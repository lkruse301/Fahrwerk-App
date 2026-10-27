import * as db from './db.js';
import {
  FIELDS, todayLocal, formatDateDE, formatDateLongDE, emptyValues, latestSetup, previousSetup,
  setupsForBike, applyChange, changeEntry, changedKeys, upsert,
} from './setup.js';
import { buildWorkbook, parseWorkbook, backupFileName } from './excel.js';

const NEW_BIKE = '__new__';
const $ = (id) => document.getElementById(id);

// view: 'main' (neuestes Setup) | 'history' (Verlauf) | 'day' (einzelner Tag bearbeiten)
const state = { bikes: [], setups: [], bikeId: null, view: 'main', editDate: null };
let writeQueue = Promise.resolve();

/* ---------- Hilfen ---------- */

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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

function currentBike() {
  return state.bikes.find((b) => b.id === state.bikeId) ?? null;
}

function findEntry(bikeId, datum) {
  return state.setups.find((s) => s.bikeId === bikeId && s.datum === datum) ?? null;
}

function save(rec) {
  state.setups = upsert(state.setups, rec);
  writeQueue = writeQueue.then(() => db.putSetup(rec)).catch(() => toast('Speichern fehlgeschlagen'));
}

/* ---------- Einstellungs-Zeilen (Hauptansicht und Tagesansicht) ---------- */

/** Baut Gabel- und Dämpfer-Block mit +/−-Zeilen in root. onStep(key, dir) → true, wenn geändert. */
function buildPanel(root, onStep) {
  const els = {};
  [['gabel', 'Gabel'], ['daempfer', 'Dämpfer']].forEach(([group, title]) => {
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.innerHTML = `<h2>${title}</h2><div class="rows"></div>`;
    const rows = sec.querySelector('.rows');
    FIELDS.filter((f) => f.group === group).forEach((f) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.key = f.key;
      row.innerHTML = `
        <button class="step" data-dir="-1" aria-label="${title} ${f.label} verringern">−</button>
        <div class="readout">
          <span class="label">${f.label}</span>
          <span><span class="value">0</span>${f.unit ? `<span class="unit">${f.unit}</span>` : ''}</span>
        </div>
        <button class="step" data-dir="1" aria-label="${title} ${f.label} erhöhen">+</button>`;
      rows.appendChild(row);
      els[f.key] = { row, value: row.querySelector('.value'), minus: row.querySelector('[data-dir="-1"]') };
      row.querySelectorAll('.step').forEach((btn) => {
        const dir = Number(btn.dataset.dir);
        attachRepeat(btn, () => {
          const changed = onStep(f.key, dir);
          if (changed) bump(els[f.key].value);
          return changed;
        });
      });
    });
    root.appendChild(sec);
  });
  return els;
}

function bump(el) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

/** Tippen = ein Schritt, gedrückt halten = fortlaufend (wird schneller). */
function attachRepeat(btn, doStep) {
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
    if (!doStep()) return stop();
    count += 1;
    timer = setTimeout(tick, count > 30 ? 20 : count > 12 ? 40 : 90);
  };

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || btn.disabled) return;
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    btn.classList.add('pressed');
    count = 0;
    doStep();
    delay = setTimeout(tick, 420);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => btn.addEventListener(ev, stop));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  // Tastatur (Enter/Leertaste) löst nur "click" ohne Zeiger aus
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) doStep();
  });
}

function renderPanel(els, values, prev) {
  const changed = new Set(changedKeys(values, prev));
  FIELDS.forEach((f) => {
    const el = els[f.key];
    const v = values[f.key] ?? 0;
    el.value.textContent = v;
    el.minus.disabled = v <= 0;
    el.row.classList.toggle('changed', changed.has(f.key));
  });
}

let mainEls;
let dayEls;

/** Hauptansicht: Änderung am neuesten Setup, an einem neuen Tag entsteht ein neuer Tageseintrag. */
function stepMain(key, dir) {
  if (!state.bikeId) return false;
  const current = latestSetup(state.setups, state.bikeId);
  if (dir < 0 && (current ? current[key] : 0) <= 0) return false;
  save(applyChange(state.setups, state.bikeId, key, dir, todayLocal()));
  render();
  return true;
}

/** Tagesansicht: ändert nur den gewählten Tag, es entsteht kein neuer Eintrag. */
function stepDay(key, dir) {
  const rec = findEntry(state.bikeId, state.editDate);
  if (!rec) return false;
  if (dir < 0 && (rec[key] ?? 0) <= 0) return false;
  save(changeEntry(rec, key, dir));
  render();
  return true;
}

/* ---------- Darstellung ---------- */

function renderBikeSelect() {
  const sel = $('bikeSelect');
  sel.innerHTML = '';
  state.bikes.forEach((b) => sel.add(new Option(b.name, b.id)));
  sel.add(new Option('＋ Neues Bike …', NEW_BIKE));
  sel.value = state.bikeId ?? '';
}

function showView(view) {
  state.view = view;
  render();
  window.scrollTo(0, 0);
}

function render() {
  // Gewählter Tag existiert nicht mehr (z. B. nach Wiederherstellung) → zurück zum Verlauf
  if (state.view === 'day' && !findEntry(state.bikeId, state.editDate)) state.view = 'history';
  if (state.view !== 'main' && !state.bikeId) state.view = 'main';

  const v = state.view;
  $('mainHeader').hidden = v !== 'main';
  $('subHeader').hidden = v === 'main';
  $('mainView').hidden = v !== 'main';
  $('historyView').hidden = v !== 'history';
  $('dayView').hidden = v !== 'day';

  if (v === 'main') renderMain();
  else if (v === 'history') renderHistory();
  else renderDay();
}

function renderMain() {
  const hasBike = !!state.bikeId;
  $('empty').hidden = hasBike;
  $('setup').hidden = !hasBike;
  $('bikeMenu').disabled = !hasBike;
  $('historyBtn').disabled = !hasBike;
  $('bikeSelect').parentElement.style.visibility = state.bikes.length ? 'visible' : 'hidden';

  if (!hasBike) {
    $('setupDate').textContent = 'Kein Bike';
    $('todayChip').hidden = true;
    return;
  }

  const today = todayLocal();
  const cur = latestSetup(state.setups, state.bikeId);
  const isToday = !!cur && cur.datum === today;
  const prev = isToday ? previousSetup(state.setups, state.bikeId, today) : null;

  $('setupDate').textContent = cur ? `Setup vom ${formatDateDE(cur.datum)}` : 'Noch kein Setup gespeichert';
  $('todayChip').hidden = !isToday;
  renderPanel(mainEls, cur ?? emptyValues(), prev);
}

function summary(s, prev) {
  if (!prev) return 'Erstes Setup';
  const n = changedKeys(s, prev).length;
  if (n === 0) return 'Keine Änderung';
  return n === 1 ? '1 Wert geändert' : `${n} Werte geändert`;
}

function renderHistory() {
  const bike = currentBike();
  $('subTitle').textContent = 'Verlauf';
  $('subStatus').textContent = bike ? bike.name : '';

  const list = setupsForBike(state.setups, state.bikeId); // neuestes zuerst
  const today = todayLocal();
  $('historyEmpty').hidden = list.length > 0;
  $('historyList').innerHTML = list
    .map((s, i) => {
      const prev = list[i + 1] ?? null;
      const chips = [
        i === 0 ? '<span class="chip">Aktuell</span>' : '',
        s.datum === today ? '<span class="chip chip-muted">Heute</span>' : '',
      ].join('');
      return `
      <li>
        <button class="history-item" data-date="${esc(s.datum)}">
          <span class="hi-main">
            <span class="hi-date">${formatDateLongDE(s.datum)} ${chips}</span>
            <span class="hi-sum">${summary(s, prev)}</span>
            <span class="hi-vals">Gabel ${s.gabel_luftdruck} psi · ${s.gabel_tokens} Tokens · Dämpfer ${s.daempfer_federrate} lbs</span>
          </span>
          <span class="hi-chev" aria-hidden="true">›</span>
        </button>
      </li>`;
    })
    .join('');
}

function renderDay() {
  const rec = findEntry(state.bikeId, state.editDate);
  const prev = previousSetup(state.setups, state.bikeId, state.editDate);
  const isLatest = latestSetup(state.setups, state.bikeId)?.datum === state.editDate;
  $('subTitle').textContent = `Setup vom ${formatDateDE(state.editDate)}`;
  $('subStatus').textContent = `${currentBike()?.name ?? ''} · Änderungen gelten nur für diesen Tag${isLatest ? ' (aktuelles Setup)' : ''}`;
  renderPanel(dayEls, rec, prev);
}

async function selectBike(id) {
  state.bikeId = id;
  renderBikeSelect();
  render();
  await db.setMeta('lastBikeId', id);
}

/* ---------- Tag löschen ---------- */

async function deleteDay() {
  const datum = state.editDate;
  if (!findEntry(state.bikeId, datum)) return;
  const isLatest = latestSetup(state.setups, state.bikeId)?.datum === datum;
  const prev = previousSetup(state.setups, state.bikeId, datum);
  let message = 'Der Eintrag wird endgültig gelöscht. Andere Tage bleiben unverändert.';
  if (isLatest) {
    message += prev
      ? ` Die Hauptansicht zeigt danach das Setup vom ${formatDateDE(prev.datum)}.`
      : ' Für dieses Bike ist danach kein Setup mehr gespeichert.';
  }
  const ok = await dialog({
    title: `Setup vom ${formatDateDE(datum)} löschen?`,
    message,
    okText: 'Löschen',
    danger: true,
  });
  if (ok !== 'ok') return;
  const bikeId = state.bikeId;
  state.setups = state.setups.filter((s) => !(s.bikeId === bikeId && s.datum === datum));
  writeQueue = writeQueue.then(() => db.deleteSetup(bikeId, datum)).catch(() => toast('Löschen fehlgeschlagen'));
  await writeQueue;
  showView('history');
  toast('Tag gelöscht');
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
  const bike = currentBike();
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
  state.view = 'main';
  const keep = state.bikes.some((b) => b.id === state.bikeId) ? state.bikeId : state.bikes[0]?.id ?? null;
  await selectBike(keep);
  toast('Backup wiederhergestellt');
}

/* ---------- Start ---------- */

async function init() {
  mainEls = buildPanel($('setup'), stepMain);
  dayEls = buildPanel($('daySetup'), stepDay);
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
  $('historyBtn').addEventListener('click', () => showView('history'));
  $('backBtn').addEventListener('click', () => showView(state.view === 'day' ? 'history' : 'main'));
  $('historyList').addEventListener('click', (e) => {
    const item = e.target.closest('.history-item');
    if (!item) return;
    state.editDate = item.dataset.date;
    showView('day');
  });
  $('deleteDayBtn').addEventListener('click', deleteDay);
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
