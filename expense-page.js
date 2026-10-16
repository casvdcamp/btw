// Expense Page screen behavior.

function updateExpenseRefund() {
  const total = Number(elements.expenseTotal.value);
  const vat = Number(elements.expenseVat.value);
  const safeTotal = Number.isFinite(total) ? total : 0;
  const safeVat = Number.isFinite(vat) ? vat : 0;
  const net = Math.max(0, safeTotal - safeVat);
  const rate = net > 0 && safeVat > 0 ? safeVat / net * 100 : 0;

  elements.expenseNetValue.textContent = fmt(net);
  elements.expenseVatPercentValue.textContent = safeVat > 0 && net > 0
    ? `${Number(rate.toFixed(2))}%`
    : "Niet herkend";
  elements.expenseVatValue.textContent = fmt(safeVat);
  elements.expenseGrossValue.textContent = fmt(safeTotal);
  elements.expenseRefundValue.textContent = fmt(safeVat);
  elements.expenseRecognitionState.textContent = expenseVatEstimated
    ? "Btw geschat — controleer"
    : expenseWasRecognized
      ? "Automatisch herkend"
      : "Controleer of vul handmatig in";
}

function resetExpenseForm() {
  expenseDataUrl = null;
  expenseFile = null;
  expenseWasRecognized = false;
  expenseVatEstimated = false;
  elements.expenseInput.value = "";
  elements.expenseUploadEmpty.classList.remove("hidden");
  elements.expenseUploadPreview.classList.add("hidden");
  elements.expensePreviewImage.classList.add("hidden");
  elements.expensePreviewImage.removeAttribute("src");
  elements.expenseFileIcon.classList.add("hidden");
  elements.expenseEditor.classList.add("hidden");
  elements.expenseErrorBox.classList.add("hidden");
  elements.expenseLoadingNotice.classList.add("hidden");
  elements.expenseSaveState.classList.add("hidden");
  elements.expenseSaveButton.classList.remove("hidden");
  elements.expenseDescription.value = "";
  elements.expenseDate.value = "";
  elements.expenseTotal.value = "";
  elements.expenseVat.value = "";
  updateExpenseRefund();
}

async function readExpenseFromFile(file, dataUrl) {
  return receiptScanner.read(file, dataUrl);
}

async function handleExpenseFile(file) {
  if (!file) return;
  expenseFile = file;
  elements.expenseUploadEmpty.classList.add("hidden");
  elements.expenseUploadPreview.classList.remove("hidden");
  elements.expenseEditor.classList.add("hidden");
  elements.expenseErrorBox.classList.add("hidden");
  elements.expenseLoadingNotice.classList.remove("hidden");
  elements.expensePreviewTitle.textContent = file.name;
  elements.expensePreviewSubtext.textContent = "Bon wordt gelezen…";
  elements.expenseSaveState.classList.add("hidden");
  elements.expenseSaveButton.classList.remove("hidden");

  try {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!file.type.startsWith("image/") && !isPdf) {
      throw new Error("Kies een afbeelding of pdf-bestand.");
    }
    expenseDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(new Error("Het bestand kon niet worden gelezen."));
      reader.readAsDataURL(file);
    });
    if (file.type.startsWith("image/")) {
      elements.expensePreviewImage.src = expenseDataUrl;
      elements.expensePreviewImage.classList.remove("hidden");
      elements.expenseFileIcon.classList.add("hidden");
    } else {
      elements.expensePreviewImage.classList.add("hidden");
      elements.expenseFileIcon.classList.remove("hidden");
    }
    elements.expenseProgressText.textContent = "Bon wordt klaargemaakt voor herkenning";
    const parsed = await readExpenseFromFile(file, expenseDataUrl);
    if (!parsed.total) {
      throw new Error("Ik kon geen bedragen van deze bon herkennen.");
    }
    expenseWasRecognized = !parsed.vatEstimated;
    expenseVatEstimated = parsed.vatEstimated;
    elements.expenseDescription.value = file.name.replace(/\.[^.]+$/, "");
    elements.expenseDate.value = new Date().toISOString().slice(0, 10);
    elements.expenseTotal.value = parsed.total.toFixed(2);
    elements.expenseVat.value = parsed.vat.toFixed(2);
    elements.expensePreviewSubtext.textContent = parsed.vatEstimated
      ? "Het totaal is herkend. De btw is geschat op basis van " + parsed.vatRate + "% — controleer dit op de bon."
      : "Bedragen en btw zijn automatisch herkend. Controleer ze voor je opslaat.";
    elements.expenseEditor.classList.remove("hidden");
    updateExpenseRefund();
  } catch (error) {
    const message = error instanceof Error ? error.message : "De bon kon niet worden gelezen.";
    elements.expenseErrorBox.textContent = `${message} Vul de bedragen handmatig in of probeer een duidelijkere foto of pdf.`;
    elements.expenseErrorBox.classList.remove("hidden");
    elements.expensePreviewSubtext.textContent = "Je kunt de bedragen hieronder ook zelf invullen.";
    elements.expenseDescription.value = file.name.replace(/\.[^.]+$/, "");
    elements.expenseDate.value = new Date().toISOString().slice(0, 10);
    elements.expenseTotal.value = "";
    elements.expenseVat.value = "";
    expenseWasRecognized = false;
    expenseVatEstimated = false;
    elements.expenseEditor.classList.remove("hidden");
    updateExpenseRefund();
  } finally {
    elements.expenseProgressText.textContent = "Bon wordt uitgelezen en bedragen worden berekend";
    elements.expenseLoadingNotice.classList.add("hidden");
  }
}

async function saveExpense() {
  const total = Number(elements.expenseTotal.value);
  const vat = Number(elements.expenseVat.value);
  if (
    elements.expenseTotal.value === "" ||
    elements.expenseVat.value === "" ||
    !Number.isFinite(total) ||
    total <= 0 ||
    !Number.isFinite(vat) ||
    vat < 0 ||
    vat > total
  ) {
    elements.expenseErrorBox.textContent = "Vul een geldig totaalbedrag groter dan nul en een btw-bedrag tussen nul en het totaal in.";
    elements.expenseErrorBox.classList.remove("hidden");
    return;
  }
  const date = elements.expenseDate.value || new Date().toISOString().slice(0, 10);
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "expense",
    omschrijving: elements.expenseDescription.value.trim() || "Zakelijke uitgave",
    expenseDate: date,
    expenseTotal: total,
    expenseVat: vat,
    expenseNet: Number((total - vat).toFixed(2)),
    expenseVatRate: total > vat ? Number((vat / (total - vat) * 100).toFixed(2)) : 0,
    uploadedAt: new Date().toISOString(),
    year: Number(date.slice(0, 4)) || new Date().getFullYear(),
    fileName: expenseFile?.name || "",
    dataUrl: expenseDataUrl,
  };
  try {
    const next = [record, ...expenses];
    ledgerStorage.saveExpenses(next);
    expenses = next;
    selectedYear = record.year;
    renderYearButtons();
    renderOverview();
    elements.expenseSaveState.classList.remove("hidden");
    elements.expenseSaveButton.classList.add("hidden");
  } catch (error) {
    console.error("Kon bon niet opslaan", error);
    elements.expenseErrorBox.textContent = "De bon kon niet worden opgeslagen. Mogelijk is er te weinig opslagruimte op dit apparaat.";
    elements.expenseErrorBox.classList.remove("hidden");
  }
}

async function deleteExpense(id) {
  const next = expenses.filter((record) => record.id !== id);
  try {
    ledgerStorage.saveExpenses(next);
    expenses = next;
    renderYearButtons();
    renderOverview();
  } catch (error) {
    console.error("Kon bon niet verwijderen", error);
    elements.expenseErrorBox.textContent = "De bon kon niet worden verwijderd.";
    elements.expenseErrorBox.classList.remove("hidden");
  }
}
