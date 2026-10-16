(function (global) {
  const { parseReceiptText } = global.ZzpFinance;

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("De afbeelding kon niet worden geopend."));
      image.src = source;
    });
  }

  async function createOcrImages(dataUrl, cropReceipt = true) {
    const image = await loadImage(dataUrl);
    let source = image;
    if (cropReceipt && image.naturalHeight > image.naturalWidth * 1.25) {
      const crop = document.createElement("canvas");
      const sx = Math.round(image.naturalWidth * 0.08);
      const sy = Math.round(image.naturalHeight * 0.13);
      const sw = Math.round(image.naturalWidth * 0.80);
      const sh = Math.round(image.naturalHeight * 0.67);
      crop.width = sw;
      crop.height = sh;
      const context = crop.getContext("2d");
      if (!context) throw new Error("De bon kon niet worden bijgesneden voor herkenning.");
      context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
      source = crop;
    }

    const scale = Math.min(3, Math.max(1, 1800 / Math.max(source.width, source.height)));
    const width = Math.round(source.width * scale);
    const height = Math.round(source.height * scale);
    const original = document.createElement("canvas");
    original.width = width;
    original.height = height;
    const originalContext = original.getContext("2d", { willReadFrequently: true });
    if (!originalContext) throw new Error("De afbeelding kon niet worden voorbereid voor herkenning.");
    originalContext.drawImage(source, 0, 0, width, height);

    const enhanced = document.createElement("canvas");
    enhanced.width = width;
    enhanced.height = height;
    const enhancedContext = enhanced.getContext("2d", { willReadFrequently: true });
    if (!enhancedContext) throw new Error("De afbeelding kon niet worden verbeterd voor herkenning.");
    enhancedContext.drawImage(original, 0, 0);
    const pixels = enhancedContext.getImageData(0, 0, width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
      const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.65 + 128));
      pixels.data[index] = contrast;
      pixels.data[index + 1] = contrast;
      pixels.data[index + 2] = contrast;
    }
    enhancedContext.putImageData(pixels, 0, 0);
    return [original, enhanced];
  }

  function scoreRecognition(text, confidence) {
    const receipt = parseReceiptText(text);
    let score = Math.max(0, confidence || 0) / 10;
    if (receipt.total > 0) score += 3;
    if (receipt.vat > 0) score += 5;
    if (receipt.net > 0) score += 2;
    if (receipt.itemTotal > 0) score += 8;
    if (receipt.total > 0 && receipt.vat > receipt.total) score -= 10;
    if (receipt.total > 0 && receipt.net > receipt.total) score -= 10;
    if (receipt.total > 0 && receipt.net > 0 && receipt.vat > 0) {
      score += Math.abs(receipt.total - receipt.net - receipt.vat) < 0.03 ? 2 : -4;
    }
    return { receipt, score };
  }

  class ReceiptScanner {
    constructor(onProgress = () => {}) {
      this.onProgress = onProgress;
      if (global.pdfjsLib) {
        global.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
      }
    }

    async read(file, dataUrl) {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        return this.readPdf(file);
      }
      if (!global.Tesseract) throw new Error("OCR-library is niet geladen.");
      return this.recognize(await createOcrImages(dataUrl));
    }

    async readPdf(file) {
      if (!global.pdfjsLib) throw new Error("De pdf-lezer is niet geladen.");
      const pdf = await global.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const page = await pdf.getPage(1);
      const textContent = await page.getTextContent();
      const rows = [];

      textContent.items.forEach((item) => {
        if (!item.str.trim()) return;
        const [x, y] = item.transform ? [item.transform[4], item.transform[5]] : [0, 0];
        let row = rows.find((candidate) => Math.abs(candidate.y - y) < 3);
        if (!row) {
          row = { y, items: [] };
          rows.push(row);
        }
        row.items.push({ x, text: item.str });
      });

      const embeddedText = rows
        .sort((a, b) => b.y - a.y)
        .map((row) => row.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "))
        .join("\n");
      const parsedText = parseReceiptText(embeddedText);
      if (parsedText.total && parsedText.vat) return parsedText;
      if (!global.Tesseract) throw new Error("De bon bevat geen leesbare tekst en de OCR-library is niet geladen.");

      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("De eerste pagina van de pdf kon niet worden verwerkt.");
      await page.render({ canvasContext: context, viewport }).promise;
      return this.recognize(await createOcrImages(canvas.toDataURL("image/png"), false));
    }

    async recognize(images) {
      let best = null;
      for (const language of ["nld", "eng"]) {
        for (const [index, image] of images.entries()) {
          this.onProgress(
            `Bon wordt gelezen (${language === "nld" ? "Nederlands" : "Engels"}, ${index + 1}/${images.length})`
          );
          const result = await global.Tesseract.recognize(image, language, { logger: () => {} });
          const candidate = scoreRecognition(result?.data?.text || "", result?.data?.confidence);
          if (!best || candidate.score > best.score) best = candidate;
          if (
            candidate.receipt.itemTotal > 0 &&
            candidate.receipt.total > 0 &&
            Math.abs(candidate.receipt.total - candidate.receipt.itemTotal) <= 0.5 &&
            result?.data?.confidence >= 60
          ) {
            return candidate.receipt;
          }
        }
      }
      return best?.receipt || { total: 0, net: 0, vat: 0, vatRate: null };
    }
  }

  global.ReceiptScanner = ReceiptScanner;
})(window);
