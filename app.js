const APP_NAME = "Sufra";

const CATEGORIES = [
  {
    id: "mains",
    label: "Main courses",
    singular: "main course",
    legacyComboKey: "main",
    minServings: 1,
    maxServings: 6,
    defaultServings: 1,
  },
  {
    id: "sides",
    label: "Side dishes",
    singular: "side dish",
    legacyComboKey: "side",
    minServings: 1,
    maxServings: 6,
    defaultServings: 1,
  },
  {
    id: "desserts",
    label: "Desserts",
    singular: "dessert",
    legacyComboKey: "dessert",
    minServings: 1,
    maxServings: 6,
    defaultServings: 1,
  },
  {
    id: "soups",
    label: "Soups",
    singular: "soup",
    legacyComboKey: "soup",
    minServings: 0,
    maxServings: 6,
    defaultServings: 1,
  },
];

const DEFAULT_DISHES = {
  mains: ["Chicken Biryani", "Lamb Kofta", "Mandi Rice"],
  sides: ["Samosa", "Fattoush Salad", "Garlic Bread"],
  desserts: ["Kunafa", "Basbousa", "Date Cookies"],
  soups: ["Harira", "Lentil Soup", "Tomato Soup"],
};

const STORAGE_KEY = "sufra-state-v2";
const LEGACY_STORAGE_KEYS = ["sufra-state-v1", "iftar-lantern-state-v1", "ramealsdan-state-v1"];
const MAX_HISTORY = 30;
const SW_VERSION = "v11";

let state = loadState();

const comboStatsEl = document.getElementById("combo-stats");
const statusEl = document.getElementById("status");
const historyListEl = document.getElementById("history-list");
const generateBtn = document.getElementById("generate-btn");
const copyBtn = document.getElementById("copy-btn");
const resetCycleBtn = document.getElementById("reset-cycle-btn");
const clearHistoryBtn = document.getElementById("clear-history-btn");

const outputEls = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, document.getElementById(`output-${category.id}`)]),
);

const countInputs = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, document.getElementById(`count-${category.id}`)]),
);

wireEvents();
render();
registerServiceWorker();

function wireEvents() {
  for (const category of CATEGORIES) {
    const form = document.getElementById(`form-${category.id}`);
    const input = document.getElementById(`input-${category.id}`);
    const list = document.getElementById(`list-${category.id}`);
    const countInput = countInputs[category.id];

    if (!form || !input || !list || !countInput) {
      continue;
    }

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

    countInput.addEventListener("change", () => {
      updateServings(category.id, countInput.value);
    });
  }

  generateBtn.addEventListener("click", generateCombo);
  copyBtn.addEventListener("click", copyCombo);
  resetCycleBtn.addEventListener("click", resetCycle);
  clearHistoryBtn.addEventListener("click", clearHistory);
}

function createDefaultState() {
  const dishes = {};
  const servings = {};
  const cyclePools = {};

  for (const category of CATEGORIES) {
    dishes[category.id] = [...DEFAULT_DISHES[category.id]];
    servings[category.id] = category.defaultServings;
    cyclePools[category.id] = makeShuffledPool(dishes[category.id]);
  }

  return {
    dishes,
    servings,
    cyclePools,
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
    dishes: {},
    servings: {},
    cyclePools: {},
    lastCombo: null,
    history: [],
  };

  for (const category of CATEGORIES) {
    const candidateDishes = loadedRaw?.dishes?.[category.id];
    loaded.dishes[category.id] = Array.isArray(candidateDishes)
      ? cleanDishArray(candidateDishes)
      : [...defaultState.dishes[category.id]];

    const candidateServings = loadedRaw?.servings?.[category.id];
    loaded.servings[category.id] = clampServings(category, candidateServings);

    const candidatePool = loadedRaw?.cyclePools?.[category.id];
    loaded.cyclePools[category.id] = Array.isArray(candidatePool)
      ? normalizePool(candidatePool, loaded.dishes[category.id])
      : [];
  }

  loaded.lastCombo = normalizeCombo(loadedRaw?.lastCombo, loaded.dishes);

  if (Array.isArray(loadedRaw?.history)) {
    loaded.history = loadedRaw.history
      .map((entry) => normalizeHistoryEntry(entry, loaded.dishes))
      .filter((entry) => entry !== null)
      .slice(0, MAX_HISTORY);
  }

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
    setStatus(`"${name}" is already in ${categoryById(categoryId).label.toLowerCase()}.`, "warn");
    return;
  }

  state.dishes[categoryId].push(name);
  insertAtRandom(state.cyclePools[categoryId], name);

  reconcileState(state);
  saveState();
  render();
  setStatus(`Added "${name}" to ${categoryById(categoryId).label.toLowerCase()}.`, "success");
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
  setStatus(`Removed "${removed}" from ${categoryById(categoryId).label.toLowerCase()}.`, "success");
}

function updateServings(categoryId, rawValue) {
  const category = categoryById(categoryId);
  const nextValue = clampServings(category, rawValue);

  state.servings[categoryId] = nextValue;

  saveState();
  render();

  const noun = nextValue === 1 ? category.singular : category.label.toLowerCase();
  setStatus(`Set ${nextValue} ${noun} per combo.`, "success");
}

function generateCombo() {
  const required = CATEGORIES.filter((category) => state.servings[category.id] > 0);
  const missing = required
    .filter((category) => state.dishes[category.id].length === 0)
    .map((category) => category.label);

  if (missing.length > 0) {
    setStatus(`Add at least one dish in: ${missing.join(", ")}.`, "warn");
    return;
  }

  const restartedPools = new Set();
  const combo = {};

  for (const category of CATEGORIES) {
    const desiredCount = state.servings[category.id];
    combo[category.id] = drawDishesForCategory(category.id, desiredCount, restartedPools);
  }

  state.lastCombo = combo;
  state.history.unshift({ ...combo, at: new Date().toISOString() });
  state.history = state.history.slice(0, MAX_HISTORY);

  saveState();
  render();

  const poolStats = getPoolStats();
  let message = "Meal generated.";
  if (restartedPools.size > 0) {
    const labels = [...restartedPools].map((categoryId) => categoryById(categoryId).label.toLowerCase());
    message += ` New no-repeat cycle started for ${labels.join(", ")}.`;
  }
  message += ` Remaining before repeat: ${poolStats}.`;
  setStatus(message, "success");
}

function drawDishesForCategory(categoryId, desiredCount, restartedPools) {
  const picks = [];
  if (desiredCount <= 0) {
    return picks;
  }

  const dishes = state.dishes[categoryId];
  if (dishes.length === 0) {
    return picks;
  }

  const pickedInCurrentCombo = new Set();

  while (picks.length < desiredCount) {
    if (state.cyclePools[categoryId].length === 0) {
      state.cyclePools[categoryId] = makeShuffledPool(dishes);
      restartedPools.add(categoryId);
    }

    const pool = state.cyclePools[categoryId];
    const avoidDuplicatesThisCombo = pickedInCurrentCombo.size < dishes.length;
    let candidateIndices = [];

    if (avoidDuplicatesThisCombo) {
      candidateIndices = pool
        .map((dish, index) => ({ dish, index }))
        .filter((entry) => !pickedInCurrentCombo.has(entry.dish.toLowerCase()))
        .map((entry) => entry.index);
    }

    if (candidateIndices.length === 0) {
      candidateIndices = pool.map((_, index) => index);
    }

    const chosenIndex = candidateIndices[randomInt(candidateIndices.length)];
    const [dish] = pool.splice(chosenIndex, 1);

    picks.push(dish);
    pickedInCurrentCombo.add(dish.toLowerCase());
  }

  return picks;
}

function copyCombo() {
  if (!state.lastCombo) {
    setStatus("Generate a combo first.", "warn");
    return;
  }

  const lines = [`${APP_NAME} pick:`];
  for (const category of CATEGORIES) {
    const picks = state.lastCombo[category.id] || [];
    if (picks.length === 0) {
      lines.push(`${category.label}: Not included`);
      continue;
    }
    lines.push(`${category.label}: ${picks.join(", ")}`);
  }

  if (!navigator.clipboard?.writeText) {
    setStatus("Clipboard is not available in this browser.", "warn");
    return;
  }

  navigator.clipboard
    .writeText(lines.join("\n"))
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
    renderServingInput(category.id);
  }

  renderComboCard();
  renderHistory();

  comboStatsEl.textContent = `Before repeat: ${getPoolStats()}`;
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

function renderServingInput(categoryId) {
  const input = countInputs[categoryId];
  if (!input) {
    return;
  }
  input.value = String(state.servings[categoryId]);
}

function renderComboCard() {
  for (const category of CATEGORIES) {
    const outputEl = outputEls[category.id];
    if (!outputEl) {
      continue;
    }
    const picks = state.lastCombo?.[category.id] || [];

    if (picks.length === 0) {
      outputEl.textContent = state.servings[category.id] === 0 ? "Not included" : "-";
      continue;
    }

    outputEl.textContent = picks.join(" • ");
  }
}

function renderHistory() {
  if (state.history.length === 0) {
    historyListEl.innerHTML = '<li class="empty">No generated combos yet.</li>';
    return;
  }

  historyListEl.innerHTML = state.history
    .map((entry) => {
      const timestamp = formatTimestamp(entry.at);
      const parts = CATEGORIES
        .map((category) => formatHistoryChunk(category, entry[category.id] || []))
        .filter((chunk) => chunk !== "");

      return `
        <li class="history-entry">
          ${parts.join('<span class="history-sep"> | </span>')}
          <span class="history-meta">${timestamp}</span>
        </li>
      `;
    })
    .join("");
}

function formatHistoryChunk(category, picks) {
  if (!Array.isArray(picks) || picks.length === 0) {
    return "";
  }

  return `<span class="history-chunk"><strong>${escapeHtml(category.label)}:</strong> ${picks
    .map((item) => escapeHtml(item))
    .join(", ")}</span>`;
}

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`.trim();
}

function getPoolStats() {
  return CATEGORIES.map((category) => `${category.singular} ${state.cyclePools[category.id].length}`).join(
    ", ",
  );
}

function reconcileState(target) {
  for (const category of CATEGORIES) {
    target.dishes[category.id] = cleanDishArray(target.dishes[category.id] || []);
    target.servings[category.id] = clampServings(category, target.servings[category.id]);
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

function normalizeCombo(rawCombo, dishes) {
  if (!rawCombo || typeof rawCombo !== "object") {
    return null;
  }

  const combo = {};
  let hasAny = false;

  for (const category of CATEGORIES) {
    const candidate = rawCombo[category.id] ?? rawCombo[category.legacyComboKey];
    let items = [];

    if (Array.isArray(candidate)) {
      items = normalizeComboItems(candidate, dishes[category.id]);
    } else if (typeof candidate === "string") {
      items = normalizeComboItems([candidate], dishes[category.id]);
    }

    combo[category.id] = items;
    if (items.length > 0) {
      hasAny = true;
    }
  }

  return hasAny ? combo : null;
}

function normalizeComboItems(items, options) {
  const output = [];
  const seen = new Set();

  for (const item of items) {
    const canonical = canonicalDishName(item, options);
    const key = canonical.toLowerCase();
    if (!canonical || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(canonical);
  }

  return output;
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
  const safeOptions = Array.isArray(options) ? options : [];
  const normalized = normalizeDishName(rawValue).toLowerCase();
  for (const option of safeOptions) {
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
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function insertAtRandom(list, value) {
  const index = randomInt(list.length + 1);
  list.splice(index, 0, value);
}

function makeShuffledPool(items) {
  const copy = [...items];
  shuffleInPlace(copy);
  return copy;
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function randomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    return 0;
  }

  if (window.crypto?.getRandomValues) {
    const maxUint32 = 0xffffffff;
    const limit = maxUint32 - ((maxUint32 + 1) % maxExclusive);
    const buffer = new Uint32Array(1);

    do {
      window.crypto.getRandomValues(buffer);
    } while (buffer[0] > limit);

    return buffer[0] % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}

function clampServings(category, value) {
  const parsed = Number.parseInt(value, 10);
  const fallback = category.defaultServings;
  const safe = Number.isInteger(parsed) ? parsed : fallback;
  return Math.min(category.maxServings, Math.max(category.minServings, safe));
}

function categoryById(categoryId) {
  return CATEGORIES.find((category) => category.id === categoryId) || CATEGORIES[0];
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`./service-worker.js?${SW_VERSION}`).catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}
