"use strict";

// Finance OS app, part: Forms: saving and deleting entries and standing orders, settings, categories, profile and account.
// Loaded by app.html in this order: state.js → calc.js → render.js → render-settings.js → future.js → layout.js → navigation.js → forms.js → main.js

// Forms and drafts

function formOf(type) {
  return ENTRY_KINDS[type] ? "expenses" : type;
}

function formOfField(id) {
  return Object.keys(FORMS).find((name) => FORMS[name].fields.includes(id));
}

function saveDrafts(form) {
  for (const id of FORMS[form].fields) state.drafts[id] = $(id).value;
}

function restoreDrafts() {
  const drafts = state.drafts;
  for (const id of ["entryKind", "recKind"]) {
    if (drafts[id]) setSelectValue(id, drafts[id], false);
  }
  fillSelects();
  for (const id of DRAFT_FIELDS) {
    if (!(id in drafts)) continue;
    const field = $(id);
    const value = (DATE_FIELDS.includes(id) && parseDate(drafts[id])) || drafts[id];
    if (field.tagName === "SELECT") setSelectValue(id, value, Boolean(editing[formOfField(id)]));
    else field.value = value;
  }
}

function resetForm(form, keep = []) {
  for (const id of FORMS[form].fields) {
    if (keep.includes(id)) continue;
    const field = $(id);
    if (field.tagName === "SELECT") field.selectedIndex = 0;
    else field.value = DEFAULT_DATE_FIELDS.includes(id) ? defaultDate() : "";
  }
}

function finishEdit(form, keep = []) {
  editing[form] = null;
  resetForm(form, keep);
  fillSelects();
  saveDrafts(form);
  updateEditButtons();
}

function cancelEdit(form) {
  finishEdit(form);
  save();
}

function saveRecord(type, record) {
  const form = formOf(type);
  const edit = editing[form];

  if (edit && edit.type === type) {
    const index = state[type].findIndex((record) => record.id === edit.id);
    if (index >= 0) state[type][index] = { ...state[type][index], ...record };
    else state[type].push({ id: edit.id, ...record });
  } else if (edit) {
    // The entry kind was changed, e.g. from expense to income.
    state[edit.type] = state[edit.type].filter((record) => record.id !== edit.id);
    state[type].push({ id: edit.id, ...record });
  } else {
    state[type].push({ id: newId(), ...record });
  }

  finishEdit(form, edit ? [] : FORMS[form].keepAfterSave);
  persist();
  notify("Gespeichert");
}

function saveEntry() {
  const date = readDate("exDate");
  const desc = $("exDesc").value.trim();
  const amount = readAmount("exAmount");
  if (!date || !desc || amount === null) {
    return notify("Bitte Datum, Beschreibung und einen Betrag grösser als 0 eingeben.");
  }
  // A withdrawal cannot exceed the savings balance (checked for new entries up to today).
  if ($("entryKind").value === "withdraw" && !editing.expenses && date <= todayISO()) {
    const account = savingAccounts().find((savings) => savings.name === $("exCat").value);
    const available = account ? accountBalances()[account.id] || 0 : 0;
    if (amount > available + 0.001) {
      return notify("Auf „{name}“ sind nur {amount} – so viel kannst du höchstens nehmen.", {
        name: $("exCat").value,
        amount: chf(available),
      });
    }
  }
  const kind = $("entryKind").value;
  saveRecord(ENTRY_TYPES[kind], {
    date,
    desc,
    cat: $("exCat").value,
    pay: kind === "expense" ? $("exPay").value : "",
    amount,
  });
  explainBooking(date);
}

// After saving: say so when the entry counts in another pay month or only from a later date,
// otherwise it seems to be missing from "available".
function explainBooking(date) {
  if (date > todayISO()) {
    notify("Gespeichert – zählt erst ab {date} (geplant).", { date: formatDate(date) });
  } else if (payrollMonth(date) !== currentMonth) {
    notify("Gespeichert im Lohnmonat {month} – der gewählte Monat ist {current}.", {
      month: monthName(payrollMonth(date)),
      current: monthName(currentMonth),
    });
  }
}

function saveRecurring() {
  const name = $("recName").value.trim();
  const amount = readAmount("recAmount");
  const start = readDate("recStart");
  const end = readDate("recEnd");
  if (!name || amount === null || !start) {
    return notify("Bitte Name, positiven Betrag und Startdatum eingeben.");
  }
  if ($("recEnd").value.trim() && !end) return notify("Bitte ein gültiges Enddatum eingeben.");
  if (end && end < start) return notify("Das Enddatum darf nicht vor dem Startdatum liegen.");
  const interval = INTERVALS[$("recInterval").value] ? $("recInterval").value : "monthly";
  // Expense, income or a transfer to a savings account
  const kind = [...$("recKind").options].some((option) => option.value === $("recKind").value) ? $("recKind").value : "expense";
  saveRecord("recurring", { kind, name, amount, interval, start, end, cat: $("recCat").value });
}

function editRecord(type, id) {
  const record = state[type]?.find((item) => item.id === id);
  if (!record) return;
  const form = formOf(type);
  editing[form] = { type, id };
  showPage(FORMS[form].page);

  let values;
  if (form === "expenses") {
    $("entryKind").value = ENTRY_KINDS[type];
    state.drafts.entryKind = ENTRY_KINDS[type];
    values = { exDate: record.date, exDesc: record.desc, exCat: record.cat, exPay: record.pay, exAmount: record.amount };
  } else if (form === "recurring") {
    const kind = record.kind || "expense";
    if (![...$("recKind").options].some((option) => option.value === kind)) {
      $("recKind").append(new Option(`${RECURRING_KIND_LABELS[kind]} (${t("archiviert")})`, kind));
    }
    $("recKind").value = kind;
    values = {
      recName: record.name,
      recAmount: record.amount,
      recInterval: record.interval || "monthly",
      recStart: record.start,
      recEnd: record.end,
      recCat: record.cat,
    };
  }

  fillSelects();
  for (const [fieldId, value] of Object.entries(values)) {
    if ($(fieldId).tagName === "SELECT") setSelectValue(fieldId, value ?? "", true);
    else $(fieldId).value = value ?? "";
  }
  saveDrafts(form);
  updateEditButtons();
  save();

  const firstField = $(FORMS[form].fields[0]);
  firstField.scrollIntoView({ block: "center" });
  firstField.focus({ preventScroll: true });
}

// Deletes right away; "Rückgängig" in the message brings the entry back at the same place.
function deleteRecord(type, id) {
  const index = state[type].findIndex((item) => item.id === id);
  if (index < 0) return;
  const [removed] = state[type].splice(index, 1);
  const form = formOf(type);
  if (editing[form]?.id === id) finishEdit(form);
  persist();
  notify("Eintrag gelöscht", null, () => {
    if (state[type].some((item) => item.id === id)) return;
    state[type].splice(Math.min(index, state[type].length), 0, removed);
    persist();
    notify("Eintrag wiederhergestellt");
  });
}

function openNewEntry() {
  showPage("expenses");
  if (editing.expenses) finishEdit("expenses");
  $("entryKind").value = "expense";
  state.drafts.entryKind = "expense";
  fillSelects();
  save();
  $("exDesc").focus();
}

// Settings

function saveSettings() {
  const start = readDate("setStart");
  if (!start) return notify("Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.");

  // Read only the visible year fields and keep the values of hidden years.
  const read = (prefix, list) =>
    list.map((value, i) => ($(prefix + i) ? readAmount(prefix + i, true) : Number(value) || 0));
  const salaries = read("salary", state.salaries);
  const extraSave = read("extraSave", state.extraSave);
  if ([...salaries, ...extraSave].includes(null)) return notify("Bitte gültige Beträge ab 0 eingeben.");

  const years = [2, 3, 4].includes(Number($("setYears").value)) ? Number($("setYears").value) : 4;
  const payday = Math.min(28, Math.max(1, Number($("setPayday").value) || 25));
  const thirteenth = ["none", "spread", "11", "12"].includes($("setThirteenth").value) ? $("setThirteenth").value : "none";
  const autoAccount = $("setAutoAccount").value;
  const trackFrom = /^\d{4}-\d{2}$/.test($("setTrackFrom").value) ? $("setTrackFrom").value : null;

  const thirteenthSave = Array.from({ length: MAX_YEARS }, (_, i) =>
    $("thirteenthSave" + i) ? $("thirteenthSave" + i).checked : Boolean((state.thirteenthSave || [])[i]),
  );

  Object.assign(state, { start, years, payday, thirteenth, salaries, extraSave, thirteenthSave, trackFrom });
  if (savingAccounts().some((account) => account.id === autoAccount)) state.autoAccount = autoAccount;
  if (!monthList().includes(currentMonth)) {
    setCurrentMonth(initialMonth());
    persist();
    openMonthEntry();
  } else {
    persist();
  }
  notify("Einstellungen gespeichert");
}

async function resetAll() {
  if (!(await confirmAction({ title: t("Wirklich alle Finanzwerte und Einträge auf 0 zurücksetzen?"), okLabel: t("Zurücksetzen") }))) return;
  // Keep appearance and layout; the first-time setup is not shown again.
  state = { ...createEmptyData(), appearance: state.appearance, layout: state.layout, setupDone: true };
  editing = loadEditing();
  setCurrentMonth(initialMonth());
  $("entryKind").value = "expense";
  fillSelects();
  Object.keys(FORMS).forEach((form) => resetForm(form));
  persist();
  openMonthEntry();
}

// Categories and payment methods

const LIST_SELECTS = {
  categories: ["exCat", "recCat"],
  incomeCategories: ["exCat", "recCat"],
  payments: ["exPay"],
};

function addListItem(type) {
  if (!LIST_SELECTS[type]) return;
  const input = $("listName-" + type);
  const name = input.value.trim();
  if (!name) return notify("Bitte eine Bezeichnung eingeben.");
  if (state[type].some((item) => item.toLowerCase() === name.toLowerCase())) {
    return notify("Diese Bezeichnung besteht bereits.");
  }
  state[type].push(name);
  input.value = "";
  persist();
  notify("Hinzugefügt");
}

async function renameListItem(type, index) {
  if (!LIST_SELECTS[type]) return;
  const oldName = state[type][index];
  const name = await askUser({ title: t("Umbenennen"), label: t("Neue Bezeichnung"), value: oldName, okLabel: t("Speichern") });
  if (!name || name === oldName) return;
  if (state[type].some((item, i) => i !== index && item.toLowerCase() === name.toLowerCase())) {
    return notify("Diese Bezeichnung besteht bereits.");
  }

  state[type][index] = name;
  renameInBookings(type, oldName, name);

  // Rename the selected values in the forms too.
  const selected = LIST_SELECTS[type].filter((id) => $(id).value === oldName);
  fillSelects();
  for (const id of selected) {
    $(id).value = name;
    state.drafts[id] = name;
  }
  persist();
  notify("Umbenannt");
}

async function deleteListItem(type, index) {
  if (!LIST_SELECTS[type]) return;
  if (state[type].length <= 1) return notify("Mindestens eine Bezeichnung muss erhalten bleiben.");
  if (!(await confirmAction({ title: t("Bezeichnung aus der Auswahl entfernen? Bestehende Buchungen bleiben erhalten."), okLabel: t("Entfernen") }))) return;
  state[type].splice(index, 1);
  persist();
  notify("Entfernt");
}

// Profile and privacy (only with login)

function showAccount(me) {
  $("accountName").textContent = me.username;
  $("accountEmail").textContent = me.email;
  $("newUsername").value = me.username;
}

async function changeUsername() {
  const username = $("newUsername").value.trim();
  if (!username) return notify("Bitte einen Benutzernamen eingeben.");
  try {
    const result = await api("/account/username", { method: "PUT", body: { username } });
    $("accountName").textContent = result.username;
    notify("Benutzername gespeichert");
  } catch (error) {
    notify(error.message);
  }
}

// Downloads all stored data as a file (Art. 25/28 FADP).
async function exportAccount() {
  try {
    const data = await api("/account/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `finance-os-${todayISO()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    notify("Deine Daten wurden heruntergeladen");
  } catch (error) {
    notify(error.message);
  }
}

// Deleting needs two steps: the password here sends an email, and only the link in it
// (login.html?delete=…) deletes the account with all data.
async function deleteAccount() {
  const password = $("deletePassword").value;
  if (!password) return notify("Bitte zur Bestätigung dein Passwort eingeben.");
  if (!(await confirmAction({ title: t("Konto löschen? Wir schicken dir zuerst eine E-Mail zur Bestätigung."), okLabel: t("E-Mail schicken") }))) return;
  try {
    const result = await api("/account", { method: "DELETE", body: { password } });
    $("deletePassword").value = "";
    $("deleteSent").textContent = t(result.message);
    $("deleteSent").hidden = false;
    notify(result.message);
  } catch (error) {
    $("deletePassword").value = "";
    notify(error.message);
  }
}
