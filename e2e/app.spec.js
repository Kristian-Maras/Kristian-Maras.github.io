// Working with the app: wage, entries, savings, standing orders; everything is saved.
const { test, expect, openApp, goTo } = require("./fixtures");

const chf = (text) => Number(text.replace(/[^\d.-]/g, ""));

async function setWage(page, amount) {
  await goTo(page, "settings");
  await page.click('[data-settings-tab-button="pay"]');
  await page.fill("#salary0", String(amount));
  await page.locator("#salary0").blur();
}

async function addEntry(page, { kind = "expense", desc, amount, category }) {
  await goTo(page, "expenses");
  await page.selectOption("#entryKind", kind);
  await page.fill("#exDesc", desc);
  await page.fill("#exAmount", String(amount));
  if (category) await page.selectOption("#exCat", category);
  await page.click("#expenseSave");
  await expect(page.locator("#allExpenses")).toContainText(desc);
}

test("expenses, income and savings change the month and are saved", async ({ page, request }) => {
  await openApp(page, request);
  await setWage(page, 1000);

  await goTo(page, "month");
  await expect.poll(async () => chf(await page.locator("#mIncome").textContent())).toBe(1000);

  await addEntry(page, { desc: "Kino", amount: 18.5 });
  await addEntry(page, { kind: "income", desc: "Babysitten", amount: 40 });
  await addEntry(page, { kind: "saving", desc: "Ferienkasse", amount: 100 });

  await goTo(page, "month");
  // Income from entries is not part of "wage + allowances"; it goes straight to "available".
  await expect.poll(async () => chf(await page.locator("#mIncome").textContent())).toBe(1000);
  await expect.poll(async () => chf(await page.locator("#mSpent").textContent())).toBe(18.5);
  await expect.poll(async () => chf(await page.locator("#mSaved").textContent())).toBe(100);
  await expect.poll(async () => chf(await page.locator("#mAvail").textContent())).toBe(921.5);

  await expect(page.locator("#mAvailExtra")).toContainText("40.00");

  // The dashboard shows the same "available" first; the savings account shows the transfer.
  await goTo(page, "dashboard");
  await expect.poll(async () => chf(await page.locator("#heroAmount").textContent())).toBe(921.5);
  await expect(page.locator("#currentSummary")).toContainText("40.00");
  await expect(page.locator("#dashboard .account-card.saving").first()).toContainText("100.00");

  // Everything is stored on the server.
  await page.waitForTimeout(1500);
  await page.reload();
  await goTo(page, "expenses");
  for (const desc of ["Kino", "Babysitten", "Ferienkasse"]) await expect(page.locator("#allExpenses")).toContainText(desc);
});

test("an entry can be edited and deleted", async ({ page, request }) => {
  await openApp(page, request);
  await addEntry(page, { desc: "Pizza", amount: 20 });

  const row = page.locator("#allExpenses tr", { hasText: "Pizza" });
  await row.locator('[data-action="edit-record"]').click();
  await expect(page.locator("#exDesc")).toHaveValue("Pizza");
  await page.fill("#exDesc", "Pizza mit Freunden");
  await page.fill("#exAmount", "25");
  await page.click("#expenseSave");
  await expect(page.locator("#allExpenses")).toContainText("Pizza mit Freunden");

  // Deleted right away; "Rückgängig" brings it back, deleting again removes it for good
  await page.locator("#allExpenses tr", { hasText: "Pizza mit Freunden" }).locator('[data-action="delete-record"]').click();
  await expect(page.locator("#allExpenses")).not.toContainText("Pizza");
  await page.click("#toast .toast-action");
  await expect(page.locator("#allExpenses")).toContainText("Pizza mit Freunden");
  await page.locator("#allExpenses tr", { hasText: "Pizza mit Freunden" }).locator('[data-action="delete-record"]').click();
  await expect(page.locator("#allExpenses")).not.toContainText("Pizza");
});

test("income has no payment method and says where the money goes", async ({ page, request }) => {
  await openApp(page, request);
  await goTo(page, "expenses");
  await expect(page.locator("#exPay")).toBeVisible();
  await page.selectOption("#entryKind", "income");
  await expect(page.locator("#exPay")).toBeHidden();
  await expect(page.locator("#entryHint")).toContainText("Verfügbar");
  await page.selectOption("#entryKind", "saving");
  await expect(page.locator("#exPay")).toBeHidden();
});

test("an entry in another pay month says where it was booked", async ({ page, request }) => {
  await openApp(page, request);
  await goTo(page, "expenses");
  await page.fill("#exDate", "2030-01-15");
  await page.fill("#exDesc", "Konzert");
  await page.fill("#exAmount", "60");
  await page.click("#expenseSave");
  await expect(page.locator("#toast")).toContainText("15.01.2030");
});

test("dashboard blocks can be dragged and resized at the edge; the month page has no arranging", async ({ page, request }) => {
  // Tall window: the mouse cannot leave the window, and all blocks used here must be on screen.
  await page.setViewportSize({ width: 1280, height: 1100 });
  await openApp(page, request);
  const order = () => page.locator('[data-sortable="dashboard"] > .block').evaluateAll((blocks) => blocks.map((block) => block.dataset.block));
  const width = (id) => page.locator(`[data-block="${id}"]`).evaluate((block) => block.getBoundingClientRect().width);
  const start = ["available", "account-main", "account-save", "upcoming", "categories", "stats"];
  expect(await order()).toEqual(start);
  await expect(page.locator('[data-action="move-block"], [data-action="resize-block"]')).toHaveCount(0);

  // Keyboard: arrows move a block
  await page.click('#dashboard [data-action="arrange"]');
  const savings = page.locator('[data-block="account-save"]');
  await savings.locator("[data-block-bar]").focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  expect(await order()).toEqual(["account-save", "available", "account-main", "upcoming", "categories", "stats"]);

  // Dragging the right edge: "still available" becomes half as wide
  const available = page.locator('[data-block="available"]');
  const full = await width("available");
  const edge = await available.locator('[data-block-resize="right"]').boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 - full / 2, edge.y + edge.height / 2, { steps: 12 });
  await expect(available).toHaveClass(/resizing/);
  await page.mouse.up();
  const half = await width("available");
  expect(half).toBeGreaterThan(full * 0.45);
  expect(half).toBeLessThan(full * 0.55);
  await page.waitForTimeout(400); // the other blocks glide into their new places

  // Dragging the bar: the wage account goes anywhere, here into the free space below the savings account.
  // The block stays under the pointer the whole time.
  const main = page.locator('[data-block="account-main"]');
  const box = (locator) => locator.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, bottom: r.bottom }; });
  const bar = await main.locator(".block-name").boundingBox();
  const grab = { x: bar.x + 10 - (await box(main)).x, y: bar.y + bar.height / 2 - (await box(main)).y };
  await page.mouse.move(bar.x + 10, bar.y + bar.height / 2);
  await page.mouse.down();
  const saveBox = await box(savings);
  const targetX = saveBox.x + 30;
  const targetY = saveBox.bottom + 40;
  await page.mouse.move(targetX, targetY, { steps: 15 });
  await expect(main).toHaveClass(/dragging/);
  await expect(page.locator(".block-placeholder")).toHaveCount(1);
  const floating = await box(main);
  expect(Math.abs(floating.x + grab.x - targetX)).toBeLessThan(2);
  expect(Math.abs(floating.y + grab.y - targetY)).toBeLessThan(2);
  await page.mouse.up();
  await expect(page.locator(".block-placeholder")).toHaveCount(0);
  await page.waitForTimeout(400);
  const landed = await box(main);
  const saveNow = await box(savings);
  expect(Math.abs(landed.x - saveNow.x)).toBeLessThan(3);
  expect(landed.y).toBeGreaterThan(saveNow.bottom);
  expect(landed.y - saveNow.bottom).toBeLessThan(30);

  // Narrower than half is not possible (too little room for the text): it stops at half
  const saveEdge = await savings.locator('[data-block-resize="right"]').boundingBox();
  await page.mouse.move(saveEdge.x + saveEdge.width / 2, saveEdge.y + saveEdge.height / 2);
  await page.mouse.down();
  await page.mouse.move(saveEdge.x + saveEdge.width / 2 - full / 4, saveEdge.y + saveEdge.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect((await savings.boundingBox()).width).toBeGreaterThan(full * 0.45);
  const arranged = await order();

  // "Ausblenden": while arranging the block stays faded with "Ausgeblendet", afterwards it is gone
  const categoriesBlock = page.locator('[data-block="categories"]');
  await categoriesBlock.locator('[data-action="toggle-block"]').click();
  await expect(categoriesBlock).toHaveClass(/block-hidden/);
  await expect(categoriesBlock.locator(".block-hidden-label")).toBeVisible();
  await expect(categoriesBlock.locator('[data-action="toggle-block"]')).toHaveAttribute("aria-label", "Ausgaben nach Kategorie einblenden");

  // A click outside the blocks ends arranging
  await page.click("#dashboard h1");
  await expect(page.locator('[data-sortable="dashboard"]')).not.toHaveClass(/arranging/);
  await expect(categoriesBlock).toBeHidden();

  await page.waitForTimeout(1500); // saved with the account
  await page.reload();
  await expect(page.locator("#financeApp")).toBeVisible();
  expect(await order()).toEqual(arranged);
  expect(Math.abs((await width("available")) - half)).toBeLessThan(3);
  expect((await box(main)).y).toBeGreaterThan((await box(savings)).bottom - 3); // still below the savings account
  await expect(categoriesBlock).toBeHidden();

  // The left edge works the same way (here it would get narrower than half, so it stays); the right side stays where it is
  await page.click('#dashboard [data-action="arrange"]');
  const before = await available.boundingBox();
  const leftEdge = await available.locator('[data-block-resize="left"]').boundingBox();
  await page.mouse.move(leftEdge.x + leftEdge.width / 2, leftEdge.y + leftEdge.height / 2);
  await page.mouse.down();
  await page.mouse.move(leftEdge.x + leftEdge.width / 2 + full / 8, leftEdge.y + leftEdge.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await available.boundingBox();
  expect(after.width).toBeGreaterThan(full * 0.45); // half is the smallest width
  expect(Math.abs(after.x + after.width - (before.x + before.width))).toBeLessThan(3);

  await page.click('#dashboard [data-action="reset-layout"]');
  expect(await order()).toEqual(start);
  await expect.poll(() => width("available")).toBeGreaterThan(full - 3);
  await expect(categoriesBlock).not.toHaveClass(/block-hidden/);

  await goTo(page, "month");
  await expect(page.locator('#month [data-action="arrange"]')).toHaveCount(0);
});

test("a withdrawal cannot exceed the savings balance", async ({ page, request }) => {
  await openApp(page, request);
  await goTo(page, "expenses");
  await page.selectOption("#entryKind", "withdraw");
  await page.fill("#exDesc", "Velo");
  await page.fill("#exAmount", "500");
  await page.click("#expenseSave");
  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#allExpenses")).not.toContainText("Velo");
});

test("standing orders appear in the month and can be marked as paid", async ({ page, request }) => {
  await openApp(page, request);
  await goTo(page, "recurring");
  await expect(page.locator('#recKind option[value="saving"]')).toHaveCount(1); // transfers to a savings account too
  await page.fill("#recName", "Handy-Abo");
  await page.fill("#recAmount", "25");
  await page.selectOption("#recInterval", "monthly");
  await page.click("#recurringSave");
  await expect(page.locator("#recurringRows")).toContainText("Handy-Abo");

  await goTo(page, "month");
  const planned = page.locator("#plannedPaymentsRows tr", { hasText: "Handy-Abo" });
  await expect(planned).toBeVisible();
  const toggle = planned.locator('[data-action="toggle-recurring-payment"]');
  const before = await toggle.textContent();
  await toggle.click();
  await expect(planned.locator('[data-action="toggle-recurring-payment"]')).not.toHaveText(before);
});

test("a standing order counts from its due date and can be marked open again", async ({ page, request }) => {
  await openApp(page, request);
  await goTo(page, "recurring");
  // Due today: paid automatically and taken off "available"
  await page.fill("#recName", "Fitness");
  await page.fill("#recAmount", "80");
  await page.click("#recurringSave");
  // Starts later: open, not counted yet
  await page.fill("#recName", "Halbtax");
  await page.fill("#recAmount", "190");
  await page.fill("#recStart", "2030-03-01");
  await page.click("#recurringSave");

  const fitness = page.locator("#recurringRows tr", { hasText: "Fitness" });
  await expect(fitness).toContainText("Bezahlt");
  await expect(fitness.locator("td.money")).toContainText("− CHF 80.00");
  await expect(page.locator("#recurringRows tr", { hasText: "Halbtax" })).toContainText("Nicht in diesem Lohnmonat");

  await goTo(page, "month");
  await expect.poll(async () => chf(await page.locator("#mSpent").textContent())).toBe(80);

  // Marked as open: no longer taken off
  const planned = page.locator("#plannedPaymentsRows tr", { hasText: "Fitness" });
  await planned.locator('[data-action="toggle-recurring-payment"]').click();
  await expect(planned).toContainText("Offen");
  await expect.poll(async () => chf(await page.locator("#mSpent").textContent())).toBe(0);
  await goTo(page, "recurring");
  await expect(fitness).toContainText("Offen");
  await expect(fitness.locator("td.money")).not.toContainText("−");
  await goTo(page, "dashboard");
  await expect(page.locator("#upcomingRows")).toContainText("Fitness");
});

test("the entries page shows only the selected pay month", async ({ page, request }) => {
  await openApp(page, request);
  await addEntry(page, { desc: "Znüni", amount: 4 });
  await page.click('.month-switch [data-action="change-month"]');
  await page.locator("#monthGrid .month-cell:not(:disabled):not(.selected)").first().click();
  await goTo(page, "expenses");
  await expect(page.locator("#allExpenses")).not.toContainText("Znüni");
});

test("dashboard, month, entries, standing orders and settings can be opened", async ({ page, request }) => {
  await openApp(page, request);
  for (const id of ["month", "expenses", "recurring", "settings", "dashboard"]) await goTo(page, id);
  await page.click('#dashboard [data-action="new-entry"]');
  await expect(page.locator("#expenses")).toHaveClass(/active/);
});

test("another pay month can be chosen", async ({ page, request }) => {
  await openApp(page, request);
  const label = await page.locator("#activeMonthLabel").textContent();
  await page.click('.month-switch [data-action="change-month"]');
  await expect(page.locator("#monthEntry")).toBeVisible();
  // Twelve months; months outside the apprenticeship cannot be chosen
  await expect(page.locator("#monthGrid .month-cell")).toHaveCount(12);
  await expect(page.locator("#monthGrid .month-cell:disabled").first()).toBeVisible();
  await page.locator("#monthGrid .month-cell:not(:disabled):not(.selected)").first().click();
  await expect(page.locator("#monthEntry")).toBeHidden();
  await expect(page.locator("#activeMonthLabel")).not.toHaveText(label);
});

test("the dashboard compares wage, expenses and savings; all months open in a pop-up", async ({ page, request }) => {
  await openApp(page, request, { setup: { startYear: new Date().getFullYear() - 1 } });
  await page.locator("#dashboard details", { hasText: "Statistik seit Lehrbeginn" }).locator("summary").click();

  // Last three pay months, each with wage, expenses and savings
  const rows = page.locator("#comparisonChart .compare-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.first().locator(".saved-value")).toBeVisible();
  await expect(rows.first().locator(".compare-track.saved")).toHaveCount(1);

  // "Seit Lehrbeginn": every pay month in a pop-up
  await page.click('[data-action="show-comparison"]');
  await expect(page.locator("#comparisonDialog")).toBeVisible();
  expect(await page.locator("#comparisonAll .compare-row").count()).toBeGreaterThan(3);
  await page.click('[data-action="close-comparison"]');
  await expect(page.locator("#comparisonDialog")).toBeHidden();
});

test("two blocks side by side can not be made narrower than half", async ({ page, request }) => {
  await openApp(page, request);
  await page.click('#dashboard [data-action="arrange"]');
  const main = page.locator('[data-block="account-main"]');
  const save = page.locator('[data-block="account-save"]');
  await page.waitForTimeout(400); // the blocks glide into their arranging places
  await save.scrollIntoViewIfNeeded();
  const mainBefore = await main.boundingBox();
  const saveBefore = await save.boundingBox();
  expect(Math.abs(mainBefore.y - saveBefore.y)).toBeLessThan(2); // next to each other, half each

  // The savings account's left edge to the left would make the wage account narrower than half
  const edge = await save.locator('[data-block-resize="left"]').boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 - 160, edge.y + edge.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const mainAfter = await main.boundingBox();
  expect(Math.abs(mainAfter.width - mainBefore.width)).toBeLessThan(3);
});

test("arranging stays on after moving or resizing a block, until 'Fertig' or a click outside", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await openApp(page, request);
  const container = page.locator('[data-sortable="dashboard"]');
  const toggle = page.locator('#dashboard [data-action="arrange"]');
  await toggle.click();
  await expect(container).toHaveClass(/arranging/);
  await page.waitForTimeout(400);

  // Resize: let go far away from the block (over empty space)
  const save = page.locator('[data-block="account-save"]');
  const edge = await save.locator('[data-block-resize="left"]').boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x - 120, edge.y + edge.height / 2 + 200, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(container).toHaveClass(/arranging/);

  // Move: drag the wage account by its bar and let go
  const main = page.locator('[data-block="account-main"]');
  const bar = await main.locator(".block-name").boundingBox();
  await page.mouse.move(bar.x + 10, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + 10, bar.y + bar.height / 2 + 300, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(container).toHaveClass(/arranging/);
  await expect(toggle).toHaveText("Fertig");

  // A real click outside ends it
  await page.click("#dashboard h1");
  await expect(container).not.toHaveClass(/arranging/);
  await expect(toggle).toHaveText("Anordnen");
});

test("an opening balance counts like money carried into the pay month in which it is entered", async ({ page, request }) => {
  await openApp(page, request);
  const before = await page.evaluate(() => monthSummary(currentMonth).available);
  await goTo(page, "settings");
  await page.click('[data-settings-tab-button="lists"]');
  const [spending, saving] = await page.evaluate(() => [spendingAccount().id, savingAccounts()[0].id]);
  await page.fill(`#acc-start-${spending}`, "30.50");
  await page.locator(`#acc-start-${spending}`).blur();
  await page.fill(`#acc-start-${saving}`, "20");
  await page.locator(`#acc-start-${saving}`).blur();

  await goTo(page, "dashboard");
  await expect.poll(async () => chf(await page.locator("#heroAmount").textContent())).toBeCloseTo(before + 30.5);
  await expect(page.locator("#currentSummary")).toContainText("Anfangsbestand");
  await expect
    .poll(async () => chf(await page.locator("#dashboard .account-card.spending strong").textContent()))
    .toBeCloseTo(before + 30.5);
  await goTo(page, "month");
  await expect.poll(async () => chf(await page.locator("#mAvail").textContent())).toBeCloseTo(before + 30.5);
  await expect(page.locator("#monthMath")).toContainText("Anfangsbestand");
  // Shown at the bottom, below the wage (it was there before the wage)
  await expect(page.locator("#monthMath tr").last()).toContainText("Anfangsbestand");
  // Counted once: the balance today has it once, the next pay month does not have it again
  const check = await page.evaluate(([spendingId, savingId]) => {
    const balance = accountBalances();
    const total = countedMonths().reduce((sum, month) => sum + monthSummary(month).available, 0);
    return {
      spending: balance[spendingId] - total,
      saving: balance[savingId] - countedMonths().reduce((sum, month) => sum + accountMoves([month])[savingId], 0),
      next: monthSummary(addMonths(currentMonth, 1)).opening,
    };
  }, [spending, saving]);
  expect(check.spending).toBeCloseTo(0);
  expect(check.saving).toBeCloseTo(0);
  expect(check.next).toBe(0);
});

test("the opening balance of a savings account shows on the month page too", async ({ page, request }) => {
  await openApp(page, request);
  const saving = await page.evaluate(() => savingAccounts()[0].id);
  await goTo(page, "settings");
  await page.click('[data-settings-tab-button="lists"]');
  await page.fill(`#acc-start-${saving}`, "0.50");
  await page.locator(`#acc-start-${saving}`).blur();
  await goTo(page, "dashboard");
  const card = chf(await page.locator("#dashboard .account-card.saving strong").first().textContent());
  await goTo(page, "month");
  await expect.poll(async () => chf(await page.locator("#mSaved").textContent())).toBeCloseTo(card);
  await expect(page.locator("#mSavedExtra")).toContainText("0.50");
  await expect(page.locator("#monthMath")).toContainText("Anfangsbestand Sparkonto");
});

test("a standing order can transfer money to a savings account", async ({ page, request }) => {
  await openApp(page, request);
  await goTo(page, "recurring");
  await page.selectOption("#recKind", "saving");
  await expect(page.locator("#recCatLabel")).toHaveText("Sparkonto");
  const account = await page.evaluate(() => savingAccounts()[0].name);
  await expect(page.locator("#recCat option").first()).toHaveText(account);
  await page.fill("#recName", "Sparplan Ferien");
  await page.fill("#recAmount", "100");
  await page.click("#recurringSave");
  await expect(page.locator("#recurringRows")).toContainText("Sparplan Ferien");
  const order = await page.evaluate(() => state.recurring.find((item) => item.name === "Sparplan Ferien"));
  expect(order.kind).toBe("saving");
  expect(order.cat).toBe(account);
});
