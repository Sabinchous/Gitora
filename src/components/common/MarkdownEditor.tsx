import React, { forwardRef, useRef, useState } from 'react';
import { Bold, Code2, Italic, List, Quote } from 'lucide-react';

export interface MarkdownEditorProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

const formats = [
  { id: 'bold', label: 'Жирный', marker: '**', Icon: Bold },
  { id: 'italic', label: 'Курсив', marker: '*', Icon: Italic },
  { id: 'code', label: 'Моноширинный код', marker: '`', Icon: Code2 },
] as const;

function isWrapped(value: string, start: number, end: number, marker: string): boolean {
  if (start !== end) return value.slice(start, end).startsWith(marker) && value.slice(start, end).endsWith(marker);
  return value.slice(0, start).endsWith(marker) && value.slice(end).startsWith(marker);
}

export const MarkdownEditor = forwardRef<HTMLTextAreaElement, MarkdownEditorProps>(function MarkdownEditor({
  value,
  onValueChange,
  className = '',
  disabled,
  ...textareaProps
}, forwardedRef) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  const setRef = (node: HTMLTextAreaElement | null) => {
    localRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const rememberSelection = () => {
    const textarea = localRef.current;
    if (textarea) setSelection({ start: textarea.selectionStart, end: textarea.selectionEnd });
  };

  const applyFormat = (marker: string) => {
    const textarea = localRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.slice(start, end);
    let nextValue = value;
    let nextStart = start;
    let nextEnd = end;

    if (isWrapped(value, start, end, marker)) {
      if (start === end) {
        nextStart = start + marker.length;
        nextEnd = nextStart;
      } else {
        nextValue = `${value.slice(0, start)}${selectedText.slice(marker.length, -marker.length)}${value.slice(end)}`;
        nextEnd = start + Math.max(0, selectedText.length - marker.length * 2);
      }
    } else if (selectedText) {
      nextValue = `${value.slice(0, start)}${marker}${selectedText}${marker}${value.slice(end)}`;
      nextStart = start + marker.length;
      nextEnd = end + marker.length;
    } else {
      nextValue = `${value.slice(0, start)}${marker}${marker}${value.slice(end)}`;
      nextStart = start + marker.length;
      nextEnd = nextStart;
    }

    onValueChange(nextValue);
    setSelection({ start: nextStart, end: nextEnd });
    window.requestAnimationFrame(() => {
      const nextTextarea = localRef.current;
      if (!nextTextarea) return;
      nextTextarea.focus();
      nextTextarea.setSelectionRange(nextStart, nextEnd);
    });
  };

  const insertPrefix = (prefix: string) => {
    const textarea = localRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.slice(start, end);
    const lines = selectedText || 'текст';
    const nextValue = `${value.slice(0, start)}${prefix}${lines}${value.slice(end)}`;
    const nextStart = start + prefix.length;
    const nextEnd = nextStart + lines.length;
    onValueChange(nextValue);
    setSelection({ start: nextStart, end: nextEnd });
    window.requestAnimationFrame(() => {
      const nextTextarea = localRef.current;
      if (!nextTextarea) return;
      nextTextarea.focus();
      nextTextarea.setSelectionRange(nextStart, nextEnd);
    });
  };

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] focus-within:border-[var(--sage)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--sage),transparent_78%)]" data-markdown-editor>
      <div className="flex min-h-10 items-center gap-1 border-b border-[var(--line)] bg-[var(--surface)] px-1.5" data-markdown-toolbar role="toolbar" aria-label="Форматирование текста">
        {formats.map(({ id, label, marker, Icon }) => (
          <button
            key={id}
            type="button"
            className={`grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] active:scale-[0.96] ${isWrapped(value, selection.start, selection.end, marker) ? 'bg-[var(--surface-strong)] text-[var(--ink)]' : ''}`}
            aria-label={label}
            aria-pressed={isWrapped(value, selection.start, selection.end, marker)}
            title={`${label} (Markdown)`}
            onMouseDown={event => event.preventDefault()}
            onClick={() => applyFormat(marker)}
            disabled={disabled}
          >
            <Icon size={15} aria-hidden="true" />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-[var(--line)]" aria-hidden="true" />
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] active:scale-[0.96]"
          aria-label="Маркированный список"
          title="Маркированный список"
          onMouseDown={event => event.preventDefault()}
          onClick={() => insertPrefix('- ')}
          disabled={disabled}
        >
          <List size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] active:scale-[0.96]"
          aria-label="Цитата"
          title="Цитата"
          onMouseDown={event => event.preventDefault()}
          onClick={() => insertPrefix('> ')}
          disabled={disabled}
        >
          <Quote size={15} aria-hidden="true" />
        </button>
        <span className="ml-auto px-2 text-xs text-[var(--muted)]">Markdown</span>
      </div>
      <textarea
        {...textareaProps}
        ref={setRef}
        value={value}
        disabled={disabled}
        onChange={event => onValueChange(event.target.value)}
        onSelect={event => {
          setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd });
          textareaProps.onSelect?.(event);
        }}
        onKeyUp={event => {
          rememberSelection();
          textareaProps.onKeyUp?.(event);
        }}
        className={`block w-full resize-y border-0 bg-transparent p-3 text-sm font-normal leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--muted)] disabled:opacity-50 ${className}`}
      />
    </div>
  );
});
