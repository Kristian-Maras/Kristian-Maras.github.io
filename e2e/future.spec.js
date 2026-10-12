// Sparzukunft page, salary and allowances as one row, renaming allowances
const { test, expect, createUser, skipTour, goTo } = require("./fixtures");

async function setUp(page) {
  await page.evaluate(() => {
    state.salaries = [650, 950, 1200, 1500];
    state.extraSave = [100, 150, 200, 300];
    state.thirteenth = "12";
    state.thirteenthSave = [true, false, false, false];
    const allowance = state.allowances[0];
    allowance.enabled = true;
    allowance.per = "month";
    allowance.amounts = [120, 120, 200, 200];
    allowance.save = [50, 50, 0, 0];
    render();
  });
}

test("Sparzukunft shows what is saved per year and until the end of the apprenticeship", async ({ page, request }) => {
  await createUser(page, request);
  await skipTour(page);
  await setUp(page);
  await goTo(page, "future");
  // Year 1: 100 + 50 per month of 770, plus the 13th (650) once
  const first = page.locator("#saveOverview .save-year").first();
  await expect(first.locator(".save-headline")).toHaveText("Du sparst CHF 150.00 von CHF 770.00 (Lohn + Pauschalen) pro Monat");
  await expect(first).toContainText("CHF 620.00");
  await expect(first.locator(".save-yearly")).toContainText("CHF 650.00");
  // (150×12 + 650) + 200×12 + 200×12 + 300×12
  await expect(page.locator("#futureTotal")).toHaveText("CHF 10’850.00");
  await expect(page.locator("#futureYears li")).toHaveCount(4);

  await page.click('[data-action="edit-saving"]');
  await expect(page.locator("#settings")).toHaveClass(/active/);
  await expect(page.locator('[data-settings-tab-button="pay"]')).toHaveClass(/active/);
});

test("salary and allowances are one row; the name is only shown where something is saved", async ({ page, request }) => {
  await createUser(page, request);
  await skipTour(page);
  await setUp(page);
  const texts = await page.evaluate(() => monthLedger(currentMonth).map((row) => row.text));
  const name = await page.evaluate(() => state.allowances[0].name);
  expect(texts).toContain("Lohn + Pauschale");
  expect(texts).not.toContain("Lohn");
  expect(texts).not.toContain(name);
  expect(texts).toContain(`${name} sparen`);

  // Two allowances: "Lohn + Pauschalen"
  const plural = await page.evaluate(() => {
    const second = state.allowances[1];
    second.enabled = true;
    second.per = "month";
    second.amounts = [30, 30, 30, 30];
    return monthLedger(currentMonth).find((row) => row.kind === "income" && row.text.startsWith("Lohn"));
  });
  expect(plural.text).toBe("Lohn + Pauschalen");
  expect(plural.amount).toBe(800);

  // No allowances: just "Lohn"
  const alone = await page.evaluate(() => {
    state.allowances.forEach((allowance) => (allowance.enabled = false));
    return monthLedger(currentMonth).map((row) => row.text);
  });
  expect(alone).toContain("Lohn");
});

test("an allowance can be renamed", async ({ page, request }) => {
  await createUser(page, request);
  await skipTour(page);
  await setUp(page);
  await goTo(page, "settings");
  await page.click('[data-settings-tab-button="pay"]');
  const id = await page.evaluate(() => state.allowances[0].id);
  page.answerDialog("Essen");
  await page.click(`[data-action="rename-allowance"][data-id="${id}"]`);
  await expect(page.locator("#allowanceList")).toContainText("Essen");
  expect(await page.evaluate(() => state.allowances[0].name)).toBe("Essen");
});

test("Sparzukunft always uses the wage and amounts from the settings", async ({ page, request }) => {
  await createUser(page, request, { setup: { wage: 650 } });
  await skipTour(page);
  await goTo(page, "settings");
  await page.click('[data-settings-tab-button="pay"]');
  await page.fill("#salary0", "812.40");
  await page.locator("#salary0").blur();
  await page.fill("#extraSave0", "75");
  await page.locator("#extraSave0").blur();
  await goTo(page, "future");
  await expect(page.locator("#saveOverview .save-year .save-headline").first()).toHaveText("Du sparst CHF 75.00 von CHF 812.40 (Lohn) pro Monat");
});

test("a yearly allowance comes in the chosen pay month; savings standing orders count in Sparzukunft", async ({ page, request }) => {
  await createUser(page, request);
  await skipTour(page);
  await setUp(page);
  const result = await page.evaluate(() => {
    const allowance = state.allowances[0];
    allowance.per = "year";
    allowance.month = "03";
    state.recurring.push({ id: newId(), kind: "saving", name: "Sparplan", amount: 40, interval: "monthly", start: firstMonth() + "-25", end: "", cat: savingAccounts()[0].name });
    render();
    const months = monthList().slice(0, 12);
    return {
      paidIn: months.filter((month) => monthSummary(month).allowances.length).map((month) => month.slice(5, 7)),
      selectValue: document.querySelector(`[data-allowance-month="${allowance.id}"]`)?.value,
    };
  });
  expect(result.paidIn).toEqual(["03"]);
  expect(result.selectValue).toBe("03");
  await goTo(page, "future");
  const first = page.locator("#saveOverview .save-year").first();
  // 100 automatic + 40 standing order per month; the allowance (yearly) is not part of "pro Monat"
  await expect(first.locator(".save-headline")).toHaveText("Du sparst CHF 140.00 von CHF 650.00 (Lohn) pro Monat");
  await expect(first).toContainText("Sparplan");
  await expect(first.locator(".save-yearly").first()).toContainText("März");
});

test("Sparzukunft starts with 'Tracken ab', shows the period and the period can be chosen", async ({ page, request }) => {
  await createUser(page, request);
  await skipTour(page);
  await setUp(page);
  // Tracking starts in the 10th pay month of the apprenticeship
  const { from, end, thirteenthSkipped } = await page.evaluate(() => {
    const first = firstMonth();
    state.trackFrom = addMonths(first, 9);
    render();
    const skipped = Array.from({ length: 9 }, (_, k) => addMonths(first, k)).some((month) => month.endsWith("-12"));
    return { from: monthName(state.trackFrom), end: monthName(addMonths(first, state.years * 12 - 1)), thirteenthSkipped: skipped };
  });
  await goTo(page, "future");
  await expect(page.locator("#futureTotalLabel")).toHaveText(`Von ${from} bis ${end} sparst du`);
  await expect(page.locator("#saveOverview .save-year").first().locator("h2")).toContainText("3 von 12 Monaten");
  // 10’850 minus 9 months of 150 and, if it fell into them, the 13th (650)
  const expected = 10850 - 9 * 150 - (thirteenthSkipped ? 650 : 0);
  await expect(page.locator("#futureTotal")).toHaveText(await page.evaluate((n) => chf(n), expected));
  await expect(page.locator("#futureTotalNote")).toContainText("in 39 Lohnmonaten");

  // Only the 2nd apprenticeship year
  const [secondStart, secondEnd] = await page.evaluate(() => [addMonths(firstMonth(), 12), addMonths(firstMonth(), 23)]);
  await page.selectOption("#futureFrom", secondStart);
  await page.selectOption("#futureTo", secondEnd);
  await expect(page.locator("#futureYears li")).toHaveCount(1);
  await expect(page.locator("#futureTotal")).toHaveText("CHF 2’400.00");
  // "Bis" only offers months from "Von" on
  const before = await page.locator(`#futureTo option[value="${await page.evaluate(() => addMonths(firstMonth(), 11))}"]`).count();
  expect(before).toBe(0);

  // Quick choices
  await page.click('[data-action="future-preset"][data-preset="all"]');
  await expect(page.locator("#futureTotal")).toHaveText("CHF 10’850.00");
  await expect(page.locator('[data-preset="all"]')).toHaveAttribute("aria-pressed", "true");
  await page.click('[data-action="future-preset"][data-preset="track"]');
  await expect(page.locator("#futureTotalLabel")).toHaveText(`Von ${from} bis ${end} sparst du`);
});
