/**
 * Minimal Markdown subset for assistant replies: headings, bold/italic, inline code,
 * bullet and numbered lists, fenced code blocks and horizontal rules. Anything else
 * (tables, links, HTML) is shown as plain text. Pure so it can be unit-tested.
 */

export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type Block =
  | { type: 'heading'; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'bullet'; depth: number; inlines: Inline[] }
  | { type: 'ordered'; depth: number; marker: string; inlines: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'rule' };

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\s][^*\n]*?\*)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const tok = m[0];
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    if (tok.startsWith('`')) out.push({ text: tok.slice(1, -1), code: true });
    else if (tok.startsWith('**') || tok.startsWith('__')) out.push({ text: tok.slice(2, -2), bold: true });
    else out.push({ text: tok.slice(1, -1), italic: true });
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.filter((i) => i.text.length > 0);
}

const depthOf = (indent: string) => Math.min(2, Math.floor(indent.replace(/\t/g, '  ').length / 2));

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', inlines: parseInline(para.join('\n')) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const body: string[] = [];
      // An unterminated fence runs to the end of the reply.
      while (++i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i]);
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) {
      flush();
      blocks.push({ type: 'heading', inlines: parseInline(m[1].replace(/\s*#+\s*$/, '')) });
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ type: 'rule' });
    } else if ((m = line.match(/^(\s*)[-*•+]\s+(.*)$/))) {
      flush();
      blocks.push({ type: 'bullet', depth: depthOf(m[1]), inlines: parseInline(m[2]) });
    } else if ((m = line.match(/^(\s*)(\d{1,3})[.)]\s+(.*)$/))) {
      flush();
      blocks.push({ type: 'ordered', depth: depthOf(m[1]), marker: `${m[2]}.`, inlines: parseInline(m[3]) });
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}
