const CATEGORIES = [
  { id: "mains", label: "Main course" },
  { id: "sides", label: "Side dish" },
  { id: "desserts", label: "Dessert" },
];

const DEFAULT_DISHES = {
  mains: ["Chicken Biryani", "Lamb Kofta", "Lentil Soup"],
  sides: ["Samosa", "Fattoush Salad", "Garlic Bread"],
  desserts: ["Kunafa", "Basbousa", "Date Cookies"],
};

const STORAGE_KEY = "ramealsdan-state-v1";
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
  return {
    dishes: {
      mains: [...DEFAULT_DISHES.mains],
      sides: [...DEFAULT_DISHES.sides],
      desserts: [...DEFAULT_DISHES.desserts],
    },
    usedCombos: [],
    lastCombo: null,
    history: [],
  };
}

function loadState() {
  const defaultState = createDefaultState();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(raw);
    const loaded = {
      ...defaultState,
      dishes: { ...defaultState.dishes },
      usedCombos: [],
      lastCombo: null,
      history: [],
    };

    for (const category of CATEGORIES) {
      const candidate = parsed?.dishes?.[category.id];
      if (Array.isArray(candidate)) {
        loaded.dishes[category.id] = cleanDishArray(candidate);
      }
    }

    if (Array.isArray(parsed?.usedCombos)) {
      loaded.usedCombos = parsed.usedCombos.filter((item) => typeof item === "string");
    }

    if (isCombo(parsed?.lastCombo)) {
      loaded.lastCombo = cleanCombo(parsed.lastCombo);
    }

    if (Array.isArray(parsed?.history)) {
      loaded.history = parsed.history
        .filter((entry) => isCombo(entry))
        .map((entry) => ({
          ...cleanCombo(entry),
          at: typeof entry.at === "string" ? entry.at : new Date().toISOString(),
        }))
        .slice(0, MAX_HISTORY);
    }

    reconcileState(loaded);
    return loaded;
  } catch {
    return defaultState;
  }
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

  const availableCombos = getAvailableCombos(state.dishes, state.usedCombos);
  if (availableCombos.length === 0) {
    setStatus("No combos left in this cycle. Tap Start New Cycle.", "warn");
    return;
  }

  const randomIndex = Math.floor(Math.random() * availableCombos.length);
  const combo = availableCombos[randomIndex];
  const key = comboKey(combo);

  state.lastCombo = combo;
  state.usedCombos.push(key);
  state.history.unshift({ ...combo, at: new Date().toISOString() });
  state.history = state.history.slice(0, MAX_HISTORY);
  saveState();
  render();

  const counts = getCounts(state.dishes, state.usedCombos);
  setStatus(`Meal generated. ${counts.remaining} combos left in this cycle.`, "success");
}

function copyCombo() {
  if (!state.lastCombo) {
    setStatus("Generate a combo first.", "warn");
    return;
  }

  const text = [
    "Tonight's Ramadan combo:",
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
  if (state.usedCombos.length === 0) {
    setStatus("Cycle is already fresh.", "warn");
    return;
  }

  state.usedCombos = [];
  saveState();
  render();
  setStatus("Cycle reset. All combos are available again.", "success");
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

  const counts = getCounts(state.dishes, state.usedCombos);
  comboStatsEl.textContent = `${counts.remaining} of ${counts.total} combos left`;
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

function getCounts(dishes, usedCombos) {
  const total = dishes.mains.length * dishes.sides.length * dishes.desserts.length;
  const used = Math.min(usedCombos.length, total);
  return {
    total,
    used,
    remaining: Math.max(total - used, 0),
  };
}

function getAvailableCombos(dishes, usedCombos) {
  const used = new Set(usedCombos);
  const combos = [];

  for (const main of dishes.mains) {
    for (const side of dishes.sides) {
      for (const dessert of dishes.desserts) {
        const combo = { main, side, dessert };
        if (!used.has(comboKey(combo))) {
          combos.push(combo);
        }
      }
    }
  }

  return combos;
}

function reconcileState(target) {
  const validKeys = new Set(
    getAvailableCombos(target.dishes, []).map((combo) => comboKey(combo)),
  );

  target.usedCombos = target.usedCombos.filter((key) => validKeys.has(key));
  target.history = target.history.filter((entry) => validKeys.has(comboKey(entry)));

  if (target.lastCombo && !validKeys.has(comboKey(target.lastCombo))) {
    target.lastCombo = null;
  }
}

function cleanDishArray(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const normalized = normalizeDishName(item);
    const normalizedKey = normalized.toLowerCase();
    if (!normalized || seen.has(normalizedKey)) {
      continue;
    }

    seen.add(normalizedKey);
    output.push(normalized);
  }

  return output;
}

function normalizeDishName(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function comboKey(combo) {
  return `${combo.main}|||${combo.side}|||${combo.dessert}`;
}

function categoryLabel(categoryId) {
  return CATEGORIES.find((cat) => cat.id === categoryId)?.label.toLowerCase() || "category";
}

function isCombo(value) {
  return (
    value &&
    typeof value.main === "string" &&
    typeof value.side === "string" &&
    typeof value.dessert === "string"
  );
}

function cleanCombo(combo) {
  return {
    main: normalizeDishName(combo.main),
    side: normalizeDishName(combo.side),
    dessert: normalizeDishName(combo.dessert),
  };
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
