import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { parseMarkdown, tokenizeInline } from '../../lib/markdown';
import type { MarkdownBlock } from '../../lib/markdown';

function renderInline(value: string, keyPrefix: string): ReactNode[] {
  return tokenizeInline(value).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.type === 'strong') return <strong key={key}>{renderInline(token.value, key)}</strong>;
    if (token.type === 'emphasis') return <em key={key}>{renderInline(token.value, key)}</em>;
    if (token.type === 'code') return <code key={key} className="rounded bg-[var(--surface-strong)] px-1 py-0.5 font-mono text-[0.9em]">{token.value}</code>;
    return <Fragment key={key}>{token.value}</Fragment>;
  });
}

export function MarkdownInline({ content }: { content: string }) {
  return <>{renderInline(content, 'inline')}</>;
}

function renderLines(lines: string[], keyPrefix: string) {
  return lines.map((line, index) => (
    <Fragment key={`${keyPrefix}-${index}`}>
      {index > 0 && <br />}
      {renderInline(line, `${keyPrefix}-${index}`)}
    </Fragment>
  ));
}

function renderBlock(block: MarkdownBlock, index: number): ReactNode {
  const key = `markdown-block-${index}`;
  switch (block.type) {
    case 'heading': {
      const className = block.level === 1
        ? 'text-base font-bold tracking-tight'
        : block.level === 2
          ? 'text-sm font-bold tracking-tight'
          : 'text-sm font-semibold';
      if (block.level === 1) return <h1 key={key} className={className}>{renderInline(block.value, key)}</h1>;
      if (block.level === 2) return <h2 key={key} className={className}>{renderInline(block.value, key)}</h2>;
      return <h3 key={key} className={className}>{renderInline(block.value, key)}</h3>;
    }
    case 'unordered-list':
      return <ul key={key} className="m-0 list-disc space-y-1 pl-5">{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>)}</ul>;
    case 'ordered-list':
      return <ol key={key} className="m-0 list-decimal space-y-1 pl-5">{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>)}</ol>;
    case 'blockquote':
      return <blockquote key={key} className="m-0 border-l-2 border-[var(--sage)] pl-3 text-[var(--muted)] italic">{renderLines(block.lines, key)}</blockquote>;
    case 'code-block':
      return <pre key={key} className="m-0 max-w-full overflow-x-auto rounded-lg bg-[var(--surface-soft)] p-3 text-xs leading-relaxed"><code className="font-mono whitespace-pre">{block.value}</code></pre>;
    case 'paragraph':
      return <p key={key} className="m-0">{renderLines(block.lines, key)}</p>;
  }
}

export function MarkdownRenderer({ content, className = '' }: { content: string; className?: string }) {
  const blocks = parseMarkdown(content);
  if (blocks.length === 0) return null;

  return <div className={`space-y-2 break-words ${className}`} data-markdown-renderer>{blocks.map(renderBlock)}</div>;
}
