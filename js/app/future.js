"use strict";

// Finance OS app, part: Sparzukunft page. Per apprenticeship year: what is saved every month
// (automatic saving, saved allowances, 13th-month salary when its switch is on) out of the
// monthly income, what is left to spend, and what is saved once a year (yearly allowances,
// 13th-month salary with the November/December pay). On top: the total until the end of the
// apprenticeship. The amounts are set under Einstellungen → Lohn & Pauschalen.
// The period starts with "Tracken ab" and ends with the apprenticeship; both can be changed on the page.

let futureChoice = { from: null, to: null }; // chosen period on the page (pay months), not saved

// All pay months of the apprenticeship (without the month after it ends)
const apprenticeshipMonths = () => monthList().slice(0, state.years * 12);

function futureRange() {
  const months = apprenticeshipMonths();
  const from = months.includes(futureChoice.from) ? futureChoice.from : months.includes(trackStart()) ? trackStart() : months[0];
  const to = months.includes(futureChoice.to) && futureChoice.to >= from ? futureChoice.to : months.at(-1);
  return { from, to };
}

function futureYear(i, from, to) {
  const yearMonths = Array.from({ length: 12 }, (_, k) => addMonths(firstMonth(), i * 12 + k));
  const months = yearMonths.filter((month) => month >= from && month <= to);
  const inRange = (number) => months.some((month) => month.slice(5, 7) === number);
  const salary = Number(state.salaries[i]) || 0;
  const saveThirteenth = Boolean((state.thirteenthSave || [])[i]);
  const parts = [];
  const yearly = [];
  let allowanceIncome = 0;
  let saved = 0;
  const addSaved = (label, amount) => {
    if (amount > 0) {
      saved += amount;
      parts.push([label, amount]);
    }
  };
  addSaved(t("Automatisch sparen"), Number(state.extraSave[i]) || 0);
  for (const allowance of enabledAllowances()) {
    const amount = Number(allowance.amounts[i]) || 0;
    const save = Number(allowance.save[i]) || 0;
    if (allowance.per === "year") {
      if (amount && inRange(allowanceMonth(allowance))) yearly.push({ when: t("Im {month}", { month: monthLabel(allowanceMonth(allowance)) }), label: allowance.name, amount, save });
      continue;
    }
    allowanceIncome += amount;
    addSaved(allowance.name, save);
  }
  if (state.thirteenth === "spread" && saveThirteenth) addSaved(t("13. Lohn (Anteil)"), Math.round((salary / 13) * 100) / 100);
  if (["11", "12"].includes(state.thirteenth) && salary && inRange(state.thirteenth)) {
    yearly.push({ when: t("Im {month}", { month: monthLabel(state.thirteenth) }), label: t("13. Monatslohn"), amount: salary, save: saveThirteenth ? salary : 0 });
  }
  // Standing orders to a savings account: monthly ones like the parts above, others as "n × im Jahr"
  const orders = new Map();
  for (const month of months) {
    for (const { order } of plannedRecurring(month).filter((payment) => payment.order.kind === "saving")) {
      const entry = orders.get(order.id) || { order, total: 0, count: 0 };
      entry.total += Number(order.amount) || 0;
      entry.count += 1;
      orders.set(order.id, entry);
    }
  }
  for (const { order, total, count } of orders.values()) {
    if (count === months.length) addSaved(order.name, Number(order.amount) || 0);
    else yearly.push({ when: t("{n} × im Jahr", { n: count }), label: order.name, amount: total, save: total, order: true });
  }
  const income = salary + allowanceIncome;
  const perYear = saved * months.length + yearly.reduce((sum, item) => sum + item.save, 0);
  return { salary, allowanceIncome, income, saved, left: income - saved, parts, yearly, perYear, monthCount: months.length };
}

function renderFuture() {
  const { from, to } = futureRange();
  // Full month name, and a short one for phones ("Sept. 2026")
  const label = (month) => {
    const [year, number] = month.split("-").map(Number);
    const short = new Date(year, number - 1).toLocaleDateString(I18N.locale, { month: "short", year: "numeric" });
    return `<span class="label-long">${monthName(month)}</span><span class="label-short">${short}</span>`;
  };
  $("futureFromLabel").innerHTML = label(from);
  $("futureToLabel").innerHTML = label(to);
  const presets = futurePresets().filter((preset) => preset.show);
  $("futurePresets").innerHTML = presets
    .map((preset) => `<button type="button" data-action="future-preset" data-preset="${preset.id}" aria-pressed="${preset.from === from && preset.to === to}">${preset.label}</button>`)
    .join("");

  const years = yearIndexes()
    .map((i) => ({ i, ...futureYear(i, from, to) }))
    .filter((year) => year.monthCount > 0);
  const total = years.reduce((sum, year) => sum + year.perYear, 0);
  const biggest = Math.max(...years.map((year) => year.perYear), 1);
  const monthCount = years.reduce((sum, year) => sum + year.monthCount, 0);

  $("futureTotalLabel").textContent = t("Von {from} bis {to} sparst du", { from: monthName(from), to: monthName(to) });
  $("futureTotal").textContent = chf(total);
  $("futureTotalNote").textContent = t("in {n} Lohnmonaten, wenn alles so bleibt wie eingestellt", { n: monthCount });
  $("futureYears").innerHTML = years
    .map(
      (year) => `<li>
        <span>${yearLabel(year.i)}</span>
        <span class="future-bar"><span style="width:${Math.round((year.perYear / biggest) * 100)}%"></span></span>
        <b>${chf(year.perYear)}</b>
      </li>`,
    )
    .join("");

  $("saveOverview").innerHTML = years
    .map((year) => {
      const share = year.income ? Math.round((year.saved / year.income) * 100) : 0;
      const parts = year.parts.length
        ? year.parts.map(([label, amount]) => `<li><span>${escapeHTML(label)}</span><b>${chf(amount)}</b></li>`).join("")
        : `<li class="empty-line"><span>${t("Noch nichts eingestellt")}</span></li>`;
      const yearly = year.yearly
        .map(
          (item) => `<p class="save-yearly">${escapeHTML(item.when)}: ${escapeHTML(item.label)} ${
            item.order ? `– ${t("gespart")} <b>${chf(item.save)}</b>` : `${chf(item.amount)}${item.save ? ` – ${t("davon gespart")} <b>${chf(item.save)}</b>` : ""}`
          }</p>`,
        )
        .join("");
      return `<article class="card save-year">
        <h2>${yearLabel(year.i)}${year.monthCount < 12 ? ` <small>· ${t("{n} von 12 Monaten", { n: year.monthCount })}</small>` : ""}</h2>
        <p class="save-headline">${t(year.allowanceIncome ? "Du sparst {saved} von {income} (Lohn + Pauschalen) pro Monat" : "Du sparst {saved} von {income} (Lohn) pro Monat", {
          saved: `<b>${chf(year.saved)}</b>`,
          income: chf(year.income),
        })}</p>
        <div class="save-meter" aria-hidden="true"><span style="width:${Math.min(100, share)}%"></span></div>
        <p class="save-left">${share} % ${t("gespart")} · ${t("zum Ausgeben bleiben {amount}", { amount: `<b>${chf(year.left)}</b>` })}</p>
        <ul class="save-parts">${parts}</ul>
        ${yearly}
      </article>`;
    })
    .join("");
}

// "Von" / "Bis": a pop-up with ‹ year › and the twelve months, like "Monat ändern".
// "Bis" only offers months from "Von" on; months outside the apprenticeship can not be chosen.
let futurePick = { end: "from", year: null };

function futurePickChoices() {
  const months = apprenticeshipMonths();
  return futurePick.end === "to" ? months.filter((month) => month >= futureRange().from) : months;
}

function openFuturePick(data) {
  const { from, to } = futureRange();
  futurePick = { end: data.end === "to" ? "to" : "from", year: Number((data.end === "to" ? to : from).slice(0, 4)) };
  renderFuturePick();
  if (!$("futureMonthDialog").open) $("futureMonthDialog").showModal();
  $("futureMonthGrid").querySelector(".selected")?.focus();
}

function renderFuturePick() {
  const choices = futurePickChoices();
  const years = choices.map((month) => Number(month.slice(0, 4)));
  const selected = futureRange()[futurePick.end];
  const today = todaysMonth();
  $("futureMonthTitle").textContent = t(futurePick.end === "to" ? "Bis zu welchem Lohnmonat?" : "Ab welchem Lohnmonat?");
  $("futurePickYear").textContent = futurePick.year;
  document.querySelector('[data-action="future-pick-year"][data-step="-1"]').disabled = futurePick.year <= Math.min(...years);
  document.querySelector('[data-action="future-pick-year"][data-step="1"]').disabled = futurePick.year >= Math.max(...years);
  $("futureMonthGrid").innerHTML = Array.from({ length: 12 }, (_, i) => {
    const month = `${futurePick.year}-${pad2(i + 1)}`;
    const label = new Date(futurePick.year, i).toLocaleDateString(I18N.locale, { month: "short" }).replace(".", "");
    const classes = ["month-cell", month === selected ? "selected" : "", month === today ? "today" : ""].join(" ");
    return `<button type="button" class="${classes}" data-action="future-pick-month" data-month="${month}"
      aria-pressed="${month === selected}" aria-label="${monthName(month)}" ${choices.includes(month) ? "" : "disabled"}>${label}</button>`;
  }).join("");
}

function changeFuturePickYear(data) {
  futurePick.year += Number(data.step);
  renderFuturePick();
}

function pickFutureMonth(data) {
  if (!futurePickChoices().includes(data.month)) return;
  futureChoice[futurePick.end] = data.month;
  $("futureMonthDialog").close();
  renderFuture();
}

// Quick choices: from "Tracken ab", from today's pay month, or the whole apprenticeship
function futurePresets() {
  const months = apprenticeshipMonths();
  const end = months.at(-1);
  const track = months.includes(trackStart()) ? trackStart() : months[0];
  const today = todaysMonth();
  return [
    { id: "track", label: t("Ab Tracken"), from: track, to: end, show: track !== months[0] },
    { id: "today", label: t("Ab heute"), from: today, to: end, show: today !== track && months.includes(today) },
    { id: "all", label: t("Ganze Lehre"), from: months[0], to: end, show: true },
  ];
}

function chooseFuturePreset(id) {
  const preset = futurePresets().find((item) => item.id === id);
  if (!preset) return;
  futureChoice = { from: preset.from, to: preset.to };
  renderFuture();
}

// "Beträge ändern": to Einstellungen → Lohn & Pauschalen
function editSaving() {
  showPage("settings");
  showSettingsTab("pay");
}
