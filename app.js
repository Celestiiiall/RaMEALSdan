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
    defaultEnabled: true,
  },
  {
    id: "sides",
    label: "Side dishes",
    singular: "side dish",
    legacyComboKey: "side",
    minServings: 1,
    maxServings: 6,
    defaultServings: 1,
    defaultEnabled: true,
  },
  {
    id: "desserts",
    label: "Desserts",
    singular: "dessert",
    legacyComboKey: "dessert",
    minServings: 1,
    maxServings: 6,
    defaultServings: 1,
    defaultEnabled: true,
  },
  {
    id: "soups",
    label: "Soups",
    singular: "soup",
    legacyComboKey: "soup",
    minServings: 1,
    maxServings: 6,
    defaultServings: 1,
    defaultEnabled: false,
  },
  {
    id: "salads",
    label: "Salads",
    singular: "salad",
    legacyComboKey: "salad",
    minServings: 1,
    maxServings: 6,
    defaultServings: 1,
    defaultEnabled: false,
  },
];

const DEFAULT_DISHES = {
  mains: ["Chicken Biryani", "Lamb Kofta", "Mandi Rice"],
  sides: ["Samosa", "Cheese Sambousek", "Garlic Bread"],
  desserts: ["Kunafa", "Basbousa", "Date Cookies"],
  soups: ["Harira", "Lentil Soup", "Tomato Soup"],
  salads: ["Tabbouleh", "Cucumber Yogurt Salad", "Beetroot Salad"],
};

const STORAGE_KEY = "sufra-state-v3";
const LEGACY_STORAGE_KEYS = [
  "sufra-state-v2",
  "sufra-state-v1",
  "iftar-lantern-state-v1",
  "ramealsdan-state-v1",
];
const MAX_HISTORY = 30;
const SW_VERSION = "v17";

let state = loadState();

const statusEl = document.getElementById("status");
const historyListEl = document.getElementById("history-list");
const generateBtn = document.getElementById("generate-btn");
const copyBtn = document.getElementById("copy-btn");
const resetCycleBtn = document.getElementById("reset-cycle-btn");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const shareSaveBtn = document.getElementById("share-save-btn");
const pasteRestoreBtn = document.getElementById("paste-restore-btn");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFileInput = document.getElementById("import-file");
const saveMetaEl = document.getElementById("save-meta");

const outputEls = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, document.getElementById(`output-${category.id}`)]),
);

const countInputs = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, document.getElementById(`count-${category.id}`)]),
);

const toggleInputs = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, document.getElementById(`toggle-${category.id}`)]),
);

const servingWrapEls = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, document.getElementById(`serving-wrap-${category.id}`)]),
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
    const toggleInput = toggleInputs[category.id];

    if (form && input && list) {
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

    if (countInput) {
      countInput.addEventListener("change", () => {
        updateServings(category.id, countInput.value);
      });
    }

    if (toggleInput) {
      toggleInput.addEventListener("change", () => {
        updateCategoryEnabled(category.id, toggleInput.checked);
      });
    }
  }

  generateBtn?.addEventListener("click", generateCombo);
  copyBtn?.addEventListener("click", copyCombo);
  resetCycleBtn?.addEventListener("click", resetCycle);
  clearHistoryBtn?.addEventListener("click", clearHistory);

  shareSaveBtn?.addEventListener("click", shareOrCopySave);
  pasteRestoreBtn?.addEventListener("click", restoreFromPaste);
  exportBtn?.addEventListener("click", exportBackup);
  importBtn?.addEventListener("click", () => importFileInput?.click());

  importFileInput?.addEventListener("change", () => {
    const [file] = importFileInput.files || [];
    importStateFromFile(file);
    importFileInput.value = "";
  });
}

function createDefaultState() {
  const dishes = {};
  const servings = {};
  const enabled = {};
  const cyclePools = {};

  for (const category of CATEGORIES) {
    dishes[category.id] = [...DEFAULT_DISHES[category.id]];
    servings[category.id] = category.defaultServings;
    enabled[category.id] = category.defaultEnabled;
    cyclePools[category.id] = makeShuffledPool(dishes[category.id]);
  }

  return {
    dishes,
    servings,
    enabled,
    cyclePools,
    lastSavedAt: null,
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
    enabled: {},
    cyclePools: {},
    lastSavedAt: typeof loadedRaw?.lastSavedAt === "string" ? loadedRaw.lastSavedAt : null,
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

    const candidateEnabled = loadedRaw?.enabled?.[category.id];
    if (typeof candidateEnabled === "boolean") {
      loaded.enabled[category.id] = candidateEnabled;
    } else {
      const parsedServings = Number.parseInt(candidateServings, 10);
      loaded.enabled[category.id] = Number.isInteger(parsedServings)
        ? parsedServings > 0
        : category.defaultEnabled;
    }

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
  state.lastSavedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderSaveMeta();
}

function addDish(categoryId, rawName) {
  const name = normalizeDishName(rawName);
  if (!name) {
    setStatus("Type a dish name first.", "warn");
    return;
  }

  const exists = state.dishes[categoryId].some((dish) => dish.toLowerCase() === name.toLowerCase());
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

function updateCategoryEnabled(categoryId, enabled) {
  state.enabled[categoryId] = Boolean(enabled);

  if (state.enabled[categoryId] && state.servings[categoryId] < categoryById(categoryId).minServings) {
    state.servings[categoryId] = categoryById(categoryId).defaultServings;
  }

  if (!state.enabled[categoryId] && state.lastCombo) {
    state.lastCombo[categoryId] = [];
  }

  saveState();
  render();

  const action = state.enabled[categoryId] ? "included" : "excluded";
  setStatus(`${categoryById(categoryId).label} ${action} in combos.`, "success");
}

function generateCombo() {
  const activeCategories = CATEGORIES.filter((category) => state.enabled[category.id]);
  if (activeCategories.length === 0) {
    setStatus("Enable at least one category first.", "warn");
    return;
  }

  const required = activeCategories.filter((category) => state.servings[category.id] > 0);
  if (required.length === 0) {
    setStatus("Set servings for at least one enabled category.", "warn");
    return;
  }

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
    if (!state.enabled[category.id] || state.servings[category.id] <= 0) {
      combo[category.id] = [];
      continue;
    }

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

function buildBackupPayload() {
  return {
    app: APP_NAME,
    version: 4,
    exportedAt: new Date().toISOString(),
    state,
  };
}

function buildBackupText(pretty = false) {
  return JSON.stringify(buildBackupPayload(), null, pretty ? 2 : 0);
}

function buildBackupFilename() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `sufra-backup-${stamp}.json`;
}

async function shareOrCopySave() {
  const saveText = buildBackupText();

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${APP_NAME} Save`,
        text: saveText,
      });
      setStatus("Save shared.", "success");
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
    }
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(saveText)
      .then(() => setStatus("Save copied. Use Paste Restore on another device.", "success"))
      .catch(() => setStatus("Could not copy save. Try Save File.", "warn"));
    return;
  }

  window.prompt("Copy this save text:", saveText);
  setStatus("Save shown for manual copy.", "success");
}

function restoreFromPaste() {
  const pasted = window.prompt("Paste your Sufra save text here:");
  if (pasted === null) {
    return;
  }

  importStateFromText(pasted, "pasted text");
}

function exportBackup() {
  const blob = new Blob([buildBackupText(true)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = buildBackupFilename();
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
  setStatus("Backup file saved.", "success");
}

function importStateFromFile(file) {
  if (!file) {
    return;
  }

  file
    .text()
    .then((text) => importStateFromText(text, file.name))
    .catch(() => {
      setStatus("Could not load backup file.", "warn");
    });
}

function importStateFromText(text, sourceLabel) {
  try {
    const parsed = JSON.parse(text);
    const importedRaw = parsed?.state ?? parsed;

    if (!importedRaw || typeof importedRaw !== "object") {
      throw new Error("Invalid backup format");
    }

    const next = createDefaultState();
    next.dishes = importedRaw.dishes || {};
    next.servings = importedRaw.servings || {};
    next.enabled = importedRaw.enabled || {};
    next.cyclePools = importedRaw.cyclePools || {};
    next.lastSavedAt = typeof importedRaw.lastSavedAt === "string" ? importedRaw.lastSavedAt : null;
    next.lastCombo = importedRaw.lastCombo || null;
    next.history = Array.isArray(importedRaw.history) ? importedRaw.history : [];

    reconcileState(next);
    state = next;
    saveState();
    render();
    setStatus(`Save restored from ${sourceLabel}.`, "success");
  } catch {
    setStatus("Could not restore save text.", "warn");
  }
}

function render() {
  for (const category of CATEGORIES) {
    renderCategoryList(category.id);
    renderServingInput(category.id);
    renderCategoryToggle(category.id);
  }

  renderComboCard();
  renderHistory();
  renderSaveMeta();
}

function renderCategoryList(categoryId) {
  const listEl = document.getElementById(`list-${categoryId}`);
  const items = state.dishes[categoryId];

  if (!listEl) {
    return;
  }

  if (items.length === 0) {
    listEl.innerHTML = '<li class="empty">No dishes yet.</li>';
    return;
  }

  listEl.innerHTML = items
    .map(
      (dish, index) => `
        <li class="dish-item">
          <span>${escapeHtml(dish)}</span>
          <button class="remove-btn" data-index="${index}" aria-label="Remove ${escapeHtml(dish)}">
            Remove
          </button>
        </li>
      `,
    )
    .join("");
}

function renderServingInput(categoryId) {
  const input = countInputs[categoryId];
  const wrap = servingWrapEls[categoryId];
  if (!input) {
    return;
  }

  input.value = String(state.servings[categoryId]);

  const enabled = Boolean(state.enabled[categoryId]);
  input.disabled = !enabled;
  input.setAttribute("aria-disabled", String(!enabled));
  wrap?.classList.toggle("disabled", !enabled);
}

function renderCategoryToggle(categoryId) {
  const toggle = toggleInputs[categoryId];
  if (!toggle) {
    return;
  }

  toggle.checked = Boolean(state.enabled[categoryId]);
}

function renderComboCard() {
  for (const category of CATEGORIES) {
    const outputEl = outputEls[category.id];
    if (!outputEl) {
      continue;
    }

    if (!state.enabled[category.id]) {
      outputEl.textContent = "Not included";
      continue;
    }

    const picks = state.lastCombo?.[category.id] || [];
    if (picks.length === 0) {
      outputEl.textContent = "-";
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
      const parts = CATEGORIES.map((category) => formatHistoryChunk(category, entry[category.id] || [])).filter(
        (chunk) => chunk !== "",
      );

      const body = parts.length > 0 ? parts.join('<span class="history-sep"> | </span>') : "No picks";

      return `
        <li class="history-entry">
          ${body}
          <span class="history-meta">${timestamp}</span>
        </li>
      `;
    })
    .join("");
}

function renderSaveMeta() {
  if (!saveMetaEl) {
    return;
  }

  if (!state.lastSavedAt) {
    saveMetaEl.textContent = "Auto-save is on for this device.";
    return;
  }

  saveMetaEl.textContent = `Auto-saved ${formatTimestamp(state.lastSavedAt)} on this device.`;
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
  return CATEGORIES.map((category) => {
    if (!state.enabled[category.id]) {
      return `${category.singular} off`;
    }

    return `${category.singular} ${state.cyclePools[category.id].length}`;
  }).join(", ");
}

function reconcileState(target) {
  target.enabled = target.enabled || {};
  target.lastSavedAt = typeof target.lastSavedAt === "string" ? target.lastSavedAt : null;

  for (const category of CATEGORIES) {
    const rawServingValue = target.servings[category.id];
    target.dishes[category.id] = cleanDishArray(target.dishes[category.id] || []);

    if (typeof target.enabled[category.id] !== "boolean") {
      const parsedServings = Number.parseInt(rawServingValue, 10);
      target.enabled[category.id] = Number.isInteger(parsedServings)
        ? parsedServings > 0
        : category.defaultEnabled;
    }

    target.servings[category.id] = clampServings(category, rawServingValue);
  }

  for (const category of CATEGORIES) {
    const currentPool = Array.isArray(target.cyclePools?.[category.id]) ? target.cyclePools[category.id] : [];

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
