// 오늘 화면
import { scoreDay, tMark, penOf, markOf, itemMark, applyAuto, comboMax, bsSum, hasBs } from '../scoring.js';
import { sealSVG } from '../charts.js';
import { backupReminder, itemStreak, lastSameType } from '../stats.js';
import { renderCreed, hasCreed } from '../creed.js';
import { esc, fmt1, fmt2, parse, addDays, monday, WD, hhmm } from '../format.js';

export const DAYTYPES = [['weekday', '평일'], ['weekend', '주말'], ['family', '가족·행사'], ['trip', '출장·여행']];

// auto: 직접 누른 값이 없을 때 보이는 자동 값(작은 "자동" 표시)
function markBtns(id, val, allowNa, auto = null) {
  const on = (k) => val === k || (!val && auto === k);
  const b = (k, l, c, al) => `<button type="button" class="mk ${c}${!val && auto === k ? ' auto' : ''}" data-mark="${id}" data-val="${k}" aria-pressed="${on(k)}" aria-label="${al}${!val && auto === k ? ' (자동)' : ''}">${l}</button>`;
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

// 사명서 카드: 그날 읽지 않았으면 펼침, 읽었으면 한 줄로 접힘. [펼치기]로 다시 읽는다.
// V는 항상 현재 버전(settings.cur)이다. 그날 기록이 묶인 버전과 상관없다.
export function creedCard(S, d, V) {
  if (!hasCreed(V)) return '';
  const read = d.creedAt ? hhmm(new Date(d.creedAt)) : null;
  const open = !read || S.creedOpen === S.cur;
  const title = esc(V.creed.title || '사명서');
  if (!open) return `<div class="creedline"><span>${title} · <b>읽음 ✓</b> ${read}</span><button type="button" class="chip" data-creed="open">펼치기</button></div>`;
  return `<section class="creed" aria-label="${title}"><h2 class="ctitle">${title}</h2><div class="cbody">${renderCreed(V.creed.text)}</div>
    ${read ? `<div class="creedfoot"><span class="note">읽음 ✓ ${read}</span><button type="button" class="btn ghost" data-creed="close">접기</button></div>` : '<button type="button" class="btn creedbtn" data-creed="read">읽었습니다</button>'}</section>`;
}

// v1.5 도우미
const hasA1 = (V) => !!(V && V.virtues && V.virtues.some((v) => v.items.some((i) => i.kind === 'a1')));
const hasCats = (V) => !!(V && Array.isArray(V.categories) && V.categories.length);
// 받침 있으면 '과', 없으면 '와'
const josaGwa = (w) => { const c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c >= 0 && c < 11172 && c % 28 ? '과' : '와'; };
const filled = (o) => !!(o && typeof o === 'object' && Object.keys(o).length);
function a1Text(d, it) {
  const a = String(d.a1 || '').trim();
  return a ? `오늘의 A1: ${esc(a)}` : `아침에 A1을 적지 않았습니다${it.h ? ' · ' + esc(it.h) : ''}`;
}
// v1.7 블록 입력: 카테고리 칩을 누를 때마다 tapStep(기본 1T)씩 더한다. 길게 누르면 그 칩 0.
const fmtH = (x) => String(Math.round(+x * 2) / 2);
export const stepOf = (V) => (+V.tapStep === 0.5 ? 0.5 : 1);
function catChips(V, d, b) {
  const o = (d.bs || {})[b.id] || {};
  return `<div class="cats" role="group" aria-label="${esc(b.h)} 카테고리" style="--n:${V.categories.length}">${V.categories.map((c) => {
    const n = +o[c.id] || 0;
    return `<button type="button" class="cat${n ? ' has' : ''}" data-bs="${esc(b.id)}" data-cat="${esc(c.id)}" aria-label="${esc(c.id)} ${esc(c.n)} ${fmtH(n)}T"><b>${esc(c.id)}${n ? ` <i>${fmtH(n)}</i>` : ''}</b><small>${esc(c.n)}</small></button>`;
  }).join('')}</div>`;
}
// 그날 블록 T(bs 합계 또는 집중도 × T, 입력 없으면 0)
const blkNow = (d, b) => (hasBs(d, b.id) ? bsSum(d.bs[b.id]) : (({ o: 1, t: 0.5, x: 0 })[(d.b || {})[b.id]] ?? 0) * b.t);
// 연속 기록 문구: "연속 5 · 최장 12", 보류 중이면 "연속 2 (보류) · 최장 12"
function streakTxt(S, ctx, it, cur) {
  const vers = S.data.versions, cv = ctx.curV();
  const r = itemStreak(S.data.days, it.id, cur, (dd) => {
    if (!dd) return null;
    const Vd = vers[dd.v] || cv;
    if (it.kind === 'time' && !(Vd && Vd.virtues.some((v) => v.items.some((i) => i.id === it.id && i.kind === 'time')))) return null;
    return itemMark(dd, it, Vd);
  });
  return `<span class="stk">연속 ${r.current}${r.pending ? ' (보류)' : ''} · 최장 ${r.longest}</span>`;
}

// v1.7: 보고 있는 날의 기록 버전이 현재 버전과 다르면 안내 띠
function retagBand(ctx, d, missing) {
  const { S } = ctx, cid = ctx.curId();
  if (missing || !S.data.days[S.cur] || !d.v || d.v === cid || !S.data.versions[d.v]) return '';
  if (S.retagAsk === S.cur) return `<div class="banner retag" role="status">이 날의 점수가 새 기준으로 다시 계산됩니다. <button type="button" class="chip" data-retag="yes">바꾸기</button><button type="button" class="chip" data-retag="no">취소</button></div>`;
  return `<div class="banner retag">이 날은 예전 기준(${esc(S.data.versions[d.v].name)})으로 채점한 기록입니다. <button type="button" class="chip" data-retag="ask">지금 기준으로 바꾸기</button></div>`;
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
    ${retagBand(ctx, d, missing)}
    ${creedCard(S, d, ctx.curV())}
    ${hasA1(V) || hasA1(ctx.curV()) ? `<label class="f a1in">오늘의 A1 (꼭 해야 할 중요한 일 하나)<input class="in" data-a1="1" value="${esc(d.a1 || '')}" enterkeyhint="done"></label>` : ''}
    <div class="chips" role="group" aria-label="날 유형">${DAYTYPES.map(([k, l]) => `<button type="button" class="chip" data-type="${k}" aria-pressed="${d.type === k}">${l}</button>`).join('')}</div>`;
  if (missing) h += `<div class="banner warn">버전 정의 없음: 이 기록의 사명서 버전(${esc(d.v || '없음')})이 이 기기에 없어 현재 버전으로 채점했습니다. 설정에서 그 버전을 가져오면 원래 기준으로 보입니다.</div>`;
  h += `<div class="hero"><div>${sealSVG(s, V, focus)}</div><div class="side">
    <p>오늘 점수 <b id="pctTxt">${fmt1(s.pct)}</b>점 <span class="note" id="rawTxt">(${fmt2(s.raw)} / ${fmt2(s.max)}${s.pen ? ` · Passive −${s.pen}` : ''})</span></p>
    <p>유효시간 <b id="tTxt">${s.T === null ? '미입력' : fmt1(s.T) + 'T'}</b> <span class="note">${V.tScale.length ? V.tScale[0][0] + 'T = ' + Math.round(V.tScale[0][1] * 100) + '%' : ''}</span></p>
    <div class="focus">${fv ? `이번 주 집중 덕목 <b>${esc(fv.name)}</b>${fv.model ? ' · ' + esc(fv.model) : ''}` : '이번 주 집중 덕목이 없습니다.'} <button type="button" class="chip" data-gotab="setup">바꾸기</button></div>
    ${d.type !== 'weekday' ? '<p class="note">평일이 아닌 날은 해당 없는 항목을 –로 빼면 점수에서 제외됩니다.</p>' : ''}
  </div></div>`;
  const cats = hasCats(V);
  let grp = null;
  for (const v of V.virtues) {
    const pv = s.per[v.id];
    if (v.group && v.group !== grp) h += `<p class="grp">${esc(v.group)}</p>`;
    grp = v.group || null;
    h += `<section class="v${v.id === focus ? ' isfocus' : ''}"><div class="vh"><h2>${esc(v.name)}</h2><span class="meta">${[v.sub, v.model].filter(Boolean).map(esc).join(' · ')}${v.sub || v.model ? ' · ' : ''}${fmt1(v.pts)}점</span><span class="sc" data-vs="${esc(v.id)}">${fmt1(pv.r)} / ${fmt1(pv.m)}</span></div>`;
    if (Array.isArray(v.creed) && v.creed.length) h += `<p class="vcreed">${v.creed.map(esc).join(' ')}</p>`;
    for (const it of v.items) {
      const mk = d.m[it.id];
      const stk = streakTxt(S, ctx, it, cur);
      if (it.kind === 'time') {
        h += `<div class="item"><div class="t">${esc(it.t)} ${stk} <span class="tval" id="tVal">${s.T === null ? '' : fmt1(s.T) + 'T → ' + Math.round(tMark(s.T, V) * 100) + '%'}</span>${it.h ? `<small>${esc(it.h)}</small>` : ''}</div>
          <div class="marks"><button type="button" class="mk na" data-mark="${esc(it.id)}" data-val="${mk === 'na' ? '' : 'na'}" aria-pressed="${mk === 'na'}" aria-label="오늘 해당 없음">–</button></div></div>`;
        if (mk !== 'na') {
          const lvBtns = (b) => `<div class="lv" role="group" aria-label="집중도">${[['o', '온전히'], ['t', '보통'], ['x', '미흡']].map(([k, l]) => `<button type="button" class="lvb lv-${k}" data-mark="blk:${esc(b.id)}" data-val="${k}" aria-pressed="${d.b[b.id] === k}">${l}</button>`).join('')}</div>`;
          if (cats) {
            const st = stepOf(V), anyIn = filled(d.bs) || filled(d.b);
            const src = anyIn ? null : lastSameType(S.data.days, cur, d.type);
            const tname = (DAYTYPES.find(([k]) => k === d.type) || [, '같은 유형'])[1];
            h += `<p class="note" style="margin:6px 0 0">카테고리 칩을 누를 때마다 ${st === 1 ? '1T(30분)' : '0.5T(15분)'}씩 더합니다. 잘못 누른 칩은 길게 누르면 0이 됩니다. 칩을 안 쓴 블록은 온전히 = 전부, 보통 = 절반, 미흡 = 0으로 셉니다. 한 일은 적고 싶을 때만(선택).</p>
            ${src ? `<div class="chips"><button type="button" class="chip" data-bsfill="${esc(src)}">지난 ${esc(tname)}${josaGwa(tname)} 같게 채우기</button><span class="note">카테고리와 T 복사 (${+src.slice(5, 7)}/${+src.slice(8)})</span></div>` : ''}
            <div class="blocks">${V.blocks.map((b) => {
              const has = hasBs(d, b.id), now = blkNow(d, b), rest = b.t - now;
              const btns = has
                ? `<div class="lv" role="group" aria-label="빠른 입력"><button type="button" class="lvb lv-rest" data-bsrest="${esc(b.id)}"${rest > 1e-9 ? '' : ' disabled'}>남은 T 채우기</button><button type="button" class="lvb lv-clr" data-bsclr="${esc(b.id)}">지우기</button></div>`
                : lvBtns(b);
              return `<div class="blk wc"><div class="h">${esc(b.h)}<small>${fmt1(b.t)}T · ${esc(b.n)}</small><small class="bsum">합계 ${fmtH(now)} / ${fmtH(b.t)}T</small><small class="bsmsg" data-bsmsg="${esc(b.id)}" role="status"></small></div>${btns}
              ${catChips(V, d, b)}
              <input class="in" data-btext="${esc(b.id)}" placeholder="한 일 (선택)${b.ex ? ' · 예: ' + esc(b.ex) : ''}" value="${esc((d.bt || {})[b.id] || '')}" aria-label="${esc(b.h)} 한 일 (선택)"></div>`;
            }).join('')}</div>`;
          } else {
          h += `<p class="note" style="margin:6px 0 0">시간대마다 한 일을 적고 집중도를 고르세요. 온전히 = 전부, 보통 = 절반, 미흡 = 0으로 셉니다.</p>
          <div class="blocks">${V.blocks.map((b) => `<div class="blk"><div class="h">${esc(b.h)}<small>${fmt1(b.t)}T · ${esc(b.n)}</small></div>
            <input class="in" data-btext="${esc(b.id)}" placeholder="${esc(b.ex || '한 일')}" value="${esc((d.bt || {})[b.id] || '')}" aria-label="${esc(b.h)} 한 일">
            ${lvBtns(b)}</div>`).join('')}</div>`;
          }
          h += `
          <div class="row2"><label class="f">블록 합계 보정 (± T)<input class="in" type="number" step="0.5" inputmode="decimal" data-field="tAdj" value="${esc(d.tAdj || '')}"></label>
          <label class="f">직접 입력 (T, 블록 무시)<input class="in" type="number" step="0.5" min="0" inputmode="decimal" data-field="tOverride" value="${esc(d.tOverride ?? '')}"></label></div>`;
        }
      } else {
        const sub = it.kind === 'a1' ? `<small id="a1Line">${a1Text(d, it)}</small>`
          : it.kind === 'combo' ? `<small class="combo">오늘 최장 ${fmtH(comboMax(d))}콤보${it.h ? ' · ' + esc(it.h) : ''}</small>`
          : it.h ? `<small>${esc(it.h)}</small>` : '';
        const au = d.auto && d.auto[it.id] ? d.auto[it.id].val : null;
        h += `<div class="item"><div class="t">${esc(it.t)} ${stk}${sub}</div>${markBtns(esc(it.id), mk, true, au)}</div>`;
      }
    }
    h += '</section>';
  }
  const vio = V.passive.reduce((a, g) => a + g.rules.filter((r) => d.p[r.id]).length, 0);
  h += `<details class="pass"${vio ? ' open' : ''}><summary><h3 style="margin:0">Passive</h3><span class="note">기본은 모두 ○. 어긴 것만 누르세요 (△ −${pen.t}, ✕ −${pen.x}) · 위반 ${vio}건</span></summary>`;
  for (const g of V.passive) {
    h += `<div class="vh" style="margin-top:6px"><h2 style="font-size:17px">${esc(g.name)}</h2><span class="meta">${[g.sub, g.model].filter(Boolean).map(esc).join(' · ')}</span></div>`;
    for (const r of g.rules) {
      const k = d.p[r.id] || 'o';
      h += `<div class="item"><div class="t">${esc(r.t)}</div><div class="marks">${[['o', '○', '', '지킴'], ['t', '△', 'half', '조금 어김'], ['x', '✕', 'zero', '어김']].map(([v, l, c, al]) => `<button type="button" class="mk ${c}" data-pass="${esc(r.id)}" data-val="${v}" aria-pressed="${k === v}" aria-label="${al}">${l}</button>`).join('')}</div></div>`;
      if (k !== 'o') h += `<input class="in pmemo" data-pm="${esc(r.id)}" placeholder="메모 (선택) · 무슨 일이었나" value="${esc((d.pm || {})[r.id] || '')}" aria-label="${esc(r.t)} 메모">`;
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
  const a1it = V.virtues.flatMap((v) => v.items).find((i) => i.kind === 'a1');
  const a1e = document.getElementById('a1Line'); if (a1e && a1it) a1e.innerHTML = a1Text(d, a1it);
  set('tTxt', s.T === null ? '미입력' : fmt1(s.T) + 'T');
  set('tVal', s.T === null ? '' : fmt1(s.T) + 'T → ' + Math.round(tMark(s.T, V) * 100) + '%');
  for (const v of V.virtues) { const e = document.querySelector(`[data-vs="${CSS.escape(v.id)}"]`); if (e) e.textContent = fmt1(s.per[v.id].r) + ' / ' + fmt1(s.per[v.id].m); }
}

export function click(t, ctx) {
  const { S } = ctx, ds = t.dataset;
  if (ds.gotab) { ctx.go(ds.gotab); return; }
  if (ds.gobackup) { ctx.go('setup'); setTimeout(() => document.getElementById('dataSec')?.scrollIntoView(), 0); return; }
  if (ds.nav !== undefined) { ctx.flushAll(); S.creedOpen = null; S.cur = ds.nav === '0' ? ctx.today() : addDays(S.cur, +ds.nav); ctx.render(); return; }
  if (ds.creed === 'read') { S.creedOpen = null; ctx.editDay((d) => { d.creedAt = new Date().toISOString(); }); window.scrollTo(0, 0); return; }
  if (ds.creed === 'open') { S.creedOpen = S.cur; ctx.render(); return; }
  if (ds.creed === 'close') { S.creedOpen = null; ctx.render(); return; }
  if (ds.type) { ctx.editDay((d) => { d.type = ds.type; }); return; }
  if (ds.mark !== undefined) {
    const id = ds.mark, val = ds.val;
    ctx.editDay((d) => {
      if (id.startsWith('blk:')) { const b = id.slice(4); if (d.b[b] === val) delete d.b[b]; else d.b[b] = val; }
      else if (!val || d.m[id] === val) delete d.m[id]; else d.m[id] = val;
    });
    return;
  }
  if (ds.pass) { ctx.editDay((d) => { if (ds.val === 'o') { delete d.p[ds.pass]; if (d.pm) delete d.pm[ds.pass]; } else d.p[ds.pass] = ds.val; }); return; }
  if (ds.retag === 'ask') { S.retagAsk = S.cur; ctx.render(); return; }
  if (ds.retag === 'no') { S.retagAsk = null; ctx.render(); return; }
  if (ds.retag === 'yes') {
    S.retagAsk = null;
    const id = ctx.curId();
    ctx.editDay((d) => { d.v = id; applyAuto(d, ctx.curV()); });
    ctx.setStatus && ctx.setStatus('이 날을 지금 기준으로 바꿨습니다');
    return;
  }
  if (ds.bs !== undefined && ds.cat !== undefined) {
    // 길게 누른 뒤 손을 뗄 때 오는 누름은 무시
    if (S.lpIgnore && Date.now() < S.lpIgnore) { S.lpIgnore = 0; return; }
    S.lpIgnore = 0;
    const d0 = ctx.getDay(S.cur), { V } = ctx.verOfDay(d0), b = V.blocks.find((x) => x.id === ds.bs); if (!b) return;
    const st = stepOf(V), o = (d0.bs || {})[b.id] || {};
    if (bsSum(o) + st > b.t + 1e-9) { capMsg(b); return; }
    ctx.editDay((d) => {
      d.bs = { ...(d.bs || {}) };
      const x = { ...(d.bs[b.id] || {}) }, v = +x[ds.cat] || 0;
      delete x[ds.cat]; x[ds.cat] = v + st; // 마지막으로 누른 카테고리를 맨 뒤로(남은 T 채우기 대상)
      d.bs[b.id] = x; if (d.b) delete d.b[b.id];
      applyAuto(d, V);
    });
    return;
  }
  if (ds.bsrest) {
    ctx.editDay((d) => {
      const { V } = ctx.verOfDay(d), b = V.blocks.find((x) => x.id === ds.bsrest);
      if (!b || !hasBs(d, b.id)) return;
      const x = { ...d.bs[b.id] }, rest = b.t - bsSum(x), last = Object.keys(x).pop();
      if (!(rest > 1e-9)) return;
      const v = +x[last] || 0; delete x[last]; x[last] = v + rest;
      d.bs = { ...d.bs, [b.id]: x };
      applyAuto(d, V);
    });
    return;
  }
  if (ds.bsclr) { ctx.editDay((d) => { clearCat(d, ds.bsclr, null); applyAuto(d, ctx.verOfDay(d).V); }); return; }
  if (ds.bsfill) {
    const src = S.data.days[ds.bsfill]; if (!src || !src.bs) return;
    ctx.editDay((d) => {
      const { V } = ctx.verOfDay(d); d.bs = {};
      for (const b of V.blocks) if (hasBs(src, b.id)) { d.bs[b.id] = { ...src.bs[b.id] }; if (d.b) delete d.b[b.id]; }
      if (!filled(d.bs)) delete d.bs;
      applyAuto(d, V);
    });
    return;
  }
  if (ds.drink) { ctx.editDay((d) => { const v = ds.drink === 'yes'; d.drink = d.drink === v ? null : v; }); }
}

export function input(el, ctx) {
  if (el.dataset.a1) {
    const v = el.value;
    ctx.editDay((d) => { if (v.trim()) d.a1 = v; else delete d.a1; }, false);
  } else if (el.dataset.pm) {
    const id = el.dataset.pm, v = el.value;
    ctx.editDay((d) => { d.pm = d.pm || {}; if (v.trim()) d.pm[id] = v; else delete d.pm[id]; }, false);
  } else if (el.dataset.btext) {
    const id = el.dataset.btext, v = el.value;
    ctx.editDay((d) => { d.bt = d.bt || {}; if (v) d.bt[id] = v; else delete d.bt[id]; }, false);
  } else if (el.dataset.field) {
    const f = el.dataset.field, raw = el.value;
    const num = ['kcal', 'steps', 'weight', 'tAdj', 'tOverride'].includes(f);
    if (num && raw !== '' && !Number.isFinite(+raw)) return;
    ctx.editDay((d) => { d[f] = num ? (raw === '' ? (f === 'tAdj' ? 0 : null) : +raw) : raw; }, false);
  }
}

// ---------- v1.7: 칩 길게 누르기(0.5초) = 그 칩 0T ----------
// cat이 null이면 블록 전체를 지운다
function clearCat(d, bid, cat) {
  if (!d.bs || !d.bs[bid]) return;
  const x = { ...d.bs[bid] };
  if (cat === null) for (const k of Object.keys(x)) delete x[k]; else delete x[cat];
  d.bs = { ...d.bs };
  if (Object.keys(x).length) d.bs[bid] = x; else delete d.bs[bid];
  if (!Object.keys(d.bs).length) delete d.bs;
}
function capMsg(b) {
  const e = document.querySelector(`[data-bsmsg="${CSS.escape(b.id)}"]`); if (!e) return;
  e.textContent = `이 블록은 ${fmtH(b.t)}T까지입니다`;
  clearTimeout(e._t); e._t = setTimeout(() => { e.textContent = ''; }, 2000);
}
export const LONG_MS = 500;
let lp = null;
function lpCancel() { if (lp) { clearTimeout(lp.timer); lp = null; } }
export function pointerdown(e, ctx) {
  const t = e.target && e.target.closest ? e.target.closest('button[data-bs][data-cat]') : null;
  lpCancel();
  if (!t || (e.button !== undefined && e.button > 0)) return;
  const bid = t.dataset.bs, cat = t.dataset.cat;
  lp = { x: e.clientX, y: e.clientY, fired: false, timer: setTimeout(() => {
    lp.fired = true; ctx.S.lpIgnore = Infinity;
    ctx.editDay((d) => { clearCat(d, bid, cat); applyAuto(d, ctx.verOfDay(d).V); });
  }, LONG_MS) };
}
export function pointermove(e) { if (lp && !lp.fired && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) lpCancel(); }
export function pointerup(e, ctx) {
  if (!lp) return;
  const fired = lp.fired; lpCancel();
  if (fired) ctx.S.lpIgnore = Date.now() + 700;
}
export function contextmenu(e) { if (e.target && e.target.closest && e.target.closest('button[data-cat]')) e.preventDefault(); }
