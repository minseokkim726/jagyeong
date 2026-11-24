// 첫 실행: 버전이 하나도 없을 때
import * as imp from './importer.js';
import { SAMPLE_VERSION, normalizeVersion } from '../versions.js';

export function render(ctx) {
  const { S } = ctx;
  if (!S.imp || S.imp.where !== 'welcome') S.imp = { where: 'welcome', open: true, paste: false, msg: '', err: false, plan: null, read: null, ask: null };
  return `<section class="welcome">
    <h2 class="wtitle">사명서를 불러오세요</h2>
    <p class="note">덕목·항목·배점이 담긴 사명서 정의 파일(JSON)을 넣으면 바로 채점을 시작할 수 있습니다. 다른 기기에서 만든 백업 파일로 복원할 수도 있습니다.</p>
    <div class="wbtns">
      <label class="btn filebtn">파일 고르기<input type="file" accept=".json,application/json,text/plain" data-impfile="1"></label>
      <button type="button" class="btn ghost" data-imp="paste" aria-pressed="${!!S.imp.paste}">붙여넣기</button>
      <label class="btn ghost filebtn">백업에서 복원<input type="file" accept=".json,application/json,text/plain" data-impfile="1"></label>
    </div>
    ${imp.panel(ctx, 'welcome', { buttons: false })}
    <p class="note" style="margin-top:28px">파일이 없으면 <button type="button" class="linkbtn" data-sample="1">예시로 둘러보기</button> (덕목 2개짜리 견본. 나중에 설정에서 내 사명서를 가져오면 됩니다.)</p>
  </section>`;
}

export function click(t, ctx) {
  if (imp.click(t, ctx)) return;
  if (t.dataset.sample) {
    const V = normalizeVersion(SAMPLE_VERSION);
    V.created = new Date().toISOString();
    ctx.repo.addVersion(V, { makeCurrent: true }).then(ctx.reload).then(() => { ctx.S.imp = null; ctx.S.tab = 'today'; ctx.setStatus('예시 사명서로 시작했습니다'); ctx.render(); })
      .catch((e) => ctx.setStatus('저장하지 못했습니다: ' + (e.message || e), true));
  }
}
export function change(el, ctx) { imp.change(el, ctx); }
