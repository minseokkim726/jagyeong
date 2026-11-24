// 오늘 화면
import { scoreDay, tMark, penOf } from '../scoring.js';
import { sealSVG } from '../charts.js';
import { backupReminder } from '../stats.js';
import { esc, fmt1, fmt2, parse, addDays, monday, WD } from '../format.js';

export const DAYTYPES = [['weekday', '평일'], ['weekend', '주말'], ['family', '가족·행사'], ['trip', '출장·여행']];

function markBtns(id, val, allowNa) {
  const b = (k, l, c, al) => `<button type="button" class="mk ${c}" data-mark="${id}" data-val="${k}" aria-pressed="${val === k}" aria-label="${al}">${l}</button>`;
  return `<div class="marks">${b('o', '○', '', '잘 지킴')}${b('t', '△', 'half', '절반')}${b('x', '✕', 'zero', '못 지킴')}${allowNa ? b('na', '–', 'na', '오늘 해당 없음') : ''}</div>`;
}

export function focusOf(S, date) { const w = S.data.weeks[monday(date)]; return (w && w.focus) || null; }

function backupBanner(ctx) {
  const { S } = ctx;
  const r = backupReminder(Object.values(S.data.days), S.data.settings.lastBackupAt, new Date(), ctx.today());
  if (!r.show) return '';
  const txt = r.never ? `첫 기록 뒤 ${r.days}일이 지났는데 아직 백업 파일을 만들지 않았습니다.` : `마지막 백업 뒤 ${r.days}일이 지났고 그 뒤에 고친 기록이 있습니다.`;
  return `<div class="banner warn">${txt} 기록은 이 기기에만 있습니다. <button type="button" class="chip" data-gobackup="1">백업하러 가기</button></div>`;
}

export function render(ctx) {
  const { S } = ctx;
  const cur = S.cur, d = ctx.getDay(cur), { V, missing } = ctx.verOfDay(d), s = scoreDay(d, V), focus = focusOf(S, cur), dt = parse(cur);
  const fv = V.virtues.find((v) => v.id === focus);
  const pen = penOf(V);
  let h = backupBanner(ctx);
  h += `<div class="datebar"><button type="button" class="iconbtn" data-nav="-1" aria-label="전날">‹</button>
    <div class="d">${dt.getMonth() + 1}월 ${dt.getDate()}일 (${WD[dt.getDay()]})<small>${cur === ctx.today() ? '오늘' : esc(cur)} · ${esc(V.name)}</small></div>
    <button type="button" class="iconbtn" data-nav="1" aria-label="다음날">›</button><button type="button" class="iconbtn" data-nav="0" aria-label="오늘로">⌂</button></div>
    <div class="chips" role="group" aria-label="날 유형">${DAYTYPES.map(([k, l]) => `<button type="button" class="chip" data-type="${k}" aria-pressed="${d.type === k}">${l}</button>`).join('')}</div>`;
  if (missing) h += `<div class="banner warn">버전 정의 없음: 이 기록의 사명서 버전(${esc(d.v || '없음')})이 이 기기에 없어 현재 버전으로 채점했습니다. 설정에서 그 버전을 가져오면 원래 기준으로 보입니다.</div>`;
  h += `<div class="hero"><div>${sealSVG(s, V, focus)}</div><div class="side">
    <p>오늘 점수 <b id="pctTxt">${fmt1(s.pct)}</b>점 <span class="note" id="rawTxt">(${fmt2(s.raw)} / ${fmt2(s.max)}${s.pen ? ` · Passive −${s.pen}` : ''})</span></p>
    <p>유효시간 <b id="tTxt">${s.T === null ? '미입력' : fmt1(s.T) + 'T'}</b> <span class="note">${V.tScale.length ? V.tScale[0][0] + 'T = ' + Math.round(V.tScale[0][1] * 100) + '%' : ''}</span></p>
    <div class="focus">${fv ? `이번 주 집중 덕목 <b>${esc(fv.name)}</b>${fv.model ? ' · ' + esc(fv.model) : ''}` : '이번 주 집중 덕목이 없습니다.'} <button type="button" class="chip" data-gotab="setup">바꾸기</button></div>
    ${d.type !== 'weekday' ? '<p class="note">평일이 아닌 날은 해당 없는 항목을 –로 빼면 점수에서 제외됩니다.</p>' : ''}
  </div></div>`;
  for (const v of V.virtues) {
    const pv = s.per[v.id];
    h += `<section class="v${v.id === focus ? ' isfocus' : ''}"><div class="vh"><h2>${esc(v.name)}</h2><span class="meta">${[v.sub, v.model].filter(Boolean).map(esc).join(' · ')}${v.sub || v.model ? ' · ' : ''}${fmt1(v.pts)}점</span><span class="sc" data-vs="${esc(v.id)}">${fmt1(pv.r)} / ${fmt1(pv.m)}</span></div>`;
    for (const it of v.items) {
      const mk = d.m[it.id];
      if (it.kind === 'time') {
        h += `<div class="item"><div class="t">${esc(it.t)} <span class="tval" id="tVal">${s.T === null ? '' : fmt1(s.T) + 'T → ' + Math.round(tMark(s.T, V) * 100) + '%'}</span>${it.h ? `<small>${esc(it.h)}</small>` : ''}</div>
          <div class="marks"><button type="button" class="mk na" data-mark="${esc(it.id)}" data-val="${mk === 'na' ? '' : 'na'}" aria-pressed="${mk === 'na'}" aria-label="오늘 해당 없음">–</button></div></div>`;
        if (mk !== 'na') {
          h += `<p class="note" style="margin:6px 0 0">시간대마다 한 일을 적고 집중도를 고르세요. 온전히 = 전부, 보통 = 절반, 미흡 = 0으로 셉니다.</p>
          <div class="blocks">${V.blocks.map((b) => `<div class="blk"><div class="h">${esc(b.h)}<small>${fmt1(b.t)}T · ${esc(b.n)}</small></div>
            <input class="in" data-btext="${esc(b.id)}" placeholder="${esc(b.ex || '한 일')}" value="${esc((d.bt || {})[b.id] || '')}" aria-label="${esc(b.h)} 한 일">
            <div class="lv" role="group" aria-label="집중도">${[['o', '온전히'], ['t', '보통'], ['x', '미흡']].map(([k, l]) => `<button type="button" class="lvb lv-${k}" data-mark="blk:${esc(b.id)}" data-val="${k}" aria-pressed="${d.b[b.id] === k}">${l}</button>`).join('')}</div></div>`).join('')}</div>
          <div class="row2"><label class="f">블록 합계 보정 (± T)<input class="in" type="number" step="0.5" inputmode="decimal" data-field="tAdj" value="${esc(d.tAdj || '')}"></label>
          <label class="f">직접 입력 (T, 블록 무시)<input class="in" type="number" step="0.5" min="0" inputmode="decimal" data-field="tOverride" value="${esc(d.tOverride ?? '')}"></label></div>`;
        }
      } else {
        h += `<div class="item"><div class="t">${esc(it.t)}${it.h ? `<small>${esc(it.h)}</small>` : ''}</div>${markBtns(esc(it.id), mk, true)}</div>`;
      }
    }
    h += '</section>';
  }
  const vio = V.passive.reduce((a, g) => a + g.rules.filter((r) => d.p[r.id]).length, 0);
  h += `<details class="pass"${vio ? ' open' : ''}><summary><h3 style="margin:0">Passive</h3><span class="note">기본은 모두 ○. 어긴 것만 누르세요 (△ −${pen.t}, ✕ −${pen.x}) · 위반 ${vio}건</span></summary>`;
  for (const g of V.passive) {
    h += `<div class="vh" style="margin-top:6px"><h2 style="font-size:17px">${esc(g.name)}</h2><span class="meta">${esc(g.sub)}</span></div>`;
    for (const r of g.rules) {
      const k = d.p[r.id] || 'o';
      h += `<div class="item"><div class="t">${esc(r.t)}</div><div class="marks">${[['o', '○', '', '지킴'], ['t', '△', 'half', '조금 어김'], ['x', '✕', 'zero', '어김']].map(([v, l, c, al]) => `<button type="button" class="mk ${c}" data-pass="${esc(r.id)}" data-val="${v}" aria-pressed="${k === v}" aria-label="${al}">${l}</button>`).join('')}</div></div>`;
    }
  }
  h += `</details><h3>생활 기록</h3><div class="row2">
    <label class="f">칼로리 (kcal)<input class="in" type="number" inputmode="numeric" data-field="kcal" value="${esc(d.kcal ?? '')}"></label>
    <label class="f">걸음 수<input class="in" type="number" inputmode="numeric" data-field="steps" value="${esc(d.steps ?? '')}"></label>
    <label class="f">체중 (kg)<input class="in" type="number" step="0.1" inputmode="decimal" data-field="weight" value="${esc(d.weight ?? '')}"></label>
    <div class="f">음주<div class="marks"><button type="button" class="chip" data-drink="no" aria-pressed="${d.drink === false}">안 마심</button><button type="button" class="chip" data-drink="yes" aria-pressed="${d.drink === true}">마심</button></div></div></div>
    <label class="f" style="margin-top:10px">특이사항<textarea class="in" data-field="memo">${esc(d.memo)}</textarea></label>
    <label class="f" style="margin-top:10px">오늘의 한 줄 반성<textarea class="in" data-field="line">${esc(d.line)}</textarea></label>`;
  return h;
}

// 글자 입력 중에는 화면 전체를 다시 그리지 않고 점수만 고친다
export function refresh(ctx) {
  const d = ctx.getDay(ctx.S.cur), { V } = ctx.verOfDay(d), s = scoreDay(d, V);
  const set = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  set('pctTxt', fmt1(s.pct)); set('sealNum', Math.round(s.pct)); set('sealCnt', `입력 ${s.filled} / ${s.count}`);
  set('rawTxt', `(${fmt2(s.raw)} / ${fmt2(s.max)}${s.pen ? ` · Passive −${s.pen}` : ''})`);
  set('tTxt', s.T === null ? '미입력' : fmt1(s.T) + 'T');
  set('tVal', s.T === null ? '' : fmt1(s.T) + 'T → ' + Math.round(tMark(s.T, V) * 100) + '%');
  for (const v of V.virtues) { const e = document.querySelector(`[data-vs="${CSS.escape(v.id)}"]`); if (e) e.textContent = fmt1(s.per[v.id].r) + ' / ' + fmt1(s.per[v.id].m); }
}

export function click(t, ctx) {
  const { S } = ctx, ds = t.dataset;
  if (ds.gotab) { ctx.go(ds.gotab); return; }
  if (ds.gobackup) { ctx.go('setup'); setTimeout(() => document.getElementById('dataSec')?.scrollIntoView(), 0); return; }
  if (ds.nav !== undefined) { ctx.flushAll(); S.cur = ds.nav === '0' ? ctx.today() : addDays(S.cur, +ds.nav); ctx.render(); return; }
  if (ds.type) { ctx.editDay((d) => { d.type = ds.type; }); return; }
  if (ds.mark !== undefined) {
    const id = ds.mark, val = ds.val;
    ctx.editDay((d) => {
      if (id.startsWith('blk:')) { const b = id.slice(4); if (d.b[b] === val) delete d.b[b]; else d.b[b] = val; }
      else if (!val || d.m[id] === val) delete d.m[id]; else d.m[id] = val;
    });
    return;
  }
  if (ds.pass) { ctx.editDay((d) => { if (ds.val === 'o') delete d.p[ds.pass]; else d.p[ds.pass] = ds.val; }); return; }
  if (ds.drink) { ctx.editDay((d) => { const v = ds.drink === 'yes'; d.drink = d.drink === v ? null : v; }); }
}

export function input(el, ctx) {
  if (el.dataset.btext) {
    const id = el.dataset.btext, v = el.value;
    ctx.editDay((d) => { d.bt = d.bt || {}; if (v) d.bt[id] = v; else delete d.bt[id]; }, false);
  } else if (el.dataset.field) {
    const f = el.dataset.field, raw = el.value;
    const num = ['kcal', 'steps', 'weight', 'tAdj', 'tOverride'].includes(f);
    if (num && raw !== '' && !Number.isFinite(+raw)) return;
    ctx.editDay((d) => { d[f] = num ? (raw === '' ? (f === 'tAdj' ? 0 : null) : +raw) : raw; }, false);
  }
}
