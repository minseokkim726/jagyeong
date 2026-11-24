// 추이 계산 (순수 함수)
import { scoreDay } from './scoring.js';
import { addDays, monday, monthDays, parse } from './format.js';

// 기록의 버전 정의(없으면 현재 버전, missing 표시)
export function verOf(d, versions, cur) {
  const V = versions[d.v];
  if (V) return { V, missing: false };
  return { V: versions[cur], missing: true };
}

// 오늘 기록이 있으면 오늘부터, 아직 없으면 어제부터 거꾸로 센다. 기록 없는 날에서 멈춤
export function streak(days, today) {
  let n = 0;
  const start = days[today] ? today : addDays(today, -1);
  for (let k = start; days[k]; k = addDays(k, -1)) n++;
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
  const rec = list.filter((k) => days[k]).map((k) => { const d = days[k]; const { V } = verOf(d, versions, cur); return { k, d, V, s: scoreDay(d, V) }; });
  const avg = rec.length ? rec.reduce((a, r) => a + r.s.pct, 0) / rec.length : null;
  const ts = rec.filter((r) => r.s.T !== null);
  const tavg = ts.length ? ts.reduce((a, r) => a + r.s.T, 0) / ts.length : null;
  const tm = today.slice(0, 7);
  const elapsed = ym < tm ? list.length : ym === tm ? +today.slice(8) : 0;
  const pen = rec.reduce((a, x) => a + x.s.pen, 0);
  const drink = rec.filter((x) => x.d.drink === true).length;
  const st = rec.filter((x) => x.d.steps !== null && x.d.steps !== undefined && x.d.steps !== '' && +x.d.steps > 0);
  const stepsAvg = st.length ? Math.round(st.reduce((a, x) => a + +x.d.steps, 0) / st.length) : null;
  return { list, rec, count: rec.length, elapsed, avg, tavg, streak: streak(days, today), pen, drink, stepsAvg, series: list.map((k) => { const r = rec.find((x) => x.k === k); return r ? r.s.pct : null; }) };
}

// 덕목별 달성률: 덕목 id가 같은 것끼리 합친다. 순서는 현재 버전 → 그 밖의 버전에서 처음 나온 순.
export function virtueRates(rec, curV) {
  const acc = new Map();
  const names = new Map();
  if (curV) for (const v of curV.virtues) { acc.set(v.id, { r: 0, m: 0 }); names.set(v.id, v.short || v.name); }
  for (const x of rec) {
    for (const v of x.V.virtues) {
      if (!acc.has(v.id)) { acc.set(v.id, { r: 0, m: 0 }); names.set(v.id, v.short || v.name); }
      const pv = x.s.per[v.id]; if (pv) { const a = acc.get(v.id); a.r += pv.r; a.m += pv.m; }
    }
  }
  return [...acc.entries()].map(([id, a]) => ({ id, name: names.get(id), pct: a.m ? a.r / a.m * 100 : null }));
}

// 이번 주 7칸
export function weekCells(days, versions, cur, today) {
  const wk = monday(today);
  return Array.from({ length: 7 }, (_, i) => {
    const k = addDays(wk, i), d = days[k];
    return { k, pct: d ? scoreDay(d, verOf(d, versions, cur).V).pct : null };
  });
}
