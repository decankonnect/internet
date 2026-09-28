export class HistoryManager {
  constructor(storageKey = "decan-speed-history") {
    this.storageKey = storageKey;
    this.items = this.load();
  }

  load() {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  save() {
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.items.slice(0, 6)));
    } catch (error) {
      console.warn("Unable to save speed test history:", error);
    }
  }

  add(entry) {
    const safeEntry = {
      timestamp: new Date().toISOString(),
      download: Number(entry.download ?? 0),
      upload: Number(entry.upload ?? 0),
      ping: Number(entry.ping ?? 0),
      jitter: Number(entry.jitter ?? 0),
    };

    this.items = [safeEntry, ...this.items].slice(0, 6);
    this.save();
  }

  clear() {
    this.items = [];
    this.save();
  }

  get() {
    return this.items;
  }
}
