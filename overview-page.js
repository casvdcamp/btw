// Overview Page screen behavior.

function showPage(pageName) {
  elements.pagePanels.forEach((panel) => {
    const active = panel.id === `page-${pageName}`;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  elements.navButtons.forEach((button) => {
    const active = button.dataset.pageTarget === pageName;
    button.classList.toggle("active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  if (pageName === "overview") renderOverview();
}

function renderYearButtons() {
  const set = new Set(history.map(guessYear));
  expenses.forEach((record) => set.add(record.year));
  set.add(new Date().getFullYear());
  const years = Array.from(set).sort((a, b) => b - a);

  elements.yearButtons.innerHTML = "";
  years.forEach((year) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `year-button ${year === selectedYear ? "active" : ""}`;
    button.textContent = year;
    button.addEventListener("click", () => {
      selectedYear = year;
      renderOverview();
      renderYearButtons();
    });
    elements.yearButtons.appendChild(button);
  });
}

function formatRecordDate(record) {
  if (record.factuurdatum) return record.factuurdatum;
  return new Date(record.uploadedAt).toLocaleDateString("nl-NL");
}

function formatExpenseDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("nl-NL");
}

function renderTableRow(parent, record, kind) {
  const row = document.createElement("tr");
  const cells = kind === "payable"
    ? [
        record.omschrijving || "Factuur",
        formatRecordDate(record),
        fmt(record.btw || 0),
        fmt(record.ibReserve || 0),
        fmt((record.btw || 0) + (record.ibReserve || 0)),
      ]
    : [
        record.omschrijving || "Zakelijke uitgave",
        formatExpenseDate(record.expenseDate || formatRecordDate(record)),
        fmt(record.expenseTotal || 0),
        fmt(record.expenseVat || 0),
      ];

  cells.forEach((value, index) => {
    const cell = document.createElement("td");
    cell.textContent = value;
    if (kind === "refundable" && index === 0 && record.dataUrl) {
      const link = document.createElement("a");
      link.className = "attachment-link";
      link.href = record.dataUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Bekijk bon";
      cell.appendChild(document.createElement("br"));
      cell.appendChild(link);
    }
    row.appendChild(cell);
  });

  const actionCell = document.createElement("td");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "delete-button";
  button.textContent = "🗑";
  button.setAttribute("aria-label", kind === "payable" ? "Verwijder factuur" : "Verwijder bon");
  button.addEventListener("click", () => {
    if (kind === "payable") deleteRecord(record.id);
    else deleteExpense(record.id);
  });
  actionCell.appendChild(button);
  row.appendChild(actionCell);
  parent.appendChild(row);
}

function renderOverview() {
  const yearlyInvoices = history.filter((record) =>
    record.type !== "expense" && guessYear(record) === selectedYear
  );
  const yearlyExpenses = expenses.filter((record) => record.year === selectedYear);
  const payable = yearlyInvoices.reduce((sum, record) =>
    sum + (record.btw || 0) + (record.ibReserve || 0), 0
  );
  const refundable = yearlyExpenses.reduce((sum, record) => sum + (record.expenseVat || 0), 0);
  const difference = payable - refundable;

  elements.payableTotal.textContent = fmt(payable);
  elements.refundableTotal.textContent = fmt(refundable);
  elements.balanceResultCard.classList.toggle("is-payable", difference > 0);
  elements.balanceResultLabel.textContent = difference > 0 ? "Nog te betalen" : difference < 0 ? "Terug te krijgen" : "Saldo";
  elements.balanceResultValue.textContent = fmt(Math.abs(difference));
  elements.balanceResultHint.textContent = difference > 0
    ? "Na verrekening van de terug te vragen btw"
    : difference < 0
      ? "Je terug te vragen btw is hoger dan je reservering"
      : "Te betalen en terug te vragen zijn gelijk";

  elements.payableRows.innerHTML = "";
  yearlyInvoices.forEach((record) => renderTableRow(elements.payableRows, record, "payable"));
  elements.emptyPayable.classList.toggle("hidden", yearlyInvoices.length > 0);

  elements.refundableRows.innerHTML = "";
  yearlyExpenses.forEach((record) => renderTableRow(elements.refundableRows, record, "refundable"));
  elements.emptyRefundable.classList.toggle("hidden", yearlyExpenses.length > 0);

  const hasEntries = yearlyInvoices.length > 0 || yearlyExpenses.length > 0;
  elements.emptyYearLabel.textContent = selectedYear;
  elements.emptyOverview.classList.toggle("hidden", hasEntries);
  elements.overviewTables.classList.toggle("hidden", !hasEntries);
}

async function deleteRecord(id) {
  const next = history.filter((r) => r.id !== id);
  const saved = await saveHistory(next);
  if (!saved) return;

  if (id === savedRecordId) {
    savedRecordId = null;
    saveState = "unsaved";
    updateSaveUI();
  }

  renderOverview();
  renderYearButtons();
}

async function saveHistory(next) {
  try {
    ledgerStorage.saveInvoices(next);
    history = next;
    return true;
  } catch (error) {
    console.error("Kon overzicht niet opslaan", error);
    return false;
  }
}
