// 사명서 버전 정의: 형식 맞추기, 저장 전 검사, 가져오기 읽기·합치기 (순수 함수)
import { clone, fmt2 } from './format.js';
import { DEFAULT_PEN } from './scoring.js';

export const APP_ID = 'jagyeongmun';
export const SCHEMA = 1;

// 코드에 내장하는 중립 견본(덕목 2개). 사용자의 사명서 내용은 넣지 않는다.
export const SAMPLE_VERSION = {
  id: 'sample',
  name: '예시 사명서',
  created: '2026-11-24',
  pen: { t: 1, x: 2 },
  tScale: [[8, 1], [6, 0.8], [4, 0.6], [0, 0.2]],
  blocks: [
    { id: 'sb1', h: '09:00–12:00', n: '오전', ex: '집중해서 한 일', t: 3 },
    { id: 'sb2', h: '13:00–18:00', n: '오후', ex: '집중해서 한 일', t: 5 },
  ],
  virtues: [
    { id: 'sv1', name: '건강', sub: '몸 돌보기', model: '예시 인물', pts: 10, items: [
      { id: 'si1a', t: '물 충분히 마시기', h: '하루 1.5L', w: 0.5 },
      { id: 'si1b', t: '30분 걷기', w: 0.5 }] },
    { id: 'sv2', name: '성실', sub: '시간 쓰기', model: '예시 인물', pts: 10, items: [
      { id: 'si2a', t: '집중 시간', h: '시간 블록 합계로 계산', w: 0.6, kind: 'time' },
      { id: 'si2b', t: '할 일 목록 확인', w: 0.4 }] },
  ],
  creed: { title: '예시 사명서', text: ['나는 오늘 하루를 **정성껏** 산다.', '', '- 몸을 돌본다', '- 시간을 아껴 쓴다'].join(String.fromCharCode(10)) },
  passive: [
    { id: 'sp1', name: '말', sub: '말 조심', rules: [
      { id: 'sp1a', t: '남을 깎아내리지 않기' },
      { id: 'sp1b', t: '약속을 가볍게 하지 않기' }] },
  ],
};

// 옛 형식(블록 n에 "이름 · 예시")을 새 형식(n, ex)으로, pen 기본값, 숫자 변환, 구간표 정렬
export function normalizeVersion(src) {
  const V = clone(src) || {};
  V.name = V.name ?? '';
  V.pen = V.pen && typeof V.pen === 'object' ? { t: num(V.pen.t), x: num(V.pen.x) } : { ...DEFAULT_PEN };
  V.tScale = Array.isArray(V.tScale) ? V.tScale.map((r) => [num(r[0]), num(r[1])]) : [];
  V.tScale.sort((a, b) => b[0] - a[0]);
  V.blocks = (Array.isArray(V.blocks) ? V.blocks : []).map((b) => {
    const o = { ...b, t: num(b.t) };
    if (o.ex === undefined) {
      const s = String(o.n ?? '');
      const k = s.indexOf(' · ');
      if (k >= 0) { o.n = s.slice(0, k); o.ex = s.slice(k + 3); } else { o.n = s; o.ex = ''; }
    }
    return o;
  });
  V.virtues = (Array.isArray(V.virtues) ? V.virtues : []).map((v) => ({
    ...v, pts: num(v.pts), items: (Array.isArray(v.items) ? v.items : []).map((it) => ({ ...it, w: num(it.w) })),
  }));
  V.passive = (Array.isArray(V.passive) ? V.passive : []).map((g) => ({ ...g, rules: Array.isArray(g.rules) ? g.rules : [] }));
  // 사명서 본문(선택). 없으면 기능을 숨긴다.
  if (V.creed && typeof V.creed === 'object') V.creed = { title: String(V.creed.title ?? ''), text: String(V.creed.text ?? '') };
  else delete V.creed;
  return V;
}
function num(x) { return x === '' || x === null || x === undefined ? NaN : +x; }
const blank = (s) => !String(s ?? '').trim();

// 저장 전 검사. 문제마다 { path, msg }. 빈 배열이면 통과.
export function validateVersion(V) {
  const errs = [];
  const e = (path, msg) => errs.push({ path, msg });
  if (!V || typeof V !== 'object') return [{ path: '', msg: '사명서 정의 형식이 아닙니다.' }];
  if (blank(V.name)) e('name', '버전 이름을 적어 주세요.');
  const vs = Array.isArray(V.virtues) ? V.virtues : [];
  if (!vs.length) e('virtues', '덕목이 하나 이상 있어야 합니다.');
  let timeCount = 0;
  vs.forEach((v, vi) => {
    const label = blank(v.name) ? `${vi + 1}번째 덕목` : v.name;
    if (blank(v.name)) e(`virtues.${vi}.name`, `${vi + 1}번째 덕목: 이름을 적어 주세요.`);
    if (!(+v.pts > 0)) e(`virtues.${vi}.pts`, `${label}: 배점은 0보다 커야 합니다.`);
    const items = Array.isArray(v.items) ? v.items : [];
    if (!items.length) e(`virtues.${vi}.items`, `${label}: 세부 항목이 하나 이상 있어야 합니다.`);
    items.forEach((it, ii) => {
      if (it.kind === 'time') timeCount++;
      if (blank(it.t)) e(`virtues.${vi}.items.${ii}.t`, `${label} ${ii + 1}번째 항목: 문구를 적어 주세요.`);
      if (!(+it.w >= 0) || it.w === '' || it.w === null) e(`virtues.${vi}.items.${ii}.w`, `${label} ${ii + 1}번째 항목: 가중치는 0 이상이어야 합니다.`);
    });
  });
  if (timeCount !== 1) e('time', `유효시간 항목은 정확히 1개여야 합니다(지금 ${timeCount}개).`);
  (Array.isArray(V.blocks) ? V.blocks : []).forEach((b, bi) => {
    if (!(+b.t >= 0) || b.t === '' || b.t === null) e(`blocks.${bi}.t`, `${bi + 1}번째 시간 블록: T는 0 이상이어야 합니다.`);
  });
  const sc = Array.isArray(V.tScale) ? V.tScale : [];
  if (!sc.length) e('tScale', 'T 구간표에 줄이 하나 이상 있어야 합니다.');
  const seen = new Set();
  sc.forEach((r, ri) => {
    const a = r[0], b = r[1];
    if (a === '' || a === null || !Number.isFinite(+a)) e(`tScale.${ri}.0`, `T 구간표 ${ri + 1}번째 줄: 기준 T를 적어 주세요.`);
    else if (seen.has(+a)) e(`tScale.${ri}.0`, `T 구간표: 기준 ${+a}T가 겹칩니다.`);
    else seen.add(+a);
    if (b === '' || b === null || !(+b >= 0 && +b <= 1)) e(`tScale.${ri}.1`, `T 구간표 ${ri + 1}번째 줄: 비율은 0~1 사이여야 합니다.`);
  });
  const pen = V.pen || {};
  if (!(+pen.t >= 0) || pen.t === '' || pen.t === null) e('pen.t', 'Passive 감점(△)은 0 이상이어야 합니다.');
  if (!(+pen.x >= 0) || pen.x === '' || pen.x === null) e('pen.x', 'Passive 감점(✕)은 0 이상이어야 합니다.');
  (Array.isArray(V.passive) ? V.passive : []).forEach((g, gi) => {
    if (!Array.isArray(g.rules)) e(`passive.${gi}`, `Passive ${gi + 1}번째 묶음 형식이 틀렸습니다.`);
  });
  return errs;
}

// 경고(저장은 허용): 가중치 합이 1이 아닌 덕목
export function weightWarnings(V) {
  const out = [];
  (V.virtues || []).forEach((v, vi) => {
    const s = (v.items || []).reduce((a, i) => a + (+i.w || 0), 0);
    if (Math.abs(s - 1) > 0.001) out.push({ vi, sum: s, msg: `${v.name || vi + 1 + '번째 덕목'}: 가중치 합 ${fmt2(s)} (1이 아님)` });
  });
  return out;
}

// 편집 화면 위 합계
export function editorSums(V) {
  const pts = (V.virtues || []).reduce((a, v) => a + (+v.pts || 0), 0);
  const blockT = (V.blocks || []).reduce((a, b) => a + (+b.t || 0), 0);
  return { pts, blockT, warn: weightWarnings(V) };
}

// 저장할 모양으로 정리(숫자로 바꾸고 구간표를 큰 순으로)
export function finalizeVersion(draft, { id, created, from }) {
  const V = normalizeVersion(draft);
  V.id = id; V.created = created; V.from = from ?? null;
  return V;
}

// 기록이 쓰는 버전이나 현재 버전은 지울 수 없다
export function canDeleteVersion(id, cur, daysList) {
  if (id === cur) return { ok: false, why: '현재 쓰는 버전입니다.' };
  const n = daysList.filter((d) => d.v === id).length;
  if (n) return { ok: false, why: `기록 ${n}일이 이 버전을 씁니다.` };
  return { ok: true };
}

// id가 이미 있으면 기존 것을 건드리지 않고 새 id
export function uniqueId(id, existing, makeId) {
  if (id && !existing[id]) return id;
  let k = makeId();
  let i = 2;
  while (existing[k]) k = makeId() + '-' + i++;
  return k;
}

// ---------- 가져오기 ----------
const asMap = (x, key) => {
  if (!x) return {};
  if (Array.isArray(x)) { const o = {}; for (const r of x) if (r && r[key] != null) o[r[key]] = r; return o; }
  if (typeof x === 'object') return x;
  return {};
};
const looksVersion = (o) => o && typeof o === 'object' && Array.isArray(o.virtues) && Array.isArray(o.blocks);

// 붙여넣기·파일 내용을 읽어 종류를 가린다.
// kind: 'backup'(이 앱 백업) | 'artifact'(아티팩트 기록) | 'version'(사명서 정의 하나)
export function readImport(input) {
  let o = input;
  if (typeof input === 'string') {
    try { o = JSON.parse(input); } catch { return { ok: false, error: 'JSON 형식이 아닙니다. 파일 내용을 그대로 붙여넣었는지 확인해 주세요.' }; }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, error: '알 수 없는 형식입니다.' };
  if (o.app !== undefined) {
    if (o.app !== APP_ID) return { ok: false, error: `다른 앱의 파일입니다(${String(o.app)}).` };
    if (+o.schema !== SCHEMA) return { ok: false, error: `지원하지 않는 백업 형식 번호입니다(schema ${String(o.schema)}).` };
    const versions = asMap(o.versions, 'id');
    for (const [k, v] of Object.entries(versions)) {
      if (!looksVersion(v)) return { ok: false, error: `버전 ${k}의 형식이 틀렸습니다.` };
      if (!v.id) v.id = k;
    }
    const days = asMap(o.days, 'date');
    const bad = checkDays(days); if (bad) return { ok: false, error: bad };
    return { ok: true, kind: 'backup', current: o.current ?? null, versions, days, weeks: asMap(o.weeks, 'week'), months: asMap(o.months, 'month') };
  }
  if (looksVersion(o)) return { ok: true, kind: 'version', version: o };
  if (o.days && typeof o.days === 'object') {
    const days = asMap(o.days, 'date');
    const bad = checkDays(days); if (bad) return { ok: false, error: bad };
    return { ok: true, kind: 'artifact', current: o.version ?? null, versions: {}, days, weeks: asMap(o.weeks, 'week'), months: asMap(o.months, 'month') };
  }
  return { ok: false, error: '사명서 정의나 기록 파일이 아닙니다.' };
}
function checkDays(days) {
  for (const [k, d] of Object.entries(days)) {
    if (!d || typeof d !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return `기록 ${k}의 형식이 틀렸습니다.`;
  }
  return null;
}

const newer = (a, b) => !!(a && a.at && b && b.at && String(b.at) > String(a.at));

// 합치기 계획(순수). existing: { versions, days, weeks, months } 각각 키→값.
// 같은 날짜·주·월은 at이 늦은 쪽(at이 없으면 기존 유지), 같은 id 버전은 기존 유지.
export function planMerge(existing, inc) {
  const put = { versions: [], days: [], weeks: [], months: [] };
  let overlap = 0, newDays = 0, replaced = 0;
  for (const [id, v] of Object.entries(inc.versions || {})) {
    if (!existing.versions[id]) put.versions.push(normalizeVersion({ ...v, id }));
  }
  for (const [k, d] of Object.entries(inc.days || {})) {
    const cur = existing.days[k];
    const row = { ...d, date: k };
    if (!cur) { put.days.push(row); newDays++; continue; }
    overlap++;
    if (newer(cur, row)) { put.days.push(row); replaced++; }
  }
  for (const [k, w] of Object.entries(inc.weeks || {})) {
    const cur = existing.weeks[k]; const row = { ...w, week: k };
    if (!cur || newer(cur, row)) put.weeks.push(row);
  }
  for (const [k, m] of Object.entries(inc.months || {})) {
    const cur = existing.months[k]; const row = { ...m, month: k };
    if (!cur || newer(cur, row)) put.months.push(row);
  }
  // 합친 뒤에도 정의가 없는 버전을 쓰는 기록
  const known = new Set([...Object.keys(existing.versions), ...put.versions.map((v) => v.id)]);
  const missing = [...new Set(Object.values(inc.days || {}).map((d) => d.v).filter((v) => v && !known.has(v)))];
  return {
    put, missing,
    preview: { days: Object.keys(inc.days || {}).length, versions: Object.keys(inc.versions || {}).length, overlap, newDays, replaced, newVersions: put.versions.length },
  };
}
