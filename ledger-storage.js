(function (global) {
  class LedgerStorage {
    constructor(storage = global.localStorage) {
      this.storage = storage;
      this.invoiceKey = "zzp_invoice_overview_v1";
      this.expenseKey = "zzp_expense_overview_v1";
    }

    readList(key) {
      const raw = this.storage.getItem(key);
      const records = raw ? JSON.parse(raw) : [];
      return Array.isArray(records) ? records : [];
    }

    loadInvoices() {
      return this.readList(this.invoiceKey);
    }

    loadExpenses() {
      return this.readList(this.expenseKey).filter((record) =>
        record &&
        typeof record.id === "string" &&
        Number.isFinite(record.year) &&
        Number.isFinite(record.expenseTotal) &&
        Number.isFinite(record.expenseVat)
      );
    }

    saveInvoices(records) {
      this.storage.setItem(this.invoiceKey, JSON.stringify(records));
    }

    saveExpenses(records) {
      this.storage.setItem(this.expenseKey, JSON.stringify(records));
    }
  }

  global.LedgerStorage = LedgerStorage;
})(window);
