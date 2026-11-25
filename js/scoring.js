// 채점 (순수 함수). 입력: 하루 기록 d, 버전 정의 V → 출력: 점수. DOM·저장소 접근 금지.
// 프로토타입의 tFromDay·tMark·scoreDay를 그대로 옮기고, 감점 값만 버전 정의의 pen을 쓴다.
export const MARK = { o: 1, t: 0.5, x: 0 };
export const DEFAULT_PEN = { t: 1, x: 2 };
export const penOf = (V) => (V && V.pen ? V.pen : DEFAULT_PEN);

// v1.7: 블록에 카테고리별 T(bs)가 있으면 그 합계, 없으면 예전처럼 집중도(b) × 블록 T
export const bsSum = (o) => (o && typeof o === 'object' ? Object.values(o).reduce((a, x) => a + (Number.isFinite(+x) ? +x : 0), 0) : 0);
export const hasBs = (d, id) => !!(d && d.bs && d.bs[id] && typeof d.bs[id] === 'object' && Object.keys(d.bs[id]).length);
// 블록 하나의 T. 입력이 없으면 null
export function blockT(d, b) {
  if (hasBs(d, b.id)) return bsSum(d.bs[b.id]);
  const m = d.b && d.b[b.id];
  return m in MARK ? b.t * MARK[m] : null;
}

export function tFromDay(d, V) {
  if (d.tOverride !== null && d.tOverride !== undefined && d.tOverride !== '') return Math.max(0, +d.tOverride);
  let any = false, t = 0;
  for (const b of V.blocks) { const x = blockT(d, b); if (x !== null) { any = true; t += x; } }
  return any ? Math.max(0, t + (+d.tAdj || 0)) : null;
}

export function tMark(T, V) { for (const [min, v] of V.tScale) if (T >= min) return v; return 0; }

// 항목 값: 직접 누른 값(m)이 있으면 그것, 없으면 자동 값(auto). 직접 값이 항상 우선.
export function markOf(d, id) {
  const mk = d.m && d.m[id];
  if (mk) return mk;
  const a = d.auto && d.auto[id];
  return a && a.val in MARK ? a.val : undefined;
}

export function scoreDay(d, V) {
  const PEN = penOf(V);
  const T = tFromDay(d, V); let raw = 0, max = 0, filled = 0, count = 0; const per = {};
  for (const v of V.virtues) {
    let r = 0, m = 0;
    for (const it of v.items) {
      const mk = d.m && d.m[it.id];
      if (mk === 'na') continue;
      count++;
      let val = null;
      if (it.kind === 'time') val = T === null ? null : tMark(T, V);
      else { const k = markOf(d, it.id); if (k in MARK) val = MARK[k]; }
      const p = v.pts * it.w; m += p;
      if (val !== null) { filled++; r += p * val; }
    }
    per[v.id] = { r, m }; raw += r; max += m;
  }
  let pen = 0;
  for (const g of V.passive) for (const ru of g.rules) { const k = d.p && d.p[ru.id]; if (k in PEN) pen += PEN[k]; }
  const pct = max ? Math.max(0, raw / max * 100 - pen) : 0;
  return { raw, max, pct, pen, per, T, filled, count };
}

// 저장 시점 계산값(내보내기·분석용). 화면은 항상 다시 계산한다.
export function scoreSnapshot(d, V) {
  const s = scoreDay(d, V);
  return { pct: +s.pct.toFixed(2), raw: +s.raw.toFixed(2), max: +s.max.toFixed(2), T: s.T, pen: s.pen };
}

// ---------- v1.7: 6콤보 자동 · 항목 연속 기록용 값 ----------
export const COMBO = { full: 6, half: 3 };
export const STREAK_T = 20;
export const comboOf = (V) => ({ ...COMBO, ...((V && V.combo) || {}) });

// 그날 bs에서 한 블록 안 한 카테고리의 가장 큰 T
export function comboMax(d) {
  let n = 0;
  for (const o of Object.values((d && d.bs) || {})) for (const x of Object.values(o || {})) if (+x > n) n = +x;
  return n;
}

// combo 항목의 자동 값을 다시 계산해 d.auto에 반영한다(d를 고친다). at은 값이 바뀔 때만 새로.
export function applyAuto(d, V, now = new Date().toISOString()) {
  const items = (V.virtues || []).flatMap((v) => v.items).filter((i) => i.kind === 'combo');
  if (!items.length) return d;
  const c = comboOf(V), n = comboMax(d);
  const val = n >= c.full ? 'o' : n >= c.half ? 't' : null;
  const auto = { ...(d.auto || {}) };
  for (const it of items) {
    const old = auto[it.id];
    if (old && old.src !== 'blocks') continue; // 다른 출처의 자동 값은 건드리지 않음
    if (val) auto[it.id] = old && old.val === val ? old : { val, src: 'blocks', at: now };
    else delete auto[it.id];
  }
  if (Object.keys(auto).length) d.auto = auto; else delete d.auto;
  return d;
}

// 연속 기록용 그날 항목 표시: 'o' | 't' | 'x' | null(건너뜀)
// 유효시간 항목은 T ≥ streakT(기본 20)이면 ○, 아니면 ✕. T 미입력·–는 건너뜀.
export function itemMark(d, it, V) {
  if (!d) return null;
  const mk = markOf(d, it.id);
  if (mk === 'na') return null;
  if (it.kind === 'time') {
    if (!V) return null;
    const T = tFromDay(d, V);
    if (T === null) return null;
    const lim = Number.isFinite(+V.streakT) && V.streakT !== null && V.streakT !== '' ? +V.streakT : STREAK_T;
    return T >= lim ? 'o' : 'x';
  }
  return mk in MARK ? mk : null;
}
