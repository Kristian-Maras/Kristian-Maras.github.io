// Profile: user name, password, email address, data download and account deletion.
const fs = require("fs");
const { test, expect, API_URL, PASSWORD, uniqueEmail, linkFromMail, openApp, goTo, logIn, skipTour } = require("./fixtures");

async function openProfile(page) {
  await goTo(page, "settings");
  await page.click('[data-settings-tab-button="account"]');
}

// "Download data / delete account" is folded away at first.
async function openPrivacySection(page) {
  await openProfile(page);
  const section = page.locator("#privacyCard");
  if ((await section.getAttribute("open")) === null) await section.locator("summary").click();
  await expect(section.locator('[data-action="export-account"]')).toBeVisible();
}

test("the user name can be changed", async ({ page, request }) => {
  await openApp(page, request);
  await openProfile(page);
  await page.fill("#newUsername", "Lea Muster");
  await page.click('[data-action="change-username"]');
  await expect(page.locator("#accountName")).toHaveText("Lea Muster");
  await page.reload();
  await expect(page.locator("#accountName")).toHaveText("Lea Muster");
});

test("the password is changed on the login page", async ({ page, request }) => {
  const { email } = await openApp(page, request);
  await openProfile(page);
  await page.click('a[href="login.html?change=password"]');
  await expect(page.locator("#authTitle")).toHaveText("Passwort ändern");
  await page.fill("#currentPassword", PASSWORD);
  await page.fill("#password", "Neu-und-sicher-1!");
  await page.click("#submitBtn");
  await expect(page.locator("#authNotice")).toContainText("Passwort geändert");

  await page.goto("/app.html"); // this device stays logged in
  await expect(page.locator("#financeApp")).toBeVisible();
  await page.click('[data-action="logout"]');
  await page.waitForURL("**/login.html");
  await logIn(page, { email, password: "Neu-und-sicher-1!" });
});

test("the email address is changed after confirming the new one", async ({ page, request }) => {
  await openApp(page, request);
  const newEmail = uniqueEmail("new");
  await openProfile(page);
  await page.click('a[href="login.html?change=email"]');
  await expect(page.locator("#authTitle")).toHaveText("E-Mail-Adresse ändern");
  await page.fill("#email", newEmail);
  await page.fill("#password", PASSWORD);
  await page.click("#submitBtn");
  await expect(page.locator("#authNotice")).toContainText(newEmail);

  await page.goto(await linkFromMail(request, newEmail, "email"));
  await expect(page.locator("#authNotice")).toContainText("bestätigt");
  await logIn(page, { email: newEmail });
});

test("all data can be downloaded", async ({ page, request }) => {
  const { email } = await openApp(page, request);
  await openPrivacySection(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-action="export-account"]')]);
  expect(download.suggestedFilename()).toMatch(/^finance-os-.*\.json$/);
  const content = fs.readFileSync(await download.path(), "utf8");
  expect(content).toContain(email);
});

test("deleting the account needs the password and the link from the email", async ({ page, request }) => {
  const { email } = await openApp(page, request);
  await openPrivacySection(page);
  await page.fill("#deletePassword", PASSWORD);
  await page.click('[data-action="delete-account"]');

  // Only an email is sent; the account still exists.
  await expect(page.locator("#deleteSent")).toContainText("E-Mail");
  await expect(page).toHaveURL(/app\.html/);
  const link = await linkFromMail(request, email, "delete");

  // The link asks once more before anything is deleted.
  await page.goto(link);
  await expect(page.locator("#deleteConfirm")).toBeVisible();
  await expect(page.locator("#authForm")).toBeHidden();
  await page.click("#deleteConfirmBtn");
  await page.waitForURL("**/login.html*");
  // Pop-up "account deleted" with a link to the login
  await expect(page.locator("#deletedDialog")).toBeVisible();
  await expect(page.locator("#deletedTitle")).toHaveText("Du hast dein Konto gelöscht");
  await expect(page.locator("#deletedRegister")).toHaveAttribute("href", "login.html?register");
  await expect(page.locator("#deletedHome")).toHaveAttribute("href", "./");
  await page.click("#deletedLogin");
  await expect(page.locator("#deletedDialog")).toBeHidden();
  await expect(page.locator("#email")).toBeVisible();

  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("#submitBtn");
  await expect(page.locator("#authError")).toHaveText("E-Mail oder Passwort falsch");

  // A used link does not work again.
  await page.goto(link);
  await page.click("#deleteConfirmBtn");
  await expect(page.locator("#authError")).toContainText("ungültig");
});

test("deleted on another device: back in the app, a pop-up says the account is deleted", async ({ page, request }) => {
  const { email } = await openApp(page, request);
  await openPrivacySection(page);
  await page.fill("#deletePassword", PASSWORD);
  await page.click('[data-action="delete-account"]');
  await expect(page.locator("#deleteSent")).toContainText("E-Mail");

  // The link from the email is confirmed on the phone; the app stays open on the laptop.
  const link = await linkFromMail(request, email, "delete");
  const token = new URL(link, "http://localhost").searchParams.get("delete");
  const confirmed = await request.post(`${API_URL}/auth/confirm-delete`, { data: { token } });
  expect(confirmed.ok()).toBe(true);

  // Back in the tab on the laptop
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForURL("**/login.html*");
  await expect(page.locator("#deletedDialog")).toBeVisible();
  await page.click("#deletedLogin");
  await expect(page.locator("#deletedDialog")).toBeHidden();
});
