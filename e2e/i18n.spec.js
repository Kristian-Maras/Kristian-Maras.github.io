// Every page can be switched completely to English, French and Italian.
const { test, expect, PASSWORD, uniqueEmail, linkFromMail, mailsTo, createUser, skipTour, goTo } = require("./fixtures");

/** Visible German texts that have a translation but were not translated. */
function untranslatedTexts(page) {
  return page.evaluate(() => {
    const column = ["en", "fr", "it"].indexOf(I18N.language);
    const dictionary = window.TRANSLATIONS;
    const found = new Set();
    const check = (text) => {
      const clean = text.replace(/\s+/g, " ").trim();
      const translation = dictionary[clean]?.[column];
      if (translation && translation !== clean) found.add(clean);
    };
    const visible = (element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (parent && !parent.closest("[translate=no], script, style") && visible(parent)) check(walker.currentNode.nodeValue);
    }
    document.querySelectorAll("[placeholder], [aria-label], [title], option").forEach((element) => {
      if (element.closest("[translate=no]")) return;
      for (const name of ["placeholder", "aria-label", "title"]) if (element.hasAttribute(name)) check(element.getAttribute(name));
      if (element.tagName === "OPTION") check(element.textContent);
    });
    check(document.title);
    return [...found];
  });
}

const LANGUAGES = {
  en: { settings: "Settings", wrongPassword: "Email or password incorrect", confirmSubject: "Please confirm your email address", food: "Food" },
  fr: { settings: "Réglages", wrongPassword: "E-mail ou mot de passe incorrect", confirmSubject: "Merci de confirmer ton adresse e-mail", food: "Repas" },
  it: { settings: "Impostazioni", wrongPassword: "E-mail o password errata", confirmSubject: "Conferma il tuo indirizzo e-mail", food: "Cibo" },
};

for (const [language, expected] of Object.entries(LANGUAGES)) {
  test.describe(`language ${language}`, () => {
    test.use({ language });

    test("public pages are fully translated", async ({ page }) => {
      for (const path of ["/", "/login.html", "/login.html?register", "/login.html?forgot", "/login.html?delete=x", "/datenschutz.html", "/kontakt.html", "/impressum.html", "/nutzungsbedingungen.html"]) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        expect(await untranslatedTexts(page), path).toEqual([]);
      }
    });

    test("the app, its messages and the emails are translated", async ({ page, request }) => {
      const email = uniqueEmail(language);
      await page.goto("/login.html?register");
      await page.fill("#username", "Lea");
      await page.fill("#email", email);
      await page.fill("#password", PASSWORD);
      await page.check("#acceptTerms");
      await page.click("#submitBtn");
      await expect(page.locator("#authNotice")).toBeVisible();
      expect(await untranslatedTexts(page)).toEqual([]); // message from the server

      const mails = await mailsTo(request, email);
      expect(mails.at(-1).subject).toBe(expected.confirmSubject);

      await page.goto(await linkFromMail(request, email, "verify"));
      await page.fill("#email", email);
      await page.fill("#password", "Falsch-123!");
      await page.click("#submitBtn");
      await expect(page.locator("#authError")).toHaveText(expected.wrongPassword);
      await page.fill("#password", PASSWORD);
      await page.click("#submitBtn");
      await page.waitForURL("**/app.html");

      // First-time setup: every question is translated (with allowances and a subscription).
      const setup = page.locator("#setup");
      const check = async (name) => expect(await untranslatedTexts(page), name).toEqual([]);
      await expect(setup).toBeVisible();
      await check("setup start");
      await page.click("#setupNext");
      await setup.locator('[data-choice="years"][data-value="3"]').click();
      await check("setup years");
      await page.click("#setupNext");
      await setup.locator('[data-choice="payday"][data-value="25"]').click();
      await check("setup payday");
      await page.click("#setupNext");
      await expect(setup.locator(".setup-months .month-cell.selected")).toHaveCount(1);
      await check("setup tracking start");
      await page.click("#setupNext");
      await setup.locator('[data-choice="thirteenth"][data-value="spread"]').click();
      await check("setup 13th");
      await page.click("#setupNext");
      for (const i of [0, 1, 2]) await setup.locator(`[data-wage="${i}"]`).fill("900");
      await check("setup wages");
      await page.click("#setupNext");
      await setup.locator('[data-choice="allowances"][data-value="yes"]').click();
      await setup.locator('[data-allowance-on="0"]').check();
      await setup.locator('[data-allowance-amount="0"]').fill("120");
      await check("setup allowances");
      await page.click("#setupNext");
      await expect(setup.locator(".setup-list")).toHaveCount(3);
      await check("setup categories");
      await page.click("#setupNext");
      await setup.locator('[data-setup="add-order"]').click();
      await setup.locator('[data-order="0"][data-key="name"]').fill("Netflix");
      await setup.locator('[data-order="0"][data-key="amount"]').fill("12");
      await check("setup subscriptions");
      await page.click("#setupNext");
      await check("setup summary");
      await page.click("#setupNext");
      await expect(setup).toBeHidden();

      expect(await untranslatedTexts(page)).toEqual([]); // with the tour
      await skipTour(page);

      await expect(page.locator('.nav [data-page="settings"]')).toContainText(expected.settings);
      for (const id of ["dashboard", "month", "expenses", "recurring"]) {
        await goTo(page, id);
        expect(await untranslatedTexts(page), id).toEqual([]);
      }
      await goTo(page, "settings");
      for (const tab of ["pay", "lists", "look", "account"]) {
        await page.click(`[data-settings-tab-button="${tab}"]`);
        await page.evaluate(() => document.querySelectorAll("details.fold").forEach((fold) => (fold.open = true)));
        expect(await untranslatedTexts(page), tab).toEqual([]);
      }
    });
  });
}

test("default categories and accounts follow a language change", async ({ page, request }) => {
  await createUser(page, request); // registered in German
  await skipTour(page);
  await goTo(page, "expenses");
  await page.fill("#exDesc", "Mittagessen");
  await page.fill("#exAmount", "12");
  await page.selectOption("#exCat", "Essen & Trinken");
  await page.click("#expenseSave");
  await expect(page.locator("#allExpenses")).toContainText("Essen & Trinken");
  await page.waitForTimeout(1500); // saved on the server

  await page.selectOption("#appLang", "en");
  await expect(page.locator('.nav [data-page="settings"]')).toContainText("Settings");
  await goTo(page, "expenses");
  await expect(page.locator("#exCat")).toContainText("Food");
  await expect(page.locator("#allExpenses")).toContainText("Food");
  await expect(page.locator("#allExpenses")).toContainText("Mittagessen"); // own texts stay as typed
  await goTo(page, "dashboard");
  await expect(page.locator("#dashboard .account-card.saving").first()).toContainText("Savings account");

  await page.selectOption("#appLang", "it");
  await goTo(page, "expenses");
  await expect(page.locator("#allExpenses")).toContainText("Cibo");
});
