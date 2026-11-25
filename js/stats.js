// 추이 계산 (순수 함수)
import { scoreDay, hasBs } from './scoring.js';
import { addDays, monday, monthDays, parse } from './format.js';

// 기록의 버전 정의(없으면 현재 버전, missing 표시)
export function verOf(d, versions, cur) {
  const V = versions[d.v];
  if (V) return { V, missing: false };
  return { V: versions[cur], missing: true };
}

// 채점·생활 기록 없이 사명서 읽음만 있는 날은 "기록한 날"로 세지 않는다
// 아침 입력(사명서 읽음·오늘의 A1)만 있는 날도 같다(v1.5)
const isFilled = (o) => o && typeof o === 'object' && Object.keys(o).length > 0;
export function isCreedOnly(d) {
  if (!d || !(d.creedAt || String(d.a1 || '').trim())) return false;
  const has = isFilled(d.m) || isFilled(d.b) || isFilled(d.p) || isFilled(d.bt) || isFilled(d.bc) || isFilled(d.bs) || isFilled(d.pm) || isFilled(d.menu)
    || (d.tOverride !== null && d.tOverride !== undefined && d.tOverride !== '') || (+d.tAdj || 0) !== 0
    || [d.kcal, d.steps, d.weight, d.drink].some((x) => x !== null && x !== undefined && x !== '')
    || !!String(d.memo || '').trim() || !!String(d.line || '').trim();
  return !has;
}
export const isRecorded = (d) => !!d && !isCreedOnly(d);

// 오늘 기록이 있으면 오늘부터, 아직 없으면 어제부터 거꾸로 센다. 기록 없는 날에서 멈춤
export function streak(days, today) {
  let n = 0;
  const start = isRecorded(days[today]) ? today : addDays(today, -1);
  for (let k = start; isRecorded(days[k]); k = addDays(k, -1)) n++;
  return n;
}

// 백업 알림을 띄울지(순수 함수). days: 기록 목록, lastBackupAt: ISO|null, now: Date, today: 'YYYY-MM-DD'
// - 백업한 적이 없고, 가장 오래된 기록의 날짜가 7일 이상 지났을 때
// - 마지막 백업 뒤 7일이 지났고, 그 뒤에 고친 기록이 있을 때
export const BACKUP_DAYS = 7;
export function backupReminder(dayList, lastBackupAt, now, today) {
  if (!dayList.length) return { show: false };
  const dayMs = 86400000;
  if (!lastBackupAt) {
    const oldest = dayList.map((d) => d.date).sort()[0];
    const age = Math.round((parse(today) - parse(oldest)) / dayMs);
    return age >= BACKUP_DAYS ? { show: true, never: true, days: age } : { show: false };
  }
  const since = Math.floor((now.getTime() - new Date(lastBackupAt).getTime()) / dayMs);
  if (since < BACKUP_DAYS) return { show: false };
  const changed = dayList.some((d) => d.at && String(d.at) > String(lastBackupAt));
  return changed ? { show: true, never: false, days: since } : { show: false };
}

export function monthStats(days, versions, cur, ym, today) {
  const list = monthDays(ym);
  const rec = list.filter((k) => isRecorded(days[k])).map((k) => { const d = days[k]; const { V } = verOf(d, versions, cur); return { k, d, V, s: scoreDay(d, V) }; });
  const avg = rec.length ? rec.reduce((a, r) => a + r.s.pct, 0) / rec.length : null;
  const ts = rec.filter((r) => r.s.T !== null);
  const tavg = ts.length ? ts.reduce((a, r) => a + r.s.T, 0) / ts.length : null;
  const tm = today.slice(0, 7);
  const elapsed = ym < tm ? list.length : ym === tm ? +today.slice(8) : 0;
  const pen = rec.reduce((a, x) => a + x.s.pen, 0);
  const drink = rec.filter((x) => x.d.drink === true).length;
  const st = rec.filter((x) => x.d.steps !== null && x.d.steps !== undefined && x.d.steps !== '' && +x.d.steps > 0);
  const creedDays = list.filter((k) => days[k] && days[k].creedAt).length;
  const stepsAvg = st.length ? Math.round(st.reduce((a, x) => a + +x.d.steps, 0) / st.length) : null;
  return { list, rec, creedDays, count: rec.length, elapsed, avg, tavg, streak: streak(days, today), pen, drink, stepsAvg, series: list.map((k) => { const r = rec.find((x) => x.k === k); return r ? r.s.pct : null; }) };
}

// 덕목별 달성률: 덕목 id가 같은 것끼리 합친다. 순서는 현재 버전 → 그 밖의 버전에서 처음 나온 순.
// 배점과 무관하게 (받은 점수 ÷ 배점) / (만점 ÷ 배점)으로 합친다. 배점이 달라도 같은 표시면 같은 달성률.
export function virtueRates(rec, curV) {
  const acc = new Map();
  const names = new Map();
  if (curV) for (const v of curV.virtues) { acc.set(v.id, { r: 0, m: 0 }); names.set(v.id, v.short || v.name); }
  for (const x of rec) {
    for (const v of x.V.virtues) {
      if (!acc.has(v.id)) { acc.set(v.id, { r: 0, m: 0 }); names.set(v.id, v.short || v.name); }
      const pv = x.s.per[v.id], k = +v.pts > 0 ? +v.pts : 1;
      if (pv) { const a = acc.get(v.id); a.r += pv.r / k; a.m += pv.m / k; }
    }
  }
  return [...acc.entries()].map(([id, a]) => ({ id, name: names.get(id), pct: a.m ? a.r / a.m * 100 : null }));
}

// 이번 주 7칸
export function weekCells(days, versions, cur, today) {
  const wk = monday(today);
  return Array.from({ length: 7 }, (_, i) => {
    const k = addDays(wk, i), d = isRecorded(days[k]) ? days[k] : null;
    return { k, pct: d ? scoreDay(d, verOf(d, versions, cur).V).pct : null };
  });
}

// 이달 달성률 + 지난달 대비(%p). 지난달 기록이 없으면 대비 null.
export function virtueRatesCompare(rec, prevRec, curV) {
  const now = virtueRates(rec, curV);
  if (!prevRec.length) return now.map((r) => ({ ...r, prev: null, delta: null }));
  const prev = new Map(virtueRates(prevRec, curV).map((r) => [r.id, r.pct]));
  return now.map((r) => {
    const p = prev.has(r.id) ? prev.get(r.id) : null;
    return { ...r, prev: p, delta: r.pct === null || p === null ? null : r.pct - p };
  });
}

// ---------- v1.5: 카테고리 · 연속 기록 · Passive 메모 ----------
const BLK = { o: 1, t: 0.5, x: 0 };
export const UNCAT = '미분류';

// 카테고리별 유효시간: 블록에 bs(카테고리별 T)가 있으면 그대로, 없으면 Σ(블록 T × 집중도 값)을 bc 또는 미분류로.
// 고르지 않았거나 모르는 카테고리는 "미분류".
// rec: [{ d, V }], curV: 이름·순서의 기준. 반환: [{ id, n, t }] (미분류는 id null, 맨 뒤)
export function categoryTime(rec, curV) {
  const order = [], names = new Map(), acc = new Map();
  const add = (c) => { if (c && c.id != null && !names.has(c.id)) { names.set(c.id, c.n); order.push(c.id); acc.set(c.id, 0); } };
  for (const c of (curV && curV.categories) || []) add(c);
  let un = 0;
  for (const { d, V } of rec) {
    for (const c of V.categories || []) add(c);
    for (const b of V.blocks || []) {
      if (hasBs(d, b.id)) { // v1.7: 카테고리별 T 그대로
        for (const [c, x] of Object.entries(d.bs[b.id])) { const t = +x || 0; if (names.has(c)) acc.set(c, acc.get(c) + t); else un += t; }
        continue;
      }
      const m = d.b && d.b[b.id];
      if (!(m in BLK)) continue;
      const t = (+b.t || 0) * BLK[m];
      const c = d.bc && d.bc[b.id];
      if (c != null && names.has(c)) acc.set(c, acc.get(c) + t); else un += t;
    }
  }
  const out = order.map((id) => ({ id, n: names.get(id), t: acc.get(id) }));
  out.push({ id: null, n: UNCAT, t: un });
  return out;
}

// 같은 날 유형의 가장 최근(그날보다 앞선) 기록 중 블록 카테고리별 T(bs)를 넣은 날. 없으면 null. (v1.7: bc → bs)
export function lastSameType(days, date, type) {
  let best = null;
  for (const [k, d] of Object.entries(days)) {
    if (k >= date || !d || d.type !== type || !Object.values(d.bs || {}).some(isFilled)) continue;
    if (!best || k > best) best = k;
  }
  return best;
}

// 항목 연속 기록(v1.7 규칙). markOf(d) → 'o' | 't' | 'x' | null
//   ○ = 이어지고 +1 / △ 한 번 = 보류(끊기지도 세지도 않음) / △ 두 번 연속 = 끊김 / ✕ = 끊김
//   null(–·미입력·기록 없는 날) = 건너뜀(△ 연속 판정에서도 없는 날로 봄)
// current: date까지(그 뒤 기록은 안 셈), longest: 전체 기록. pending: date 기준 보류 중인지.
export function streakRun(marks) {
  let run = 0, pend = false, longest = 0;
  for (const m of marks) {
    if (m === 'o') { run++; pend = false; if (run > longest) longest = run; }
    else if (m === 't') { if (pend) { run = 0; pend = false; } else pend = true; }
    else if (m === 'x') { run = 0; pend = false; }
  }
  return { run, pending: pend && run > 0, longest };
}
export function itemStreak(days, itemId, date, markOf) {
  const get = markOf || ((d) => { const m = d && d.m && d.m[itemId]; return m === 'o' || m === 't' || m === 'x' ? m : null; });
  const keys = Object.keys(days).sort();
  const marks = keys.map((k) => [k, get(days[k], k)]).filter(([, m]) => m);
  const upto = streakRun(marks.filter(([k]) => k <= date).map(([, m]) => m));
  const all = streakRun(marks.map(([, m]) => m));
  return { current: upto.run, longest: all.longest, pending: upto.pending };
}

// 이달 Passive 위반 메모 목록(날짜순): △·✕ 이고 메모가 있는 것
export function passiveNotes(rec) {
  const out = [];
  for (const { k, d, V } of rec) {
    for (const g of V.passive || []) for (const r of g.rules || []) {
      const mk = d.p && d.p[r.id], memo = String((d.pm || {})[r.id] || '').trim();
      if ((mk === 't' || mk === 'x') && memo) out.push({ date: k, rule: r.t, mark: mk, memo });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
