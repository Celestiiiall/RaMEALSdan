const APP_NAME = "Iftar Lantern";

const CATEGORIES = [
  { id: "mains", label: "Main course", comboKey: "main" },
  { id: "sides", label: "Side dish", comboKey: "side" },
  { id: "desserts", label: "Dessert", comboKey: "dessert" },
];

const DEFAULT_DISHES = {
  mains: ["Chicken Biryani", "Lamb Kofta", "Lentil Soup"],
  sides: ["Samosa", "Fattoush Salad", "Garlic Bread"],
  desserts: ["Kunafa", "Basbousa", "Date Cookies"],
};

const STORAGE_KEY = "iftar-lantern-state-v1";
const LEGACY_STORAGE_KEYS = ["ramealsdan-state-v1"];
const MAX_HISTORY = 30;

let state = loadState();

const comboStatsEl = document.getElementById("combo-stats");
const statusEl = document.getElementById("status");
const mainOutputEl = document.getElementById("main-output");
const sideOutputEl = document.getElementById("side-output");
const dessertOutputEl = document.getElementById("dessert-output");
const historyListEl = document.getElementById("history-list");
const generateBtn = document.getElementById("generate-btn");
const copyBtn = document.getElementById("copy-btn");
const resetCycleBtn = document.getElementById("reset-cycle-btn");
const clearHistoryBtn = document.getElementById("clear-history-btn");

wireEvents();
render();
registerServiceWorker();

function wireEvents() {
  for (const category of CATEGORIES) {
    const form = document.getElementById(`form-${category.id}`);
    const input = document.getElementById(`input-${category.id}`);
    const list = document.getElementById(`list-${category.id}`);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      addDish(category.id, input.value);
      input.value = "";
      input.focus();
    });

    list.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-index]");
      if (!button) {
        return;
      }

      const index = Number(button.dataset.index);
      removeDish(category.id, index);
    });
  }

  generateBtn.addEventListener("click", generateCombo);
  copyBtn.addEventListener("click", copyCombo);
  resetCycleBtn.addEventListener("click", resetCycle);
  clearHistoryBtn.addEventListener("click", clearHistory);
}

function createDefaultState() {
  const dishes = {
    mains: [...DEFAULT_DISHES.mains],
    sides: [...DEFAULT_DISHES.sides],
    desserts: [...DEFAULT_DISHES.desserts],
  };

  return {
    dishes,
    cyclePools: {
      mains: makeShuffledPool(dishes.mains),
      sides: makeShuffledPool(dishes.sides),
      desserts: makeShuffledPool(dishes.desserts),
    },
    lastCombo: null,
    history: [],
  };
}

function loadState() {
  const defaultState = createDefaultState();
  const loadedRaw = readPersistedState();
  if (!loadedRaw) {
    return defaultState;
  }

  const loaded = {
    ...defaultState,
    dishes: { ...defaultState.dishes },
    cyclePools: { mains: [], sides: [], desserts: [] },
    lastCombo: null,
    history: [],
  };

  for (const category of CATEGORIES) {
    const candidateDishes = loadedRaw?.dishes?.[category.id];
    if (Array.isArray(candidateDishes)) {
      loaded.dishes[category.id] = cleanDishArray(candidateDishes);
    }
  }

  for (const category of CATEGORIES) {
    const candidatePool = loadedRaw?.cyclePools?.[category.id];
    if (Array.isArray(candidatePool)) {
      loaded.cyclePools[category.id] = normalizePool(candidatePool, loaded.dishes[category.id]);
    } else {
      loaded.cyclePools[category.id] = [];
    }
  }

  if (Array.isArray(loadedRaw?.history)) {
    loaded.history = loadedRaw.history
      .map((entry) => normalizeHistoryEntry(entry, loaded.dishes))
      .filter((entry) => entry !== null)
      .slice(0, MAX_HISTORY);
  }

  loaded.lastCombo = normalizeCombo(loadedRaw?.lastCombo, loaded.dishes);

  reconcileState(loaded);
  return loaded;
}

function readPersistedState() {
  const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) {
      continue;
    }

    try {
      return JSON.parse(raw);
    } catch {
      continue;
    }
  }

  return null;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function addDish(categoryId, rawName) {
  const name = normalizeDishName(rawName);
  if (!name) {
    setStatus("Type a dish name first.", "warn");
    return;
  }

  const exists = state.dishes[categoryId].some(
    (dish) => dish.toLowerCase() === name.toLowerCase(),
  );
  if (exists) {
    setStatus(`"${name}" is already in ${categoryLabel(categoryId)}.`, "warn");
    return;
  }

  state.dishes[categoryId].push(name);
  insertAtRandom(state.cyclePools[categoryId], name);
  reconcileState(state);
  saveState();
  render();
  setStatus(`Added "${name}" to ${categoryLabel(categoryId)}.`, "success");
}

function removeDish(categoryId, index) {
  if (!Number.isInteger(index)) {
    return;
  }

  const list = state.dishes[categoryId];
  if (index < 0 || index >= list.length) {
    return;
  }

  const [removed] = list.splice(index, 1);
  state.cyclePools[categoryId] = state.cyclePools[categoryId].filter((item) => item !== removed);
  reconcileState(state);
  saveState();
  render();
  setStatus(`Removed "${removed}" from ${categoryLabel(categoryId)}.`, "success");
}

function generateCombo() {
  const missing = CATEGORIES.filter((cat) => state.dishes[cat.id].length === 0).map(
    (cat) => cat.label,
  );
  if (missing.length > 0) {
    setStatus(`Add at least one dish in: ${missing.join(", ")}.`, "warn");
    return;
  }

  const restartedPools = [];
  for (const category of CATEGORIES) {
    if (state.cyclePools[category.id].length === 0) {
      state.cyclePools[category.id] = makeShuffledPool(state.dishes[category.id]);
      restartedPools.push(category.label);
    }
  }

  const combo = {};
  for (const category of CATEGORIES) {
    combo[category.comboKey] = pullRandomDish(category.id);
  }

  state.lastCombo = combo;
  state.history.unshift({ ...combo, at: new Date().toISOString() });
  state.history = state.history.slice(0, MAX_HISTORY);

  saveState();
  render();

  const poolStats = getPoolStats();
  let message = "Meal generated.";
  if (restartedPools.length > 0) {
    message += ` New no-repeat pool started for ${restartedPools.join(", ")}.`;
  }
  message += ` Remaining before repeat: main ${poolStats.mains}, side ${poolStats.sides}, dessert ${poolStats.desserts}.`;
  setStatus(message, "success");
}

function copyCombo() {
  if (!state.lastCombo) {
    setStatus("Generate a combo first.", "warn");
    return;
  }

  const text = [
    `${APP_NAME} pick:`,
    `Main course: ${state.lastCombo.main}`,
    `Side dish: ${state.lastCombo.side}`,
    `Dessert: ${state.lastCombo.dessert}`,
  ].join("\n");

  if (!navigator.clipboard?.writeText) {
    setStatus("Clipboard is not available in this browser.", "warn");
    return;
  }

  navigator.clipboard
    .writeText(text)
    .then(() => setStatus("Combo copied to clipboard.", "success"))
    .catch(() => setStatus("Could not copy combo. Try again.", "warn"));
}

function resetCycle() {
  for (const category of CATEGORIES) {
    state.cyclePools[category.id] = makeShuffledPool(state.dishes[category.id]);
  }

  saveState();
  render();
  setStatus("No-repeat pools reset for all categories.", "success");
}

function clearHistory() {
  if (state.history.length === 0) {
    setStatus("History is already empty.", "warn");
    return;
  }

  state.history = [];
  saveState();
  render();
  setStatus("History cleared.", "success");
}

function render() {
  for (const category of CATEGORIES) {
    renderCategoryList(category.id);
  }

  renderComboCard();
  renderHistory();

  const stats = getPoolStats();
  comboStatsEl.textContent = `Before repeat: main ${stats.mains}, side ${stats.sides}, dessert ${stats.desserts}`;
}

function renderCategoryList(categoryId) {
  const listEl = document.getElementById(`list-${categoryId}`);
  const items = state.dishes[categoryId];

  if (items.length === 0) {
    listEl.innerHTML = '<li class="empty">No dishes yet.</li>';
    return;
  }

  listEl.innerHTML = items
    .map(
      (dish, index) => `
        <li class="dish-item">
          <span>${escapeHtml(dish)}</span>
          <button class="remove-btn" data-index="${index}" aria-label="Remove ${escapeHtml(
            dish,
          )}">
            Remove
          </button>
        </li>
      `,
    )
    .join("");
}

function renderComboCard() {
  mainOutputEl.textContent = state.lastCombo?.main || "-";
  sideOutputEl.textContent = state.lastCombo?.side || "-";
  dessertOutputEl.textContent = state.lastCombo?.dessert || "-";
}

function renderHistory() {
  if (state.history.length === 0) {
    historyListEl.innerHTML = '<li class="empty">No generated combos yet.</li>';
    return;
  }

  historyListEl.innerHTML = state.history
    .map((entry) => {
      const timestamp = formatTimestamp(entry.at);
      return `
        <li class="history-entry">
          ${escapeHtml(entry.main)} + ${escapeHtml(entry.side)} + ${escapeHtml(entry.dessert)}
          <span class="history-meta">${timestamp}</span>
        </li>
      `;
    })
    .join("");
}

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`.trim();
}

function getPoolStats() {
  return {
    mains: state.cyclePools.mains.length,
    sides: state.cyclePools.sides.length,
    desserts: state.cyclePools.desserts.length,
  };
}

function pullRandomDish(categoryId) {
  const pool = state.cyclePools[categoryId];
  if (pool.length === 0) {
    return "";
  }

  const randomIndex = Math.floor(Math.random() * pool.length);
  const [dish] = pool.splice(randomIndex, 1);
  return dish;
}

function reconcileState(target) {
  for (const category of CATEGORIES) {
    target.dishes[category.id] = cleanDishArray(target.dishes[category.id] || []);
  }

  for (const category of CATEGORIES) {
    const currentPool = Array.isArray(target.cyclePools?.[category.id])
      ? target.cyclePools[category.id]
      : [];

    target.cyclePools[category.id] = normalizePool(currentPool, target.dishes[category.id]);
    if (target.cyclePools[category.id].length === 0 && target.dishes[category.id].length > 0) {
      target.cyclePools[category.id] = makeShuffledPool(target.dishes[category.id]);
    }
  }

  target.lastCombo = normalizeCombo(target.lastCombo, target.dishes);
  target.history = (target.history || [])
    .map((entry) => normalizeHistoryEntry(entry, target.dishes))
    .filter((entry) => entry !== null)
    .slice(0, MAX_HISTORY);
}

function normalizePool(pool, validDishes) {
  const map = new Map(validDishes.map((dish) => [dish.toLowerCase(), dish]));
  const seen = new Set();
  const cleaned = [];

  for (const item of pool) {
    const normalized = normalizeDishName(item).toLowerCase();
    const canonical = map.get(normalized);
    if (!canonical || seen.has(canonical.toLowerCase())) {
      continue;
    }
    seen.add(canonical.toLowerCase());
    cleaned.push(canonical);
  }

  return cleaned;
}

function normalizeHistoryEntry(entry, dishes) {
  const combo = normalizeCombo(entry, dishes);
  if (!combo) {
    return null;
  }

  return {
    ...combo,
    at: typeof entry.at === "string" ? entry.at : new Date().toISOString(),
  };
}

function normalizeCombo(combo, dishes) {
  if (!isComboShape(combo)) {
    return null;
  }

  const main = canonicalDishName(combo.main, dishes.mains);
  const side = canonicalDishName(combo.side, dishes.sides);
  const dessert = canonicalDishName(combo.dessert, dishes.desserts);

  if (!main || !side || !dessert) {
    return null;
  }

  return { main, side, dessert };
}

function cleanDishArray(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const normalized = normalizeDishName(item);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function canonicalDishName(rawValue, options) {
  const normalized = normalizeDishName(rawValue).toLowerCase();
  for (const option of options) {
    if (option.toLowerCase() === normalized) {
      return option;
    }
  }
  return "";
}

function normalizeDishName(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function isComboShape(value) {
  return (
    value &&
    typeof value.main === "string" &&
    typeof value.side === "string" &&
    typeof value.dessert === "string"
  );
}

function categoryLabel(categoryId) {
  return CATEGORIES.find((cat) => cat.id === categoryId)?.label.toLowerCase() || "category";
}

function formatTimestamp(raw) {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function insertAtRandom(list, value) {
  const index = Math.floor(Math.random() * (list.length + 1));
  list.splice(index, 0, value);
}

function makeShuffledPool(items) {
  const copy = [...items];
  shuffleInPlace(copy);
  return copy;
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}
