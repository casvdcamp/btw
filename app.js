const {
  formatCurrency: fmt,
  guessYear,
  buildInvoiceFromText,
  InvoiceCalculator,
} = window.ZzpFinance;
const ledgerStorage = new window.LedgerStorage();
let receiptScanner;

const elements = {
  navButtons: document.querySelectorAll("[data-page-target]"),
  pagePanels: document.querySelectorAll(".page-panel"),
  invoiceInput: document.getElementById("invoiceInput"),
  uploadEmpty: document.getElementById("uploadEmpty"),
  uploadPreview: document.getElementById("uploadPreview"),
  previewImage: document.getElementById("previewImage"),
  previewTitle: document.getElementById("previewTitle"),
  previewSubtext: document.getElementById("previewSubtext"),
  resetButton: document.getElementById("resetButton"),
  loadingNotice: document.getElementById("loadingNotice"),
  errorBox: document.getElementById("errorBox"),
  resultSummary: document.getElementById("resultSummary"),
  nettoValue: document.getElementById("nettoValue"),
  btwLabel: document.getElementById("btwLabel"),
  btwValue: document.getElementById("btwValue"),
  totaalValue: document.getElementById("totaalValue"),
  ibLabel: document.getElementById("ibLabel"),
  ibOptions: document.querySelectorAll("[data-ib-percent]"),
  opzijValue: document.getElementById("opzijValue"),
  vrijValue: document.getElementById("vrijValue"),
  saveStateSuccess: document.getElementById("saveStateSuccess"),
  saveButton: document.getElementById("saveButton"),
  saveHint: document.getElementById("saveHint"),
  retryBox: document.getElementById("retryBox"),
  retryButton: document.getElementById("retryButton"),
  yearButtons: document.getElementById("yearButtons"),
  emptyOverview: document.getElementById("emptyOverview"),
  emptyYearLabel: document.getElementById("emptyYearLabel"),
  expenseInput: document.getElementById("expenseInput"),
  expenseUploadEmpty: document.getElementById("expenseUploadEmpty"),
  expenseUploadPreview: document.getElementById("expenseUploadPreview"),
  expensePreviewImage: document.getElementById("expensePreviewImage"),
  expenseFileIcon: document.getElementById("expenseFileIcon"),
  expensePreviewTitle: document.getElementById("expensePreviewTitle"),
  expensePreviewSubtext: document.getElementById("expensePreviewSubtext"),
  expenseResetButton: document.getElementById("expenseResetButton"),
  expenseLoadingNotice: document.getElementById("expenseLoadingNotice"),
  expenseProgressText: document.getElementById("expenseProgressText"),
  expenseErrorBox: document.getElementById("expenseErrorBox"),
  expenseEditor: document.getElementById("expenseEditor"),
  expenseDescription: document.getElementById("expenseDescription"),
  expenseDate: document.getElementById("expenseDate"),
  expenseTotal: document.getElementById("expenseTotal"),
  expenseVat: document.getElementById("expenseVat"),
  expenseNetValue: document.getElementById("expenseNetValue"),
  expenseVatPercentValue: document.getElementById("expenseVatPercentValue"),
  expenseVatValue: document.getElementById("expenseVatValue"),
  expenseGrossValue: document.getElementById("expenseGrossValue"),
  expenseRecognitionState: document.getElementById("expenseRecognitionState"),
  expenseRefundValue: document.getElementById("expenseRefundValue"),
  expenseSaveState: document.getElementById("expenseSaveState"),
  expenseSaveButton: document.getElementById("expenseSaveButton"),
  overviewTables: document.getElementById("overviewTables"),
  payableRows: document.getElementById("payableRows"),
  refundableRows: document.getElementById("refundableRows"),
  emptyPayable: document.getElementById("emptyPayable"),
  emptyRefundable: document.getElementById("emptyRefundable"),
  payableTotal: document.getElementById("payableTotal"),
  refundableTotal: document.getElementById("refundableTotal"),
  balanceResultCard: document.getElementById("balanceResultCard"),
  balanceResultLabel: document.getElementById("balanceResultLabel"),
  balanceResultValue: document.getElementById("balanceResultValue"),
  balanceResultHint: document.getElementById("balanceResultHint"),
};

receiptScanner = new window.ReceiptScanner((message) => {
  elements.expenseProgressText.textContent = message;
});

let status = "idle";
let invoice = null;
let ibPercent = 30;
let history = [];
let selectedYear = null;
let saveState = "unsaved";
let savedRecordId = null;
let expenses = [];
let expenseDataUrl = null;
let expenseFile = null;
let expenseWasRecognized = false;
let expenseVatEstimated = false;

function hydrateHistory() {
  try {
    history = ledgerStorage.loadInvoices();
    const years = [...history.map(guessYear), ...expenses.map((record) => record.year)];
    selectedYear = years.length ? Math.max(...years) : new Date().getFullYear();
  } catch (error) {
    console.error("Kon overzicht niet laden", error);
    history = [];
    selectedYear = expenses.length
      ? Math.max(...expenses.map((record) => record.year))
      : new Date().getFullYear();
  } finally {
    renderYearButtons();
    renderOverview();
  }
}

function hydrateExpenses() {
  try {
    expenses = ledgerStorage.loadExpenses();
  } catch (error) {
    console.error("Kon bonnenoverzicht niet laden", error);
    expenses = [];
  }
}

function attachEvents() {
  elements.navButtons.forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.pageTarget));
  });
  elements.invoiceInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    handleFile(file);
  });

  elements.resetButton.addEventListener("click", resetForm);
  elements.retryButton.addEventListener("click", resetForm);
  elements.ibOptions.forEach((button) => {
    button.addEventListener("click", () => {
      ibPercent = Number(button.dataset.ibPercent);
      elements.ibOptions.forEach((option) => {
        const active = option === button;
        option.classList.toggle("active", active);
        option.setAttribute("aria-pressed", String(active));
      });
      elements.ibLabel.textContent = `${ibPercent}% van netto`;
      if (invoice) {
        updateCalculator();
        if (savedRecordId) {
          saveState = "dirty";
          updateSaveUI();
        }
      }
    });
  });

  elements.saveButton.addEventListener("click", handleSave);
  elements.expenseInput.addEventListener("change", (event) => {
    handleExpenseFile(event.target.files?.[0]);
  });
  elements.expenseResetButton.addEventListener("click", resetExpenseForm);
  elements.expenseVat.addEventListener("input", updateExpenseRefund);
  elements.expenseTotal.addEventListener("input", updateExpenseRefund);
  elements.expenseSaveButton.addEventListener("click", saveExpense);
}

attachEvents();
hydrateExpenses();
hydrateHistory();
updateSaveUI();
updateCalculator();
