// Landing page: content, language, light/dark, links to login and the privacy page.
const { test, expect } = require("./fixtures");

test("shows the landing page with all sections", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Finance OS/);
  await expect(page.locator("h1")).toHaveText("Dein Lehrlingslohn, im Griff vom 25. bis zum 24.");
  for (const id of ["features", "how-it-works", "security", "faq"]) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
  await page.click('.site-nav a[href="#faq"]');
  await expect(page.locator("#faq")).toBeInViewport();
});

test("switches between German, English, French and Italian", async ({ page }) => {
  const headings = {
    en: "Your apprentice wage, under control from the 25th to the 24th.",
    fr: "Ton salaire d'apprenti·e, sous contrôle du 25 au 24.",
    it: "Il tuo salario di apprendista, sotto controllo dal 25 al 24.",
    de: "Dein Lehrlingslohn, im Griff vom 25. bis zum 24.",
  };
  await page.goto("/");
  for (const [language, heading] of Object.entries(headings)) {
    await page.locator(".header-actions [data-lang-select]").selectOption(language);
    await expect(page.locator("h1")).toHaveText(heading);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
  }
});

test("light bulb switches between light and dark and remembers it", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator(".header-actions [data-theme-toggle]");
  const isDark = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const before = await isDark();
  await toggle.click();
  const after = await isDark();
  expect(after).not.toBe(before);
  await page.reload();
  expect(await isDark()).toBe(after);
});

test("'Kostenlos starten' opens the registration in a new tab", async ({ page, context }) => {
  await page.goto("/");
  const [registration] = await Promise.all([context.waitForEvent("page"), page.click(".header-actions a.button")]);
  await registration.waitForLoadState();
  expect(registration.url()).toContain("/login.html?register");
  await expect(page).toHaveURL(/\/$|index\.html/); // the landing page stays open
});

test("FAQ answers open and close", async ({ page }) => {
  await page.goto("/");
  const question = page.locator("#faq details").first();
  await question.locator("summary").click();
  await expect(question).toHaveAttribute("open", "");
  await question.locator("summary").click();
  await expect(question).not.toHaveAttribute("open", "");
});

test("imprint and terms of use are linked in the footer and readable", async ({ page }) => {
  for (const path of ["/", "/login.html", "/datenschutz.html", "/kontakt.html"]) {
    await page.goto(path);
    await expect(page.locator('a[href="impressum.html"]').first()).toBeAttached();
    await expect(page.locator('a[href="nutzungsbedingungen.html"]').first()).toBeAttached();
  }
  await page.goto("/impressum.html");
  await expect(page.locator("h1")).toHaveText("Impressum");
  await expect(page.locator("main")).toContainText("Kristian Maras");
  await expect(page.locator("main")).toContainText("kontakt@finance-os.dev");
  await page.goto("/nutzungsbedingungen.html");
  await expect(page.locator("h1")).toHaveText("Nutzungsbedingungen");
  await expect(page.locator("main")).toContainText("Schweizer Recht");
});

test("the app can be added to the home screen (manifest and icons)", async ({ page, request }) => {
  await page.goto("/index.html");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get("/" + href)).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("app.html");
  for (const icon of manifest.icons) expect((await request.get("/" + icon.src)).ok()).toBeTruthy();
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get("/" + touchIcon)).ok()).toBeTruthy();
});

test("a pop-up asks to reload when a newer version is online", async ({ page }) => {
  await page.route("**/version.json*", (route) => route.fulfill({ contentType: "application/json", body: '{"version":"9999999999"}' }));
  await page.goto("/index.html");
  const overlay = page.locator(".update-overlay");
  await expect(overlay).toBeVisible({ timeout: 10000 });
  await expect(overlay).toContainText("Neu laden");
  // It cannot be closed: Escape keeps it, clicks on the page behind are blocked
  await page.keyboard.press("Escape");
  await expect(overlay).toBeVisible();
  await expect(page.locator(".update-close")).toHaveCount(0);
  await page.unroute("**/version.json*");
  await page.locator(".update-reload").click();
  await page.waitForLoadState("load");
  await expect(page.locator(".update-overlay")).toHaveCount(0);
});

test("no note while the page is up to date", async ({ page }) => {
  await page.goto("/index.html");
  await page.waitForTimeout(5000);
  await expect(page.locator(".update-overlay")).toHaveCount(0);
});

test("the landing page explains how to add Finance OS to the home screen", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('.site-nav a[href="#app"]').click();
  const section = page.locator("#app");
  await expect(section).toBeInViewport();
  await expect(section).toContainText("Zum Home-Bildschirm");
  await expect(section).toContainText("App installieren");
  await expect(page.locator(".faq")).toContainText("Gibt es Finance OS als App?");
});
