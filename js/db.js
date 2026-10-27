// IndexedDB: Bikes, Setups (ein Eintrag pro Bike und Tag) und Einstellungen.

const DB_NAME = 'fahrwerk';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('bikes')) db.createObjectStore('bikes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('setups')) {
        const s = db.createObjectStore('setups', { keyPath: ['bikeId', 'datum'] });
        s.createIndex('bikeId', 'bikeId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function getAll(store) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const getBikes = () => getAll('bikes');
export const getSetups = () => getAll('setups');

export async function putBike(bike) {
  const db = await open();
  const tx = db.transaction('bikes', 'readwrite');
  tx.objectStore('bikes').put(bike);
  return done(tx);
}

export async function putSetup(setup) {
  const db = await open();
  const tx = db.transaction('setups', 'readwrite');
  tx.objectStore('setups').put(setup);
  return done(tx);
}

/** Löscht genau einen Tageseintrag eines Bikes. */
export async function deleteSetup(bikeId, datum) {
  const db = await open();
  const tx = db.transaction('setups', 'readwrite');
  tx.objectStore('setups').delete([bikeId, datum]);
  return done(tx);
}

/** Löscht ein Bike samt aller Setups. */
export async function deleteBike(bikeId) {
  const db = await open();
  const tx = db.transaction(['bikes', 'setups'], 'readwrite');
  tx.objectStore('bikes').delete(bikeId);
  const idx = tx.objectStore('setups').index('bikeId');
  idx.openKeyCursor(IDBKeyRange.only(bikeId)).onsuccess = (e) => {
    const cur = e.target.result;
    if (cur) {
      tx.objectStore('setups').delete(cur.primaryKey);
      cur.continue();
    }
  };
  return done(tx);
}

/** Ersetzt alle Daten in einer Transaktion (für die Wiederherstellung aus Excel). */
export async function replaceAll(bikes, setups) {
  const db = await open();
  const tx = db.transaction(['bikes', 'setups'], 'readwrite');
  const b = tx.objectStore('bikes');
  const s = tx.objectStore('setups');
  b.clear();
  s.clear();
  bikes.forEach((x) => b.put(x));
  setups.forEach((x) => s.put(x));
  return done(tx);
}

export async function getMeta(key) {
  const db = await open();
  return new Promise((resolve) => {
    const req = db.transaction('meta').objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror = () => resolve(undefined);
  });
}

export async function setMeta(key, value) {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  return done(tx);
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch (_) {
    /* nicht kritisch */
  }
}
