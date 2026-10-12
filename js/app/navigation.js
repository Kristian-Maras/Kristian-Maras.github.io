"use strict";

// Finance OS app, part: Navigation: pages, settings tabs, menu, pop-ups, light/dark, first-time setup, tour, choosing the month.
// Loaded by app.html in this order: state.js → calc.js → render.js → render-settings.js → future.js → layout.js → navigation.js → forms.js → payday.js → main.js

// Navigation

function showPage(id) {
  setMenuOpen(false);
  Object.keys(DEFAULT_LAYOUT).forEach((name) => setArranging(name, false));
  document.querySelectorAll(".page").forEach((page) => page.classList.toggle("active", page.id === id));
  document
    .querySelectorAll(".nav button")
    .forEach((button) => button.classList.toggle("active", button.dataset.page === id));
  window.scrollTo(0, 0);
}

// Settings tabs

const SETTINGS_TAB_KEY = "financeOS_settingsTab";

function showSettingsTab(tab) {
  document.querySelectorAll("[data-settings-tab]").forEach((element) => {
    element.classList.toggle("tab-hidden", element.dataset.settingsTab !== tab);
  });
  document.querySelectorAll("[data-settings-tab-button]").forEach((button) => {
    const active = button.dataset.settingsTabButton === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    if (active) button.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  try {
    localStorage.setItem(SETTINGS_TAB_KEY, tab);
  } catch {
    // Not remembered.
  }
}

document.querySelectorAll("[data-settings-tab-button]").forEach((button) =>
  button.addEventListener("click", () => showSettingsTab(button.dataset.settingsTabButton)),
);
try {
  showSettingsTab(localStorage.getItem(SETTINGS_TAB_KEY) || "pay");
} catch {
  showSettingsTab("pay");
}

// Burger menu on phones

function setMenuOpen(open) {
  $("appBurger").setAttribute("aria-expanded", String(open));
  $("appMenu").classList.toggle("open", open);
}

// Clicking beside a pop-up closes it
for (const id of ["comparisonDialog", "monthEntry"]) {
  $(id).addEventListener("click", (event) => {
    if (event.target === $(id)) $(id).close();
  });
}
$("appBurger").addEventListener("click", () => setMenuOpen($("appBurger").getAttribute("aria-expanded") !== "true"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuOpen(false);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".sidebar")) setMenuOpen(false);
});

// Light bulb button: switches between light and dark and saves it like the appearance settings.
function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  state.appearance = { ...appearance, mode: dark ? "light" : "dark" };
  applyAppearance(state.appearance);
  renderAppearance();
  save();
}

// First-time setup (js/app/setup.js): new accounts answer a few questions first; the answers are
// written into the settings and standing orders. Accounts that already have a wage skip it.
const needsSetup = () => !state.setupDone && !state.salaries.some((amount) => Number(amount) > 0);

function openSetup() {
  Setup.open({
    lists: { categories: state.categories, incomeCategories: state.incomeCategories, payments: state.payments },
    onFinish: applySetup,
  });
}

function applySetup(answers) {
  const money = (value) => Math.round(Math.max(0, Number(String(value).replace(",", ".")) || 0) * 100) / 100;
  const perYear = (value) => Array.from({ length: MAX_YEARS }, (_, i) => (i < answers.years ? money(value) : 0));

  state.start = `${answers.startYear}-${pad2(answers.startMonth)}-01`;
  state.years = answers.years;
  state.payday = answers.payday;
  state.thirteenth = answers.thirteenth;
  state.trackFrom = answers.trackFrom && answers.trackFrom > firstMonth() ? answers.trackFrom : null;
  state.salaries = Array.from({ length: MAX_YEARS }, (_, i) => (i < answers.years ? money(answers.wages[i]) : 0));

  const wanted = answers.allowances === "yes";
  for (const item of answers.allowanceItems) {
    const allowance = state.allowances.find((entry) => entry.id === item.id);
    if (!allowance) continue;
    allowance.enabled = wanted && item.on;
    if (allowance.enabled) Object.assign(allowance, { amounts: perYear(item.amount), per: item.per, month: item.per === "year" ? item.month || pad2(answers.startMonth) : undefined });
  }
  const own = answers.ownAllowance;
  if (wanted && own.name.trim()) {
    state.allowances.push({
      ...newAllowance("p" + newId(), own.name.trim(), true),
      amounts: perYear(own.amount),
      per: own.per,
      month: own.per === "year" ? own.month || pad2(answers.startMonth) : undefined,
    });
  }

  // Categories step: the edited lists replace the starting lists (a new account has no entries yet)
  for (const list of ["categories", "incomeCategories", "payments"]) {
    if (answers.lists?.[list]?.length) state[list] = [...answers.lists[list]];
  }

  for (const order of answers.orders) {
    state.recurring.push({
      id: newId(),
      kind: "expense",
      name: order.name.trim(),
      amount: money(order.amount),
      interval: order.interval,
      start: order.start,
      end: "",
      cat: order.cat,
    });
  }

  state.setupDone = true;
  setCurrentMonth(todaysMonth());
  persist();
  showPage("dashboard");
  if (!state.tourDone) startTour();
}

// Guided tour (js/app/tour.js): shown once per account, can be restarted in the settings.
function startTour() {
  const page = document.querySelector(".page.active")?.id;
  Tour.start({
    onFinish: () => {
      state.tourDone = true;
      if (page) showPage(page);
      persist();
    },
  });
}

// "Monat ändern": a pop-up with a year switch (‹ 2026 ›) and the twelve months as buttons.
// Months outside the apprenticeship cannot be chosen; a click opens the month right away.
let pickerYear = null;

function openMonthEntry() {
  setMenuOpen(false);
  pickerYear = Number(currentMonth.slice(0, 4));
  renderMonthGrid();
  if (!$("monthEntry").open) $("monthEntry").showModal();
  $("monthGrid").querySelector(".selected")?.focus();
}

function renderMonthGrid() {
  const months = monthList();
  const years = months.map((month) => Number(month.slice(0, 4)));
  const today = todaysMonth();
  $("pickerYear").textContent = pickerYear;
  document.querySelector('[data-action="picker-year"][data-step="-1"]').disabled = pickerYear <= Math.min(...years);
  document.querySelector('[data-action="picker-year"][data-step="1"]').disabled = pickerYear >= Math.max(...years);
  $("monthGrid").innerHTML = Array.from({ length: 12 }, (_, i) => {
    const month = `${pickerYear}-${pad2(i + 1)}`;
    const label = new Date(pickerYear, i).toLocaleDateString(I18N.locale, { month: "short" }).replace(".", "");
    const untracked = months.includes(month) && !isTracked(month);
    const classes = ["month-cell", month === currentMonth ? "selected" : "", month === today ? "today" : "", untracked ? "untracked" : ""].join(" ");
    const name = untracked ? `${monthName(month)} – ${t("Nicht erfasst")}` : monthName(month);
    return `<button type="button" class="${classes}" data-action="pick-month" data-month="${month}"
      aria-pressed="${month === currentMonth}" aria-label="${name}" title="${untracked ? t("Nicht erfasst") : ""}" ${months.includes(month) ? "" : "disabled"}>${label}</button>`;
  }).join("");
  $("pickerPeriod").textContent = `${monthName(currentMonth)} · ${periodLabel(currentMonth)}`;
}

function changePickerYear(data) {
  pickerYear += Number(data.step);
  renderMonthGrid();
}

function pickMonth(data) {
  if (!monthList().includes(data.month)) return;
  setCurrentMonth(data.month);
  for (const id of DEFAULT_DATE_FIELDS) {
    const form = formOfField(id);
    if (!editing[form]) {
      $(id).value = defaultDate();
      state.drafts[id] = $(id).value;
    }
  }
  $("monthEntry").close();
  persist();
}
