// 추이 화면
import { monthStats, virtueRatesCompare, weekCells, categoryTime, passiveNotes } from '../stats.js';
import { lineChartInner } from '../charts.js';
import { esc, fmt1, parse, addMonths, WD, clone } from '../format.js';
import { focusOf } from './today.js';
import { hasCreed } from '../creed.js';

export function render(ctx) {
  const { S } = ctx, today = ctx.today();
  const st = monthStats(S.data.days, S.data.versions, ctx.curId(), S.month, today);
  const prev = monthStats(S.data.days, S.data.versions, ctx.curId(), addMonths(S.month, -1), today);
  const [y, m] = S.month.split('-').map(Number);
  const focus = focusOf(S, today);
  const none = !st.count;
  const curV = ctx.curV();
  let h = `<div class="datebar"><button type="button" class="iconbtn" data-month="-1" aria-label="전달">‹</button><div class="d">${y}년 ${m}월</div><button type="button" class="iconbtn" data-month="1" aria-label="다음달">›</button></div>
  <div class="figs"><div class="fg"><b>${none ? '–' : `${st.count}<small style="font-size:15px"> / ${st.elapsed}</small>`}</b><span>기록한 날</span></div>
  <div class="fg"><b>${st.avg === null ? '–' : fmt1(st.avg)}</b><span>평균 점수</span></div>
  <div class="fg"><b>${st.tavg === null ? '–' : fmt1(st.tavg) + 'T'}</b><span>평균 유효시간</span></div>
  <div class="fg"><b>${none ? '–' : st.streak + '일'}</b><span>현재 연속 기록</span></div></div>
  ${st.creedDays || hasCreed(curV) ? `<p class="note creedstat">사명서 읽은 날 <b>${st.creedDays}일</b> / 기록한 날 ${st.count}일</p>` : ''}`;
  // 1) 덕목별 달성률(기본 지표): 배점과 무관, 지난달 대비 ±%p
  const rates = virtueRatesCompare(st.rec, prev.rec, curV);
  const cmp = prev.rec.length > 0;
  h += `<h3>덕목별 달성률 (이달${cmp ? ', 지난달 대비' : ''})</h3><div class="bars${cmp ? ' cmp' : ''}">`;
  for (const r of rates) {
    const dl = r.delta === null ? '' : Math.round(r.delta);
    h += `<div class="bar${r.id === focus ? ' isfocus' : ''}"><span>${esc(r.name)}</span><div class="tr"><i style="width:${r.pct === null ? 0 : r.pct.toFixed(1)}%"></i></div><span class="p">${r.pct === null ? '–' : Math.round(r.pct) + '%'}</span>${cmp ? `<span class="dl">${dl === '' ? '' : (dl > 0 ? '+' : dl < 0 ? '−' : '±') + Math.abs(dl) + '%p'}</span>` : ''}</div>`;
  }
  h += `</div><p class="note">달성률 = 받은 점수 ÷ 만점(배점과 무관).${cmp ? ' 지난달 기록이 없는 덕목은 대비를 비웁니다.' : ' 지난달 기록이 없어 대비는 생략합니다.'}</p>`;
  // 2) 카테고리별 유효시간
  if (curV && Array.isArray(curV.categories) && curV.categories.length) {
    const ct = categoryTime(st.rec, curV).filter((c) => c.id !== null || c.t > 0);
    const mx = Math.max(0, ...ct.map((c) => c.t));
    h += '<h3>카테고리별 유효시간 (이달)</h3>';
    h += none ? '<p class="note">이달 기록이 없습니다.</p>' : `<div class="bars ctime">${ct.map((c) => `<div class="bar"><span>${c.id === null ? esc(c.n) : `<b>${esc(c.id)}</b> ${esc(c.n)}`}</span><div class="tr"><i style="width:${mx ? (c.t / mx * 100).toFixed(1) : 0}%"></i></div><span class="p">${fmt1(c.t)}T</span></div>`).join('')}</div><p class="note">블록 T × 집중도(온전히 1 · 보통 0.5 · 미흡 0). 카테고리를 고르지 않은 블록은 미분류.</p>`;
  }
  // 3) 일별 점수
  h += '<h3>일별 점수</h3><p class="note">배점이 달마다 바뀌므로 점수는 이달 안에서만 비교하세요.</p>';
  h += none ? '<p class="empty">아직 기록이 없습니다</p>' : '<div class="fig" id="chart"><svg aria-label="일별 점수 그래프" role="img"></svg></div><p class="note">빈칸은 기록하지 않은 날입니다.</p>';
  const wk = weekCells(S.data.days, S.data.versions, ctx.curId(), today);
  h += `<h3>이번 주</h3><div class="week">${wk.map((c) => `<button type="button" class="wd${c.k === S.cur ? ' on' : ''}" data-go="${c.k}">${WD[parse(c.k).getDay()]} ${+c.k.slice(8)}<b>${c.pct === null ? '·' : Math.round(c.pct)}</b></button>`).join('')}</div>`;
  h += `<p class="note">Passive 감점 합계 ${none ? '–' : st.pen + '점'} · 음주한 날 ${none ? '–' : st.drink + '일'} · 평균 걸음 ${st.stepsAvg === null ? '–' : st.stepsAvg.toLocaleString('ko-KR')}</p>`;
  const pn = passiveNotes(st.rec);
  if (pn.length) h += `<details class="pnotes"><summary>이달 위반 메모 ${pn.length}건</summary><ul>${pn.map((x) => `<li><span class="note">${+x.date.slice(5, 7)}/${+x.date.slice(8)} · ${x.mark === 'x' ? '✕' : '△'} ${esc(x.rule)}</span><br>${esc(x.memo)}</li>`).join('')}</ul></details>`;
  const mr = S.data.months[S.month] || {};
  h += `<h3>이번 달 돌아보기</h3><label class="f">잘한 점<textarea class="in" data-mfield="good">${esc(mr.good)}</textarea></label>
  <label class="f" style="margin-top:10px">부족한 점<textarea class="in" data-mfield="bad">${esc(mr.bad)}</textarea></label>`;
  return h;
}

let ro = null;
export function after(ctx) {
  const { S } = ctx;
  if (ro) { ro.disconnect(); ro = null; }
  const svg = document.querySelector('#chart svg'); if (!svg) return;
  const st = monthStats(S.data.days, S.data.versions, ctx.curId(), S.month, ctx.today());
  const sel = st.list.indexOf(S.cur);
  const draw = () => { const W = svg.clientWidth, H = svg.clientHeight; if (W) svg.innerHTML = lineChartInner(W, H, st.series, sel); };
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(draw); ro.observe(svg); }
  draw();
}

export function click(t, ctx) {
  const { S } = ctx, ds = t.dataset;
  if (ds.month) { S.month = addMonths(S.month, +ds.month); ctx.render(); return; }
  if (ds.go) { S.cur = ds.go; ctx.go('today'); }
}

export function input(el, ctx) {
  if (!el.dataset.mfield) return;
  const { S } = ctx;
  const mr = clone(S.data.months[S.month] || { month: S.month });
  mr[el.dataset.mfield] = el.value; mr.at = new Date().toISOString();
  S.data.months[S.month] = mr;
  ctx.queue('months', S.month, 600);
}
