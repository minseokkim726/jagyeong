// 채점 (순수 함수). 입력: 하루 기록 d, 버전 정의 V → 출력: 점수. DOM·저장소 접근 금지.
// 프로토타입의 tFromDay·tMark·scoreDay를 그대로 옮기고, 감점 값만 버전 정의의 pen을 쓴다.
export const MARK = { o: 1, t: 0.5, x: 0 };
export const DEFAULT_PEN = { t: 1, x: 2 };
export const penOf = (V) => (V && V.pen ? V.pen : DEFAULT_PEN);

export function tFromDay(d, V) {
  if (d.tOverride !== null && d.tOverride !== undefined && d.tOverride !== '') return Math.max(0, +d.tOverride);
  let any = false, t = 0;
  for (const b of V.blocks) { const m = d.b && d.b[b.id]; if (m in MARK) { any = true; t += b.t * MARK[m]; } }
  return any ? Math.max(0, t + (+d.tAdj || 0)) : null;
}

export function tMark(T, V) { for (const [min, v] of V.tScale) if (T >= min) return v; return 0; }

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
      else if (mk in MARK) val = MARK[mk];
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
