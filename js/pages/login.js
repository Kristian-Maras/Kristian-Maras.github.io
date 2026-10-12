// Login page: log in, register, forgot/reset password, confirm email links and,
// for logged-in users, change password or email address.

const $ = (id) => document.getElementById(id);
const t = I18N.t;
const form = $("authForm");
const passwordField = $("password");
const submitButton = $("submitBtn");
const MIN_PASSWORD_LENGTH = 8;

// Same rules as PasswordPolicy in the backend. Special character = neither letter, digit nor space.
const PASSWORD_RULES = {
  length: { test: (password) => password.length >= MIN_PASSWORD_LENGTH, message: "Passwort braucht mindestens 8 Zeichen" },
  upper: { test: (password) => /\p{Lu}/u.test(password), message: "Passwort braucht mindestens einen Grossbuchstaben" },
  lower: { test: (password) => /\p{Ll}/u.test(password), message: "Passwort braucht mindestens einen Kleinbuchstaben" },
  special: {
    test: (password) => /[^\p{L}\p{N}\s]/u.test(password),
    message: "Passwort braucht mindestens ein Sonderzeichen (z. B. ! ? # %)",
  },
};

let mode = "login";
let resetToken = null; // from a ?reset=… email link

const VIEWS = {
  login: {
    title: t("Willkommen zurück"),
    subtitle: t("Melde dich mit deiner E-Mail-Adresse an."),
    button: t("Einloggen"),
    passwordLabel: t("Passwort"),
  },
  register: {
    title: t("Konto erstellen"),
    subtitle: t("Nach der Registrierung bestätigst du deine E-Mail-Adresse über einen Link."),
    button: t("Konto erstellen"),
    passwordLabel: t("Passwort"),
  },
  forgot: {
    title: t("Passwort vergessen"),
    subtitle: t("Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort wählen kannst."),
    button: t("Link schicken"),
  },
  reset: {
    title: t("Neues Passwort wählen"),
    subtitle: t("Danach wirst du überall abgemeldet und kannst dich mit dem neuen Passwort einloggen."),
    button: t("Passwort speichern"),
    passwordLabel: t("Neues Passwort"),
  },
  // Opened from the app (Settings → Profile); these require a login.
  changePassword: {
    title: t("Passwort ändern"),
    subtitle: t("Bestätige mit deinem aktuellen Passwort. Danach werden alle anderen Geräte abgemeldet und du bekommst eine Hinweis-E-Mail."),
    button: t("Passwort ändern"),
    passwordLabel: t("Neues Passwort"),
  },
  changeEmail: {
    title: t("E-Mail-Adresse ändern"),
    subtitle: t("Wir schicken einen Bestätigungslink an die neue Adresse. Die Änderung gilt erst, wenn du ihn öffnest."),
    button: t("Link schicken"),
    passwordLabel: t("Passwort zur Bestätigung"),
    emailLabel: t("Neue E-Mail-Adresse"),
  },
};

// ?change=password|email → view name
const CHANGE_VIEWS = { password: "changePassword", email: "changeEmail" };
// A change that should continue after the user has logged in.
const PENDING_CHANGE_KEY = "financeOS_pendingChange";
// Typed email/username (never the password) survive a visit to the privacy page.
const DRAFT_KEY = "financeOS_loginDraft";

function setMode(newMode, { keepMessages = false } = {}) {
  mode = newMode;
  const view = VIEWS[mode];

  document.querySelectorAll("[data-show]").forEach((element) => {
    element.hidden = !element.dataset.show.split(" ").includes(mode);
  });
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  $("authTitle").textContent = view.title;
  $("authSubtitle").textContent = view.subtitle;
  submitButton.textContent = view.button;
  if (view.passwordLabel) $("passwordLabel").textContent = view.passwordLabel;
  $("emailLabel").textContent = view.emailLabel || t("E-Mail");
  $("email").autocomplete = mode === "changeEmail" ? "off" : "email";
  passwordField.autocomplete = ["login", "changeEmail"].includes(mode) ? "current-password" : "new-password";
  $("currentPassword").value = "";
  passwordField.value = "";
  $("resendBtn").hidden = true;
  updatePasswordMeter();

  // Keep the view in the URL so going back from another page shows the same form.
  const change = Object.keys(CHANGE_VIEWS).find((key) => CHANGE_VIEWS[key] === mode);
  const query = change ? `?change=${change}` : mode === "register" || mode === "forgot" ? `?${mode}` : "";
  history.replaceState(null, "", location.pathname + query);

  if (!keepMessages) {
    showError("");
    showNotice("");
  }
}

// Messages (including those from the server) are shown in the selected language.
function showError(message) {
  message = t(message);
  $("authError").textContent = message;
  $("authError").hidden = !message;
}

function showNotice(message) {
  message = t(message);
  $("authNotice").textContent = message;
  $("authNotice").hidden = !message;
}

/** The first rule the password does not meet, or null if it meets all of them. */
function unmetPasswordRule(password) {
  return Object.values(PASSWORD_RULES).find((rule) => !rule.test(password)) || null;
}

// Rule list below the password field: each rule is ticked as soon as it is met.
function updatePasswordMeter() {
  const password = passwordField.value;
  let metCount = 0;
  for (const [name, rule] of Object.entries(PASSWORD_RULES)) {
    const met = rule.test(password);
    if (met) metCount += 1;
    document.querySelector(`#passwordRules [data-rule="${name}"]`).classList.toggle("met", met);
  }
  const allMet = metCount === Object.keys(PASSWORD_RULES).length;
  const fill = $("pwMeterFill");
  fill.style.width = `${(metCount / Object.keys(PASSWORD_RULES).length) * 100}%`;
  fill.classList.toggle("ok", allMet);
}

function setBusy(busy) {
  submitButton.disabled = busy;
  submitButton.textContent = busy ? t("Bitte warten …") : VIEWS[mode].button;
}

async function submit() {
  const email = $("email").value.trim();
  const password = passwordField.value;
  const username = $("username").value.trim();
  showError("");

  if (mode === "changePassword" || mode === "changeEmail") return submitAccountChange(email, password);

  if (mode === "register" && !username) return showError("Bitte einen Benutzernamen eingeben");
  if (mode !== "reset" && !email) return showError("Bitte deine E-Mail-Adresse eingeben");
  if (mode !== "forgot" && !password) return showError("Bitte ein Passwort eingeben");
  if ((mode === "register" || mode === "reset") && unmetPasswordRule(password)) {
    return showError(unmetPasswordRule(password).message);
  }
  if (mode === "register" && !$("acceptTerms").checked) {
    return showError("Bitte akzeptiere die Nutzungsbedingungen und die Datenschutzerklärung.");
  }

  setBusy(true);
  try {
    if (mode === "login") {
      const result = await api("/auth/login", { method: "POST", body: { email, password }, redirectOn401: false });
      rememberLogin(result);
      passwordField.value = "";
      // Continue with a password/email change that required logging in first.
      const pendingChange = readPendingChange();
      if (pendingChange) {
        clearPendingChange();
        setMode(CHANGE_VIEWS[pendingChange]);
        return;
      }
      location.replace("app.html");
      return;
    }
    if (mode === "register") {
      const result = await api("/auth/register", { method: "POST", body: { email, username, password, acceptTerms: $("acceptTerms").checked }, redirectOn401: false });
      setMode("login");
      $("email").value = email;
      showNotice(t(result.message) + spamHint() + localMailHint());
    } else if (mode === "forgot") {
      const result = await api("/auth/forgot-password", { method: "POST", body: { email }, redirectOn401: false });
      setMode("login");
      $("email").value = email;
      showNotice(t(result.message) + localMailHint());
    } else if (mode === "reset") {
      const result = await api("/auth/reset-password", { method: "POST", body: { token: resetToken, password }, redirectOn401: false });
      resetToken = null;
      setMode("login");
      showNotice(result.message);
    }
  } catch (error) {
    showError(error.message);
    if (error.code === "EMAIL_NOT_VERIFIED") $("resendBtn").hidden = false;
  } finally {
    setBusy(false);
  }
}

function readPendingChange() {
  try {
    return sessionStorage.getItem(PENDING_CHANGE_KEY);
  } catch {
    return null;
  }
}

function clearPendingChange() {
  try {
    sessionStorage.removeItem(PENDING_CHANGE_KEY);
  } catch {
    // Nothing stored.
  }
}

function rememberPendingChange(change) {
  try {
    sessionStorage.setItem(PENDING_CHANGE_KEY, change);
  } catch {
    // Without storage the user simply lands in the app after logging in.
  }
}

async function submitAccountChange(email, password) {
  const currentPassword = $("currentPassword").value;
  if (mode === "changePassword") {
    if (!currentPassword) return showError("Bitte dein aktuelles Passwort eingeben");
    if (unmetPasswordRule(password)) return showError(unmetPasswordRule(password).message);
  } else {
    if (!email) return showError("Bitte die neue E-Mail-Adresse eingeben");
    if (!password) return showError("Bitte dein Passwort eingeben");
  }

  setBusy(true);
  try {
    const result =
      mode === "changePassword"
        ? await api("/account/password", {
            method: "PUT",
            body: { currentPassword, newPassword: password },
            redirectOn401: false,
          })
        : await api("/account/email", { method: "POST", body: { newEmail: email, password }, redirectOn401: false });
    if (mode === "changePassword") rememberLogin(result);
    const changedMode = mode;
    setMode(changedMode, { keepMessages: true });
    $("email").value = "";
    showNotice(t(result.message) + (changedMode === "changeEmail" ? localMailHint() : ""));
  } catch (error) {
    if (error.status === 401) {
      // Session expired: log in first, then continue here.
      rememberPendingChange(mode === "changePassword" ? "password" : "email");
      setMode("login");
      showNotice("Bitte zuerst einloggen.");
      return;
    }
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

async function resendVerification() {
  const email = $("email").value.trim();
  try {
    const result = await api("/auth/resend-verification", { method: "POST", body: { email }, redirectOn401: false });
    showError("");
    $("resendBtn").hidden = true;
    showNotice(t(result.message) + spamHint() + localMailHint());
  } catch (error) {
    showError(error.message);
  }
}

/** Confirmation emails sometimes land in spam, so point there. */
function spamHint() {
  return " " + t("Schau auch im Spam-Ordner nach.");
}

/** Without a mail server the emails are printed to the IntelliJ console; say so when running locally. */
function localMailHint() {
  return ["localhost", "127.0.0.1"].includes(location.hostname)
    ? " " + t("(Lokal ohne Mailserver: Den Link findest du in der IntelliJ-Konsole.)")
    : "";
}

/**
 * Handles URL parameters: links from emails (?verify, ?reset, ?email), ?forgot, ?register,
 * ?deleted and ?change=password|email from the app.
 */
async function handleUrlParameters() {
  const params = new URLSearchParams(INITIAL_SEARCH);
  if ([...params.keys()].length === 0) return false;
  // Remove secret tokens from the address bar right away; setMode() writes the view back.
  history.replaceState(null, "", location.pathname);

  if (params.has("deleted")) {
    $("deletedDialog").showModal();
  }
  if (params.has("forgot")) {
    setMode("forgot");
  }
  if (params.has("register")) {
    setMode("register");
    $("username").focus();
  }
  if (params.has("reset")) {
    resetToken = params.get("reset");
    setMode("reset");
    return true;
  }

  const changeView = CHANGE_VIEWS[params.get("change")];
  if (changeView) {
    try {
      await api("/auth/me", { redirectOn401: false });
      setMode(changeView);
      (changeView === "changePassword" ? $("currentPassword") : $("email")).focus();
    } catch {
      rememberPendingChange(params.get("change"));
      setMode("login");
      showNotice("Bitte zuerst einloggen.");
    }
    return true;
  }

  if (params.has("delete")) {
    showDeleteConfirm(params.get("delete"));
    return true;
  }

  for (const [param, path] of [["verify", "/auth/verify-email"], ["email", "/auth/confirm-email"]]) {
    if (!params.has(param)) continue;
    try {
      const result = await api(path, { method: "POST", body: { token: params.get(param) }, redirectOn401: false });
      showNotice(result.message);
    } catch (error) {
      showError(error.message);
    }
  }
  return true;
}

// Link from the deletion email: asks once more; mail programs that open links to check them
// therefore cannot delete the account by themselves.
function showDeleteConfirm(token) {
  form.hidden = true;
  document.querySelector(".auth-tabs").hidden = true;
  $("authTitle").textContent = t("Konto endgültig löschen?");
  $("authSubtitle").hidden = true;
  $("deleteConfirm").hidden = false;
  $("deleteConfirmBtn").addEventListener("click", async () => {
    $("deleteConfirmBtn").disabled = true;
    try {
      await api("/auth/confirm-delete", { method: "POST", body: { token }, redirectOn401: false });
      forgetLogin();
      location.replace("login.html?deleted");
    } catch (error) {
      // e.g. expired link: back to the normal login with the error
      $("deleteConfirm").hidden = true;
      $("authSubtitle").hidden = false;
      document.querySelector(".auth-tabs").hidden = false;
      form.hidden = false;
      setMode("login");
      showError(error.message);
    }
  });
}

document.querySelectorAll("[data-mode]").forEach((button) =>
  button.addEventListener("click", () => {
    setMode(button.dataset.mode);
    (button.dataset.mode === "register" ? $("username") : $("email")).focus();
  }),
);

$("togglePassword").addEventListener("click", () => {
  const show = passwordField.type === "password";
  passwordField.type = show ? "text" : "password";
  $("togglePassword").textContent = show ? t("Verbergen") : t("Anzeigen");
  $("togglePassword").setAttribute("aria-pressed", String(show));
  passwordField.focus();
});

passwordField.addEventListener("input", updatePasswordMeter);
$("resendBtn").addEventListener("click", resendVerification);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  submit();
});

for (const id of ["email", "username"]) {
  $(id).addEventListener("input", () => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}");
      draft[id] = $(id).value;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Private mode.
    }
  });
}

// Read the query string before setMode() rewrites the address.
const INITIAL_SEARCH = location.search;
setMode("login");
handleUrlParameters().then(() => {
  if (mode.startsWith("change")) return; // never prefill the new email with the old one
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}");
    for (const id of ["email", "username"]) if (draft[id] && !$(id).value) $(id).value = draft[id];
  } catch {
    // Nothing stored.
  }
});
