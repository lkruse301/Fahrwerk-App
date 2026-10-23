// Excel-Export und -Import. Nutzt die lokal eingebundene SheetJS-Bibliothek (globales XLSX).

import { FIELDS, FIELD_KEYS, todayLocal } from './setup.js';

const SETUP_HEADERS = ['Datum', 'Bike', ...FIELDS.map((f) => f.excel)];
const BIKE_HEADERS = ['ID', 'Name'];

export function backupFileName(d = new Date()) {
  return `Fahrwerk-Backup_${todayLocal(d)}.xlsx`;
}

/** Erzeugt die Excel-Datei als Blob. */
export function buildWorkbook(bikes, setups) {
  const XLSX = window.XLSX;
  const nameById = Object.fromEntries(bikes.map((b) => [b.id, b.name]));
  const order = Object.fromEntries(bikes.map((b, i) => [b.id, i]));
  const rows = [...setups]
    .filter((s) => nameById[s.bikeId] !== undefined)
    .sort((a, b) => order[a.bikeId] - order[b.bikeId] || (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0))
    .map((s) => [s.datum, nameById[s.bikeId], ...FIELD_KEYS.map((k) => s[k] ?? 0)]);

  const wsSetups = XLSX.utils.aoa_to_sheet([SETUP_HEADERS, ...rows]);
  wsSetups['!cols'] = SETUP_HEADERS.map((h, i) => ({ wch: i === 0 ? 12 : Math.max(10, h.length + 2) }));
  const wsBikes = XLSX.utils.aoa_to_sheet([BIKE_HEADERS, ...bikes.map((b) => [b.id, b.name])]);
  wsBikes['!cols'] = [{ wch: 38 }, { wch: 24 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSetups, 'Setups');
  XLSX.utils.book_append_sheet(wb, wsBikes, 'Bikes');
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function normDate(v) {
  if (v instanceof Date && !isNaN(v)) return todayLocal(v);
  if (typeof v === 'number') {
    const p = window.XLSX.SSF.parse_date_code(v);
    if (p) return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/**
 * Liest eine Backup-Datei. Gibt { bikes, setups } zurück oder wirft einen Fehler
 * mit verständlicher Meldung. Es wird dabei nichts gespeichert.
 */
export function parseWorkbook(arrayBuffer) {
  const XLSX = window.XLSX;
  let wb;
  try {
    wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  } catch (_) {
    throw new Error('Die Datei konnte nicht als Excel-Datei gelesen werden.');
  }
  const wsS = wb.Sheets['Setups'];
  const wsB = wb.Sheets['Bikes'];
  if (!wsS || !wsB) throw new Error('Die Datei enthält nicht die Blätter „Setups“ und „Bikes“.');

  const aoaB = XLSX.utils.sheet_to_json(wsB, { header: 1, blankrows: false });
  const aoaS = XLSX.utils.sheet_to_json(wsS, { header: 1, blankrows: false });
  const hB = (aoaB[0] || []).map((h) => String(h).trim());
  const hS = (aoaS[0] || []).map((h) => String(h).trim());

  const missB = BIKE_HEADERS.filter((h) => !hB.includes(h));
  const missS = SETUP_HEADERS.filter((h) => !hS.includes(h));
  if (missB.length || missS.length) {
    throw new Error(`Folgende Spalten fehlen: ${[...missB, ...missS].join(', ')}`);
  }

  const bikes = [];
  const idByName = {};
  aoaB.slice(1).forEach((row, i) => {
    const id = String(row[hB.indexOf('ID')] ?? '').trim();
    const name = String(row[hB.indexOf('Name')] ?? '').trim();
    if (!id && !name) return;
    if (!id || !name) throw new Error(`Blatt „Bikes“, Zeile ${i + 2}: ID oder Name fehlt.`);
    if (idByName[name]) throw new Error(`Das Bike „${name}“ kommt doppelt vor.`);
    idByName[name] = id;
    bikes.push({ id, name });
  });

  const seen = new Set();
  const setups = [];
  aoaS.slice(1).forEach((row, i) => {
    const line = i + 2;
    if (row.every((c) => c === undefined || c === '')) return;
    const datum = normDate(row[hS.indexOf('Datum')]);
    if (!datum) throw new Error(`Blatt „Setups“, Zeile ${line}: ungültiges Datum.`);
    const bikeName = String(row[hS.indexOf('Bike')] ?? '').trim();
    const bikeId = idByName[bikeName];
    if (!bikeId) throw new Error(`Blatt „Setups“, Zeile ${line}: Bike „${bikeName}“ ist nicht im Blatt „Bikes“.`);
    const key = `${bikeId}|${datum}`;
    if (seen.has(key)) throw new Error(`Blatt „Setups“, Zeile ${line}: „${bikeName}“ hat am ${datum} zwei Einträge.`);
    seen.add(key);
    const rec = { bikeId, datum };
    FIELDS.forEach((f) => {
      const raw = row[hS.indexOf(f.excel)];
      const n = raw === undefined || raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(n) || n < 0) throw new Error(`Blatt „Setups“, Zeile ${line}: ungültiger Wert bei „${f.excel}“.`);
      rec[f.key] = n;
    });
    setups.push(rec);
  });

  return { bikes, setups };
}
