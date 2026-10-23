// Felder und Tageslogik – reine Funktionen, ohne DOM und ohne Speicher.

export const FIELDS = [
  { key: 'gabel_luftdruck', group: 'gabel', label: 'Luftdruck', unit: 'psi', step: 1, excel: 'Gabel Luftdruck (psi)' },
  { key: 'gabel_tokens', group: 'gabel', label: 'Tokens', unit: '', step: 1, excel: 'Gabel Tokens' },
  { key: 'gabel_hsc', group: 'gabel', label: 'HSC', unit: 'Klicks', step: 1, excel: 'Gabel HSC' },
  { key: 'gabel_lsc', group: 'gabel', label: 'LSC', unit: 'Klicks', step: 1, excel: 'Gabel LSC' },
  { key: 'gabel_hsr', group: 'gabel', label: 'HSR', unit: 'Klicks', step: 1, excel: 'Gabel HSR' },
  { key: 'gabel_lsr', group: 'gabel', label: 'LSR', unit: 'Klicks', step: 1, excel: 'Gabel LSR' },
  { key: 'daempfer_federrate', group: 'daempfer', label: 'Federrate', unit: 'lbs', step: 25, excel: 'Dämpfer Federrate (lbs)' },
  { key: 'daempfer_hsc', group: 'daempfer', label: 'HSC', unit: 'Klicks', step: 1, excel: 'Dämpfer HSC' },
  { key: 'daempfer_lsc', group: 'daempfer', label: 'LSC', unit: 'Klicks', step: 1, excel: 'Dämpfer LSC' },
  { key: 'daempfer_hsr', group: 'daempfer', label: 'HSR', unit: 'Klicks', step: 1, excel: 'Dämpfer HSR' },
  { key: 'daempfer_lsr', group: 'daempfer', label: 'LSR', unit: 'Klicks', step: 1, excel: 'Dämpfer LSR' },
];

export const FIELD_KEYS = FIELDS.map((f) => f.key);

/** Lokales Datum als JJJJ-MM-TT (nicht UTC). */
export function todayLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** JJJJ-MM-TT → TT.MM.JJJJ */
export function formatDateDE(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function emptyValues() {
  return Object.fromEntries(FIELD_KEYS.map((k) => [k, 0]));
}

/** Alle Setups eines Bikes, neuestes zuerst. */
export function setupsForBike(setups, bikeId) {
  return setups
    .filter((s) => s.bikeId === bikeId)
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
}

/** Neuestes Setup eines Bikes oder null. */
export function latestSetup(setups, bikeId) {
  return setupsForBike(setups, bikeId)[0] ?? null;
}

/** Neuestes Setup vor einem bestimmten Datum (für die Markierung geänderter Werte). */
export function previousSetup(setups, bikeId, beforeDate) {
  return setupsForBike(setups, bikeId).find((s) => s.datum < beforeDate) ?? null;
}

/**
 * Wendet einen +/−-Schritt an.
 * - Gibt es heute schon einen Eintrag für das Bike, wird er aktualisiert.
 * - Sonst entsteht ein neuer Tageseintrag mit den Werten des letzten Eintrags.
 * Werte fallen nie unter 0.
 * Gibt den neuen/aktualisierten Eintrag zurück (Kopie, Eingabe bleibt unverändert).
 */
export function applyChange(setups, bikeId, key, direction, today = todayLocal()) {
  const field = FIELDS.find((f) => f.key === key);
  if (!field) throw new Error(`Unbekanntes Feld: ${key}`);
  const base = latestSetup(setups, bikeId);
  const record =
    base && base.datum === today
      ? { ...base }
      : { ...emptyValues(), ...(base ? pickValues(base) : {}), bikeId, datum: today };
  record[key] = Math.max(0, (record[key] ?? 0) + direction * field.step);
  return record;
}

export function pickValues(s) {
  return Object.fromEntries(FIELD_KEYS.map((k) => [k, Number(s[k]) || 0]));
}

/** Fügt einen Eintrag in die Liste ein bzw. ersetzt den gleichen Tag. Gibt neue Liste zurück. */
export function upsert(setups, record) {
  const rest = setups.filter((s) => !(s.bikeId === record.bikeId && s.datum === record.datum));
  return [...rest, record];
}

/**
 * Ändert einen Wert eines bestimmten Tageseintrags (auch eines älteren Tages),
 * ohne einen neuen Eintrag anzulegen. Werte fallen nie unter 0.
 */
export function changeEntry(record, key, direction) {
  const field = FIELDS.find((f) => f.key === key);
  if (!field) throw new Error(`Unbekanntes Feld: ${key}`);
  return { ...record, [key]: Math.max(0, (record[key] ?? 0) + direction * field.step) };
}

/** Schlüssel der Werte, die sich gegenüber dem Vergleichs-Setup unterscheiden. */
export function changedKeys(setup, prev) {
  if (!prev) return [];
  return FIELD_KEYS.filter((k) => (setup[k] ?? 0) !== (prev[k] ?? 0));
}

/** JJJJ-MM-TT → „Fr, 23.10.2026“ */
export function formatDateLongDE(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(y, m - 1, d).getDay()];
  return `${wd}, ${formatDateDE(iso)}`;
}
