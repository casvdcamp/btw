// Invoice Page screen behavior.

function setStatus(nextStatus, msg = "") {
  status = nextStatus;

  elements.loadingNotice.classList.toggle("hidden", nextStatus !== "loading");
  elements.errorBox.classList.toggle("hidden", nextStatus !== "error");
  elements.errorBox.textContent = msg;

  if (nextStatus === "done" && invoice) {
    elements.previewTitle.textContent = invoice.omschrijving || "Factuur verwerkt";
    if (invoice.klant) {
      elements.previewSubtext.textContent = `${invoice.klant}${invoice.factuurdatum ? ` · ${invoice.factuurdatum}` : ""}`;
    } else {
      elements.previewSubtext.textContent = "";
    }
  }

  if (nextStatus === "error") {
    elements.retryBox.classList.remove("hidden");
  } else {
    elements.retryBox.classList.add("hidden");
  }
}

function updateSaveUI() {
  const saved = saveState === "saved";
  elements.saveStateSuccess.classList.toggle("hidden", !saved);
  elements.saveButton.classList.toggle("hidden", saved);
  elements.saveHint.classList.toggle("hidden", saved);

  if (saved) {
    elements.saveButton.textContent = "Opslaan in jaaroverzicht";
  } else {
    elements.saveButton.innerHTML = "<span>💾</span> " + (saveState === "dirty" ? "Wijziging opslaan in jaaroverzicht" : "Opslaan in jaaroverzicht");
  }
}

function updateCalculator() {
  const { net, vat, total, incomeTax, reserve, spendable } =
    InvoiceCalculator.calculate(invoice, ibPercent);

  elements.nettoValue.textContent = fmt(net);
  elements.btwLabel.textContent = `${invoice?.btw_percentage ?? 21}%`;
  elements.btwValue.textContent = fmt(vat);
  elements.totaalValue.textContent = fmt(total);
  elements.ibLabel.textContent = `${ibPercent}% van netto`;
  elements.opzijValue.textContent = fmt(reserve);
  elements.vrijValue.textContent = fmt(spendable);
}

function resetForm() {
  status = "idle";
  invoice = null;
  saveState = "unsaved";
  savedRecordId = null;
  elements.invoiceInput.value = "";
  elements.previewImage.src = "";
  elements.uploadEmpty.classList.remove("hidden");
  elements.uploadPreview.classList.add("hidden");
  elements.resultSummary.classList.add("hidden");
  elements.errorBox.classList.add("hidden");
  elements.retryBox.classList.add("hidden");
  elements.previewTitle.textContent = "Factuur wordt gelezen…";
  elements.previewSubtext.textContent = "";
  updateSaveUI();
  updateCalculator();
  renderOverview();
}

async function readInvoiceFromImage(file) {
  if (!window.Tesseract) {
    throw new Error("OCR-library is niet geladen.");
  }

  const result = await Tesseract.recognize(file, "nld", {
    logger: () => {},
  });

  const text = result?.data?.text || "";
  if (!text.trim()) {
    throw new Error("Geen tekst gevonden op de factuur.");
  }

  const extracted = buildInvoiceFromText(text);

  if (!extracted.gevonden || (!extracted.totaal_bedrag && !extracted.netto_bedrag && !extracted.btw_bedrag)) {
    throw new Error("Ik kon geen geldige factuurinformatie uit de afbeelding halen.");
  }

  return extracted;
}

async function handleFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    const url = reader.result;
    elements.uploadEmpty.classList.add("hidden");
    elements.uploadPreview.classList.remove("hidden");
    elements.previewImage.src = url;
    elements.previewTitle.textContent = "Factuur wordt gelezen…";
    elements.previewSubtext.textContent = "";
    elements.resultSummary.classList.add("hidden");

    setStatus("loading");

    try {
      const parsed = await readInvoiceFromImage(file);
      invoice = parsed;
      setStatus("done");
      elements.resultSummary.classList.remove("hidden");
      elements.saveStateSuccess.classList.add("hidden");
      saveState = "unsaved";
      savedRecordId = null;
      updateSaveUI();
      updateCalculator();
    } catch (error) {
      const message = error instanceof Error ? error.message : "De factuur kon niet worden gelezen.";
      setStatus("error", `${message} Probeer een helderdere foto of upload een screenshot met duidelijke bedragen.`);
    }
  };

  reader.readAsDataURL(file);
}

async function handleSave() {
  if (!invoice) return;

  const netto = invoice.netto_bedrag ?? 0;
  const btw = invoice.btw_bedrag ?? 0;
  const totaal = invoice.totaal_bedrag ?? netto + btw;
  const ibReserveNow = netto * (ibPercent / 100);

  const record = {
    id: savedRecordId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    omschrijving: invoice.omschrijving || "Factuur",
    klant: invoice.klant || null,
    factuurdatum: invoice.factuurdatum || null,
    netto,
    btw,
    btwPercent: invoice.btw_percentage ?? 21,
    totaal,
    ibPercent,
    ibReserve: ibReserveNow,
    uploadedAt: savedRecordId ? history.find((r) => r.id === savedRecordId)?.uploadedAt || new Date().toISOString() : new Date().toISOString(),
  };

  const next = savedRecordId ? history.map((r) => (r.id === savedRecordId ? record : r)) : [record, ...history];

  const saved = await saveHistory(next);
  if (!saved) return;
  savedRecordId = record.id;
  saveState = "saved";
  selectedYear = guessYear(record);
  updateSaveUI();
  renderYearButtons();
  renderOverview();
}
