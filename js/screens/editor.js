// 설정 모드: 현재 버전의 사본(초안)을 고쳐 새 버전으로 저장한다
import { validateVersion, editorSums, finalizeVersion, uniqueId } from '../versions.js';
import { scoreSnapshot } from '../scoring.js';
import { esc, fmt1, fmt2, clone, versionIdAt } from '../format.js';

const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isIdx = (k) => /^\d+$/.test(k);
function getPath(o, p) { return p === '' ? o : p.split('.').reduce((a, k) => (a == null ? a : a[isIdx(k) ? +k : k]), o); }
function setPath(o, p, val) { const ks = p.split('.'); const last = ks.pop(); const t = getPath(o, ks.join('.')); if (t != null) t[isIdx(last) ? +last : last] = val; }

export function enter(ctx, resume = false) {
  const { S } = ctx;
  S.mode = 'edit'; S.edOpen = new Set(); S.edErrs = null; S.edMsg = ''; S.cancelAsk = false; S.applyToday = true;
  if (S.data.settings.draft && !resume) { S.draft = null; S.draftPrompt = true; }
  else if (S.data.settings.draft) { S.draft = clone(S.data.settings.draft); S.draftPrompt = false; }
  else { S.draft = clone(ctx.curV()); S.draft.from = ctx.curId(); S.draftPrompt = false; ctx.queue('draft', 'x', 0); }
  ctx.render(); window.scrollTo(0, 0);
}

function sumsHTML(V) {
  const s = editorSums(V);
  return `배점 합계 <b>${fmt1(s.pts)}</b>점 · 블록 T 합계 <b>${fmt1(s.blockT)}</b>T${s.warn.length ? ` · <span class="w">가중치 합이 1이 아닌 덕목 ${s.warn.length}개</span>` : ' · 가중치 합 모두 1'}`;
}

const inp = (path, val, { label, num, ph, step, cls = 'f' } = {}) =>
  `<label class="${cls}">${label}<input class="in" data-ed="${path}"${num ? ` type="number" step="${step || 'any'}" inputmode="decimal" data-num` : ''} value="${esc(val ?? '')}"${ph ? ` placeholder="${esc(ph)}"` : ''}></label>`;
const ctl = (path, i, n, { del = true, delLabel = '삭제' } = {}) =>
  `<button type="button" class="iconbtn" data-act="up" data-path="${path}" aria-label="위로"${i === 0 ? ' disabled' : ''}>▲</button><button type="button" class="iconbtn" data-act="down" data-path="${path}" aria-label="아래로"${i === n - 1 ? ' disabled' : ''}>▼</button>${del ? `<button type="button" class="iconbtn" data-act="del" data-path="${path}" aria-label="${delLabel}">✕</button>` : ''}`;

// 접기: 펼친 것의 id를 설정 모드에 머무는 동안 기억한다(순서를 바꿔도 유지)
function openSet(S) { if (!S.edOpen) S.edOpen = new Set(); return S.edOpen; }
const fold = (key, open, label) => `<button type="button" class="fold" data-fold="${esc(key)}" aria-expanded="${open}"><span class="fi" aria-hidden="true">${open ? '▾' : '▸'}</span><span class="fl">${label}</span></button>`;
function foldInfo(v, ws) {
  const bad = Math.abs(ws - 1) > 0.001;
  return `${fmt1(+v.pts || 0)}점 · 항목 ${v.items.length}개 · ${bad ? `<span class="err">가중치 합 ${fmt2(ws)}</span>` : '가중치 합 1'}`;
}
// 검사 문제가 있는 곳의 접기 열쇠
function keysForErrors(V, errs) {
  const keys = new Set();
  for (const e of errs) {
    const p = e.path.split('.');
    if (p[0] === 'virtues' && p[1] !== undefined && V.virtues[+p[1]]) keys.add(V.virtues[+p[1]].id);
    else if (p[0] === 'blocks') keys.add('blocks');
    else if (p[0] === 'tScale') keys.add('scale');
    else if (p[0] === 'passive' && p[1] !== undefined && V.passive[+p[1]]) keys.add(V.passive[+p[1]].id);
    else if (p[0] === 'time') { const t = V.virtues.filter((v) => v.items.some((i) => i.kind === 'time')); (t.length ? t : V.virtues).forEach((v) => keys.add(v.id)); }
  }
  return keys;
}

export function render(ctx) {
  const { S } = ctx;
  if (S.draftPrompt) {
    return `<div class="banner">고치던 초안이 있습니다. <button type="button" class="chip" data-draft="resume">이어서</button><button type="button" class="chip" data-draft="discard">버리기</button></div>`;
  }
  const V = S.draft;
  let h = `<div class="sums" id="edSums">${sumsHTML(V)}</div>
  <div class="banner">설정 모드입니다. 고친 내용은 초안으로 자동 보관됩니다. [새 버전으로 저장]을 누르면 새 버전이 만들어지고 오늘(${esc(ctx.today())})부터 새 기준으로 채점됩니다. 지난 기록은 당시 기준을 유지합니다. 하루 점수는 100점으로 환산되므로 배점 합이 100일 필요는 없습니다.</div>`;
  if (S.edErrs && S.edErrs.length) h += `<div class="errs" role="alert"><b>저장하지 않았습니다. 고칠 곳:</b><ul>${S.edErrs.map((e) => `<li>${esc(e.msg)}</li>`).join('')}</ul></div>`;
  h += inp('name', V.name, { label: '버전 이름' });
  h += `<p class="note">바탕 버전: ${esc(V.from || '없음')}</p><h3>덕목과 세부 실천 항목</h3>`;
  const vn = V.virtues.length;
  const op = openSet(S);
  V.virtues.forEach((v, vi) => {
    const ws = v.items.reduce((a, i) => a + (+i.w || 0), 0);
    const isOpen = op.has(v.id);
    h += `<section class="v ed">${fold(v.id, isOpen, `<b id="vn${vi}">${esc(v.name || vi + 1 + '번째 덕목')}</b> <span class="note" id="vs${vi}">${foldInfo(v, ws)}</span>`)}`;
    if (isOpen) {
      h += `<div class="row4">
      ${inp(`virtues.${vi}.name`, v.name, { label: '덕목' })}
      ${inp(`virtues.${vi}.short`, v.short, { label: '짧은 이름', ph: '인장·막대용' })}
      ${inp(`virtues.${vi}.sub`, v.sub, { label: '부제' })}
      ${inp(`virtues.${vi}.model`, v.model, { label: '모델 인물' })}
      ${inp(`virtues.${vi}.pts`, v.pts, { label: '배점', num: true, step: '1' })}</div>
      <div class="edctl"><span class="note">덕목 순서·삭제</span>${ctl(`virtues.${vi}`, vi, vn, { delLabel: '덕목 삭제' })}</div>`;
      v.items.forEach((it, ii) => {
        h += `<div class="edrow">${inp(`virtues.${vi}.items.${ii}.t`, it.t, { label: it.kind === 'time' ? '유효시간 항목 문구' : '세부 실천 항목' })}
        ${inp(`virtues.${vi}.items.${ii}.h`, it.h, { label: '설명 (선택)' })}
        ${inp(`virtues.${vi}.items.${ii}.w`, it.w, { label: '가중치', num: true, step: '0.05', cls: 'f wcell' })}</div>
        <div class="edctl">${it.kind === 'time' ? '<span class="tag">유효시간 · 삭제 불가</span>' : ''}${ctl(`virtues.${vi}.items.${ii}`, ii, v.items.length, { del: it.kind !== 'time', delLabel: '항목 삭제' })}
        ${vn > 1 ? `<select class="in" data-moveitem="${vi}.${ii}" aria-label="다른 덕목으로 옮기기"><option value="">옮기기…</option>${V.virtues.map((o, oi) => (oi === vi ? '' : `<option value="${oi}">→ ${esc(o.name || oi + 1 + '번째 덕목')}</option>`)).join('')}</select>` : ''}</div>`;
      });
      h += `<div class="chips"><span class="note${Math.abs(ws - 1) > 0.001 ? ' err' : ''}" id="ws${vi}">가중치 합 ${fmt2(ws)}${Math.abs(ws - 1) > 0.001 ? ' · 1이 아님' : ''}</span>
      <button type="button" class="chip" data-norm="${vi}">합 1로 맞추기</button><button type="button" class="chip" data-add="item" data-vi="${vi}">+ 세부 항목</button></div>`;
    }
    h += '</section>';
  });
  h += '<div class="chips"><button type="button" class="chip" data-add="virtue">+ 덕목 추가</button></div>';

  const bT = V.blocks.reduce((a, b) => a + (+b.t || 0), 0);
  h += `<section class="v ed">${fold('blocks', op.has('blocks'), `<b>유효시간 블록</b> <span class="note" id="blkInfo">${V.blocks.length}개 · 합계 ${fmt1(bT)}T</span>`)}`;
  if (op.has('blocks')) {
    h += '<p class="note">이름은 블록 옆에, 예시 활동은 "한 일" 칸의 안내 글로 보입니다.</p>';
    V.blocks.forEach((b, bi) => {
      h += `<div class="edrow blkrow">${inp(`blocks.${bi}.h`, b.h, { label: '시간대', ph: '06:00–09:00' })}${inp(`blocks.${bi}.n`, b.n, { label: '이름' })}${inp(`blocks.${bi}.ex`, b.ex, { label: '예시 활동' })}${inp(`blocks.${bi}.t`, b.t, { label: 'T', num: true, step: '0.5', cls: 'f wcell' })}</div>
      <div class="edctl">${ctl(`blocks.${bi}`, bi, V.blocks.length, { delLabel: '블록 삭제' })}</div>`;
    });
    h += '<div class="chips"><button type="button" class="chip" data-add="block">+ 시간 블록</button></div>';
  }
  h += '</section>';

  h += `<section class="v ed">${fold('scale', op.has('scale'), `<b>T 구간표</b> <span class="note">${V.tScale.length}줄</span>`)}`;
  if (op.has('scale')) {
    h += '<p class="note">T가 기준 이상인 첫 줄의 비율을 씁니다. 저장할 때 기준이 큰 순으로 정렬합니다. 비율은 0~1 (0.8 = 80%).</p>';
    V.tScale.forEach((r, ri) => {
      h += `<div class="edrow sc">${inp(`tScale.${ri}.0`, r[0], { label: '기준 T 이상', num: true, step: '0.5' })}${inp(`tScale.${ri}.1`, r[1], { label: '비율', num: true, step: '0.05' })}<button type="button" class="iconbtn" data-act="del" data-path="tScale.${ri}" aria-label="구간 줄 삭제">✕</button></div>`;
    });
    h += '<div class="chips"><button type="button" class="chip" data-add="scale">+ 구간 줄</button></div>';
  }
  h += '</section>';

  h += `<h3>Passive</h3><div class="row4 g2">${inp('pen.t', V.pen.t, { label: '△ 감점', num: true, step: '0.5' })}${inp('pen.x', V.pen.x, { label: '✕ 감점', num: true, step: '0.5' })}</div>`;
  V.passive.forEach((g, gi) => {
    const isOpen = op.has(g.id);
    h += `<section class="v ed">${fold(g.id, isOpen, `<b>${esc(g.name || gi + 1 + '번째 묶음')}</b> <span class="note">규칙 ${g.rules.length}개</span>`)}`;
    if (isOpen) {
      h += `<div class="row4 g2">${inp(`passive.${gi}.name`, g.name, { label: '묶음 이름' })}${inp(`passive.${gi}.sub`, g.sub, { label: '부제' })}</div>
      <div class="edctl"><span class="note">묶음 순서·삭제</span>${ctl(`passive.${gi}`, gi, V.passive.length, { delLabel: '묶음 삭제' })}</div>`;
      g.rules.forEach((r, ri) => {
        h += `<div class="edrow rule">${inp(`passive.${gi}.rules.${ri}.t`, r.t, { label: `규칙 ${ri + 1}` })}</div><div class="edctl">${ctl(`passive.${gi}.rules.${ri}`, ri, g.rules.length, { delLabel: '규칙 삭제' })}</div>`;
      });
      h += `<div class="chips"><button type="button" class="chip" data-add="rule" data-gi="${gi}">+ 규칙</button></div>`;
    }
    h += '</section>';
  });
  h += '<div class="chips"><button type="button" class="chip" data-add="group">+ 묶음 추가</button></div>';

  h += `<label class="ckrow"><input type="checkbox" id="applyToday"${S.applyToday !== false ? ' checked' : ''}> 오늘 기록도 새 기준으로 다시 채점</label>
  <div class="chips"><button type="button" class="btn" data-ed-save="1">새 버전으로 저장</button><button type="button" class="btn ghost" data-ed-cancel="1">취소</button></div>`;
  if (S.cancelAsk) h += `<div class="ask">고친 초안을 버릴까요? <button type="button" class="chip" data-ed-discard="1">버리기</button><button type="button" class="chip" data-ed-keep="1">계속 고치기</button></div>`;
  if (S.edMsg) h += `<p class="note" role="status">${S.edMsg}</p>`;
  return h;
}

// 그린 뒤 잘못된 칸 표시
export function markErrors(S) {
  if (!S.edErrs) return;
  let first = null;
  for (const e of S.edErrs) { const el = document.querySelector(`[data-ed="${e.path}"]`); if (el) { el.setAttribute('aria-invalid', 'true'); if (!first) first = el; } }
  if (S.edScroll) { S.edScroll = false; if (first) { first.scrollIntoView({ block: 'center' }); first.focus({ preventScroll: true }); } else window.scrollTo(0, 0); }
}

function updateSums(S) {
  const e = document.getElementById('edSums'); if (e) e.innerHTML = sumsHTML(S.draft);
  S.draft.virtues.forEach((v, vi) => {
    const ws = v.items.reduce((a, i) => a + (+i.w || 0), 0); const x = document.getElementById('ws' + vi);
    if (x) { x.textContent = '가중치 합 ' + fmt2(ws) + (Math.abs(ws - 1) > 0.001 ? ' · 1이 아님' : ''); x.classList.toggle('err', Math.abs(ws - 1) > 0.001); }
    const vs = document.getElementById('vs' + vi); if (vs) vs.innerHTML = foldInfo(v, ws);
    const vn = document.getElementById('vn' + vi); if (vn) vn.textContent = v.name || vi + 1 + '번째 덕목';
  });
  const bi = document.getElementById('blkInfo');
  if (bi) bi.textContent = `${S.draft.blocks.length}개 · 합계 ${fmt1(S.draft.blocks.reduce((a, b) => a + (+b.t || 0), 0))}T`;
}

function changed(ctx, rerender = true) { ctx.queue('draft', 'x', 600); if (rerender) { ctx.render(); markErrors(ctx.S); } }

async function save(ctx) {
  const { S } = ctx;
  const errs = validateVersion(S.draft);
  S.edErrs = errs;
  if (errs.length) { S.edMsg = ''; for (const k of keysForErrors(S.draft, errs)) openSet(S).add(k); S.edScroll = true; ctx.render(); return; }
  const now = new Date();
  const id = uniqueId(versionIdAt(now), S.data.versions, () => versionIdAt(now));
  const V = finalizeVersion(S.draft, { id, created: now.toISOString(), from: S.draft.from || ctx.curId() });
  delete V.draftOf;
  let retag = null;
  const t = ctx.today();
  if (S.applyToday !== false && S.data.days[t]) { retag = clone(S.data.days[t]); retag.v = id; retag.score = scoreSnapshot(retag, V); retag.at = now.toISOString(); }
  S.edMsg = '저장 중…'; ctx.render();
  try { await ctx.repo.addVersion(V, { makeCurrent: true, retagDay: retag }); }
  catch (e) { S.edMsg = '저장 실패 · ' + esc(e.message || e); ctx.render(); return; }
  await ctx.reload();
  S.mode = 'run'; S.draft = null; S.edErrs = null; S.edMsg = '';
  ctx.setStatus('새 버전 저장됨 · ' + V.name);
  ctx.render(); window.scrollTo(0, 0);
}

function discard(ctx) {
  const { S } = ctx;
  S.draft = null; S.mode = 'run'; S.cancelAsk = false; S.edErrs = null;
  ctx.repo.saveDraft(null).then(ctx.reload).then(() => { ctx.setStatus('초안을 버렸습니다'); ctx.render(); });
}

export function click(t, ctx) {
  const { S } = ctx, ds = t.dataset;
  if (ds.draft === 'resume') { enter(ctx, true); return; }
  if (ds.draft === 'discard') { discard(ctx); return; }
  const V = S.draft; if (!V) return;
  if (ds.fold) { const o = openSet(S); if (o.has(ds.fold)) o.delete(ds.fold); else o.add(ds.fold); ctx.render(); markErrors(S); return; }
  if (ds.act) {
    const ks = ds.path.split('.'); const i = +ks.pop(); const arr = getPath(V, ks.join('.'));
    if (!Array.isArray(arr)) return;
    if (ds.act === 'up' && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    else if (ds.act === 'down' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
    else if (ds.act === 'del') {
      const item = arr[i];
      if (ks.join('.') === 'virtues' && item.items.some((x) => x.kind === 'time')) { S.edMsg = '유효시간 항목이 있는 덕목은 지울 수 없습니다. 유효시간 항목을 먼저 다른 덕목으로 옮기세요.'; ctx.render(); return; }
      if (item && item.kind === 'time') return;
      arr.splice(i, 1);
    }
    S.edMsg = ''; changed(ctx); return;
  }
  if (ds.add) {
    if (ds.add === 'item') V.virtues[+ds.vi].items.push({ id: newId('i'), t: '', h: '', w: 0 });
    else if (ds.add === 'virtue') { const id = newId('v'); V.virtues.push({ id, name: '새 덕목', short: '', sub: '', model: '', pts: 5, items: [{ id: newId('i'), t: '', h: '', w: 1 }] }); openSet(S).add(id); }
    else if (ds.add === 'block') V.blocks.push({ id: newId('b'), h: '', n: '', ex: '', t: 1 });
    else if (ds.add === 'scale') V.tScale.push(['', '']);
    else if (ds.add === 'group') { const id = newId('p'); V.passive.push({ id, name: '새 묶음', sub: '', rules: [{ id: newId('p'), t: '' }] }); openSet(S).add(id); }
    else if (ds.add === 'rule') V.passive[+ds.gi].rules.push({ id: newId('p'), t: '' });
    changed(ctx); return;
  }
  if (ds.norm !== undefined) {
    const v = V.virtues[+ds.norm]; const s = v.items.reduce((a, i) => a + (+i.w || 0), 0);
    if (s > 0) v.items.forEach((i) => { i.w = Math.round((+i.w || 0) / s * 1000) / 1000; });
    else v.items.forEach((i) => { i.w = Math.round(1000 / v.items.length) / 1000; });
    changed(ctx); return;
  }
  if (ds.edSave) { save(ctx); return; }
  if (ds.edCancel) { S.cancelAsk = true; ctx.render(); markErrors(S); return; }
  if (ds.edKeep) { S.cancelAsk = false; ctx.render(); markErrors(S); return; }
  if (ds.edDiscard) { discard(ctx); }
}

export function input(el, ctx) {
  const { S } = ctx;
  if (el.dataset.ed === undefined || !S.draft) return;
  setPath(S.draft, el.dataset.ed, el.dataset.num !== undefined ? (el.value === '' ? '' : +el.value) : el.value);
  el.removeAttribute('aria-invalid');
  updateSums(S);
  changed(ctx, false);
}

export function change(el, ctx) {
  const { S } = ctx;
  if (el.id === 'applyToday') { S.applyToday = el.checked; return; }
  if (el.dataset.moveitem && el.value !== '') {
    const [vi, ii] = el.dataset.moveitem.split('.').map(Number); const to = +el.value;
    const [it] = S.draft.virtues[vi].items.splice(ii, 1);
    S.draft.virtues[to].items.push(it);
    S.edMsg = `"${esc(it.t || '항목')}"을(를) ${esc(S.draft.virtues[to].name)}(으)로 옮겼습니다.`;
    changed(ctx);
  }
}
