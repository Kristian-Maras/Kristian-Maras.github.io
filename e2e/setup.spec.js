// First-time setup of a new account: required questions, optional subscriptions, answers in the settings.
const { test, expect, createUser, skipTour, goTo } = require("./fixtures");

test("a new account answers the setup first; the answers end up in the settings", async ({ page, request }) => {
  await createUser(page, request, { setup: false });
  const setup = page.locator("#setup");
  const next = page.locator("#setupNext");
  const error = page.locator("#setupError");

  // The app behind is blurred and cannot be used; Escape does not close the setup.
  await expect(setup).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/setup-open/);
  expect(await page.locator("#financeApp").evaluate((app) => app.inert)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(setup).toBeVisible();
  await expect(page.locator("#setupSkip")).toBeHidden(); // required question

  await setup.locator('[data-answer="startMonth"]').selectOption("8");
  await setup.locator('[data-answer="startYear"]').selectOption(String(new Date().getFullYear()));
  await next.click();

  // No answer: an error, and the question stays.
  await next.click();
  await expect(error).toBeVisible();
  await setup.locator('[data-choice="years"][data-value="3"]').click();
  await next.click();

  await setup.locator('[data-answer="paydayOther"]').selectOption("20");
  await next.click();

  // From when to track: this pay month is preselected; here the first month (start of the apprenticeship)
  await expect(setup.locator(".setup-months .month-cell.selected")).toHaveCount(1);
  await expect(setup.locator(".setup-months .month-cell").first()).toContainText("20.");
  // The next pay month can be chosen too
  const selectedMonth = await setup.locator(".setup-months .month-cell.selected").getAttribute("data-month");
  const [y, m] = selectedMonth.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  if (nextMonth.startsWith(String(y))) await expect(setup.locator(`.setup-months [data-month="${nextMonth}"]`)).toBeEnabled();
  await setup.locator('.setup-months [data-month$="-08"]').click();
  await expect(setup.locator(".setup-track-note")).toContainText("alle Lohnmonate");
  await next.click();
  await setup.locator('[data-choice="thirteenth"][data-value="12"]').click();
  await next.click();

  // One wage per apprenticeship year, all required.
  await expect(setup.locator("[data-wage]")).toHaveCount(3);
  await setup.locator('[data-wage="0"]').fill("800");
  await next.click();
  await expect(error).toBeVisible();
  await setup.locator('[data-wage="1"]').fill("1000");
  await setup.locator('[data-wage="2"]').fill("1300");
  await next.click();

  await setup.locator('[data-choice="allowances"][data-value="yes"]').click();
  await next.click();
  await expect(error).toBeVisible(); // "yes" without choosing one
  await setup.locator('[data-allowance-on="0"]').check(); // meal allowance
  await setup.locator('[data-allowance-amount="0"]').fill("120");
  await setup.locator('[data-own="name"]').fill("Schulmaterial");
  await setup.locator('[data-own="name"]').blur();
  await setup.locator('[data-own="amount"]').fill("300");
  await setup.locator('[data-own="per"]').selectOption("year");
  await next.click();

  // Categories: the short default lists; rename, remove and add own names
  await expect(setup.locator(".setup-list")).toHaveCount(3);
  await expect(setup.locator('[data-tag-list="categories"]')).toHaveCount(5);
  await expect(setup.locator('[data-tag-list="payments"]')).toHaveCount(3);
  await expect(setup.locator('[data-tag-list="payments"][data-tag="0"]')).toHaveValue("Karte / TWINT");
  await setup.locator('[data-tag-list="categories"][data-tag="0"]').fill("Essen");
  await setup.locator('[data-setup="remove-tag"][data-list="categories"][data-index="4"]').click(); // Sport
  await setup.locator('[data-tag-new="categories"]').fill("Coiffeur");
  await setup.locator('[data-tag-new="categories"]').press("Enter");
  await setup.locator('[data-tag-new="incomeCategories"]').fill("Babysitten");
  await setup.locator('[data-tag-new="incomeCategories"]').press("Enter");
  await expect(setup.locator('[data-tag-list="incomeCategories"]')).toHaveCount(5);
  await setup.locator('[data-tag-new="payments"]').fill("PayPal"); // without Enter: still added on "Weiter"
  await next.click();

  // Subscriptions can be skipped; here one is added.
  await expect(page.locator("#setupSkip")).toBeVisible();
  await setup.locator('[data-setup="add-order"]').click();
  await setup.locator('[data-order="0"][data-key="name"]').fill("Handy-Abo");
  await setup.locator('[data-order="0"][data-key="amount"]').fill("25");
  await next.click();

  await expect(setup.locator(".setup-summary")).toContainText("Handy-Abo");
  await next.click();
  await expect(setup).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/setup-open/);
  await skipTour(page);

  await goTo(page, "settings");
  await page.click('[data-settings-tab-button="pay"]');
  await expect(page.locator("#setYears")).toHaveValue("3");
  await expect(page.locator("#setPayday")).toHaveValue("20");
  await expect(page.locator("#setTrackFrom")).toHaveValue("");
  await expect(page.locator("#setThirteenth")).toHaveValue("12");
  await expect(page.locator("#salary0")).toHaveValue(/800/);
  await expect(page.locator("#salary2")).toHaveValue(/1300/);
  await expect(page.locator('[data-allowance-toggle="food"]')).toBeChecked();
  await expect(page.locator('[data-allowance-toggle="transport"]')).not.toBeChecked();
  await expect(page.locator("#al-food-amounts-1")).toHaveValue(/120/);
  await expect(page.locator("#allowanceList")).toContainText("Schulmaterial");
  await expect(page.locator('.allowance', { hasText: "Schulmaterial" }).locator("[data-allowance-per]")).toHaveValue("year");

  await goTo(page, "recurring");
  await expect(page.locator("#recurringRows")).toContainText("Handy-Abo");
  const lists = await page.evaluate(() => ({ categories: state.categories, income: state.incomeCategories, payments: state.payments }));
  expect(lists.categories).toEqual(["Essen", "Freizeit", "Fahrzeug", "Kleidung", "Coiffeur"]);
  expect(lists.categories).toContain("Coiffeur");
  expect(lists.income).toContain("Babysitten");
  expect(lists.payments).toContain("PayPal");

  // After reloading, the setup is not shown again.
  await page.reload();
  await expect(page.locator("#financeApp")).toBeVisible();
  await expect(setup).toBeHidden();
});

test("months before „Tracken ab“ do not count", async ({ page, request }) => {
  const startYear = new Date().getFullYear() - 1;
  await createUser(page, request, { setup: { startYear, trackFrom: "current" } });
  await skipTour(page);

  // Only the current pay month counts: one wage in the statistics, the year before is not tracked
  await page.locator('details[data-fold="dash-stats"] summary').click();
  await expect(page.locator("#dIncome")).toHaveText(/1.000\.00/);
  await expect(page.locator("#yearCards .untracked").first()).toContainText("Nicht erfasst");

  // In "Monat ändern" the earlier months are marked
  await page.locator('[data-action="change-month"]:visible').first().click();
  await page.locator('[data-action="picker-year"][data-step="-1"]').click();
  await expect(page.locator(`#monthGrid [data-month="${startYear}-08"]`)).toHaveClass(/untracked/);
  await page.locator('[data-action="close-month-entry"]').click();

  // Settings: from the start of the apprenticeship, every started pay month counts again
  await goTo(page, "settings");
  await page.click('[data-settings-tab-button="pay"]');
  const tracked = await page.locator("#setTrackFrom").inputValue();
  expect(tracked).toMatch(/^\d{4}-\d{2}$/);
  await page.locator("#setTrackFrom").selectOption("");
  await goTo(page, "dashboard");
  const months = (await page.locator("#setTrackFrom option").count()) - 1; // start … current pay month (+ the next one)
  await expect(page.locator("#dIncome")).toHaveText(new RegExp(`${(months * 1000).toLocaleString("de-CH").replace(/\D/g, ".")}\\.00`));
});

