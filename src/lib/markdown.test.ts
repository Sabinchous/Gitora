import { describe, expect, it } from 'vitest';
import { parseMarkdown, tokenizeInline } from './markdown';

describe('markdown', () => {
  it('tokenizes the inline formats used by the editor', () => {
    expect(tokenizeInline('**жирный** *курсив* `код`')).toEqual([
      { type: 'strong', value: 'жирный' },
      { type: 'text', value: ' ' },
      { type: 'emphasis', value: 'курсив' },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'код' },
    ]);
  });

  it('parses headings, lists, quotes and fenced code without leaving markdown markers in block values', () => {
    expect(parseMarkdown('# Заголовок\n\n- **один**\n- `два`\n\n> цитата\n\n```ts\nconst value = 1;\n```')).toEqual([
      { type: 'heading', level: 1, value: 'Заголовок' },
      { type: 'unordered-list', items: ['**один**', '`два`'] },
      { type: 'blockquote', lines: ['цитата'] },
      { type: 'code-block', language: 'ts', value: 'const value = 1;' },
    ]);
  });

  it('keeps plain line breaks inside a paragraph', () => {
    expect(parseMarkdown('первая строка\nвторая строка')).toEqual([
      { type: 'paragraph', lines: ['первая строка', 'вторая строка'] },
    ]);
  });
});
