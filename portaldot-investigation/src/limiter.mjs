export class BoundedRateLimiter {
  constructor({ limit = 5, windowMs = 60_000, maxKeys = 10_000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.entries = new Map();
  }

  consume(key, now = Date.now()) {
    const safeKey = String(key || "unknown").slice(0, 128);
    if (this.entries.size >= this.maxKeys && !this.entries.has(safeKey)) this.prune(now, true);
    const timestamps = (this.entries.get(safeKey) ?? []).filter((value) => now - value < this.windowMs);
    if (timestamps.length >= this.limit) {
      this.entries.set(safeKey, timestamps);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((this.windowMs - (now - timestamps[0])) / 1_000)) };
    }
    timestamps.push(now);
    this.entries.set(safeKey, timestamps);
    if (this.entries.size % 100 === 0) this.prune(now, false);
    return { allowed: true, remaining: this.limit - timestamps.length };
  }

  prune(now = Date.now(), force = false) {
    for (const [key, timestamps] of this.entries) {
      const fresh = timestamps.filter((value) => now - value < this.windowMs);
      if (fresh.length) this.entries.set(key, fresh); else this.entries.delete(key);
    }
    if (force && this.entries.size >= this.maxKeys) {
      const overflow = this.entries.size - this.maxKeys + 1;
      for (const key of [...this.entries.keys()].slice(0, overflow)) this.entries.delete(key);
    }
  }
}
