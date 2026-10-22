'use strict';

/**
 * DB — a thin promise-based wrapper around IndexedDB.
 *
 * Stores created here (all stages):
 *   foods    — your food database (name, kcal, protein, carbs, fat, fibre, label)
 *   log      — daily food log entries  (date, meal, foodId, grams, …)
 *   meals    — saved meal templates    (name, items[])
 *   waist    — waist measurements      (date, cm)
 *   days     — per-day toggles         (date string as key)
 *   settings — app settings            (key → value pairs)
 */
const DB = (() => {
  const DB_NAME    = 'CalorieTracker';
  const DB_VERSION = 1;
  let _db = null;

  // ── Open (or reuse) the database ─────────────────────
  function open() {
    if (_db) return Promise.resolve(_db);

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const d = e.target.result;

        if (!d.objectStoreNames.contains('foods')) {
          const s = d.createObjectStore('foods', { keyPath: 'id', autoIncrement: true });
          s.createIndex('name', 'name', { unique: false });
        }
        if (!d.objectStoreNames.contains('log')) {
          const s = d.createObjectStore('log', { keyPath: 'id', autoIncrement: true });
          s.createIndex('date', 'date', { unique: false });
        }
        if (!d.objectStoreNames.contains('meals')) {
          d.createObjectStore('meals', { keyPath: 'id', autoIncrement: true });
        }
        if (!d.objectStoreNames.contains('waist')) {
          const s = d.createObjectStore('waist', { keyPath: 'id', autoIncrement: true });
          s.createIndex('date', 'date', { unique: false });
        }
        if (!d.objectStoreNames.contains('days')) {
          // key is the date string "YYYY-MM-DD"
          d.createObjectStore('days', { keyPath: 'date' });
        }
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  // ── Internal: get an object store in a transaction ────
  function store(name, mode = 'readonly') {
    return open().then(d => d.transaction(name, mode).objectStore(name));
  }

  // ── Wrap an IDB request in a Promise ─────────────────
  function req(idbReq) {
    return new Promise((resolve, reject) => {
      idbReq.onsuccess = () => resolve(idbReq.result);
      idbReq.onerror   = () => reject(idbReq.error);
    });
  }

  // ── Public API ────────────────────────────────────────

  /** Return all records in a store, sorted by insertion order. */
  function getAll(storeName) {
    return store(storeName).then(s => req(s.getAll()));
  }

  /** Return all records whose index `indexName` equals `value`. */
  function getAllByIndex(storeName, indexName, value) {
    return store(storeName).then(s => req(s.index(indexName).getAll(value)));
  }

  /** Return one record by primary key. */
  function get(storeName, key) {
    return store(storeName).then(s => req(s.get(key)));
  }

  /**
   * Save a record. If it has a primary key (`id` or `key`) that already
   * exists the record is updated; otherwise a new one is added.
   * Returns the new key.
   */
  function put(storeName, item) {
    return store(storeName, 'readwrite').then(s => req(s.put(item)));
  }

  /** Delete a record by primary key. */
  function del(storeName, key) {
    return store(storeName, 'readwrite').then(s => req(s.delete(key)));
  }

  /** Delete ALL records in a store (used for full import). */
  function clear(storeName) {
    return store(storeName, 'readwrite').then(s => req(s.clear()));
  }

  return { open, getAll, getAllByIndex, get, put, del, clear };
})();
