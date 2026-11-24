// 사명서 본문 표시 (순수 함수). HTML은 모두 글자로 처리한다.
// 규칙: 빈 줄 = 문단 나눔, "# " 줄 = 소제목, "- " 줄 = 목록, **굵게**만 지원.
import { esc } from './format.js';

const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

export function renderCreed(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [], list = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list.length) { out.push(`<ul>${list.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`); list = []; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (line.startsWith('# ')) { flushPara(); flushList(); out.push(`<h4>${inline(line.slice(2).trim())}</h4>`); continue; }
    if (line.startsWith('- ')) { flushPara(); list.push(line.slice(2)); continue; }
    flushList(); para.push(line);
  }
  flushPara(); flushList();
  return out.join('');
}

// 이 버전에 읽을 사명서가 있는지
export const hasCreed = (V) => !!(V && V.creed && String(V.creed.text || '').trim());
