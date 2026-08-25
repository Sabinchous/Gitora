export type MarkdownInlineToken =
  | { type: 'text'; value: string }
  | { type: 'strong'; value: string }
  | { type: 'emphasis'; value: string }
  | { type: 'code'; value: string };

export type MarkdownBlock =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'heading'; level: number; value: string }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'code-block'; language?: string; value: string };

const INLINE_TOKEN_PATTERN = /(`[^`\n]*`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;

export function tokenizeInline(value: string): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(INLINE_TOKEN_PATTERN)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) tokens.push({ type: 'text', value: value.slice(lastIndex, start) });

    if (token.startsWith('`')) {
      tokens.push({ type: 'code', value: token.slice(1, -1) });
    } else if (token.startsWith('**') || token.startsWith('__')) {
      tokens.push({ type: 'strong', value: token.slice(2, -2) });
    } else {
      tokens.push({ type: 'emphasis', value: token.slice(1, -1) });
    }
    lastIndex = start + token.length;
  }

  if (lastIndex < value.length) tokens.push({ type: 'text', value: value.slice(lastIndex) });
  return tokens;
}

function isCodeFence(line: string) {
  return /^ {0,3}(`{3,}|~{3,}).*$/.test(line);
}

function isHeading(line: string) {
  return /^ {0,3}#{1,6}[ \t]+\S/.test(line);
}

function isUnorderedListItem(line: string) {
  return /^ {0,3}[-+*][ \t]+\S/.test(line);
}

function isOrderedListItem(line: string) {
  return /^ {0,3}\d+[.)][ \t]+\S/.test(line);
}

function isBlockStart(line: string) {
  return isCodeFence(line) || isHeading(line) || /^ {0,3}>/.test(line) || isUnorderedListItem(line) || isOrderedListItem(line);
}

export function parseMarkdown(value: string): MarkdownBlock[] {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^ {0,3}(`{3,}|~{3,})\s*(.*)$/);
    if (fence) {
      const marker = fence[1][0];
      const markerLength = fence[1].length;
      const codeLines: string[] = [];
      const language = fence[2].trim() || undefined;
      index += 1;

      while (index < lines.length && !new RegExp(`^ {0,3}${marker}{${markerLength},}\\s*$`).test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code-block', language, value: codeLines.join('\n') });
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        value: heading[2].replace(/[ \t]+#+[ \t]*$/, ''),
      });
      index += 1;
      continue;
    }

    if (/^ {0,3}>/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^ {0,3}>[ \t]?/, ''));
        index += 1;
      }
      blocks.push({ type: 'blockquote', lines: quoteLines });
      continue;
    }

    const unordered = line.match(/^ {0,3}[-+*][ \t]+(.+)$/);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^ {0,3}[-+*][ \t]+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ type: 'unordered-list', items });
      continue;
    }

    const ordered = line.match(/^ {0,3}\d+[.)][ \t]+(.+)$/);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^ {0,3}\d+[.)][ \t]+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines });
  }

  return blocks;
}
