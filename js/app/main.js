"use strict";

// Finance OS app, part: Events (clicks, inputs, keys) and start. Loaded last.
// Loaded by app.html in this order: state.js → calc.js → render.js → render-settings.js → future.js → layout.js → navigation.js → forms.js → payday.js → main.js

// Events

const actions = {
  "change-month": openMonthEntry,
  "close-month-entry": () => $("monthEntry").close(),
  "pick-month": pickMonth,
  "picker-year": changePickerYear,
  arrange: toggleArranging,
  "reset-layout": resetLayout,
  "toggle-block": toggleBlock,
  "start-tour": startTour,
  "show-comparison": showComparison,
  "close-comparison": () => $("comparisonDialog").close(),
  "payday-choice": choosePayday,
  "payday-confirm": confirmPayday,
  "payday-later": () => $("paydayDialog").close(),
  "undo-carry": undoCarry,
  "undo-payday-save": undoPaydaySave,
  "new-entry": openNewEntry,
  "toggle-recurring-payment": toggleRecurringPayment,
  "toggle-theme": toggleTheme,
  "add-allowance": addAllowance,
  "add-account": addAccount,
  "rename-account": (data) => renameAccount(data.id),
  "delete-account-item": (data) => deleteMoneyAccount(data.id),
  "rename-allowance": (data) => renameAllowance(data.id),
  "edit-saving": editSaving,
  "future-preset": (data) => chooseFuturePreset(data.preset),
  "future-pick": openFuturePick,
  "future-pick-year": changeFuturePickYear,
  "future-pick-month": pickFutureMonth,
  "close-future-pick": () => $("futureMonthDialog").close(),
  "delete-allowance": (data) => deleteAllowance(data.id),
  "save-entry": saveEntry,
  "save-recurring": saveRecurring,
  "save-settings": saveSettings,
  "cancel-edit": (data) => cancelEdit(data.form),
  "edit-record": (data) => editRecord(data.type, Number(data.id)),
  "delete-record": (data) => deleteRecord(data.type, Number(data.id)),
  "add-list-item": (data) => addListItem(data.list),
  "rename-list-item": (data) => renameListItem(data.list, Number(data.index)),
  "delete-list-item": (data) => deleteListItem(data.list, Number(data.index)),
  "reset-all": resetAll,
  "toggle-list": (data) => {
    const id = data.list;
    if (expandedLists.has(id)) expandedLists.delete(id);
    else expandedLists.add(id);
    render();
    if (!expandedLists.has(id)) $(id).closest(".fold").scrollIntoView({ block: "nearest" });
  },
  "dismiss-onboarding": () => {
    state.onboardingDismissed = true;
    persist();
  },
  "change-username": changeUsername,
  "export-account": exportAccount,
  "delete-account": deleteAccount,
  logout: async () => {
    // Save pending changes first, then log out.
    if (saveOnline.pending) {
      clearTimeout(saveOnline.timer);
      await sendData();
    }
    logoutAndRedirect();
  },
};

// No input is accepted until the data has loaded; otherwise an empty state
// could overwrite the saved data.
document.addEventListener("click", (event) => {
  if (!ready) return;
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.page) showPage(button.dataset.page);
  const action = actions[button.dataset.action];
  if (action) action(button.dataset);
});

document.addEventListener("input", (event) => {
  if (!ready) return;
  const field = event.target;
  if (DRAFT_FIELDS.includes(field.id)) {
    state.drafts[field.id] = field.value;
    save();
  }
});

document.addEventListener("change", (event) => {
  if (!ready) return;
  const field = event.target;
  if (APPEARANCE_FIELDS.includes(field.name)) return changeAppearance(field);
  if (field.dataset.allowance || field.dataset.allowanceToggle || field.dataset.allowancePer || field.dataset.allowanceMonth) {
    return changeAllowance(field);
  }
  if (field.dataset.accountStart) return changeAccountStart(field);
  if (field.dataset.accountStartMonth) return chooseOpeningMonth(field);
  if (SETTINGS_FIELD.test(field.id)) return saveSettings();

  if (field.id === "entryKind" || field.id === "recKind") fillSelects();
  if (DRAFT_FIELDS.includes(field.id)) {
    state.drafts[field.id] = field.value;
    if (field.id === "entryKind") state.drafts.exCat = $("exCat").value;
    if (field.id === "recKind") state.drafts.recCat = $("recCat").value;
    save();
  }
});

// Number fields: a 0 disappears on focus so the user can type right away;
// an empty settings field shows 0 again on blur.
document.addEventListener("focusin", (event) => {
  const field = event.target;
  if (field.type === "number" && field.value !== "" && Number(field.value) === 0) field.value = "";
});
document.addEventListener("focusout", (event) => {
  const field = event.target;
  const settingsNumber = SETTINGS_FIELD.test(field.id) || field.dataset.allowance || field.dataset.accountStart;
  if (field.type === "number" && field.value === "" && settingsNumber) {
    field.value = "0";
  }
});

// Enter in a form field saves the entry or standing order.
document.addEventListener("keydown", (event) => {
  if (!ready || event.key !== "Enter" || event.target.tagName !== "INPUT") return;
  if (event.target.id === "allowanceName") return addAllowance();
  if (event.target.id === "accountNewName") return addAccount();
  if (event.target.dataset.listInput) return addListItem(event.target.dataset.listInput);
  const form = formOfField(event.target.id);
  if (form === "expenses") saveEntry();
  else if (form === "recurring") saveRecurring();
});


// Recalculate after midnight and when returning to the tab.
let calculationDate = todayISO();
setInterval(() => {
  if (ready && todayISO() !== calculationDate) {
    calculationDate = todayISO();
    render();
  }
}, 60000);
document.addEventListener("visibilitychange", () => {
  if (ready && !document.hidden) {
    calculationDate = todayISO();
    render();
    checkLogin();
    checkPayday();
  }
});

// Back in the tab: is the login still valid? If the account was deleted meanwhile (e.g. the
// deletion was confirmed on the phone), api() goes to the login page, which says so.
let lastLoginCheck = 0;
function checkLogin() {
  if (!ONLINE || Date.now() - lastLoginCheck < 10000) return;
  lastLoginCheck = Date.now();
  api("/auth/me").catch(() => {
    // Not reachable: try again on the next return to the tab.
  });
}

window.addEventListener("pagehide", flushData);

// Start

async function loadSavedData() {
  if (!ONLINE) return readLocalData();
  const me = await api("/auth/me"); // api() redirects to the login page when not logged in
  const saved = await api("/data"); // null if nothing has been saved yet
  showAccount(me);
  $("accountBox").hidden = false;
  $("accountCard").hidden = false;
  $("privacyCard").hidden = false;
  setSaveStatus(t("Alles gespeichert"));
  $("storageNote").textContent = t("Deine Eingaben werden automatisch in deinem Konto gespeichert.");
  return saved || {};
}

/** Error page instead of the app: the data could not be loaded. Nothing is lost, the user can try again. */
function showServerError(error) {
  $("serverErrorDetail").textContent = error.status
    ? t("Fehlercode {code}", { code: error.status })
    : t("Server nicht erreichbar");
  $("serverError").hidden = false;
}

$("serverErrorRetry").addEventListener("click", () => location.reload());

async function start() {
  initFolds();
  let saved;
  try {
    saved = await loadSavedData();
  } catch (error) {
    // Without login (401) api() redirects; the app stays hidden meanwhile.
    if (error.message !== "Bitte neu einloggen") {
      document.documentElement.classList.remove("checking-login");
      showServerError(error); // e.g. backend not reachable or server error (500)
    }
    return;
  }
  document.documentElement.classList.remove("checking-login"); // login confirmed, show the app

  state = loadData(saved);
  localizeDefaultNames();
  addBlockBars();
  syncAccountBlocks();
  applyLayout();
  editing = loadEditing();
  $("setPayday").innerHTML = Array.from({ length: 28 }, (_, i) => i + 1)
    .map((day) => `<option value="${day}">${day}.${day === 1 ? ` (= ${t("Kalendermonat")})` : ""}</option>`)
    .join("");
  buildYearSettings();
  // Always start in today's pay month; otherwise a month chosen earlier stays open after payday
  // and new entries seem to be missing.
  setCurrentMonth(todaysMonth());
  fillSelects();
  Object.keys(FORMS).forEach((form) => resetForm(form));
  restoreDrafts();
  ready = true;
  applyAppearance(state.appearance);
  renderAppearance();
  render();
  if (appearance.startPage !== "dashboard") showPage(appearance.startPage);
  if (needsSetup()) return openSetup();
  if (!state.setupDone) state.setupDone = true; // accounts from before the setup existed
  save();
  if (!state.tourDone) startTour();
  else checkPayday();
}

start();
