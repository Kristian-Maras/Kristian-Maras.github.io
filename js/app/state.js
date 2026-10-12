"use strict";

// Finance OS app (app.html), part 1: constants, data, appearance, storage, helpers, dialogs.
// The app is split into several files that share their names (classic scripts, no modules).
// app.html loads them in this order: state.js → calc.js → render.js → render-settings.js → future.js → layout.js → navigation.js → forms.js → main.js
// Code that runs right away may only use what is defined in the same or an earlier file.

// Translate the static page text before any user data is rendered,
// so user-defined names (categories, accounts) are never translated.
const t = I18N.t;
I18N.translatePage();

// Constants

const STORAGE_KEY = "financeOS_v2";
const MAX_YEARS = 4; // longest apprenticeship (4-year EFZ); the actual length is a setting

// Entry kind in the form -> list in the data
const ENTRY_TYPES = {
  expense: "expenses",
  saving: "savingEntries",
  withdraw: "withdrawEntries",
  income: "incomeEntries",
};
const ENTRY_KINDS = {
  expenses: "expense",
  savingEntries: "saving",
  withdrawEntries: "withdraw",
  incomeEntries: "income",
};
const KIND_LABELS = {
  income: t("Eingenommen"),
  expense: t("Ausgegeben"),
  saving: t("Aufs Sparkonto"),
  withdraw: t("Vom Sparkonto"),
};
const AMOUNT_STYLES = {
  income: { sign: "+", className: "good" },
  expense: { sign: "−", className: "bad" },
  saving: { sign: "↗", className: "transfer" },
  withdraw: { sign: "↙", className: "good" },
  // Left over at payday and taken into the next pay month (js/app/payday.js)
  carryIn: { sign: "+", className: "good" },
  carryOut: { sign: "→", className: "transfer" },
  // Left over last month and saved at payday: shown like a transfer, counts in the last month
  note: { sign: "↗", className: "transfer" },
};
// Standing order interval -> number of months between payments
const INTERVALS = {
  monthly: { label: t("Monatlich"), months: 1 },
  quarterly: { label: t("Vierteljährlich"), months: 3 },
  halfyearly: { label: t("Halbjährlich"), months: 6 },
  yearly: { label: t("Jährlich"), months: 12 },
};
// Shown under the entry form: what the chosen kind does with "available".
const ENTRY_HINTS = {
  expense: t("Wird vom Lohnkonto abgezogen und verringert „Verfügbar“."),
  income: t("Kommt direkt zu „Verfügbar“ dazu – zusätzlich zu Lohn und Pauschalen."),
  saving: t("Geht vom Lohnkonto aufs Sparkonto und ist danach nicht mehr verfügbar."),
  withdraw: t("Kommt vom Sparkonto zurück aufs Lohnkonto und erhöht „Verfügbar“."),
};
const RECURRING_KIND_LABELS = {
  expense: t("Ausgabe"),
  income: t("Einnahme"),
  saving: t("Sparen"),
};

const FORMS = {
  expenses: {
    page: "expenses",
    fields: ["exDate", "exDesc", "exCat", "exPay", "exAmount"],
    keepAfterSave: ["exDate", "exCat", "exPay"],
    saveButton: "expenseSave",
    cancelButton: "expenseCancel",
    saveLabel: t("Speichern"),
  },
  recurring: {
    page: "recurring",
    fields: ["recKind", "recName", "recAmount", "recInterval", "recStart", "recEnd", "recCat"],
    keepAfterSave: ["recKind", "recCat"],
    saveButton: "recurringSave",
    cancelButton: "recurringCancel",
    saveLabel: t("Hinzufügen"),
  },
};

const DATE_FIELDS = ["exDate", "recStart", "recEnd", "setStart"];
const DEFAULT_DATE_FIELDS = ["exDate", "recStart"];
const DRAFT_FIELDS = ["entryKind", ...Object.values(FORMS).flatMap((form) => form.fields)];
const SETTINGS_FIELD =
  /^(setStart|setYears|setPayday|setThirteenth|setTrackFrom|setAutoAccount|salary\d|extraSave\d|thirteenthSave\d)$/;

// Data

// Allowances are fixed amounts paid on top of the wage (meals, public transport, …).
// Each has an amount and a saved part per apprenticeship year.

// per: "month" (with every wage) or "year" (once a year, with the wage of the pay month in "month":
// "01"–"12"; without it the first pay month of the apprenticeship year, as in older versions)
function newAllowance(id, name, enabled = false) {
  return { id, name, enabled, per: "month", amounts: Array(MAX_YEARS).fill(0), save: Array(MAX_YEARS).fill(0) };
}

// Default names in German; they are shown in the chosen language (see localizeDefaultNames).
const DEFAULT_ALLOWANCE_NAMES = {
  food: "Essenspauschale",
  transport: "Fahrkosten / ÖV",
  phone: "Handy",
  clothes: "Arbeitskleider / Werkzeug",
};
const DEFAULT_ACCOUNT_NAMES = { main: "Lohnkonto", save: "Sparkonto" };
const DEFAULT_LISTS = {
  categories: ["Essen & Trinken", "Freizeit", "Fahrzeug", "Kleidung", "Sport"],
  incomeCategories: ["Nebenjob", "Geschenk", "Rückzahlung", "Sonstiges"],
  payments: ["Karte / TWINT", "Bar", "Überweisung"],
};
// Default names of older accounts: they still follow a language change, but new accounts no longer get them.
const OLDER_DEFAULT_LISTS = {
  categories: ["Essen", "Abos", "Schule", "Technik", "Ferien", "Sonstiges"],
  payments: ["Karte", "TWINT"],
};
// Default names that were renamed later. Accounts that still use the old default name (in any
// language) get the new one, together with their entries; names the user typed in stay as they are.
const FORMER_DEFAULT_NAMES = { Freizeit: ["Freizeit/Ausgang"], Fahrzeug: ["Motorrad/Auto"] };

// New accounts start with public transport (on) and the meal allowance (off); more can be added.
const STARTING_ALLOWANCES = ["transport", "food"];

function defaultAllowances() {
  return STARTING_ALLOWANCES.map((id) => newAllowance(id, t(DEFAULT_ALLOWANCE_NAMES[id]), id === "transport"));
}

const enabledAllowances = () => state.allowances.filter((allowance) => allowance.enabled);

function createEmptyData() {
  return {
    start: "2026-08-01",
    years: 4, // apprenticeship length: 2, 3 or 4 years
    payday: 25, // a pay month runs from the payday to the day before it in the next month
    allowances: defaultAllowances(),
    // 13th-month salary: "none", "spread" (already in the 12 monthly wages),
    // "11" (extra wage with the November pay) or "12" (December)
    thirteenth: "none",
    // Exactly one spending account plus any number of savings accounts
    accounts: [
      { id: "main", name: t(DEFAULT_ACCOUNT_NAMES.main), kind: "spending", start: 0 },
      { id: "save", name: t(DEFAULT_ACCOUNT_NAMES.save), kind: "saving", start: 0 },
    ],
    autoAccount: "save", // receives automatic savings and the saved part of allowances
    salaries: [0, 0, 0, 0],
    extraSave: [0, 0, 0, 0],
    // Save the 13th-month salary (paid in November/December) on the savings account, per year
    thirteenthSave: [false, false, false, false],
    // Defaults in the current language; users can rename them.
    categories: DEFAULT_LISTS.categories.map((name) => t(name)),
    incomeCategories: DEFAULT_LISTS.incomeCategories.map((name) => t(name)),
    payments: DEFAULT_LISTS.payments.map((name) => t(name)),
    expenses: [],
    savingEntries: [],
    withdrawEntries: [],
    incomeEntries: [],
    recurring: [],
    paidRecurring: {},
    appearance: { ...DEFAULT_APPEARANCE },
    currentMonth: null,
    // "Tracken ab": first pay month that counts ("YYYY-MM"); null = from the start of the
    // apprenticeship. Months before it count nowhere (for people who start using Finance OS later).
    trackFrom: null,
    // Payday question (js/app/payday.js): money taken from a pay month into the next one
    // ({ id, from: "YYYY-MM", amount }), the pay months already asked about, and the first
    // pay month that may be asked about (set when the question is used for the first time).
    carryOvers: [],
    paydayAnswered: [],
    paydayStart: null,
    drafts: {},
    editing: {},
  };
}

// Appearance (accent colour, light/dark, text size, hidden amounts).
// Saved with the account and cached in the browser so the colours are right on load.
// The styles themselves are in css/shared/themes.css.

const APPEARANCE_KEY = "financeOS_appearance";
const DEFAULT_APPEARANCE = {
  accent: "violet", // Lila; accounts that saved another colour keep it
  mode: "system", // follow the device
  text: "normal",
  startPage: "dashboard",
};
const APPEARANCE_FIELDS = ["accent", "mode", "text", "startPage"];
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
let appearance = { ...DEFAULT_APPEARANCE };

function applyAppearance(next) {
  appearance = { ...DEFAULT_APPEARANCE, ...next };
  const root = document.documentElement;
  const dark = appearance.mode === "dark" || (appearance.mode === "system" && darkQuery.matches);
  root.dataset.accent = appearance.accent;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.text = appearance.text;
  // The light bulb label describes what a click will do.
  const label = I18N.t(dark ? "Licht an (helles Design)" : "Licht aus (dunkles Design)");
  const themeButton = document.getElementById("appTheme");
  themeButton.setAttribute("aria-pressed", String(!dark));
  themeButton.setAttribute("aria-label", label);
  themeButton.title = label;
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
  } catch {
    // Private mode.
  }
}

// Fill the appearance form with the current values.
function renderAppearance() {
  for (const name of ["accent", "mode", "text"]) {
    const input = document.querySelector(`input[name="${name}"][value="${appearance[name]}"]`);
    if (input) input.checked = true;
  }
  $("startPage").value = appearance.startPage;
}

function changeAppearance(field) {
  const value = field.type === "checkbox" ? field.checked : field.value;
  state.appearance = { ...appearance, [field.name]: value };
  applyAppearance(state.appearance);
  save();
}

try {
  applyAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY)) || {});
} catch {
  applyAppearance({});
}
darkQuery.addEventListener("change", () => applyAppearance(appearance));

// Served by Spring Boot (http://localhost:8080): login and data per user in the database.
// Opened as a file (file://): data stays in this browser only.
const ONLINE = location.protocol.startsWith("http") && typeof api === "function";

function readLocalData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function loadData(saved) {
  const data = { ...createEmptyData(), ...saved };

  // Older versions had a single meal allowance (food, foodSave, hasFood).
  if (!Array.isArray(saved.allowances) && ("food" in saved || "foodSave" in saved)) {
    const food = Array.isArray(saved.food) ? saved.food : Array(MAX_YEARS).fill(Number(saved.food) || 0);
    data.allowances[0] = {
      ...data.allowances[0],
      enabled: saved.hasFood !== false,
      amounts: food.map((value) => Number(value) || 0),
      save: (saved.foodSave || []).map((value) => Number(value) || 0),
    };
  }
  delete data.food;
  delete data.foodSave;
  delete data.hasFood;
  // Older versions had "saving categories"; the ones in use become savings accounts.
  if (!Array.isArray(saved.accounts)) {
    const used = new Set([
      ...data.savingEntries.map((entry) => entry.cat),
      ...data.recurring.filter((order) => order.kind === "saving").map((order) => order.cat),
    ]);
    // "Sparkonto" in any language is the default savings account.
    const defaultName = data.accounts[1].name;
    const isDefault = (name) => !name || spellingsOf(DEFAULT_ACCOUNT_NAMES.save).has(name);
    const names = [defaultName, ...[...used].filter((name) => !isDefault(name))];
    data.accounts = [
      data.accounts[0],
      ...names.map((name, i) => ({ id: i === 0 ? "save" : "s" + i, name, kind: "saving", start: 0 })),
    ];
    const savingRecords = [...data.savingEntries, ...data.recurring.filter((order) => order.kind === "saving")];
    savingRecords.forEach((record) => {
      if (isDefault(record.cat)) record.cat = defaultName;
    });
  }
  if (!data.accounts.some((account) => account.id === data.autoAccount && account.kind === "saving")) {
    data.autoAccount = data.accounts.find((account) => account.kind === "saving")?.id;
  }
  delete data.savingCategories;
  delete data.confirmedMonths;
  delete data.countFrom;
  data.recurring = data.recurring.map((order) => ({ kind: "expense", interval: "monthly", ...order }));
  return data;
}

// Renaming a list item or a savings account also renames it in all bookings.
function bookingsUsing(type) {
  const ofKind = (kind) => state.recurring.filter((order) => order.kind === kind);
  return {
    categories: [...state.expenses, ...ofKind("expense")],
    incomeCategories: [...state.incomeEntries, ...ofKind("income")],
    payments: [...state.expenses, ...state.savingEntries, ...state.withdrawEntries, ...state.incomeEntries],
    accounts: [...state.savingEntries, ...state.withdrawEntries, ...ofKind("saving")],
  }[type];
}

function renameInBookings(type, oldName, name) {
  const key = type === "payments" ? "pay" : "cat";
  bookingsUsing(type).forEach((record) => {
    if (record[key] === oldName) record[key] = name;
  });
}

// Half-filled forms keep pointing at the renamed item.
function renameInDrafts(oldName, name) {
  for (const id of ["exCat", "exPay", "recCat"]) {
    if (state.drafts?.[id] === oldName) state.drafts[id] = name;
  }
}

// The German name and all its translations.
function spellingsOf(germanName) {
  return new Set([germanName, ...(window.TRANSLATIONS?.[germanName] || [])]);
}

// Default names (categories, accounts, allowances …) follow the chosen language, also when the
// language is changed later. Names the user typed in are never touched.
function localizeDefaultNames() {
  // Every spelling of a default name (German and all translations) → its current translation.
  const localized = (germanName) => {
    const spellings = spellingsOf(germanName);
    for (const former of FORMER_DEFAULT_NAMES[germanName] || []) spellingsOf(former).forEach((name) => spellings.add(name));
    return (name) => (spellings.has(name) ? t(germanName) : null);
  };
  let changed = false;

  for (const [type, defaults] of Object.entries(DEFAULT_LISTS)) {
    const list = state[type];
    [...defaults, ...(OLDER_DEFAULT_LISTS[type] || [])].forEach((germanName) => {
      const translate = localized(germanName);
      list.forEach((name, index) => {
        const next = translate(name);
        if (!next || next === name || list.includes(next)) return;
        list[index] = next;
        renameInBookings(type, name, next);
        renameInDrafts(name, next);
        changed = true;
      });
    });
  }

  for (const account of state.accounts) {
    const germanName = DEFAULT_ACCOUNT_NAMES[account.id];
    const next = germanName && localized(germanName)(account.name);
    if (!next || next === account.name || state.accounts.some((other) => other.name === next)) continue;
    if (account.kind === "saving") renameInBookings("accounts", account.name, next);
    renameInDrafts(account.name, next);
    account.name = next;
    changed = true;
  }

  for (const allowance of state.allowances) {
    const germanName = DEFAULT_ALLOWANCE_NAMES[allowance.id];
    const next = germanName && localized(germanName)(allowance.name);
    if (!next || next === allowance.name) continue;
    allowance.name = next;
    changed = true;
  }
  return changed;
}

function loadEditing() {
  const saved = state.editing || {};
  const result = {};
  for (const form of Object.keys(FORMS)) {
    const edit = saved[form];
    const exists = edit && state[edit.type]?.some((record) => record.id === edit.id);
    result[form] = exists ? edit : null;
  }
  return result;
}

let state = createEmptyData();
let editing = {};
let currentMonth = null;
let lastId = 0;
let ready = false;

function save() {
  state.editing = editing;
  if (ONLINE) return saveOnline();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    notify("Der Browser blockiert das Speichern. Deine Daten bleiben nur während dieser Sitzung erhalten.");
  }
}

function setSaveStatus(text, isError = false) {
  const status = $("saveStatus");
  status.textContent = text;
  status.classList.toggle("error", isError);
}

// Debounced: typing does not send a request for every key stroke.
function saveOnline() {
  clearTimeout(saveOnline.timer);
  saveOnline.pending = true;
  setSaveStatus(t("Speichert …"));
  saveOnline.timer = setTimeout(sendData, 400);
}

async function sendData() {
  saveOnline.pending = false;
  try {
    await api("/data", { method: "PUT", body: state });
    if (!saveOnline.pending) setSaveStatus(t("Alles gespeichert"));
  } catch (error) {
    setSaveStatus(t("Nicht gespeichert"), true);
    notify(t("Speichern fehlgeschlagen:") + " " + t(error.message));
  }
}

// Sends pending changes immediately when the tab is closed.
function flushData() {
  if (!ONLINE || !saveOnline.pending) return;
  clearTimeout(saveOnline.timer);
  saveOnline.pending = false;
  fetch(API_BASE + "/data", {
    method: "PUT",
    keepalive: true,
    credentials: "same-origin",
    headers: requestHeaders(true),
    body: JSON.stringify(state),
  }).catch(() => {});
}

function persist() {
  save();
  render();
}

function newId() {
  lastId = Math.max(Date.now(), lastId + 1);
  return lastId;
}

// Helpers

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (char) => map[char]);
}

function chf(amount) {
  const formatted = (Number(amount) || 0).toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return "CHF " + formatted;
}

function percent(value) {
  return value.toFixed(1) + " %";
}

function sumBy(list, getValue) {
  return list.reduce((total, item) => total + (Number(getValue(item)) || 0), 0);
}

function parseAmount(text) {
  const value = String(text ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  return value === "" ? NaN : Number(value);
}

function readAmount(id, allowZero = false) {
  // An empty field counts as 0 where 0 is allowed.
  if (allowZero && $(id).value.trim() === "") return 0;
  const amount = parseAmount($(id).value);
  const valid = Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0);
  return valid ? amount : null;
}

// Shows a toast message; German texts (also from the server) are translated.
// Short message at the bottom. With undo, it shows a "Rückgängig" button and stays a bit longer.
function notify(message, params, undo = null) {
  message = t(message, params);
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.toggle("with-action", Boolean(undo));
  if (undo) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-action";
    button.textContent = t("Rückgängig");
    button.addEventListener("click", () => {
      toast.hidden = true;
      undo();
    });
    toast.append(" ", button);
  }
  toast.hidden = false;
  clearTimeout(notify.timer);
  // Longer messages stay visible longer.
  notify.timer = setTimeout(() => (toast.hidden = true), Math.max(undo ? 6000 : 3500, message.length * 60));
}

// Questions and new names in the page's own dialog (app.html #appDialog) instead of the
// browser's prompt()/confirm(). Resolves with the typed text (input), true (question) or null (cancelled).
function askUser({ title, text = "", label = "", value = null, okLabel = t("OK"), danger = false }) {
  const dialog = $("appDialog");
  const input = $("appDialogInput");
  $("appDialogTitle").textContent = title;
  $("appDialogText").textContent = text;
  $("appDialogField").hidden = value === null;
  $("appDialogLabel").textContent = label;
  input.value = value ?? "";
  $("appDialogOk").textContent = okLabel;
  $("appDialogOk").classList.toggle("danger-solid", danger);

  return new Promise((resolve) => {
    const finish = (result) => {
      dialog.removeEventListener("close", onClose);
      $("appDialogForm").removeEventListener("submit", onSubmit);
      $("appDialogCancel").removeEventListener("click", onCancel);
      dialog.removeEventListener("click", onBackdrop);
      if (dialog.open) dialog.close();
      resolve(result);
    };
    const onSubmit = (event) => {
      event.preventDefault();
      finish(value === null ? true : input.value.trim());
    };
    const onCancel = () => finish(null);
    const onClose = () => finish(null); // Escape
    const onBackdrop = (event) => {
      if (event.target === dialog) finish(null);
    };
    $("appDialogForm").addEventListener("submit", onSubmit);
    $("appDialogCancel").addEventListener("click", onCancel);
    dialog.addEventListener("close", onClose);
    dialog.addEventListener("click", onBackdrop);
    dialog.showModal();
    (value === null ? $("appDialogOk") : input).focus();
    if (value !== null) input.select();
  });
}

const confirmAction = async (options) => (await askUser({ danger: true, ...options })) === true;
