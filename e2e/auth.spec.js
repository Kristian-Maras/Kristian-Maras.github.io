// Registration, email confirmation, login, password rules, forgotten password, logout.
const { test, expect, PASSWORD, uniqueEmail, mailsTo, linkFromMail, register, verifyEmail, logIn, createUser, completeSetup, skipTour } =
  require("./fixtures");

test("password rules are shown and ticked while typing", async ({ page }) => {
  await page.goto("/login.html?register");
  const rule = (name) => page.locator(`#passwordRules [data-rule="${name}"]`);
  await page.fill("#password", "abc");
  await expect(rule("lower")).toHaveClass(/met/);
  for (const name of ["length", "upper", "special"]) await expect(rule(name)).not.toHaveClass(/met/);
  await page.fill("#password", PASSWORD);
  for (const name of ["length", "upper", "lower", "special"]) await expect(rule(name)).toHaveClass(/met/);
});

test("a weak password is refused", async ({ page }) => {
  await page.goto("/login.html?register");
  await page.fill("#username", "Lea");
  await page.fill("#email", uniqueEmail());
  for (const [password, message] of [
    ["Kurz!1", "mindestens 8 Zeichen"],
    ["ohne-grossbuchstaben1", "Grossbuchstaben"],
    ["OHNE-KLEINBUCHSTABEN1", "Kleinbuchstaben"],
    ["OhneSonderzeichen1", "Sonderzeichen"],
  ]) {
    await page.fill("#password", password);
    await page.click("#submitBtn");
    await expect(page.locator("#authError")).toContainText(message);
  }
});

test("registering needs the terms and the privacy policy to be accepted", async ({ page }) => {
  await page.goto("/login.html?register");
  await page.fill("#username", "Lea");
  await page.fill("#email", uniqueEmail());
  await page.fill("#password", PASSWORD);
  await page.click("#submitBtn");
  await expect(page.locator("#authError")).toContainText("Nutzungsbedingungen");
  await expect(page.locator("#authNotice")).toBeHidden();
  await expect(page.locator('.terms-check a[href="nutzungsbedingungen.html"]')).toBeVisible();
});

test("register, confirm the email and log in", async ({ page, request }) => {
  const email = uniqueEmail("register");
  await register(page, { email });
  await expect(page.locator("#authNotice")).toContainText("E-Mail geschickt");
  await expect(page.locator("#authNotice")).toContainText("Spam-Ordner");

  // Before the confirmation the login is refused, and the link can be sent again.
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("#submitBtn");
  await expect(page.locator("#authError")).toContainText("bestätige zuerst");
  await expect(page.locator("#resendBtn")).toBeVisible();
  const before = (await mailsTo(request, email)).length;
  await page.click("#resendBtn");
  await expect.poll(async () => (await mailsTo(request, email)).length).toBe(before + 1);

  await verifyEmail(page, request, email);
  await expect(page.locator("#authNotice")).toContainText("bestätigt");
  await logIn(page, { email });
  await completeSetup(page);
  await skipTour(page);
  await expect(page.locator("#accountName")).toHaveText("Lea");
});

test("wrong password shows an error", async ({ page, request }) => {
  const { email } = await createUser(page, request);
  await page.goto("/login.html");
  await page.fill("#email", email);
  await page.fill("#password", "Falsch-123!");
  await page.click("#submitBtn");
  await expect(page.locator("#authError")).toHaveText("E-Mail oder Passwort falsch");
});

test("forgot password: reset with the emailed link", async ({ page, request }) => {
  const { email } = await createUser(page, request);
  await page.goto("/login.html?forgot");
  await page.fill("#email", email);
  await page.click("#submitBtn");
  await expect(page.locator("#authNotice")).toContainText("E-Mail geschickt");

  await page.goto(await linkFromMail(request, email, "reset"));
  await expect(page.locator("#authTitle")).toHaveText("Neues Passwort wählen");
  await page.fill("#password", "Neues-Passwort-9?");
  await page.click("#submitBtn");
  await expect(page.locator("#authNotice")).toContainText("Passwort wurde geändert");

  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("#submitBtn");
  await expect(page.locator("#authError")).toBeVisible(); // the old password no longer works
  await logIn(page, { email, password: "Neues-Passwort-9?" });
});

test("the app requires a login and logout ends it", async ({ page, request }) => {
  await page.goto("/app.html");
  await page.waitForURL("**/login.html");

  await createUser(page, request);
  await skipTour(page);
  await page.click('[data-action="logout"]');
  await page.waitForURL("**/login.html");
  await page.goto("/app.html");
  await page.waitForURL("**/login.html");
});
