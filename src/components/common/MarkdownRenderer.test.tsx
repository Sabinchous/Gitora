import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownRenderer } from './MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('renders the formats used in commit messages as semantic elements', () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer content={'# Заголовок\n\n**жирный** *курсив* `код`\n\n- пункт\n\n> цитата'} />
    );

    expect(html).toContain('<h1');
    expect(html).toContain('<strong>жирный</strong>');
    expect(html).toContain('<em>курсив</em>');
    expect(html).toContain('<code');
    expect(html).toContain('<ul');
    expect(html).toContain('<blockquote');
    expect(html).not.toContain('**жирный**');
  });

  it('renders fenced code as text without interpreting its contents', () => {
    const html = renderToStaticMarkup(<MarkdownRenderer content={'```ts\nconst value = "**not bold**";\n```'} />);

    expect(html).toContain('<pre');
    expect(html).toContain('**not bold**');
    expect(html).not.toContain('<strong>not bold</strong>');
  });
});
