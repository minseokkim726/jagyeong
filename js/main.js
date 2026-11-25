// 앱 시작, 상태, 자동 저장, 화면 전환, 서비스 워커 등록
import * as repo from './repo.js';
import { scoreSnapshot } from './scoring.js';
import { retagDay, RETAG_MSG } from './versions.js';
import { clone, hhmm, logicalToday, parse } from './format.js';
import * as today from './screens/today.js';
import * as trends from './screens/trends.js';
import * as setup from './screens/setup.js';
import * as welcome from './screens/welcome.js';

const app = document.getElementById('app');
const statusEl = document.getElementById('status');
const tabsEl = document.getElementById('tabs');

// 화면 상태
const S = {
  data: { days: {}, weeks: {}, months: {}, versions: {}, settings: { cur: null, lastBackupAt: null, draft: null } },
  tab: 'today', cur: logicalToday(), month: logicalToday().slice(0, 7),
  mode: 'run', draft: null, draftPrompt: false, cancelAsk: false, edErrs: null, edMsg: '',
  imp: null, vmsg: '', dmsg: '', delAsk: null, useAsk: null, pending: null,
};

const timers = {}, busy = {};

function setStatus(t, err) { statusEl.textContent = t; statusEl.classList.toggle('err', !!err); }

function curId() { return S.data.settings.cur && S.data.versions[S.data.settings.cur] ? S.data.settings.cur : Object.keys(S.data.versions)[0] || null; }
function curV() { return S.data.versions[curId()]; }
function blankDay(date) { const wd = parse(date).getDay(); return { date, v: curId(), type: (wd === 0 || wd === 6) ? 'weekend' : 'weekday', m: {}, b: {}, bt: {}, p: {}, tAdj: 0, tOverride: null, kcal: null, steps: null, weight: null, drink: null, memo: '', line: '' }; }
function getDay(date) { return S.data.days[date] || blankDay(date); }
// 기록의 버전(없으면 현재 버전 + missing)
function verOfDay(d) { const V = S.data.versions[d.v]; return V ? { V, missing: false } : { V: curV(), missing: !!S.data.days[d.date] }; }

// ---------- 저장: 문서별 한 번에 한 건 ----------
function queue(kind, key, ms = 0) {
  const id = kind + '/' + key; clearTimeout(timers[id]);
  if (ms) setStatus('저장 대기…');
  timers[id] = setTimeout(() => { delete timers[id]; flush(kind, key); }, ms);
}
async function flush(kind, key) {
  const id = kind + '/' + key;
  if (busy[id]) { busy[id] = 'again'; return; }
  busy[id] = true;
  try {
    if (kind === 'days') {
      const d = S.data.days[key];
      d.score = scoreSnapshot(d, verOfDay(d).V); d.at = new Date().toISOString();
      await repo.putDay(clone(d));
    } else if (kind === 'weeks') await repo.putWeek(clone(S.data.weeks[key]));
    else if (kind === 'months') await repo.putMonth(clone(S.data.months[key]));
    else if (kind === 'draft') { S.data.settings.draft = clone(S.draft); await repo.saveDraft(clone(S.draft)); }
    setStatus('저장됨 · ' + hhmm(new Date()));
  } catch (e) {
    setStatus('저장 실패 · ' + (e && e.message ? e.message : '알 수 없는 오류') + ' · 다시 누르면 다시 저장합니다', true);
  }
  const again = busy[id] === 'again'; busy[id] = false; if (again) flush(kind, key);
}
function flushAll() { for (const id of Object.keys(timers)) { clearTimeout(timers[id]); delete timers[id]; const [k, ...r] = id.split('/'); flush(k, r.join('/')); } }

function editDay(fn, rerender = true) {
  const d = clone(getDay(S.cur)); fn(d); S.data.days[S.cur] = d;
  queue('days', S.cur, rerender ? 0 : 600);
  if (rerender) render(); else today.refresh(ctx);
}

async function reload() { S.data = await repo.load(); }

// v1.7: 현재 버전을 바꾼 뒤 부른다. 오늘(새벽 4시 기준) 기록이 옛 버전이면 새 버전으로 바꾸고 저장. 바꿨으면 알림 문구.
async function retagToday() {
  const k = logicalToday(), nd = retagDay(S.data.days[k], curV());
  if (!nd) return '';
  S.data.days[k] = nd;
  await flush('days', k);
  return RETAG_MSG;
}

// 화면 모듈에 넘기는 도구
const ctx = {
  S, repo, setStatus, render, reload, retagToday, queue, editDay, getDay, verOfDay, curId, curV, flushAll,
  today: () => logicalToday(),
  go(tab) { S.tab = tab; if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab); render(); window.scrollTo(0, 0); },
};

const SCREENS = { today, trends, setup };

function render() {
  const first = !curId();
  tabsEl.hidden = first;
  if (first) { app.innerHTML = welcome.render(ctx); welcome.after && welcome.after(ctx); return; }
  tabsEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
  const sc = SCREENS[S.tab];
  app.innerHTML = sc.render(ctx);
  if (sc.after) sc.after(ctx);
}

// ---------- 이벤트 ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t || t.disabled) return;
  if (t.dataset.tab && t.closest('#tabs')) { ctx.go(t.dataset.tab); return; }
  const sc = !curId() ? welcome : SCREENS[S.tab];
  if (sc.click) sc.click(t, ctx, e);
});
document.addEventListener('input', (e) => {
  const sc = !curId() ? welcome : SCREENS[S.tab];
  if (sc.input) sc.input(e.target, ctx, e);
});
document.addEventListener('change', (e) => {
  const sc = !curId() ? welcome : SCREENS[S.tab];
  if (sc.change) sc.change(e.target, ctx, e);
});
// v1.7: 칩 길게 누르기
for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'contextmenu']) {
  document.addEventListener(ev, (e) => {
    const sc = !curId() ? welcome : SCREENS[S.tab];
    const fn = sc && sc[ev === 'pointercancel' ? 'pointerup' : ev];
    if (fn) fn(e, ctx);
  }, ev === 'pointermove' ? { passive: true } : undefined);
}
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (SCREENS[h] && h !== S.tab) { S.tab = h; render(); } });
// 화면을 떠나기 전에 기다리던 저장을 바로 한다
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAll();
  else if (S.cur && S.tab === 'today' && !document.activeElement?.matches?.('input,textarea')) {
    // 날짜가 바뀐 뒤 돌아오면 오늘 화면을 다시 그린다
    if (S.lastToday && S.lastToday !== logicalToday()) { S.cur = logicalToday(); render(); }
  }
  S.lastToday = logicalToday();
});
window.addEventListener('pagehide', flushAll);

async function start() {
  try {
    const h = location.hash.slice(1); if (SCREENS[h]) S.tab = h;
    await repo.init();
    await reload();
    S.lastToday = logicalToday();
    setStatus(curId() ? '불러왔습니다' : '');
    render();
  } catch (err) {
    setStatus('앱을 열지 못했습니다: ' + (err && err.message ? err.message : err), true);
    app.innerHTML = '';
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => reg.update().catch(() => {})).catch(() => {});
  });
}

start();
