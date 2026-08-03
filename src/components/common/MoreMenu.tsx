import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface MoreMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
  external?: boolean;
  dividerBefore?: boolean;
}

interface MoreMenuProps {
  label: string;
  items: MoreMenuItem[];
  variant?: 'surface' | 'sidebar';
  placement?: 'bottom' | 'top';
  align?: 'left' | 'right';
  triggerTestId?: string;
  menuTestId?: string;
}

interface MenuPosition {
  top: number;
  left: number;
}

const surfaceItem = 'flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] focus-visible:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-45';
const sidebarItem = 'flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[rgba(231,224,214,.82)] transition-colors hover:bg-[rgba(231,224,214,.1)] hover:text-[#E7E0D6] focus-visible:bg-[rgba(231,224,214,.1)] disabled:cursor-not-allowed disabled:opacity-45';

export const MoreMenu: React.FC<MoreMenuProps> = ({
  label,
  items,
  variant = 'surface',
  placement = 'bottom',
  align = 'right',
  triggerTestId,
  menuTestId,
}) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = Math.min(280, Math.max(210, trigger.closest('header, aside, main')?.clientWidth || 280));
    const estimatedHeight = Math.min(520, Math.max(48, items.length * 40 + 12));
    const left = align === 'left'
      ? Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
      : Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const shouldOpenAbove = placement === 'top' || (placement === 'bottom' && rect.bottom + estimatedHeight + 8 > window.innerHeight);
    const top = shouldOpenAbove
      ? Math.max(8, rect.top - estimatedHeight - 8)
      : Math.min(window.innerHeight - estimatedHeight - 8, rect.bottom + 8);
    setPosition({ top, left });
  };

  const close = () => {
    setOpen(false);
    setPosition(null);
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const enabledItems = itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled));
      if (!enabledItems.length) return;
      const currentIndex = enabledItems.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? enabledItems.length - 1
          : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + enabledItems.length) % enabledItems.length;
      enabledItems[nextIndex]?.focus();
    };
    const handleViewportChange = () => updatePosition();

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    itemRefs.current.find(item => item && !item.disabled)?.focus();
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, items.length]);

  const triggerClass = variant === 'sidebar'
    ? 'grid h-10 w-10 place-items-center rounded-lg text-[rgba(231,224,214,.72)] transition-colors hover:bg-[rgba(231,224,214,.08)] hover:text-[#E7E0D6]'
    : `grid h-10 w-10 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] ${open ? 'bg-[var(--surface-soft)] text-[var(--ink)]' : ''}`;
  const menuClass = variant === 'sidebar'
    ? 'w-[230px] rounded-xl border border-[rgba(231,224,214,.12)] bg-[#261732] p-1.5 text-[#E7E0D6] shadow-[0_16px_40px_rgba(10,4,17,.35)]'
    : 'w-[250px] rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 text-[var(--ink)] shadow-[var(--shadow)]';

  return (
    <div className="relative flex-none">
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass}
        onClick={() => {
          if (open) close();
          else {
            setOpen(true);
            window.requestAnimationFrame(updatePosition);
          }
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={label}
        {...(triggerTestId ? { [triggerTestId]: '' } : {})}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>

      {open && position && createPortal(
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={label}
          className={`fixed z-[140] ${menuClass}`}
          style={{ top: position.top, left: position.left }}
          {...(menuTestId ? { [menuTestId]: '' } : {})}
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            const itemClass = variant === 'sidebar' ? sidebarItem : surfaceItem;
            return (
              <React.Fragment key={item.id}>
                {item.dividerBefore && <div role="separator" className={variant === 'sidebar' ? 'my-1 border-t border-[rgba(231,224,214,.1)]' : 'my-1 border-t border-[var(--line)]'} />}
                <button
                  ref={element => { itemRefs.current[index] = element; }}
                  type="button"
                  role="menuitem"
                  className={`${itemClass} ${item.danger ? 'text-[#A16C62] hover:bg-[var(--danger-soft)] hover:text-[#A16C62]' : ''}`}
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    void item.onSelect();
                  }}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.external && <ExternalLink size={13} className="flex-none opacity-70" aria-hidden="true" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
};
