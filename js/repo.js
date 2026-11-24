// 데이터 접근 계층. 화면 코드는 저장소(IndexedDB)에 직접 접근하지 않고 이 모듈만 호출한다.
import { APP_ID, SCHEMA, normalizeVersion, planMerge } from './versions.js';

export const DB_NAME = 'jagyeong';
const DB_VERSION = 1;
const STORES = { days: 'date', weeks: 'week', months: 'month', versions: 'id', settings: 'id', meta: 'id' };

let dbp = null;
function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [n, keyPath] of Object.entries(STORES)) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath });
    };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); dbp = null; }; resolve(db); };
    req.onerror = () => { dbp = null; reject(req.error); };
    req.onblocked = () => reject(new Error('다른 창에서 앱이 열려 있어 저장소를 열 수 없습니다.'));
  });
  return dbp;
}

async function readAll(names = Object.keys(STORES)) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, 'readonly');
    const out = {};
    for (const n of names) { const r = t.objectStore(n).getAll(); r.onsuccess = () => { out[n] = r.result; }; }
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('읽기 취소됨'));
  });
}

// 한 트랜잭션으로 쓴다. { put: {store: [items]}, del: {store: [keys]} }
async function write({ put = {}, del = {} }) {
  const names = [...new Set([...Object.keys(put), ...Object.keys(del)])].filter((n) => (put[n] && put[n].length) || (del[n] && del[n].length));
  if (!names.length) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, 'readwrite');
    for (const [n, keys] of Object.entries(del)) for (const k of keys) t.objectStore(n).delete(k);
    for (const [n, items] of Object.entries(put)) for (const it of items) t.objectStore(n).put(it);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('저장 취소됨'));
  });
}

const DEFAULT_SETTINGS = { cur: null, lastBackupAt: null, draft: null };
const settingsOf = (rows) => { const s = (rows || []).find((r) => r.id === 'settings'); const { id, ...rest } = s || {}; return { ...DEFAULT_SETTINGS, ...rest }; };
const byKey = (rows, key) => { const o = {}; for (const r of rows || []) o[r[key]] = r; return o; };

export async function init() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch { /* 지원 안 함 */ }
  const all = await readAll(['meta']);
  if (!all.meta.find((m) => m.id === 'meta')) await write({ put: { meta: [{ id: 'meta', schemaVersion: SCHEMA }] } });
}

// 화면이 쓰는 전체 데이터
export async function load() {
  const all = await readAll();
  const versions = {};
  for (const v of all.versions) versions[v.id] = normalizeVersion(v);
  return {
    days: byKey(all.days, 'date'), weeks: byKey(all.weeks, 'week'), months: byKey(all.months, 'month'),
    versions, settings: settingsOf(all.settings),
  };
}

export const putDay = (d) => write({ put: { days: [d] } });
export const putWeek = (w) => write({ put: { weeks: [w] } });
export const putMonth = (m) => write({ put: { months: [m] } });

export async function saveSettings(patch) {
  const all = await readAll(['settings']);
  const s = settingsOf(all.settings);
  await write({ put: { settings: [{ id: 'settings', ...s, ...patch }] } });
}
export const saveDraft = (draft) => saveSettings({ draft });
export const markBackedUp = (at = new Date().toISOString()) => saveSettings({ lastBackupAt: at });

// 새 버전 저장 + 현재 버전으로 (+ 필요하면 오늘 기록의 버전을 바꿈). 한 트랜잭션.
export async function addVersion(V, { makeCurrent = true, retagDay = null } = {}) {
  const all = await readAll(['settings']);
  const s = settingsOf(all.settings);
  const put = { versions: [V] };
  if (makeCurrent) put.settings = [{ id: 'settings', ...s, cur: V.id, draft: null }];
  if (retagDay) put.days = [retagDay];
  await write({ put });
}
export const deleteVersion = (id) => write({ del: { versions: [id] } });
export const setCurrent = (id) => saveSettings({ cur: id });

// ---------- 백업 ----------
export async function exportAll() {
  const d = await load();
  return { exportedAt: new Date().toISOString(), app: APP_ID, schema: SCHEMA, current: d.settings.cur, versions: d.versions, days: d.days, weeks: d.weeks, months: d.months };
}

// readImport 결과를 받아 합치기 계획(미리보기용)
export async function previewImport(inc) {
  const d = await load();
  return planMerge(d, inc);
}

// 계획대로 한 트랜잭션에 합친다. setCur가 있으면 현재 버전으로.
export async function applyImport(plan, setCur = null) {
  const put = { ...plan.put };
  if (setCur) {
    const all = await readAll(['settings']);
    put.settings = [{ id: 'settings', ...settingsOf(all.settings), cur: setCur }];
  }
  await write({ put });
}
