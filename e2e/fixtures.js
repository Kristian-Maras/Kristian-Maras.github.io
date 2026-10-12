// Shared helpers for the end-to-end tests.
const base = require("@playwright/test");

const API_URL = process.env.E2E_API_URL || "http://localhost:8081/api";
const MAILBOX_URL = API_URL.replace("localhost", "127.0.0.1") + "/e2e/mails";
const PASSWORD = "Velo-Berg-7!";

/** A new, unused email address per test (the backend keeps users until it is restarted). */
function uniqueEmail(prefix = "user") {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@e2e.test`;
}

const test = base.test.extend({
  // Language of the website for the test; set once per browser tab, so a language
  // the test chooses itself is kept.
  language: ["de", { option: true }],

  page: async ({ page, language }, use) => {
    await page.addInitScript(
      ([apiUrl, lang]) => {
        window.FINANCE_OS_API_URL = apiUrl;
        if (!sessionStorage.getItem("e2eLanguageSet")) {
          localStorage.setItem("financeOS_lang", lang);
          sessionStorage.setItem("e2eLanguageSet", "1");
        }
      },
      [API_URL, language],
    );
    // The app asks in its own dialog (#appDialog). It is answered like a person would:
    // a queued text (answerDialog) is typed in, then "OK" is clicked.
    // Browser pop-ups are not used any more; page.browserDialogs records any that appear.
    const answers = [];
    page.answerDialog = (text) => answers.push(text);
    page.browserDialogs = [];
    page.on("dialog", (dialog) => {
      page.browserDialogs.push(dialog.message());
      dialog.accept(answers.shift()).catch(() => {});
    });
    await page.exposeFunction("e2eNextAnswer", () => answers.shift() ?? null);
    await page.addInitScript(() => {
      new MutationObserver(async (changes) => {
        for (const change of changes) {
          const dialog = change.target;
          if (dialog.id !== "appDialog" || !dialog.open) continue;
          const text = await window.e2eNextAnswer();
          const input = document.getElementById("appDialogInput");
          if (text !== null) input.value = text;
          document.getElementById("appDialogOk").click();
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["open"] });
    });
    await use(page);
  },
});

/** All emails the test backend "sent" to an address, oldest first. */
async function mailsTo(request, email) {
  const response = await request.get(`${MAILBOX_URL}?to=${encodeURIComponent(email)}`);
  base.expect(response.ok()).toBeTruthy();
  return response.json();
}

/** Waits for the newest email to an address that contains ?param=… and returns that link's path. */
async function linkFromMail(request, email, param) {
  let link = null;
  await base.expect
    .poll(async () => {
      const mails = await mailsTo(request, email);
      for (const mail of [...mails].reverse()) {
        const match = mail.text.match(new RegExp(`https?://[^\\s]+\\?${param}=[^\\s]+`));
        if (match) {
          link = match[0];
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  const url = new URL(link);
  return url.pathname + url.search;
}

async function register(page, { email, username = "Lea", password = PASSWORD }) {
  await page.goto("/login.html?register");
  await page.fill("#username", username);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.check("#acceptTerms");
  await page.click("#submitBtn");
  await base.expect(page.locator("#authNotice")).toBeVisible();
}

async function verifyEmail(page, request, email) {
  await page.goto(await linkFromMail(request, email, "verify"));
  await base.expect(page.locator("#authNotice")).toBeVisible();
}

async function logIn(page, { email, password = PASSWORD }) {
  if (!page.url().includes("/login.html")) await page.goto("/login.html");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("#submitBtn");
  await page.waitForURL("**/app.html");
  await base.expect(page.locator("#financeApp")).toBeVisible();
}

/**
 * Answers the first-time setup of a new account like a person would.
 * Defaults: 4-year apprenticeship, paid on the 25th, tracked from the start, no 13th salary,
 * CHF 1000 every year, no allowances and no subscriptions.
 */
async function completeSetup(page, answers = {}) {
  const { years = 4, payday = 25, thirteenth = "none", wage = 1000, startYear = null, trackFrom = "start" } = answers;
  const setup = page.locator("#setup");
  const next = page.locator("#setupNext");
  await base.expect(setup).toBeVisible();
  // Start of the apprenticeship: August of this year unless another year is given
  if (startYear) await setup.locator('[data-answer="startYear"]').selectOption(String(startYear));
  await next.click();
  await setup.locator(`[data-choice="years"][data-value="${years}"]`).click();
  await next.click();
  await setup.locator(`[data-choice="payday"][data-value="${payday}"]`).click();
  await next.click();
  // "Ab wann willst du deine Finanzen tracken?": from the start (default here) or this month (preselected)
  if (trackFrom === "start") {
    const previous = setup.locator('[data-setup="track-year"][data-step="-1"]');
    while (await previous.isEnabled()) await previous.click();
    await setup.locator(".setup-months .month-cell:not([disabled])").first().click();
  }
  await next.click();
  await setup.locator(`[data-choice="thirteenth"][data-value="${thirteenth}"]`).click();
  await next.click();
  for (let i = 0; i < years; i++) await setup.locator(`[data-wage="${i}"]`).fill(String(wage));
  await next.click();
  await setup.locator('[data-choice="allowances"][data-value="no"]').click();
  await next.click();
  await next.click(); // categories: keep the suggested lists
  await page.locator("#setupSkip").click(); // subscriptions
  await next.click(); // summary: "Los geht's"
  await base.expect(setup).toBeHidden();
}

/** Registers, confirms the email, logs in and answers the setup. The tour is still showing afterwards. */
async function createUser(page, request, options = {}) {
  const { setup = true, ...rest } = options;
  const user = { email: uniqueEmail(rest.prefix), password: PASSWORD, username: "Lea", ...rest };
  await register(page, user);
  await verifyEmail(page, request, user.email);
  await logIn(page, user);
  if (setup) await completeSetup(page, setup === true ? {} : setup);
  return user;
}

async function skipTour(page) {
  const card = page.locator(".tour-card");
  await base.expect(card).toBeVisible();
  await card.locator('[data-tour="skip"]').first().click();
  await base.expect(card).toHaveCount(0);
}

/** New user with the app open and the tour closed. */
async function openApp(page, request, options) {
  const user = await createUser(page, request, options);
  await skipTour(page);
  return user;
}

async function goTo(page, pageId) {
  const button = page.locator(`.nav [data-page="${pageId}"]`);
  await button.click();
  await base.expect(page.locator(`#${pageId}`)).toHaveClass(/active/);
}

/** No element makes the page wider than the screen. */
async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  base.expect(overflow).toBeLessThanOrEqual(1);
}

module.exports = {
  test,
  API_URL,
  expect: base.expect,
  PASSWORD,
  uniqueEmail,
  mailsTo,
  linkFromMail,
  register,
  verifyEmail,
  logIn,
  createUser,
  completeSetup,
  skipTour,
  openApp,
  goTo,
  expectNoHorizontalScroll,
};
