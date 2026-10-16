(function (global) {
  const formatCurrency = (amount) =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
      Number.isFinite(amount) ? amount : 0
    );

  function guessYear(record) {
    const value = record.factuurdatum;
    if (value) {
      const dayFirst = value.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
      if (dayFirst) return Number(dayFirst[3]);
      const yearFirst = value.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
      if (yearFirst) return Number(yearFirst[1]);
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getFullYear()) && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2100) {
        return parsed.getFullYear();
      }
    }
    return new Date(record.uploadedAt).getFullYear();
  }

  function parseNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;

    const text = String(value)
      .replace(/€/g, "")
      .replace(/\s+/g, "")
      .replace(/[^0-9.,\-]/g, "");
    const normalized = text.includes(",")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/\.(?=\d{3}(?:\.|$))/g, "");
    const number = Number.parseFloat(normalized);
    return Number.isFinite(number) ? number : 0;
  }

  function extractAmounts(text) {
    const matches = [...text.matchAll(/\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g)];
    return matches.map((match) => parseNumber(match[0])).filter((amount) => amount > 0).sort((a, b) => b - a);
  }

  function findVatPercent(text) {
    const vatMatch = text.match(/(?:btw|vat|belasting|tax)\s*[:\-]?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%?/i);
    if (vatMatch) return Number.parseFloat(vatMatch[1].replace(",", "."));
    const list = [...text.matchAll(/\b(6|9|21)\s*%\b/g)];
    return list.length ? Number(list[0][1]) : 21;
  }

  function buildInvoiceFromText(text) {
    const normalizedText = text.replace(/\r/g, " ").replace(/\s+/g, " ");
    const lines = text.split(/\n|\r/).map((line) => line.trim()).filter(Boolean);
    const amounts = extractAmounts(text);
    const vatPercent = findVatPercent(text);
    let total = amounts[0] || 0;
    let net = 0;
    let vat = 0;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (["totaal", "total", "amount due"].some((word) => lower.includes(word))) {
        const values = extractAmounts(line);
        if (values.length) total = Math.max(total, values[0]);
      }
      if (["netto", "subtotaal", "subtotal", "excl", "amount excl", "bedrag excl"].some((word) => lower.includes(word))) {
        const values = extractAmounts(line);
        if (values.length) net = Math.max(net, values[0]);
      }
      if (["btw", "vat", "belasting", "tax"].some((word) => lower.includes(word))) {
        const values = extractAmounts(line);
        if (values.length) vat = Math.max(vat, values[0]);
      }
    }

    if (!net && total && vatPercent) net = total / (1 + vatPercent / 100);
    if (!vat && total && net) vat = total - net;
    if (!total && net && vat) total = net + vat;
    if (!total && amounts.length > 1) {
      total = amounts[0];
      net = amounts[1] || total / (1 + vatPercent / 100);
      vat = total - net;
    }

    return {
      gevonden: true,
      omschrijving: "Factuur",
      klant: null,
      netto_bedrag: Number(net.toFixed(2)),
      btw_percentage: vatPercent,
      btw_bedrag: Number(vat.toFixed(2)),
      totaal_bedrag: Number(total.toFixed(2)),
      factuurdatum: null,
      rawText: normalizedText,
    };
  }

  function extractReceiptMoney(line) {
    const withoutRates = line.replace(/\d+(?:[.,]\d+)?\s*%/g, " ");
    const matches = withoutRates.match(/-?\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{1,2})|-?\d+[,.]\d{1,2}|€\s*-?\d+(?:[.,]\d{1,2})?/g) || [];
    return matches.map(parseNumber).filter((amount) => amount >= 0);
  }

  function extractPriceAfterFor(line) {
    const match = line.match(/\bvoor\b[^0-9]{0,8}(\d{1,4})(?:[.,](\d{1,2}))?/i);
    if (!match) return null;
    const cents = (match[2] || "").padEnd(2, "0");
    const amount = Number(`${match[1]}.${cents}`);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  function parseReceiptText(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let gross = 0;
    let net = 0;
    let vat = 0;
    const grossCandidates = [];
    const netCandidates = [];
    const vatCandidates = [];
    const vatRates = [];
    const allAmounts = [];
    const itemAmounts = [];

    lines.forEach((line) => {
      const lower = line.toLowerCase();
      const hasVatLabel = /\b(btw|vat|tax|belasting)\b/i.test(lower);
      if (hasVatLabel) {
        const rate = lower.match(/(?:btw|vat|tax|belasting)[^\d%]{0,12}(\d{1,2}(?:[.,]\d+)?)\s*%|(\d{1,2}(?:[.,]\d+)?)\s*%/i);
        const rateValue = rate ? Number((rate[1] || rate[2]).replace(",", ".")) : null;
        if (rateValue !== null && rateValue >= 0 && rateValue <= 100) vatRates.push(rateValue);
      }
      const amounts = extractReceiptMoney(line);
      allAmounts.push(...amounts);
      if (!amounts.length) return;

      if (/\bvoor\b/i.test(lower)) {
        const discountedPrice = extractPriceAfterFor(line);
        if (discountedPrice) itemAmounts.push(discountedPrice);
        else if (amounts.length > 1) itemAmounts.push(amounts[amounts.length - 1]);
      } else if (/\b(korting|discount)\b/i.test(lower)) {
        itemAmounts.push(amounts[amounts.length - 1]);
      }

      if (/\b(subtotaal|subtotal|netto|excl\.?|exclusief)\b/i.test(lower)) {
        netCandidates.push(amounts[amounts.length - 1]);
        return;
      }

      const hasGrossLabel = /\b(totaal|total|te betalen|to pay|amount due|incl\.?|inclusief|grand total)\b/i.test(lower);
      if (hasGrossLabel && (!hasVatLabel || /\b(incl\.?|inclusief)\b/i.test(lower))) {
        grossCandidates.push(amounts[amounts.length - 1]);
        return;
      }
      if (hasVatLabel) vatCandidates.push(amounts[amounts.length - 1]);
    });

    if (grossCandidates.length) gross = grossCandidates[grossCandidates.length - 1];
    if (netCandidates.length) net = netCandidates[netCandidates.length - 1];
    if (vatCandidates.length) vat = vatCandidates.reduce((sum, amount) => sum + amount, 0);
    const itemTotal = itemAmounts.length >= 2
      ? Number(itemAmounts.reduce((sum, amount) => sum + amount, 0).toFixed(2))
      : 0;
    const uniqueRates = [...new Set(vatRates)];
    let vatRate = uniqueRates.length === 1 ? uniqueRates[0] : null;

    if (itemTotal && gross && Math.abs(gross - itemTotal) > 0.5) gross = itemTotal;
    else if (!gross && itemTotal) gross = itemTotal;

    if (!gross && net && vat) gross = net + vat;
    if (!net && gross && vat) net = gross - vat;
    if (!vat && gross && vatRate !== null) {
      vat = gross * vatRate / (100 + vatRate);
      net = gross - vat;
    } else if (!vat && net && vatRate !== null) {
      vat = net * vatRate / 100;
      gross = net + vat;
    }

    if (!gross && !net && !vat && allAmounts.length) gross = Math.max(...allAmounts);
    let vatEstimated = false;
    if (!vat && gross && vatRate !== null) {
      vat = gross * vatRate / (100 + vatRate);
      net = gross - vat;
      vatEstimated = true;
    } else if (!vat && gross && vatRate === null) {
      vatRate = 21;
      vat = gross * vatRate / (100 + vatRate);
      net = gross - vat;
      vatEstimated = true;
    }
    if (!gross && net && vat) gross = net + vat;
    if (!net && gross && vat) net = gross - vat;

    return {
      total: Number(gross.toFixed(2)),
      net: Number(net.toFixed(2)),
      vat: Number(vat.toFixed(2)),
      vatRate: vatRate ?? (net > 0 && vat > 0 ? Number((vat / net * 100).toFixed(2)) : null),
      itemTotal,
      vatEstimated,
    };
  }

  class InvoiceCalculator {
    static calculate(invoice, taxPercent) {
      const net = invoice?.netto_bedrag ?? 0;
      const vat = invoice?.btw_bedrag ?? 0;
      const total = invoice?.totaal_bedrag ?? net + vat;
      const incomeTax = net * (taxPercent / 100);
      return { net, vat, total, incomeTax, reserve: vat + incomeTax, spendable: total - vat - incomeTax };
    }
  }

  global.ZzpFinance = Object.freeze({
    formatCurrency,
    guessYear,
    parseNumber,
    extractAmounts,
    findVatPercent,
    buildInvoiceFromText,
    extractReceiptMoney,
    parseReceiptText,
    InvoiceCalculator,
  });
})(window);
