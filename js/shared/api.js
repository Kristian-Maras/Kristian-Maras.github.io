// Client for the Spring Boot backend (repository finance-tracker-backend).
//
// The website and the backend run on different addresses:
//   published:  https://finance-os.dev  →  backend on Render (PUBLIC_API_URL)
//   locally:    Live Server (port 5500)         →  backend in IntelliJ (http://localhost:8080)
// Browsers block login cookies between different addresses, so the login token is kept in
// localStorage and sent in the Authorization header.
const PUBLIC_API_URL = "https://finance-tracker-backend-5rru.onrender.com/api";
const LOCAL_API_URL = "http://localhost:8080/api";
const RUNS_LOCALLY = ["localhost", "127.0.0.1"].includes(location.hostname);
// The end-to-end tests point the website at their own test backend.
const API_BASE = window.FINANCE_OS_API_URL || (RUNS_LOCALLY ? LOCAL_API_URL : PUBLIC_API_URL);
const TOKEN_KEY = "financeOS_token";

function readToken() {
  try {
    const saved = JSON.parse(localStorage.getItem(TOKEN_KEY));
    return saved && saved.expiresAt > Date.now() ? saved.token : null;
  } catch {
    return null;
  }
}

/** Keeps the token from a login response. */
function rememberLogin(result) {
  if (!result?.token) return;
  const minutes = result.expiresInMinutes || 120;
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: result.token, expiresAt: Date.now() + minutes * 60000 }));
  } catch {
    // Without storage the login cannot be kept.
  }
}

/** Request headers, including the login token. */
function requestHeaders(withJsonBody) {
  const headers = withJsonBody ? { "Content-Type": "application/json" } : {};
  // Emails from the backend (confirmation, password reset …) use the website's language.
  if (typeof I18N !== "undefined") headers["Accept-Language"] = I18N.language;
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function forgetLogin() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored.
  }
}

// Older versions kept the token in localStorage; remove those leftovers.
try {
  localStorage.removeItem("ft_token");
  localStorage.removeItem("ft_user");
} catch {
  // Storage is blocked, nothing to clean up.
}

/**
 * Sends a request to the backend and returns the parsed JSON (or null for 204).
 * On 401 the user is sent to the login page unless redirectOn401 is false
 * (with ?deleted if the account no longer exists).
 */
async function api(path, { method = "GET", body, redirectOn401 = true } = {}) {
  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      credentials: "same-origin",
      headers: requestHeaders(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      RUNS_LOCALLY
        ? "Backend nicht erreichbar – läuft Spring Boot auf Port 8080?"
        : "Server nicht erreichbar – bitte in einer Minute nochmals versuchen.",
    );
  }

  if (response.status === 401) {
    forgetLogin();
    // The account was deleted (e.g. confirmed on another device): the login page says so.
    const deleted = (await response.clone().json().catch(() => null))?.code === "ACCOUNT_DELETED";
    if (redirectOn401) {
      location.replace(deleted ? "login.html?deleted" : "login.html");
      throw new Error("Bitte neu einloggen");
    }
  }
  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || `Fehler ${response.status}`);
    error.status = response.status;
    error.code = payload?.code; // e.g. "EMAIL_NOT_VERIFIED"
    throw error;
  }
  return payload;
}

/** Ends the session on the server (all devices) and goes to the login page. */
async function logoutAndRedirect() {
  try {
    await api("/auth/logout", { method: "POST", redirectOn401: false });
  } catch {
    // Go to the login page even if the backend does not answer.
  }
  forgetLogin();
  location.replace("login.html");
}
