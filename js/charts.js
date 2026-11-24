// 직접 그린 인라인 SVG: 인장, 일별 점수 선 그래프
import { esc, fmt1 } from './format.js';

function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function sealSVG(s, V, focus) {
  const tot = V.virtues.reduce((a, v) => a + v.pts, 0), gap = V.virtues.length > 1 ? 0.05 : 0; let a = -Math.PI / 2, out = '';
  for (const v of V.virtues) {
    const span = tot ? v.pts / tot * Math.PI * 2 : 0, a0 = a + gap / 2, a1 = Math.min(a + span - gap / 2, a0 + Math.PI * 2 - 0.001), pv = s.per[v.id];
    const frac = pv && pv.m ? pv.r / pv.m : 0, mid = a + span / 2;
    out += `<path d="${arcPath(130, 130, 98, a0, a1)}" stroke="var(--line)" stroke-width="16" fill="none"/>`;
    if (frac > 0) out += `<path d="${arcPath(130, 130, 98, a0, a0 + (a1 - a0) * frac)}" stroke="${v.id === focus ? 'var(--seal)' : 'var(--ink)'}" stroke-width="16" fill="none"/>`;
    if (pv && !pv.m) out += `<path d="${arcPath(130, 130, 98, a0, a1)}" stroke="var(--paper)" stroke-width="16" fill="none"/>`;
    const lx = 130 + 122 * Math.cos(mid), ly = 130 + 122 * Math.sin(mid);
    out += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="12" text-anchor="middle" dominant-baseline="middle"${v.id === focus ? ' style="fill:var(--seal);font-weight:700"' : ''}>${esc(v.short || v.name)}</text>`;
    a += span;
  }
  return `<svg class="seal" viewBox="-18 -6 296 272" role="img" aria-label="오늘 점수 ${fmt1(s.pct)}점">
    <circle cx="130" cy="130" r="74" fill="var(--sealbg)"/><circle cx="130" cy="130" r="68" fill="none" stroke="var(--seal)" stroke-width="2"/>
    ${out}
    <text id="sealNum" x="130" y="124" text-anchor="middle" dominant-baseline="middle" class="sealnum">${Math.round(s.pct)}</text>
    <text id="sealCnt" x="130" y="160" text-anchor="middle" font-size="12">입력 ${s.filled} / ${s.count}</text></svg>`;
}

// series: 날짜 순 점수(없으면 null). sel: 선택한 칸 번호(-1이면 없음)
export function lineChartInner(W, H, series, sel) {
  const L = 30, R = 8, T = 10, B = 24, n = series.length;
  const x = (i) => L + (W - L - R) * (n > 1 ? i / (n - 1) : 0.5), yv = (v) => T + (H - T - B) * (1 - v / 100);
  let g = '';
  for (const t of [0, 60, 80, 100]) g += `<line x1="${L}" x2="${W - R}" y1="${yv(t)}" y2="${yv(t)}" stroke="var(--line)"/><text x="${L - 6}" y="${yv(t)}" font-size="11" text-anchor="end" dominant-baseline="middle" fill="var(--mute)">${t}</text>`;
  const step = W < 520 ? 7 : 5;
  series.forEach((_, i) => { if (i === 0 || (i + 1) % step === 0) g += `<text x="${x(i)}" y="${H - 6}" font-size="11" text-anchor="middle" fill="var(--mute)">${i + 1}</text>`; });
  let path = '', prev = false;
  series.forEach((p, i) => { if (p !== null) { path += (prev ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yv(p).toFixed(1); prev = true; } else prev = false; });
  g += `<path d="${path}" fill="none" stroke="var(--ink)" stroke-width="2"/>`;
  series.forEach((p, i) => { if (p !== null) g += `<circle cx="${x(i)}" cy="${yv(p)}" r="${i === sel ? 5 : 3.5}" fill="${i === sel ? 'var(--seal)' : 'var(--ink)'}"/>`; });
  return g;
}
