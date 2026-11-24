// 날짜·글자 다루는 작은 도구들 (DOM·저장소 접근 없음)
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const WD = ['일', '월', '화', '수', '목', '금', '토'];
// 그 주 월요일
export const monday = (s) => { const d = parse(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return iso(d); };
export const fmt1 = (x) => (Math.round(x * 10) / 10).toString();
export const fmt2 = (x) => (Math.round(x * 100) / 100).toString();
export const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
export const hhmm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
// 새벽 4시 전이면 전날을 오늘로 본다
export const DAY_CUTOFF_HOUR = 4;
export function logicalToday(now = new Date()) {
  const n = new Date(now.getTime());
  if (n.getHours() < DAY_CUTOFF_HOUR) n.setDate(n.getDate() - 1);
  return iso(n);
}
export function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => ym + '-' + pad(i + 1));
}
export function addMonths(ym, k) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + k, 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}
// 새 버전 id: YYYYMMDD-HHMMSS
export function versionIdAt(d = new Date()) {
  return iso(d).replace(/-/g, '') + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}
