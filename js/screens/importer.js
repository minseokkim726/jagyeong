// 가져오기(사명서 버전 · 백업 · 아티팩트 기록) 공용 패널
// S.imp = { where, open, paste, msg, err, plan, read, ask } — where: 'welcome' | 'version' | 'data'
import { readImport, normalizeVersion, validateVersion, uniqueId } from '../versions.js';
import { esc, versionIdAt } from '../format.js';

export function open(ctx, where, paste = false) { ctx.S.imp = { where, open: true, paste, msg: '', err: false, plan: null, read: null, ask: null }; ctx.render(); }
const close = (ctx) => { ctx.S.imp = null; ctx.render(); };

// 패널 HTML (where가 맞을 때만)
export function panel(ctx, where, { buttons = true } = {}) {
  const I = ctx.S.imp;
  if (!I || I.where !== where) return '';
  if (!buttons && !I.paste && !I.msg && !I.plan && !I.ask) return '';
  let h = '<div class="imp" role="region" aria-label="가져오기">';
  if (I.ask) {
    h += `<p>${esc(I.ask.text)}</p><div class="chips"><button type="button" class="btn" data-imp="useyes">예, 지금부터 사용</button><button type="button" class="btn ghost" data-imp="useno">아니요</button></div>`;
  } else if (I.plan) {
    const p = I.plan.preview;
    h += `<p><b>가져오기 미리보기</b></p><ul class="pv"><li>기록 ${p.days}일 (새 날짜 ${p.newDays}일, 겹치는 날짜 ${p.overlap}일${p.overlap ? ` 중 더 최근 것으로 바뀌는 날 ${p.replaced}일` : ''})</li><li>사명서 버전 ${p.versions}개 (새로 들어가는 것 ${p.newVersions}개)</li></ul>`;
    if (I.plan.missing.length) h += `<p class="err">정의가 없는 버전을 쓰는 기록이 있습니다(${I.plan.missing.map(esc).join(', ')}). 현재 버전으로 채점되고 "버전 정의 없음"으로 표시됩니다.</p>`;
    h += '<p class="note">같은 날짜는 더 나중에 저장된 쪽을 남기고, 같은 이름(id)의 버전은 이미 있는 것을 그대로 둡니다.</p>';
    h += '<div class="chips"><button type="button" class="btn" data-imp="apply">합치기</button><button type="button" class="btn ghost" data-imp="close">취소</button></div>';
  } else {
    if (buttons) h += `<div class="chips"><label class="btn ghost filebtn">파일 고르기<input type="file" accept=".json,application/json,text/plain" data-impfile="1"></label><button type="button" class="btn ghost" data-imp="paste" aria-pressed="${!!I.paste}">붙여넣기</button><button type="button" class="btn ghost" data-imp="close">닫기</button></div>`;
    if (I.paste) h += `<label class="f">JSON 내용을 붙여넣으세요<textarea class="in" id="impText" rows="6" spellcheck="false"></textarea></label><div class="chips"><button type="button" class="btn" data-imp="read">읽기</button></div>`;
  }
  if (I.msg) h += `<p class="${I.err ? 'err' : 'note'}" role="status">${I.msg}</p>`;
  return h + '</div>';
}

function fail(ctx, msg) { ctx.S.imp.msg = esc(msg); ctx.S.imp.err = true; ctx.render(); }

async function handleText(ctx, text) {
  const { S } = ctx, I = S.imp;
  const r = readImport(text);
  if (!r.ok) return fail(ctx, r.error);
  if (r.kind === 'version') {
    const V = normalizeVersion(r.version);
    const errs = validateVersion(V);
    if (errs.length) { I.msg = '사명서 정의에 문제가 있어 넣지 않았습니다:<br>' + errs.map((e) => '· ' + esc(e.msg)).join('<br>'); I.err = true; ctx.render(); return; }
    const id = uniqueId(V.id, S.data.versions, () => versionIdAt());
    const renamed = V.id && id !== V.id;
    V.id = id; V.created = V.created || new Date().toISOString(); V.from = V.from ?? null;
    const first = !ctx.curId();
    try { await ctx.repo.addVersion(V, { makeCurrent: first }); } catch (e) { return fail(ctx, '저장하지 못했습니다: ' + (e.message || e)); }
    await ctx.reload();
    if (first) { S.imp = null; ctx.setStatus('사명서를 불러왔습니다 · ' + V.name); S.tab = 'today'; ctx.render(); return; }
    I.ask = { id, text: `"${V.name}" 버전을 넣었습니다${renamed ? `(같은 id가 있어 새 id ${id}로)` : ''}. 바로 현재 버전으로 쓸까요?` };
    I.msg = ''; ctx.render(); return;
  }
  // 백업·아티팩트 기록
  const plan = await ctx.repo.previewImport(r);
  if (r.kind === 'artifact' && plan.missing.length) {
    return fail(ctx, `아티팩트 기록입니다. 기록이 쓰는 사명서 버전(${plan.missing.join(', ')})이 아직 없습니다. 먼저 사명서 정의 파일(seed)을 가져온 뒤 다시 가져오세요.`);
  }
  if (I.where === 'welcome' && r.kind === 'backup' && !Object.keys(r.versions).length) return fail(ctx, '백업 파일에 사명서 버전이 없습니다. 먼저 사명서 정의를 가져오세요.');
  I.plan = plan; I.read = r; I.msg = ''; I.err = false; ctx.render();
}

async function apply(ctx) {
  const { S } = ctx, I = S.imp, r = I.read;
  let setCur = null;
  const after = new Set([...Object.keys(S.data.versions), ...I.plan.put.versions.map((v) => v.id)]);
  if (!ctx.curId() || I.where === 'welcome') setCur = r.current && after.has(r.current) ? r.current : [...after][0] || null;
  try { await ctx.repo.applyImport(I.plan, setCur); } catch (e) { return fail(ctx, '합치지 못했습니다: ' + (e.message || e)); }
  await ctx.reload();
  const msg = setCur ? await ctx.retagToday() : '';
  const p = I.plan.preview;
  S.imp = null;
  if (I.where === 'welcome') S.tab = 'today';
  if (msg) S.dmsg = esc(msg);
  ctx.setStatus(`가져왔습니다 · 기록 ${p.newDays + p.replaced}일 반영, 버전 ${p.newVersions}개 추가${msg ? ' · ' + msg : ''}`);
  ctx.render();
}

// 처리했으면 true
export function click(t, ctx) {
  const a = t.dataset.imp; if (!a || !ctx.S.imp) return false;
  const I = ctx.S.imp;
  if (a === 'close') close(ctx);
  else if (a === 'paste') { I.paste = !I.paste; I.msg = ''; ctx.render(); if (I.paste) document.getElementById('impText')?.focus(); }
  else if (a === 'read') { const v = document.getElementById('impText')?.value || ''; if (!v.trim()) fail(ctx, '붙여넣은 내용이 없습니다.'); else handleText(ctx, v); }
  else if (a === 'apply') return apply(ctx);
  else if (a === 'useyes') {
    return ctx.repo.setCurrent(I.ask.id).then(ctx.reload).then(() => ctx.retagToday()).then((msg) => {
      ctx.S.imp = null; ctx.S.vmsg = msg ? esc(msg) : ''; ctx.setStatus(msg || '현재 버전을 바꿨습니다'); ctx.render();
    });
  }
  else if (a === 'useno') close(ctx);
  return true;
}

export function change(el, ctx) {
  if (!el.dataset.impfile || !el.files || !el.files[0]) return false;
  const f = el.files[0];
  f.text().then((txt) => handleText(ctx, txt), () => fail(ctx, '파일을 읽지 못했습니다.'));
  return true;
}

// 시험용
export const _handleText = handleText;
