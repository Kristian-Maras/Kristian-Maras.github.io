"use strict";

// Finance OS app, part: Showing the settings: wage table, allowances, accounts and account cards, lists, phone tables, collapsible sections.
// Loaded by app.html in this order: state.js → calc.js → render.js → render-settings.js → future.js → layout.js → navigation.js → forms.js → main.js

// Wage table with one row per apprenticeship year. Rebuilt only when the length changes,
// otherwise typed values would be lost.
let yearTableShape = "";

function buildYearSettings() {
  const shape = String(state.years);
  if (shape === yearTableShape) return;
  yearTableShape = shape;

  const input = (id, label) =>
    `<input id="${id}" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="${label}">`;
  $("yearSettingsHead").innerHTML = `<tr><th>${t("Lehrjahr")}</th><th>${t("Nettolohn CHF")}</th><th>${t("Automatisch sparen CHF")}</th><th id="thirteenthHead"></th></tr>`;
  $("yearSettings").innerHTML = yearIndexes()
    .map((i) => {
      const year = yearLabel(i);
      return `<tr>
        <td><b>${year}</b></td>
        <td>${input("salary" + i, `${t("Nettolohn")} ${year}`)}</td>
        <td>${input("extraSave" + i, `${t("Automatisch sparen")} ${year}`)}</td>
        <td class="money computed"><div class="thirteenth-cell">
          <span class="thirteenth-info">
            <small class="thirteenth-title">${t("13. Monatslohn")}</small>
            <span class="thirteenth-amount" id="thirteenth${i}" aria-live="polite"></span>
          </span>
          <label class="switch thirteenth-save">
            <span class="switch-text"><span class="long-label">${t("13. Lohn sparen")}</span><span class="short-label">${t("Sparen")}</span></span>
            <input type="checkbox" id="thirteenthSave${i}" aria-label="${t("13. Monatslohn sparen")} – ${year}">
          </label>
        </div></td>
      </tr>`;
    })
    .join("");
  addMobileLabels();
}

// Allowance list: one switch per allowance; enabled ones show amount and saved part per year.
// Rebuilt only when the list or the apprenticeship length changes.
let allowanceShape = "";

function renderAllowances() {
  const shape = JSON.stringify([state.years, state.allowances.map((allowance) => [allowance.id, allowance.name, allowance.enabled, allowance.per, allowanceMonth(allowance)])]);
  if (shape !== allowanceShape) {
    allowanceShape = shape;
    const input = (allowance, field, i, label) =>
      `<input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="${label}"
        id="al-${allowance.id}-${field}-${i}" data-allowance="${allowance.id}" data-field="${field}" data-year="${i}">`;
    $("allowanceList").innerHTML = state.allowances
      .map((allowance) => {
        const name = escapeHTML(allowance.name);
        const yearly = allowance.per === "year";
        const amountLabel = yearly ? t("CHF pro Jahr") : t("CHF pro Monat");
        const years = allowance.enabled
          ? `<div class="allowance-years">${yearIndexes()
              .map(
                (i) => `<div class="allowance-year">
                  <b>${yearLabel(i)}</b>
                  <label>${amountLabel} ${input(allowance, "amounts", i, `${name} ${yearLabel(i)}`)}</label>
                  <label>${t("davon sparen")} ${input(allowance, "save", i, `${t("{name} sparen", { name })} ${yearLabel(i)}`)}</label>
                </div>`,
              )
              .join("")}</div>`
          : "";
        return `<div class="allowance ${allowance.enabled ? "on" : ""}">
          <div class="allowance-head">
            <label class="switch">
              <span class="switch-text"><span translate="no">${name}</span></span>
              <input type="checkbox" data-allowance-toggle="${allowance.id}" ${allowance.enabled ? "checked" : ""}>
            </label>
            ${allowance.enabled ? `<select class="allowance-per" data-allowance-per="${allowance.id}" aria-label="${t("Wie oft? {name}", { name })}">
              <option value="month" ${yearly ? "" : "selected"}>${t("monatlich")}</option>
              <option value="year" ${yearly ? "selected" : ""}>${t("jährlich")}</option>
            </select>` : ""}
            ${allowance.enabled && yearly ? `<label class="allowance-month">${t("kommt im")}
              <select data-allowance-month="${allowance.id}" aria-label="${t("In welchem Lohnmonat? {name}", { name })}">
                ${Array.from({ length: 12 }, (_, i) => pad2(i + 1))
                  .map((number) => `<option value="${number}" ${number === allowanceMonth(allowance) ? "selected" : ""}>${monthLabel(number)}</option>`)
                  .join("")}
              </select></label>` : ""}
            <button class="secondary allowance-rename" data-action="rename-allowance" data-id="${allowance.id}" aria-label="${t("{name} umbenennen", { name })}" title="${t("Umbenennen")}"><span aria-hidden="true">✎</span></button>
            <button class="danger" data-action="delete-allowance" data-id="${allowance.id}" aria-label="${t("{name} entfernen", { name })}">${t("Entfernen")}</button>
          </div>
          ${years}
        </div>`;
      })
      .join("");
  }
  for (const allowance of enabledAllowances()) {
    for (const i of yearIndexes()) {
      setValue(`al-${allowance.id}-amounts-${i}`, allowance.amounts[i]);
      setValue(`al-${allowance.id}-save-${i}`, allowance.save[i]);
    }
  }
}

function changeAllowance(field) {
  const id = field.dataset.allowance || field.dataset.allowanceToggle || field.dataset.allowancePer || field.dataset.allowanceMonth;
  const allowance = state.allowances.find((allowance) => allowance.id === id);
  if (!allowance) return;
  if (field.dataset.allowanceMonth) {
    allowance.month = field.value;
    return persist();
  }
  if (field.dataset.allowancePer) {
    allowance.per = field.value === "year" ? "year" : "month";
    return persist();
  }
  if (field.dataset.allowanceToggle) {
    allowance.enabled = field.checked;
    return persist();
  }
  const year = Number(field.dataset.year);
  const value = readAmount(field.id, true);
  if (value === null) return notify("Bitte einen gültigen Betrag ab 0 eingeben.");
  const list = allowance[field.dataset.field];
  // A first value in year 1 is copied to all years; each can be changed afterwards.
  const othersEmpty = list.every((amount, i) => i === year || !amount);
  if (year === 0 && othersEmpty) list.fill(value);
  else list[year] = value;
  if (allowance.save.some((amount, i) => amount > allowance.amounts[i])) {
    allowance.save = allowance.save.map((amount, i) => Math.min(amount, allowance.amounts[i]));
    notify("„davon sparen“ kann nicht grösser sein als die Pauschale – angepasst.");
  }
  persist();
}

function addAllowance() {
  const name = $("allowanceName").value.trim();
  if (!name) return notify("Bitte einen Namen für die Pauschale eingeben.");
  if (state.allowances.some((allowance) => allowance.name.toLowerCase() === name.toLowerCase())) {
    return notify("Diese Pauschale gibt es schon.");
  }
  state.allowances.push(newAllowance("p" + newId(), name, true));
  $("allowanceName").value = "";
  persist();
  notify("Pauschale hinzugefügt");
}

async function renameAllowance(id) {
  const allowance = state.allowances.find((allowance) => allowance.id === id);
  if (!allowance) return;
  const name = await askUser({ title: t("Umbenennen"), label: t("Neuer Name für die Pauschale"), value: allowance.name, okLabel: t("Speichern") });
  if (!name || name === allowance.name) return;
  if (state.allowances.some((other) => other !== allowance && other.name.toLowerCase() === name.toLowerCase())) {
    return notify("Diese Pauschale gibt es schon.");
  }
  allowance.name = name;
  persist();
  notify("Umbenannt");
}

async function deleteAllowance(id) {
  const allowance = state.allowances.find((allowance) => allowance.id === id);
  if (!allowance) return;
  if (!(await confirmAction({ title: t("Pauschale „{name}“ entfernen?", { name: allowance.name }), okLabel: t("Entfernen") }))) return;
  state.allowances = state.allowances.filter((allowance) => allowance.id !== id);
  persist();
}

// Account cards on the dashboard and account management in the settings

// Dashboard: one block per account with what happened on it in the selected pay month.
// Each account can be moved and resized on its own while arranging.
function renderAccountCards() {
  syncAccountBlocks();
  const moves = accountMoves([currentMonth]);
  for (const account of state.accounts) {
    const spending = account.kind === "spending";
    const amount = moves[account.id] || 0;
    const block = document.querySelector(`[data-block="account-${account.id}"]`);
    block.dataset.blockName = account.name;
    block.querySelector("[data-block-bar] .block-name").textContent = account.name;
    block.querySelector(".account-card").outerHTML = `<div class="account-card ${spending ? "spending" : "saving"}">
        <span class="account-type">${spending ? t("Übrig im Lohnmonat") : t("Gespart im Lohnmonat")}</span>
        <b translate="no">${escapeHTML(account.name)}</b>
        <strong class="${amount < 0 ? "bad" : ""}">${chf(amount)}</strong>
      </div>`;
  }
}

// Adds a block for a new account and removes the block of a deleted one.
function syncAccountBlocks() {
  const container = document.querySelector('[data-sortable="dashboard"]');
  const ids = state.accounts.map((account) => "account-" + account.id);
  container.querySelectorAll('[data-block^="account-"]').forEach((block) => {
    if (!ids.includes(block.dataset.block)) block.remove();
  });
  let added = false;
  for (const account of state.accounts) {
    if (container.querySelector(`[data-block="account-${account.id}"]`)) continue;
    const block = document.createElement("div");
    block.className = "block";
    block.dataset.block = "account-" + account.id;
    block.dataset.blockName = account.name;
    block.dataset.blockPlain = "true"; // the user's own name, not translated
    block.dataset.defaultSize = "narrow";
    block.innerHTML = '<div class="account-card"></div>';
    container.append(block);
    addBlockBar(block);
    added = true;
  }
  if (added) applyLayout();
}

let accountShape = "";

function renderAccounts() {
  const shape = JSON.stringify(state.accounts.map((account) => [account.id, account.name]));
  const balance = accountBalances();
  if (shape !== accountShape) {
    accountShape = shape;
    $("accountList").innerHTML = state.accounts
      .map((account) => {
        const spending = account.kind === "spending";
        const removable = !spending && savingAccounts().length > 1;
        const name = escapeHTML(account.name);
        return `<div class="account-row ${spending ? "spending" : "saving"}">
          <div class="account-head">
            <div class="account-row-name">
              <span class="account-badge ${spending ? "spending" : "saving"}">${spending ? t("Ausgaben") : t("Sparen")}</span>
              <b translate="no">${name}</b>
            </div>
            <div class="account-today">
              <small>${t("Stand heute")}</small>
              <strong id="acc-balance-${account.id}"></strong>
            </div>
            <div class="actions">
              <button class="secondary icon-button" data-action="rename-account" data-id="${account.id}"
                aria-label="${t("{name} umbenennen", { name })}" title="${t("Umbenennen")}"><span aria-hidden="true">✎</span></button>
              ${removable ? `<button class="danger" data-action="delete-account-item" data-id="${account.id}">${t("Löschen")}</button>` : ""}
            </div>
          </div>
          <div class="account-start">
            <label for="acc-start-${account.id}">${t("Anfangsbestand")}</label>
            <div class="account-start-row">
              <select id="acc-start-month-${account.id}" data-account-start-month="${account.id}" aria-label="${t("Lohnmonat")}"></select>
              <span class="money-field"><span aria-hidden="true">CHF</span>
                <input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"
                  id="acc-start-${account.id}" data-account-start="${account.id}"></span>
            </div>
          </div>
        </div>`;
      })
      .join("");
  }
  for (const account of state.accounts) {
    // Money already on the account, for the chosen pay month (see openingsOf in calc.js);
    // today's pay month unless another one is chosen.
    const months = openingMonths();
    const month = months.includes(openingChoice[account.id]) ? openingChoice[account.id] : todaysMonth();
    const openings = openingsOf(account);
    const select = $(`acc-start-month-${account.id}`);
    select.innerHTML = months
      .map((key) => `<option value="${key}" ${key === month ? "selected" : ""}>${monthName(key)}</option>`)
      .join("");
    setValue(`acc-start-${account.id}`, openings[month] || "");
    $(`acc-balance-${account.id}`).textContent = chf(balance[account.id] || 0);
  }
}

function addAccount() {
  const name = $("accountNewName").value.trim();
  if (!name) return notify("Bitte einen Namen für das Konto eingeben.");
  if (state.accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) return notify("Dieses Konto gibt es schon.");
  state.accounts.push({ id: "s" + newId(), name, kind: "saving", start: 0 });
  $("accountNewName").value = "";
  persist();
  notify("Sparkonto hinzugefügt");
}

async function renameAccount(id) {
  const account = state.accounts.find((account) => account.id === id);
  if (!account) return;
  const name = await askUser({ title: t("Umbenennen"), label: t("Neuer Name für das Konto"), value: account.name, okLabel: t("Speichern") });
  if (!name || name === account.name) return;
  if (state.accounts.some((other) => other !== account && other.name.toLowerCase() === name.toLowerCase())) {
    return notify("Dieses Konto gibt es schon.");
  }
  if (account.kind === "saving") renameInBookings("accounts", account.name, name);
  account.name = name;
  persist();
  notify("Umbenannt");
}

async function deleteMoneyAccount(id) {
  const account = state.accounts.find((account) => account.id === id);
  if (!account || account.kind !== "saving" || savingAccounts().length <= 1) return;
  if (!(await confirmAction({ title: t("Sparkonto „{name}“ löschen? Bisherige Buchungen bleiben erhalten.", { name: account.name }), okLabel: t("Löschen") }))) return;
  state.accounts = state.accounts.filter((account) => account.id !== id);
  if (state.autoAccount === id) state.autoAccount = savingAccounts()[0].id;
  persist();
  notify("Konto gelöscht");
}

function changeAccountStart(field) {
  const account = state.accounts.find((account) => account.id === field.dataset.accountStart);
  const value = readAmount(field.id, true);
  if (!account) return;
  if (value === null) return notify("Bitte einen gültigen Betrag ab 0 eingeben.");
  // Counts in the chosen pay month only (see openingsOf in calc.js)
  const openings = openingsOf(account);
  const month = openingMonths().includes(openingChoice[account.id]) ? openingChoice[account.id] : todaysMonth();
  if (value) openings[month] = value;
  else delete openings[month];
  persist();
}

// Pay month chosen next to the opening balance (only while the page is open)
const openingChoice = {};

// Pay months an opening balance can be entered for: the tracked ones up to today's
function openingMonths() {
  const today = todaysMonth();
  const months = countedMonths().filter((month) => month <= today);
  return months.includes(today) ? months : [...months, today];
}

function chooseOpeningMonth(field) {
  openingChoice[field.dataset.accountStartMonth] = field.value;
  renderAccounts();
}

// "Tracken ab" in the settings: the start of the apprenticeship or any pay month up to the next one.
function renderTrackFrom() {
  const first = firstMonth();
  const started = monthList().filter(hasStarted).at(-1);
  const last = started ? monthList().find((month) => month > started) || started : first;
  const months = monthList().filter((month) => month <= last);
  const label = (month) => `${formatDate(period(month).start)}`;
  $("setTrackFrom").innerHTML = months
    .map((month, i) => `<option value="${i === 0 ? "" : month}">${i === 0 ? t("Ab Lehrbeginn ({date})", { date: label(month) }) : label(month)}</option>`)
    .join("");
  const start = trackStart();
  // Set directly: the options were just rebuilt, so the field must show the saved month
  // even while it still has focus right after choosing (setValue skips focused fields).
  $("setTrackFrom").value = start === first ? "" : months.includes(start) ? start : "";
}

function renderSettings() {
  setValue("setStart", state.start);
  setValue("setYears", String(state.years));
  setValue("setPayday", String(state.payday));
  setValue("setThirteenth", state.thirteenth);
  renderTrackFrom();
  $("setAutoAccount").innerHTML = savingAccounts()
    .map((account) => `<option value="${account.id}">${escapeHTML(account.name)}</option>`)
    .join("");
  $("setAutoAccount").value = state.autoAccount; // options rebuilt above, see renderTrackFrom
  $("paydayNote").textContent = paydayText();

  buildYearSettings();
  for (const i of yearIndexes()) {
    setValue("salary" + i, state.salaries[i]);
    setValue("extraSave" + i, state.extraSave[i]);
  }
  for (const i of yearIndexes()) {
    const amount = thirteenthPerYear(Number(state.salaries[i]) || 0);
    $("thirteenth" + i).textContent = state.thirteenth === "none" ? "–" : chf(amount);
    $("thirteenthSave" + i).checked = Boolean((state.thirteenthSave || [])[i]);
  }
  // The switch is there whenever there is a 13th-month salary (extra in Nov/Dec or spread over 12 wages)
  $("yearSettings").closest("table").classList.toggle("thirteenth-paid", ["11", "12", "spread"].includes(state.thirteenth));
  $("thirteenthNote").textContent = thirteenthText();
  $("yearSettings").closest("table").classList.toggle("no-thirteenth", state.thirteenth === "none");
  $("thirteenthHead").textContent = state.thirteenth === "spread" ? t("Davon 13. Monatslohn") : t("13. Monatslohn pro Jahr");
  renderAllowances();
  renderAccounts();
}

function renderLists() {
  for (const type of Object.keys(LIST_SELECTS)) {
    document.querySelector(`[data-list-items="${type}"]`).innerHTML = state[type]
      .map(
        (name, index) => `<li class="chip">
          <span>${escapeHTML(name)}</span>
          <button class="chip-button" data-action="rename-list-item" data-list="${type}" data-index="${index}"
            aria-label="${t("{name} umbenennen", { name: escapeHTML(name) })}" title="${t("Umbenennen")}">✎</button>
          <button class="chip-button remove" data-action="delete-list-item" data-list="${type}" data-index="${index}"
            aria-label="${t("{name} entfernen", { name: escapeHTML(name) })}" title="${t("Entfernen")}">×</button>
        </li>`,
      )
      .join("");
  }
}

// On phones tables are shown as cards; the column names come from data-label.
function addMobileLabels() {
  document.querySelectorAll("table").forEach((table) => {
    const labels = [...table.querySelectorAll("thead th")].map((th) => th.textContent);
    table.classList.add("mobile-cards");
    table.querySelectorAll("tbody tr").forEach((row) => {
      [...row.children].forEach((cell, i) => cell.setAttribute("data-label", labels[i] || ""));
    });
  });
}

// Long lists show only the newest rows (5 on phones, 10 otherwise) plus a "show all" button.

const SHORT_LISTS = ["monthMath", "plannedPaymentsRows", "allExpenses", "recurringRows"];
const expandedLists = new Set();
const isPhone = () => window.matchMedia("(max-width: 760px)").matches;

function shortenLists() {
  const maxRows = isPhone() ? 5 : 10;
  for (const id of SHORT_LISTS) {
    const tableBody = $(id);
    const rows = [...tableBody.rows].filter((row) => !row.querySelector(".empty"));
    const counter = document.querySelector(`[data-count-for="${id}"]`);
    if (counter) counter.textContent = rows.length || "";
    if (rows.length <= maxRows + 2) continue; // not worth a button for one or two more rows

    const open = expandedLists.has(id);
    rows.forEach((row, i) => (row.hidden = !open && i >= maxRows));
    tableBody.insertAdjacentHTML(
      "beforeend",
      `<tr class="more-row"><td colspan="9"><button class="more-button" data-action="toggle-list" data-list="${id}" aria-expanded="${open}">
        ${open ? t("Weniger anzeigen") : t("Alle {n} anzeigen", { n: rows.length })}</button></td></tr>`,
    );
  }
}

// Collapsible sections: each <details class="fold"> remembers its state in this browser.
// Defaults: data-default="closed" starts closed, data-mobile="closed" starts closed on phones.

const FOLD_KEY = "financeos.folds";

function readFolds() {
  try {
    return JSON.parse(localStorage.getItem(FOLD_KEY)) || {};
  } catch {
    return {};
  }
}

function initFolds() {
  const saved = readFolds();
  const phone = isPhone();
  document.querySelectorAll("details.fold").forEach((fold) => {
    const key = fold.dataset.fold;
    const closed = fold.dataset.default === "closed" || (phone && fold.dataset.mobile === "closed");
    fold.open = key in saved ? saved[key] : !closed;
    fold.addEventListener("toggle", () => {
      const foldStates = readFolds();
      foldStates[key] = fold.open;
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify(foldStates));
      } catch {
        // Private mode: state is not remembered.
      }
    });
  });
}

function updateEditButtons() {
  for (const [name, form] of Object.entries(FORMS)) {
    $(form.cancelButton).hidden = !editing[name];
    $(form.saveButton).textContent = editing[name] ? t("Änderungen speichern") : form.saveLabel;
  }
}

function render() {
  fillSelects();
  $("activeMonthLabel").textContent = monthName(currentMonth);
  $("mobileMonthLabel").textContent = monthName(currentMonth);
  renderDashboard();
  renderMonthPage();
  renderEntryList();
  renderRecurringList();
  renderSettings();
  renderFuture();
  renderLists();
  updateEditButtons();
  addMobileLabels();
  shortenLists();
}
