// First-time setup ("Einrichtung"): the questions a new account answers before the app can be used.
// The answers are written straight into the settings and standing orders (applySetup in js/app/navigation.js),
// so they can be changed there later. The app behind it is blurred and cannot be used meanwhile.
//
// Setup.open({ lists, onFinish }) shows it; onFinish(answers) receives the answers.
// lists: { categories, incomeCategories, payments } – the starting lists, edited in the categories step.
// The subscriptions step can be skipped; all other steps must be answered.

const Setup = (() => {
  const t = I18N.t;
  const thisYear = new Date().getFullYear();
  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
  const PAYDAYS = [25, 26, 27, 28, 1];
  const INTERVAL_CHOICES = ["monthly", "quarterly", "halfyearly", "yearly"];

  let answers;
  let step;
  let onFinish;
  let startLists = {};

  // Categories step: the three lists that can be edited before the app starts
  const LIST_GROUPS = [
    ["categories", "Ausgaben"],
    ["incomeCategories", "Einnahmen"],
    ["payments", "Zahlungsarten"],
  ];
  const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  function addToList(list, name) {
    const clean = name.trim().slice(0, 40);
    if (!clean || answers.lists[list].some((item) => sameName(item, clean))) return false;
    answers.lists[list].push(clean);
    return true;
  }

  const $ = (id) => document.getElementById(id);
  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const amountOf = (value) => {
    const number = Number(String(value ?? "").trim().replace(",", "."));
    return Number.isFinite(number) && number > 0 ? number : 0;
  };
  const monthName = (month) => new Date(2026, month - 1).toLocaleDateString(I18N.locale, { month: "long" });
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const pad2 = (n) => String(n).padStart(2, "0");
  const addMonths = (month, count) => {
    const [year, number] = month.split("-").map(Number);
    return new Date(Date.UTC(year, number - 1 + count, 1)).toISOString().slice(0, 7);
  };

  // "Tracken ab": the pay months that can be chosen, from the start of the apprenticeship to the
  // next pay month (for someone who wants to start fresh with the next wage).
  function trackRange() {
    const first = `${answers.startYear}-${pad2(answers.startMonth)}`;
    const today = todayISO();
    const current = addMonths(today.slice(0, 7), Number(today.slice(8, 10)) < answers.payday ? -1 : 0);
    const end = addMonths(first, (answers.years || 4) * 12 - 1);
    const next = addMonths(current, 1);
    const last = next < first ? first : next > end ? end : next;
    return { first, last };
  }
  const trackLabel = (month, long = false) =>
    `${answers.payday}. ${new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1).toLocaleDateString(I18N.locale, long ? { month: "long", year: "numeric" } : { month: "short" }).replace(".", "")}`;

  function freshAnswers() {
    return {
      startMonth: 8, // most apprenticeships start in August
      startYear: thisYear,
      years: null,
      payday: null,
      thirteenth: null,
      wages: [],
      allowances: null, // "yes" or "no"
      allowanceItems: [
        { id: "food", name: t("Essenspauschale"), on: false, amount: "", per: "month" },
        { id: "transport", name: t("Fahrkosten / ÖV"), on: false, amount: "", per: "month" },
      ],
      ownAllowance: { name: "", amount: "", per: "month" },
      orders: [],
      trackFrom: null, // "YYYY-MM"; chosen after the payday
      trackYear: null,
      lists: Object.fromEntries(LIST_GROUPS.map(([list]) => [list, [...(startLists[list] || [])]])),
    };
  }

  // Buttons for a choice; the chosen one is pressed (aria-pressed), like radio buttons.
  function choices(name, options, selected) {
    // Long answers (e.g. the 13th salary) get two wide columns instead of narrow boxes.
    const wide = options.some(([, label]) => String(label).length > 14);
    return `<div class="setup-choices${wide ? " setup-choices-wide" : ""}" role="radiogroup">${options
      .map(
        ([value, label, hint]) => `<button type="button" class="setup-choice" role="radio" data-choice="${name}" data-value="${value}"
          aria-checked="${String(selected) === String(value)}">
          <b>${label}</b>${hint ? `<small>${hint}</small>` : ""}
        </button>`,
      )
      .join("")}</div>`;
  }

  const perSelect = (attributes, per) => `<select ${attributes} aria-label="${t("Wie oft?")}">
      <option value="month" ${per === "month" ? "selected" : ""}>${t("monatlich")}</option>
      <option value="year" ${per === "year" ? "selected" : ""}>${t("jährlich")}</option>
    </select>`;

  // Yearly allowance: in which pay month it comes (default: the month the apprenticeship started)
  const monthSelect = (attributes, item) => {
    if (item.per !== "year") return "";
    const chosen = item.month || String(answers.startMonth).padStart(2, "0");
    return `<label class="setup-month">${t("kommt im")}
      <select ${attributes} aria-label="${t("In welchem Lohnmonat?")}">
        ${Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"))
          .map((number) => `<option value="${number}" ${number === chosen ? "selected" : ""}>${monthName(number)}</option>`)
          .join("")}
      </select></label>`;
  };

  // Each step: title, optional note, the form (html) and a check that returns an error text or "".
  const STEPS = [
    {
      title: () => t("Wann hat deine Lehre begonnen?"),
      note: () => t("Damit weiss Finance OS, in welchem Lehrjahr du bist."),
      html: () => `<div class="setup-row">
          <label class="field"><span>${t("Monat")}</span>
            <select data-answer="startMonth">${MONTHS.map((m) => `<option value="${m}" ${m === answers.startMonth ? "selected" : ""}>${monthName(m)}</option>`).join("")}</select>
          </label>
          <label class="field"><span>${t("Jahr")}</span>
            <select data-answer="startYear">${Array.from({ length: 6 }, (_, i) => thisYear - 4 + i)
              .map((y) => `<option value="${y}" ${y === answers.startYear ? "selected" : ""}>${y}</option>`)
              .join("")}</select>
          </label>
        </div>`,
      check: () => "",
    },
    {
      title: () => t("Wie lange dauert deine Lehre?"),
      html: () =>
        choices("years", [
          [2, t("2 Jahre"), t("EBA")],
          [3, t("3 Jahre"), t("EFZ")],
          [4, t("4 Jahre"), t("EFZ")],
        ], answers.years),
      check: () => (answers.years ? "" : t("Bitte wähle eine Antwort.")),
    },
    {
      title: () => t("Wann bekommst du deinen Lohn?"),
      note: () => t("Ab diesem Tag beginnt jeweils dein Lohnmonat."),
      html: () => {
        const other = answers.payday && !PAYDAYS.includes(answers.payday);
        return `${choices("payday", PAYDAYS.map((day) => [day, day === 1 ? t("Am 1.") : t("Am {day}.", { day }), day === 1 ? t("Monatsanfang") : ""]), answers.payday)}
          <label class="field setup-other"><span>${t("Anderer Tag")}</span>
            <select data-answer="paydayOther">
              <option value="">–</option>
              ${Array.from({ length: 28 }, (_, i) => i + 1)
                .filter((day) => !PAYDAYS.includes(day))
                .map((day) => `<option value="${day}" ${other && day === answers.payday ? "selected" : ""}>${t("Am {day}.", { day })}</option>`)
                .join("")}
            </select>
          </label>`;
      },
      check: () => (answers.payday ? "" : t("Bitte wähle eine Antwort.")),
    },
    {
      title: () => t("Ab wann willst du deine Finanzen tracken?"),
      note: () => t("Monate davor zählen nicht mit – also kein Lohn, kein Sparen und keine Daueraufträge. Wähle den Lohnmonat, ab dem du alles einträgst."),
      html: () => {
        const { first, last } = trackRange();
        // Preselected: today's pay month (the next one is only chosen on purpose)
        const preselected = last > first ? addMonths(last, -1) : first;
        if (!answers.trackFrom || answers.trackFrom < first || answers.trackFrom > last) answers.trackFrom = preselected;
        if (!answers.trackYear) answers.trackYear = Number(answers.trackFrom.slice(0, 4));
        const year = answers.trackYear;
        const cells = Array.from({ length: 12 }, (_, i) => {
          const month = `${year}-${pad2(i + 1)}`;
          const selected = month === answers.trackFrom;
          const allowed = month >= first && month <= last;
          return `<button type="button" class="month-cell ${selected ? "selected" : ""}" role="radio" aria-checked="${selected}"
            data-setup="track-month" data-month="${month}" aria-label="${trackLabel(month, true)}" ${allowed ? "" : "disabled"}>${trackLabel(month)}</button>`;
        }).join("");
        const summary = answers.trackFrom === first
          ? t("Ab Lehrbeginn: alle Lohnmonate zählen mit.")
          : t("Ab {date} zählt alles mit, die Monate davor nicht.", { date: trackLabel(answers.trackFrom, true) });
        return `<div class="month-year setup-year">
            <button type="button" class="icon-button" data-setup="track-year" data-step="-1" aria-label="${t("Vorheriges Jahr")}" ${year <= Number(first.slice(0, 4)) ? "disabled" : ""}>‹</button>
            <b>${year}</b>
            <button type="button" class="icon-button" data-setup="track-year" data-step="1" aria-label="${t("Nächstes Jahr")}" ${year >= Number(last.slice(0, 4)) ? "disabled" : ""}>›</button>
          </div>
          <div class="month-grid setup-months" role="radiogroup" aria-label="${t("Ab wann willst du deine Finanzen tracken?")}">${cells}</div>
          <p class="note setup-track-note">${summary}</p>`;
      },
      check: () => {
        const { first, last } = trackRange();
        return answers.trackFrom && answers.trackFrom >= first && answers.trackFrom <= last ? "" : t("Bitte wähle einen Monat.");
      },
    },
    {
      title: () => t("Hast du einen 13. Monatslohn?"),
      html: () =>
        choices("thirteenth", [
          ["none", t("Nein")],
          ["11", t("Ja, mit dem Novemberlohn")],
          ["12", t("Ja, mit dem Dezemberlohn")],
          ["spread", t("Ja, in den 12 Löhnen verteilt"), t("Er steckt schon in jedem Lohn")],
        ], answers.thirteenth),
      check: () => (answers.thirteenth ? "" : t("Bitte wähle eine Antwort.")),
    },
    {
      title: () => t("Wie viel Lohn bekommst du?"),
      note: () => t("Der Nettolohn pro Monat, also was auf deinem Konto ankommt. Er steht in deinem Lehrvertrag."),
      html: () => `<div class="setup-wages">${Array.from({ length: answers.years }, (_, i) => `
          <label class="field"><span>${t("{n}. Lehrjahr", { n: i + 1 })}</span>
            <span class="setup-money"><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"
              data-wage="${i}" value="${escapeHTML(answers.wages[i] ?? "")}"><small>CHF</small></span>
          </label>`).join("")}</div>`,
      check: () =>
        Array.from({ length: answers.years }, (_, i) => amountOf(answers.wages[i])).every(Boolean)
          ? ""
          : t("Bitte gib für jedes Lehrjahr einen Lohn grösser als 0 ein."),
    },
    {
      title: () => t("Bekommst du Pauschalen zum Lohn?"),
      note: () => t("Zum Beispiel CHF 120 pro Monat fürs Essen oder ein Beitrag an das ÖV-Abo."),
      html: () => {
        const items = answers.allowances === "yes"
          ? `<div class="setup-allowances">
              ${answers.allowanceItems.map((item, i) => `
                <div class="setup-allowance ${item.on ? "on" : ""}">
                  <label class="setup-check"><input type="checkbox" data-allowance-on="${i}" ${item.on ? "checked" : ""}> <b>${escapeHTML(item.name)}</b></label>
                  ${item.on ? `<div class="setup-row">
                    <span class="setup-money"><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="${t("Betrag CHF")}"
                      data-allowance-amount="${i}" value="${escapeHTML(item.amount)}"><small>CHF</small></span>
                    ${perSelect(`data-allowance-per="${i}"`, item.per)}
                    ${monthSelect(`data-allowance-month="${i}"`, item)}
                  </div>` : ""}
                </div>`).join("")}
              <div class="setup-allowance">
                <label class="field"><span>${t("Eigene Pauschale (optional)")}</span>
                  <input maxlength="60" placeholder="${t("z. B. Schulmaterial")}" data-own="name" value="${escapeHTML(answers.ownAllowance.name)}"></label>
                <div class="setup-row">
                  <span class="setup-money"><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="${t("Betrag CHF")}"
                    data-own="amount" value="${escapeHTML(answers.ownAllowance.amount)}"><small>CHF</small></span>
                  ${perSelect('data-own="per"', answers.ownAllowance.per)}
                  ${monthSelect('data-own="month"', answers.ownAllowance)}
                </div>
              </div>
              <p class="note">${t("Der Betrag gilt für alle Lehrjahre. Du kannst ihn später pro Lehrjahr anpassen.")}</p>
            </div>`
          : "";
        return choices("allowances", [["yes", t("Ja")], ["no", t("Nein")]], answers.allowances) + items;
      },
      check: () => {
        if (!answers.allowances) return t("Bitte wähle eine Antwort.");
        if (answers.allowances === "no") return "";
        const chosen = answers.allowanceItems.filter((item) => item.on);
        const own = answers.ownAllowance.name.trim();
        if (!chosen.length && !own) return t("Wähle mindestens eine Pauschale aus oder antworte mit „Nein“.");
        if (chosen.some((item) => !amountOf(item.amount)) || (own && !amountOf(answers.ownAllowance.amount))) {
          return t("Bitte gib für jede gewählte Pauschale einen Betrag ein.");
        }
        return "";
      },
    },
    {
      title: () => t("Lege deine Kategorien fest"),
      note: () => t("Tippe auf einen Namen, um ihn zu ändern. Später kannst du alles in den Einstellungen anpassen."),
      html: () =>
        LIST_GROUPS.map(([list, title]) => {
          const items = answers.lists[list];
          return `<section class="setup-list">
            <h3>${t(title)} <span>${items.length}</span></h3>
            <div class="setup-tags">
              ${items
                .map(
                  (name, i) => `<span class="setup-tag">
                    <input data-tag-list="${list}" data-tag="${i}" value="${escapeHTML(name)}" size="${Math.max(3, name.length)}" maxlength="40" aria-label="${t("{name} umbenennen", { name: escapeHTML(name) })}">
                    <button type="button" data-setup="remove-tag" data-list="${list}" data-index="${i}" aria-label="${t("{name} entfernen", { name: escapeHTML(name) })}">×</button>
                  </span>`,
                )
                .join("")}
              <input class="setup-tag-new" data-tag-new="${list}" maxlength="40" placeholder="${t("Eigene hinzufügen …")}" aria-label="${t("Eigene hinzufügen …")} – ${t(title)}">
            </div>
          </section>`;
        }).join(""),
      check: () => {
        // A name typed into "Eigene hinzufügen" without Enter still counts
        document.querySelectorAll("#setupBody [data-tag-new]").forEach((field) => addToList(field.dataset.tagNew, field.value));
        for (const [list, title] of LIST_GROUPS) {
          const items = answers.lists[list].map((name) => name.trim()).filter(Boolean);
          if (!items.length) return t("Behalte mindestens einen Eintrag bei {list}.", { list: t(title) });
          if (items.some((name, i) => items.findIndex((other) => sameName(other, name)) !== i)) return t("Bei {list} kommt ein Name doppelt vor.", { list: t(title) });
          answers.lists[list] = items;
        }
        return "";
      },
    },
    {
      optional: true,
      title: () => t("Hast du Abos oder feste Zahlungen?"),
      note: () => t("Zum Beispiel Handy-Abo, Streaming, Fitness oder Halbtax. Sie werden als Daueraufträge eingetragen."),
      html: () => `<div class="setup-orders">${answers.orders
        .map(
          (order, i) => `<div class="setup-order">
            <div class="setup-row">
              <label class="field"><span>${t("Name")}</span><input maxlength="60" placeholder="${t("z. B. Handy-Abo")}" data-order="${i}" data-key="name" value="${escapeHTML(order.name)}"></label>
              <label class="field"><span>${t("Betrag CHF")}</span><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" data-order="${i}" data-key="amount" value="${escapeHTML(order.amount)}"></label>
            </div>
            <div class="setup-row">
              <label class="field"><span>${t("Wiederholung")}</span>
                <select data-order="${i}" data-key="interval">${INTERVAL_CHOICES.map((value) => `<option value="${value}" ${value === order.interval ? "selected" : ""}>${t({ monthly: "Monatlich", quarterly: "Vierteljährlich", halfyearly: "Halbjährlich", yearly: "Jährlich" }[value])}</option>`).join("")}</select>
              </label>
              <label class="field"><span>${t("Nächste Zahlung")}</span><input type="date" data-order="${i}" data-key="start" value="${escapeHTML(order.start)}"></label>
            </div>
            <div class="setup-row">
              <label class="field"><span>${t("Kategorie")}</span>
                <select data-order="${i}" data-key="cat">${answers.lists.categories.map((name) => `<option ${name === order.cat ? "selected" : ""}>${escapeHTML(name)}</option>`).join("")}</select>
              </label>
              <button type="button" class="danger setup-remove" data-setup="remove-order" data-index="${i}">${t("Entfernen")}</button>
            </div>
          </div>`,
        )
        .join("")}
        <button type="button" class="secondary" data-setup="add-order">${answers.orders.length ? t("+ Weitere Zahlung") : t("+ Zahlung hinzufügen")}</button>
      </div>`,
      check: () =>
        answers.orders.every((order) => order.name.trim() && amountOf(order.amount) && order.start)
          ? ""
          : t("Bitte fülle bei jeder Zahlung Name, Betrag und Datum aus – oder entferne sie."),
    },
    {
      last: true,
      title: () => t("Alles bereit!"),
      note: () => t("So ist Finance OS jetzt eingestellt. Ändern kannst du alles jederzeit unter Einstellungen und Daueraufträge."),
      html: () => {
        const chf = (value) => "CHF " + amountOf(value).toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const thirteenth = { none: t("Nein"), 11: t("Ja, mit dem Novemberlohn"), 12: t("Ja, mit dem Dezemberlohn"), spread: t("Ja, in den 12 Löhnen verteilt") };
        const allowances = answers.allowances === "yes"
          ? [...answers.allowanceItems.filter((item) => item.on), ...(answers.ownAllowance.name.trim() ? [answers.ownAllowance] : [])]
              .map((item) => `${escapeHTML(item.name)} ${chf(item.amount)} ${item.per === "year" ? `${t("jährlich")} (${monthName(item.month || String(answers.startMonth).padStart(2, "0"))})` : t("monatlich")}`)
              .join(", ")
          : t("Keine");
        const rows = [
          [t("Lehrbeginn"), `${monthName(answers.startMonth)} ${answers.startYear}`],
          [t("Dauer der Lehre"), t("{n} Jahre", { n: answers.years })],
          [t("Lohn kommt am"), `${answers.payday}.`],
          [t("Tracken ab"), answers.trackFrom === trackRange().first ? t("Ab Lehrbeginn") : trackLabel(answers.trackFrom, true)],
          [t("13. Monatslohn"), thirteenth[answers.thirteenth]],
          ...Array.from({ length: answers.years }, (_, i) => [t("{n}. Lehrjahr", { n: i + 1 }), chf(answers.wages[i])]),
          [t("Pauschalen"), allowances],
          [t("Daueraufträge"), answers.orders.length ? answers.orders.map((order) => escapeHTML(order.name)).join(", ") : t("Keine")],
        ];
        return `<dl class="setup-summary">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
      },
      check: () => "",
    },
  ];

  const questions = STEPS.filter((item) => !item.last).length;

  // newStep: a different question is shown, so the focus moves to its title.
  function render(newStep = false) {
    const current = STEPS[step];
    $("setupProgress").textContent = current.last ? "" : t("Frage {n} von {total}", { n: step + 1, total: questions });
    $("setupBar").style.width = `${(step / (STEPS.length - 1)) * 100}%`;
    $("setupTitle").textContent = current.title();
    $("setupNote").textContent = current.note ? current.note() : "";
    $("setupBody").innerHTML = current.html();
    $("setupError").hidden = true;
    $("setupBack").hidden = step === 0;
    $("setupSkip").hidden = !current.optional;
    $("setupNext").textContent = current.last ? t("Los geht's") : t("Weiter");
    if (newStep) {
      $("setupTitle").focus();
      $("setup").scrollTop = 0;
    }
  }

  function showError(text) {
    $("setupError").textContent = text;
    $("setupError").hidden = !text;
  }

  function next() {
    const error = STEPS[step].check();
    if (error) return showError(error);
    if (STEPS[step].last) return finish();
    step += 1;
    render(true);
  }

  function finish() {
    $("setup").hidden = true;
    document.body.classList.remove("setup-open");
    $("financeApp").inert = false;
    onFinish?.(answers);
  }

  // Remembers what was typed or chosen; choices that change the form redraw the step.
  function onInput(event) {
    const field = event.target;
    const data = field.dataset;
    if (data.answer === "startMonth" || data.answer === "startYear") {
      answers[data.answer] = Number(field.value);
      answers.trackYear = null;
    }
    if (data.answer === "paydayOther" && field.value) {
      answers.payday = Number(field.value);
      document.querySelectorAll('[data-choice="payday"]').forEach((button) => button.setAttribute("aria-checked", "false"));
    }
    if (data.wage) answers.wages[Number(data.wage)] = field.value;
    if (data.allowanceAmount) answers.allowanceItems[Number(data.allowanceAmount)].amount = field.value;
    if (data.allowancePer) answers.allowanceItems[Number(data.allowancePer)].per = field.value;
    if (data.allowanceMonth) answers.allowanceItems[Number(data.allowanceMonth)].month = field.value;
    if (data.own) answers.ownAllowance[data.own] = field.value;
    // "jährlich" shows the month choice
    if ((data.allowancePer || data.own === "per") && event.type === "change") render();
    if (data.order) answers.orders[Number(data.order)][data.key] = field.value;
    // Categories step: renaming happens while typing; an emptied name is removed when leaving the field
    if (data.tagList) {
      answers.lists[data.tagList][Number(data.tag)] = field.value;
      field.size = Math.max(3, field.value.length);
      if (event.type === "change" && !field.value.trim()) {
        answers.lists[data.tagList].splice(Number(data.tag), 1);
        render();
      }
    }
    if (data.allowanceOn && event.type === "change") {
      answers.allowanceItems[Number(data.allowanceOn)].on = field.checked;
      render();
    }
    if (field.closest(".setup-card")) showError("");
  }

  function onClick(event) {
    const choice = event.target.closest("[data-choice]");
    if (choice) {
      const name = choice.dataset.choice;
      const value = choice.dataset.value;
      answers[name] = ["years", "payday"].includes(name) ? Number(value) : value;
      if (name === "years") answers.wages = answers.wages.slice(0, answers.years);
      render();
      return;
    }
    const action = event.target.closest("[data-setup]")?.dataset.setup;
    if (action === "track-month") {
      answers.trackFrom = event.target.closest("[data-setup]").dataset.month;
      render();
      $("setupBody").querySelector(".month-cell.selected")?.focus();
      return;
    }
    if (action === "track-year") {
      answers.trackYear += Number(event.target.closest("[data-setup]").dataset.step);
      render();
      return;
    }
    if (action === "add-order") {
      const categories = answers.lists.categories;
      answers.orders.push({ name: "", amount: "", interval: "monthly", start: todayISO(), cat: categories.find((name) => /abo/i.test(name)) || categories[0] || "" });
      render();
      $("setupBody").querySelector(`[data-order="${answers.orders.length - 1}"][data-key="name"]`)?.focus();
    }
    if (action === "remove-tag") {
      const button = event.target.closest("[data-setup]");
      answers.lists[button.dataset.list].splice(Number(button.dataset.index), 1);
      render();
      showError("");
      return;
    }
    if (action === "remove-order") {
      answers.orders.splice(Number(event.target.closest("[data-setup]").dataset.index), 1);
      render();
    }
  }

  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    const card = $("setup");
    card.addEventListener("input", onInput);
    card.addEventListener("change", onInput);
    card.addEventListener("click", onClick);
    $("setupNext").addEventListener("click", next);
    $("setupBack").addEventListener("click", () => {
      step = Math.max(0, step - 1);
      render(true);
    });
    $("setupSkip").addEventListener("click", () => {
      answers.orders = [];
      step += 1;
      render(true);
    });
    // Enter in a field means "next"; Escape does not close the setup.
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target.dataset.tagNew) {
        // "Eigene hinzufügen": Enter adds the name and keeps the field ready for the next one
        event.preventDefault();
        const list = event.target.dataset.tagNew;
        addToList(list, event.target.value);
        render();
        $("setupBody").querySelector(`[data-tag-new="${list}"]`)?.focus();
        return;
      }
      if (event.key === "Enter" && event.target.dataset.tagList) {
        event.preventDefault();
        event.target.blur();
        return;
      }
      if (event.key === "Enter" && event.target.tagName === "INPUT") {
        event.preventDefault();
        next();
      }
    });
  }

  function open(options = {}) {
    onFinish = options.onFinish;
    startLists = options.lists || {};
    answers = freshAnswers();
    step = 0;
    wire();
    document.body.classList.add("setup-open");
    $("financeApp").inert = true; // the app behind cannot be clicked or focused
    $("setup").hidden = false;
    render(true);
  }

  return { open, isOpen: () => !$("setup").hidden };
})();
