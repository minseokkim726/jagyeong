// 설정 화면: 실행 모드(집중 덕목, 기준표, 버전 기록, 데이터) / 설정 모드는 editor.js
import * as imp from './importer.js';
import * as editor from './editor.js';
import { copyText, download, shareOrDownload } from './io.js';
import { canDeleteVersion } from '../versions.js';
import { penOf } from '../scoring.js';
import { esc, fmt1, monday, iso } from '../format.js';
import { focusOf } from './today.js';
import { renderCreed, hasCreed } from '../creed.js';

function modeBar(S) {
  return `<div class="chips" role="group" aria-label="모드"><button type="button" class="chip" data-mode="run" aria-pressed="${S.mode === 'run'}">실행 모드</button><button type="button" class="chip" data-mode="edit" aria-pressed="${S.mode === 'edit'}">설정 모드 · 사명서 고치기</button></div>`;
}

export function render(ctx) {
  const { S } = ctx;
  if (S.mode === 'edit') return modeBar(S) + editor.render(ctx);
  if (S.creedFull && hasCreed(ctx.curV())) {
    const C = ctx.curV().creed;
    return `<section class="creed full" aria-label="사명서 전문"><div class="creedfoot top"><button type="button" class="btn ghost" data-creedfull="close">← 설정으로</button></div>
      <h2 class="ctitle">${esc(C.title || '사명서')}</h2><div class="cbody">${renderCreed(C.text)}</div>
      <div class="creedfoot"><button type="button" class="btn ghost" data-creedfull="close">닫기</button></div></section>`;
  }
  const V = ctx.curV(), cid = ctx.curId(), wk = monday(S.cur), f = focusOf(S, S.cur), tot = V.virtues.reduce((a, v) => a + v.pts, 0), pen = penOf(V);
  const dayList = Object.values(S.data.days);
  let h = modeBar(S);
  if (S.data.settings.draft) h += `<div class="banner">고치던 초안이 있습니다. <button type="button" class="chip" data-draft="resume">이어서</button><button type="button" class="chip" data-draft="discard">버리기</button></div>`;
  if (hasCreed(V)) h += `<div class="chips"><button type="button" class="btn ghost" data-creedfull="open">사명서 전문 보기</button></div>`;
  h += `<h3>이번 주 집중 덕목</h3><p class="note">${esc(wk)} 주간 · 선택한 덕목은 오늘 화면에서 강조되고 추이에서 따로 보입니다. 배점은 바뀌지 않아 점수끼리 비교할 수 있습니다.</p>
  <div class="chips">${V.virtues.map((v) => `<button type="button" class="chip" data-focus="${esc(v.id)}" aria-pressed="${f === v.id}">${esc(v.name)}</button>`).join('')}<button type="button" class="chip" data-focus="" aria-pressed="${!f}">없음</button></div>
  <h3>채점 기준 · ${esc(V.name)}</h3>
  <p class="note">항목 점수 = 덕목 배점 × 가중치 × (○ 1, △ 0.5, ✕ 0). –로 뺀 항목은 받은 점수와 만점 양쪽에서 빠집니다. 입력하지 않은 항목은 0점입니다. 오늘 점수 = 받은 점수 ÷ 만점 × 100 − Passive 감점(△ −${pen.t}, ✕ −${pen.x}), 0 아래는 0. 배점 합계 ${fmt1(tot)}점.</p>
  <div class="scroll"><table><thead><tr><th>덕목</th><th>세부 항목</th><th class="num">가중치</th><th class="num">점수</th></tr></thead><tbody>
  ${V.virtues.map((v) => v.items.map((it, i) => `<tr>${i === 0 ? `<td rowspan="${v.items.length}"><b>${esc(v.name)}</b><br><span class="note">${fmt1(v.pts)}점</span></td>` : ''}<td>${esc(it.t)}${it.kind === 'time' ? ' <span class="note">(유효시간)</span>' : ''}</td><td class="num">${it.w}</td><td class="num">${fmt1(v.pts * it.w)}</td></tr>`).join('')).join('')}
  </tbody></table></div>
  <p class="note">유효시간: ${V.tScale.map(([a, b], i) => (i === V.tScale.length - 1 && a === 0 ? '그 아래' : a + 'T 이상') + ' ' + Math.round(b * 100) + '%').join(' · ')}. 블록은 온전히 전부, 보통 절반, 미흡 0으로 셉니다. 직접 입력한 T가 있으면 블록을 무시하고, 없으면 블록 합계 + 보정입니다.</p>`;

  // 버전 기록
  const vers = Object.values(S.data.versions).sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
  h += `<h3>사명서 버전 기록</h3><p class="note">[이 버전 사용]은 오늘 기록과 앞으로 쓰는 기록에 적용됩니다. 지난 기록은 당시 버전으로 계속 채점됩니다.</p><div class="scroll"><table><thead><tr><th>버전</th><th>만든 날</th></tr></thead><tbody>`;
  for (const v of vers) {
    const del = canDeleteVersion(v.id, cid, dayList);
    const n = dayList.filter((d) => d.v === v.id).length;
    h += `<tr><td><b>${esc(v.name)}</b>${v.id === cid ? ' <span class="note">· 사용 중</span>' : ''}<br><span class="note">${esc(v.id)} · 기록 ${n}일${v.from ? ' · 바탕 ' + esc(v.from) : ''}</span>
      <div class="vrow">${v.id === cid ? '' : `<button type="button" class="chip" data-usever="${esc(v.id)}">이 버전 사용</button>`}<button type="button" class="chip" data-expver="${esc(v.id)}">내보내기</button>${del.ok ? `<button type="button" class="chip" data-delver="${esc(v.id)}">삭제</button>` : `<span class="note">삭제 불가: ${esc(del.why)}</span>`}</div>
      ${S.delAsk === v.id ? `<div class="ask">이 버전을 지울까요? 되돌릴 수 없습니다. <button type="button" class="chip" data-delyes="${esc(v.id)}">삭제</button><button type="button" class="chip" data-delno="1">취소</button></div>` : ''}</td>
      <td>${esc(String(v.created || '').slice(0, 10))}</td></tr>`;
  }
  h += '</tbody></table></div>';
  if (S.vmsg) h += `<p class="note" role="status">${S.vmsg}</p>`;
  h += `<div class="chips"><button type="button" class="btn ghost" data-impopen="version">버전 가져오기</button></div>${imp.panel(ctx, 'version')}`;
  const missing = dayList.filter((d) => !S.data.versions[d.v]);
  if (missing.length) h += `<div class="banner warn">버전 정의 없음: 기록 ${missing.length}일이 이 기기에 없는 버전(${[...new Set(missing.map((d) => d.v || '없음'))].map(esc).join(', ')})을 가리킵니다. 현재 버전으로 채점하고 있습니다. 그 버전을 가져오면 원래 기준으로 돌아옵니다.</div>`;

  // 데이터
  const last = S.data.settings.lastBackupAt;
  h += `<h3 id="dataSec">데이터</h3><p class="note">저장된 날 ${dayList.length}일 · 사명서 버전 ${vers.length}개 · 마지막 백업 ${last ? esc(iso(new Date(last))) : '없음'}. 기록은 이 기기에만 있으므로 백업 파일이 유일한 사본입니다.</p>
  <div class="chips"><button type="button" class="btn" data-backup="file">백업 파일 만들기</button><button type="button" class="btn ghost" data-backup="copy">분석용 복사</button><button type="button" class="btn ghost" data-impopen="data">가져오기</button></div>
  ${S.dmsg ? `<p class="note" role="status">${S.dmsg}</p>` : ''}${imp.panel(ctx, 'data')}`;
  return h;
}

const stamp = (d = new Date()) => iso(d).replace(/-/g, '');

async function makeBackup(ctx, how) {
  const { S } = ctx;
  ctx.flushAll();
  const data = await ctx.repo.exportAll();
  const text = JSON.stringify(data, null, 1);
  if (how === 'copy') {
    S.dmsg = (await copyText(text)) ? '분석용으로 복사했습니다. Claude 세션에 붙여넣으세요.' : '복사가 막혀 있습니다. [백업 파일 만들기]로 파일을 만들어 첨부해 주세요.';
    ctx.render(); return;
  }
  const r = await shareOrDownload(`jagyeong-backup-${stamp()}.json`, text);
  if (r === 'cancelled') { S.dmsg = '공유를 취소했습니다. 백업하지 않았습니다.'; ctx.render(); return; }
  await ctx.repo.markBackedUp(); await ctx.reload();
  S.dmsg = r === 'shared' ? '백업 파일을 공유했습니다.' : `백업 파일(jagyeong-backup-${stamp()}.json)을 저장했습니다. 다운로드 폴더를 확인하세요.`;
  ctx.render();
}

export function click(t, ctx) {
  const { S } = ctx, ds = t.dataset;
  if (ds.mode) {
    if (ds.mode === 'edit' && S.mode !== 'edit') editor.enter(ctx);
    else if (ds.mode === 'run' && S.mode === 'edit') { S.mode = 'run'; S.cancelAsk = false; ctx.render(); }
    return;
  }
  if (S.mode === 'edit') { editor.click(t, ctx); return; }
  if (ds.creedfull) { S.creedFull = ds.creedfull === 'open'; ctx.render(); window.scrollTo(0, 0); return; }
  if (imp.click(t, ctx)) return;
  if (ds.draft === 'resume') { editor.enter(ctx, true); return; }
  if (ds.draft === 'discard') { S.draft = null; ctx.repo.saveDraft(null).then(ctx.reload).then(() => { ctx.setStatus('초안을 버렸습니다'); ctx.render(); }); return; }
  if (ds.focus !== undefined) {
    const wk = monday(S.cur);
    S.data.weeks[wk] = { week: wk, focus: ds.focus || null, at: new Date().toISOString() };
    ctx.queue('weeks', wk, 0); ctx.render(); return;
  }
  if (ds.usever) {
    return ctx.repo.setCurrent(ds.usever).then(ctx.reload).then(() => ctx.retagToday()).then((msg) => { S.vmsg = msg ? esc(msg) : ''; ctx.setStatus('사용 버전 변경 · ' + S.data.versions[ds.usever].name); ctx.render(); })
      .catch((e) => ctx.setStatus('버전 변경 저장 실패 · ' + (e.message || e), true));
    return;
  }
  if (ds.expver) {
    const V = S.data.versions[ds.expver]; const text = JSON.stringify(V, null, 1);
    copyText(text).then((ok) => { download(`jagyeong-version-${V.id}.json`, text); S.vmsg = `"${esc(V.name)}" 버전을 파일로 저장했습니다${ok ? '(클립보드에도 복사)' : ''}.`; ctx.render(); });
    return;
  }
  if (ds.delver) { S.delAsk = ds.delver; ctx.render(); return; }
  if (ds.delno) { S.delAsk = null; ctx.render(); return; }
  if (ds.delyes) {
    const id = ds.delyes; const chk = canDeleteVersion(id, ctx.curId(), Object.values(S.data.days));
    S.delAsk = null;
    if (!chk.ok) { S.vmsg = '삭제할 수 없습니다: ' + esc(chk.why); ctx.render(); return; }
    ctx.repo.deleteVersion(id).then(ctx.reload).then(() => { S.vmsg = '버전을 삭제했습니다.'; ctx.render(); });
    return;
  }
  if (ds.impopen) { S.dmsg = ''; S.vmsg = ''; imp.open(ctx, ds.impopen); return; }
  if (ds.backup) { makeBackup(ctx, ds.backup).catch((e) => { S.dmsg = '백업하지 못했습니다: ' + esc(e.message || e); ctx.render(); }); }
}

export function after(ctx) { if (ctx.S.mode === 'edit') editor.markErrors(ctx.S); }

export function input(el, ctx) { if (ctx.S.mode === 'edit') editor.input(el, ctx); }
export function change(el, ctx) {
  if (ctx.S.mode === 'edit') { editor.change(el, ctx); return; }
  imp.change(el, ctx);
}
