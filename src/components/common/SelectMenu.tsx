import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface SelectMenuOption {
  value: string;
  label: string;
}

interface SelectMenuProps {
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  variant?: 'surface' | 'sidebar';
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

export const SelectMenu: React.FC<SelectMenuProps> = ({
  value,
  options,
  onChange,
  ariaLabel,
  variant = 'surface',
  className = '',
  disabled = false,
  placeholder = 'Выберите значение',
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, options.findIndex(option => option.value === value)));
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = options.find(option => option.value === value);

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const height = Math.min(320, Math.max(48, options.length * 38 + 12));
    setPosition({
      top: rect.bottom + height + 8 > window.innerHeight ? Math.max(8, rect.top - height - 8) : rect.bottom + 8,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: rect.width,
    });
  };

  const close = () => {
    setOpen(false);
    setPosition(null);
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const handlePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(current => (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        setActiveIndex(event.key === 'Home' ? 0 : Math.max(0, options.length - 1));
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const option = options[activeIndex];
        if (option) {
          onChange(option.value);
          close();
          triggerRef.current?.focus();
        }
      }
    };
    const handleViewportChange = () => updatePosition();
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [activeIndex, onChange, open, options]);

  const triggerClass = variant === 'sidebar'
    ? 'h-8 w-full rounded-lg border border-[rgba(231,224,214,.11)] bg-[rgba(231,224,214,.06)] pl-8 pr-2 text-left text-xs font-semibold text-[rgba(231,224,214,.82)] hover:bg-[rgba(231,224,214,.1)]'
    : 'h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-left text-xs text-[var(--ink)] hover:bg-[var(--surface-soft)]';
  const menuClass = variant === 'sidebar'
    ? 'rounded-xl border border-[rgba(231,224,214,.14)] bg-[#261732] p-1.5 text-[#E7E0D6] shadow-[0_16px_40px_rgba(10,4,17,.35)]'
    : 'rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 text-[var(--ink)] shadow-[var(--shadow)]';
  const itemClass = variant === 'sidebar'
    ? 'flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[rgba(231,224,214,.82)] hover:bg-[rgba(231,224,214,.1)] hover:text-[#E7E0D6]'
    : 'flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)]';

  return (
    <div className="relative min-w-0 flex-1">
      <button
        ref={triggerRef}
        type="button"
        className={`${triggerClass} ${className} disabled:cursor-not-allowed disabled:opacity-50`}
        disabled={disabled}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (open) close();
          else {
            setActiveIndex(Math.max(0, options.findIndex(option => option.value === value)));
            setOpen(true);
            window.requestAnimationFrame(updatePosition);
          }
        }}
      >
        <span className="block truncate">{selected?.label || placeholder}</span>
        <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-70" aria-hidden="true" />
      </button>
      {open && position && createPortal(
        <div ref={menuRef} id={menuId} role="listbox" aria-label={ariaLabel} className={`fixed z-[150] ${menuClass}`} style={{ top: position.top, left: position.left, width: position.width }}>
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`${itemClass} ${index === activeIndex ? (variant === 'sidebar' ? 'bg-[var(--surface-strong)] !text-[var(--ink)]' : 'bg-[var(--surface-soft)]') : ''} ${option.value === value ? 'font-bold' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => { onChange(option.value); close(); triggerRef.current?.focus(); }}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.value === value && <Check size={14} className="flex-none text-[var(--sage)]" aria-hidden="true" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};
