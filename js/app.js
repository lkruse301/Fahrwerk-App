import * as db from './db.js';
import {
  FIELDS, todayLocal, formatDateDE, emptyValues, latestSetup, previousSetup, applyChange, upsert,
} from './setup.js';
import { buildWorkbook, parseWorkbook, backupFileName } from './excel.js';

const NEW_BIKE = '__new__';
const $ = (id) => document.getElementById(id);

const state = { bikes: [], setups: [], bikeId: null };
let writeQueue = Promise.resolve();

/* ---------- Hilfen ---------- */

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/** Einfacher Dialog. Gibt den gedrückten Button-Wert bzw. den eingegebenen Text zurück. */
function dialog({ title, message = '', input = null, okText = 'OK', danger = false, extra = [], hideOk = false }) {
  const dlg = $('dlg');
  $('dlgTitle').textContent = title;
  $('dlgMsg').textContent = message;
  const inp = $('dlgInput');
  inp.hidden = input === null;
  inp.value = input ?? '';
  const ok = $('dlgOk');
  ok.textContent = okText;
  ok.className = danger ? 'danger' : 'primary';
  ok.hidden = hideOk;
  const ex = $('dlgExtra');
  ex.innerHTML = '';
  extra.forEach((b) => {
    const btn = document.createElement('button');
    btn.value = b.value;
    btn.textContent = b.text;
    btn.className = b.danger ? 'danger' : 'secondary';
    ex.appendChild(btn);
  });
  $('dlgCancel').parentElement.style.gridTemplateColumns = hideOk ? '1fr' : '1fr 1fr';
  dlg.returnValue = '';
  return new Promise((resolve) => {
    dlg.addEventListener(
      'close',
      () => {
        const v = dlg.returnValue;
        if (input !== null) resolve(v === 'ok' ? inp.value.trim() : null);
        else resolve(v || 'cancel');
      },
      { once: true }
    );
    dlg.showModal();
    if (input !== null) setTimeout(() => inp.focus(), 50);
  });
}

function nameTaken(name, exceptId = null) {
  return state.bikes.some((b) => b.id !== exceptId && b.name.toLowerCase() === name.toLowerCase());
}

/* ---------- Oberfläche aufbauen ---------- */

const rowEls = {};

function buildRows() {
  FIELDS.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.key = f.key;
    row.innerHTML = `
      <button class="step" data-dir="-1" aria-label="${f.label} verringern">−</button>
      <div class="readout">
        <span class="label">${f.label}</span>
        <span><span class="value">0</span>${f.unit ? `<span class="unit">${f.unit}</span>` : ''}</span>
      </div>
      <button class="step" data-dir="1" aria-label="${f.label} erhöhen">+</button>`;
    document.querySelector(`.rows[data-group="${f.group}"]`).appendChild(row);
    rowEls[f.key] = {
      row,
      value: row.querySelector('.value'),
      minus: row.querySelector('[data-dir="-1"]'),
    };
    row.querySelectorAll('.step').forEach((btn) => attachRepeat(btn, f.key, Number(btn.dataset.dir)));
  });
}

/** Tippen = ein Schritt, gedrückt halten = fortlaufend (wird schneller). */
function attachRepeat(btn, key, dir) {
  let delay = null;
  let timer = null;
  let count = 0;

  const stop = () => {
    clearTimeout(delay);
    clearTimeout(timer);
    delay = timer = null;
    btn.classList.remove('pressed');
  };
  const tick = () => {
    if (!step(key, dir)) return stop();
    count += 1;
    timer = setTimeout(tick, count > 30 ? 20 : count > 12 ? 40 : 90);
  };

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || btn.disabled) return;
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    btn.classList.add('pressed');
    count = 0;
    step(key, dir);
    delay = setTimeout(tick, 420);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => btn.addEventListener(ev, stop));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  // Tastatur (Enter/Leertaste) löst nur "click" ohne Zeiger aus
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) step(key, dir);
  });
}

/** Führt einen Schritt aus. Gibt false zurück, wenn nichts mehr geht (z. B. Wert schon 0). */
function step(key, dir) {
  if (!state.bikeId) return false;
  const current = latestSetup(state.setups, state.bikeId);
  if (dir < 0 && (current ? current[key] : 0) <= 0) return false;
  const rec = applyChange(state.setups, state.bikeId, key, dir, todayLocal());
  state.setups = upsert(state.setups, rec);
  writeQueue = writeQueue
    .then(() => db.putSetup(rec))
    .catch(() => toast('Speichern fehlgeschlagen'));
  render();
  const v = rowEls[key].value;
  v.classList.remove('bump');
  void v.offsetWidth;
  v.classList.add('bump');
  return true;
}

function renderBikeSelect() {
  const sel = $('bikeSelect');
  sel.innerHTML = '';
  state.bikes.forEach((b) => sel.add(new Option(b.name, b.id)));
  sel.add(new Option('＋ Neues Bike …', NEW_BIKE));
  if (state.bikeId) sel.value = state.bikeId;
  else sel.value = '';
}

function render() {
  const hasBike = !!state.bikeId;
  $('empty').hidden = hasBike;
  $('setup').hidden = !hasBike;
  $('bikeMenu').disabled = !hasBike;
  $('bikeSelect').parentElement.style.visibility = state.bikes.length ? 'visible' : 'hidden';

  if (!hasBike) {
    $('setupDate').textContent = 'Kein Bike';
    $('todayChip').hidden = true;
    return;
  }

  const today = todayLocal();
  const cur = latestSetup(state.setups, state.bikeId);
  const values = cur ?? { ...emptyValues() };
  const isToday = cur && cur.datum === today;
  const prev = isToday ? previousSetup(state.setups, state.bikeId, today) : null;

  $('setupDate').textContent = cur ? `Setup vom ${formatDateDE(cur.datum)}` : 'Noch kein Setup gespeichert';
  $('todayChip').hidden = !isToday;

  FIELDS.forEach((f) => {
    const el = rowEls[f.key];
    const v = values[f.key] ?? 0;
    el.value.textContent = v;
    el.minus.disabled = v <= 0;
    el.row.classList.toggle('changed', !!prev && prev[f.key] !== v);
  });
}

async function selectBike(id) {
  state.bikeId = id;
  renderBikeSelect();
  render();
  await db.setMeta('lastBikeId', id);
}

/* ---------- Bikes verwalten ---------- */

async function createBike() {
  const name = await dialog({ title: 'Neues Bike', message: 'Name des Bikes', input: '', okText: 'Anlegen' });
  if (!name) return false;
  if (nameTaken(name)) {
    toast(`„${name}“ gibt es schon`);
    return false;
  }
  const bike = { id: uuid(), name };
  await db.putBike(bike);
  state.bikes.push(bike);
  await selectBike(bike.id);
  toast(`„${name}“ angelegt`);
  return true;
}

async function bikeMenu() {
  const bike = state.bikes.find((b) => b.id === state.bikeId);
  if (!bike) return;
  const choice = await dialog({
    title: bike.name,
    hideOk: true,
    extra: [
      { value: 'rename', text: 'Umbenennen' },
      { value: 'delete', text: 'Bike löschen', danger: true },
    ],
  });
  if (choice === 'rename') {
    const name = await dialog({ title: 'Bike umbenennen', input: bike.name, okText: 'Speichern' });
    if (!name || name === bike.name) return;
    if (nameTaken(name, bike.id)) return toast(`„${name}“ gibt es schon`);
    bike.name = name;
    await db.putBike(bike);
    renderBikeSelect();
    toast('Umbenannt');
  } else if (choice === 'delete') {
    const n = state.setups.filter((s) => s.bikeId === bike.id).length;
    const ok = await dialog({
      title: `„${bike.name}“ löschen?`,
      message: `Das Bike und alle ${n} gespeicherten Tages-Setups werden gelöscht. Das lässt sich nur über ein Excel-Backup rückgängig machen.`,
      okText: 'Löschen',
      danger: true,
    });
    if (ok !== 'ok') return;
    await db.deleteBike(bike.id);
    state.bikes = state.bikes.filter((b) => b.id !== bike.id);
    state.setups = state.setups.filter((s) => s.bikeId !== bike.id);
    await selectBike(state.bikes[0]?.id ?? null);
    toast('Bike gelöscht');
  }
}

/* ---------- Excel ---------- */

async function exportBackup() {
  if (!window.XLSX) return toast('Excel-Modul noch nicht geladen');
  if (!state.bikes.length) return toast('Noch nichts zu sichern');
  const blob = buildWorkbook(state.bikes, state.setups);
  const name = backupFileName();
  const file = new File([blob], name, { type: blob.type });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      toast('Backup erstellt');
    } catch (e) {
      if (e.name !== 'AbortError') download(blob, name);
    }
  } else {
    download(blob, name);
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Backup heruntergeladen');
}

async function importBackup(file) {
  if (!window.XLSX) return toast('Excel-Modul noch nicht geladen');
  let data;
  try {
    data = parseWorkbook(await file.arrayBuffer());
  } catch (e) {
    await dialog({ title: 'Wiederherstellen nicht möglich', message: e.message, hideOk: true });
    return;
  }
  const ok = await dialog({
    title: 'Backup wiederherstellen?',
    message: `Alle aktuellen Daten werden durch das Backup ersetzt: ${data.bikes.length} Bike(s), ${data.setups.length} Tages-Setup(s).`,
    okText: 'Ersetzen',
    danger: true,
  });
  if (ok !== 'ok') return;
  await writeQueue;
  await db.replaceAll(data.bikes, data.setups);
  state.bikes = data.bikes;
  state.setups = data.setups;
  const keep = state.bikes.some((b) => b.id === state.bikeId) ? state.bikeId : state.bikes[0]?.id ?? null;
  await selectBike(keep);
  toast('Backup wiederhergestellt');
}

/* ---------- Start ---------- */

async function init() {
  buildRows();
  db.requestPersistence();
  [state.bikes, state.setups] = await Promise.all([db.getBikes(), db.getSetups()]);
  state.bikes.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const last = await db.getMeta('lastBikeId');
  state.bikeId = state.bikes.some((b) => b.id === last) ? last : state.bikes[0]?.id ?? null;
  renderBikeSelect();
  render();

  $('bikeSelect').addEventListener('change', async (e) => {
    if (e.target.value === NEW_BIKE) {
      const created = await createBike();
      if (!created) renderBikeSelect();
    } else {
      await selectBike(e.target.value);
    }
  });
  $('firstBike').addEventListener('click', createBike);
  $('bikeMenu').addEventListener('click', bikeMenu);
  $('exportBtn').addEventListener('click', exportBackup);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) await importBackup(f);
  });

  // Neuer Tag, während die App offen war → Anzeige aktualisieren
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
