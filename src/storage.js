// localStorage wrapper that never throws (sandboxed iframes / private mode) with an in-memory fallback.
const mem = new Map();

function ls() {
  try {
    const s = window.localStorage;
    const k = '__bc_test__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}
const store = typeof window !== 'undefined' ? ls() : null;

export const storage = {
  getJSON(key) {
    try {
      const raw = store ? store.getItem(key) : mem.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setJSON(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (store) store.setItem(key, raw);
      else mem.set(key, raw);
    } catch {
      mem.set(key, raw);
    }
  },
  remove(key) {
    try { if (store) store.removeItem(key); } catch { /* ignore */ }
    mem.delete(key);
  },
};
