import { useEffect, useMemo, useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { IconButton } from "../../../ui";
import { cn } from "../../../utils";

/**
 * Dashboard navigation.
 *
 * Rebuilt rather than patched. The previous sidebar expanded on hover when
 * collapsed, which meant the nav moved under the pointer on the way to the
 * page content and covered it — a rail should stay a rail until asked. It also
 * put a search box above the nav that filtered seven links, spending permanent
 * vertical space on a problem seven items do not have.
 *
 * So: the rail is stable, the groups are always visible, and the active item
 * is marked by a start bar plus weight rather than a filled pill, which at
 * seven items was the loudest thing on the screen.
 */

export function Sidebar({ sections, open, onClose, collapsed, onToggleCollapsed, labels }) {
  const panelRef = useRef(null);
  const firstLinkRef = useRef(null);

  // The drawer is modal on phones: Escape closes it and focus moves inside,
  // so a keyboard user is not left tabbing the page behind an overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstLinkRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const groups = useMemo(() => {
    const out = [];
    for (const section of sections) {
      let bucket = out.find((group) => group.name === section.group);
      if (!bucket) {
        bucket = { name: section.group, items: [] };
        out.push(bucket);
      }
      bucket.items.push(section);
    }
    return out;
  }, [sections]);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-[55] bg-encre/50 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
          role="presentation"
        />
      ) : null}

      <aside
        ref={panelRef}
        aria-label={labels.nav}
        className={cn(
          "fixed inset-y-0 z-[60] flex flex-col border-e border-line/10 bg-card",
          "transition-[width,transform] duration-200 ease-out",
          "lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          collapsed ? "w-[76px]" : "w-[260px]",
          // RTL slides the drawer in from the other edge.
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0",
        )}
      >
        {/* Brand */}
        <div className={cn("flex h-16 shrink-0 items-center gap-2 border-b border-line/10 px-4", collapsed && "justify-center px-0")}>
          <Link
            to="/pro"
            className={cn(
              "flex min-w-0 items-center gap-2.5 rounded-lg font-display font-extrabold tracking-tight",
              collapsed && "justify-center",
            )}
          >
            <span
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg text-[15px]"
              aria-hidden
            >
              E
            </span>
            {!collapsed ? (
              <span className="min-w-0 truncate text-[17px]">
                Eventick<span className="text-accent">.ma</span>
              </span>
            ) : null}
          </Link>
          {!collapsed ? (
            <IconButton label={labels.close} size="sm" className="ms-auto lg:hidden" onClick={onClose}>
              <X className="size-5" />
            </IconButton>
          ) : null}
        </div>

        {/* Nav */}
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group, groupIndex) => (
            <div key={group.name} className={cn(groupIndex > 0 && "mt-5")}>
              {collapsed ? (
                <div className="mx-2 mb-2 border-t border-line/10" aria-hidden />
              ) : (
                <p className="px-3 pb-2 text-[11px] font-extrabold uppercase tracking-[0.09em] text-muted">{group.name}</p>
              )}

              <ul className="grid gap-0.5">
                {group.items.map((item, itemIndex) => (
                  <li key={item.to}>
                    <NavLink
                      ref={groupIndex === 0 && itemIndex === 0 ? firstLinkRef : undefined}
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-semibold transition",
                          collapsed ? "justify-center px-0" : "px-3",
                          isActive
                            ? "bg-brume text-primary"
                            : "text-muted hover:bg-paper hover:text-ink",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* A start bar, not a filled pill: it marks the
                              active row without shouting over six others. */}
                          <span
                            className={cn(
                              "absolute inset-y-1.5 start-0 w-[3px] rounded-full transition",
                              isActive ? "bg-primary" : "bg-transparent",
                            )}
                            aria-hidden
                          />
                          <span className="shrink-0" aria-hidden>
                            {item.icon}
                          </span>
                          {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                          {item.badge > 0 ? (
                            collapsed ? (
                              <span className="absolute end-2.5 top-2 size-2 rounded-full bg-accent" aria-hidden />
                            ) : (
                              <span className="min-w-5 shrink-0 rounded-full bg-accent px-1.5 text-center text-[11px] font-extrabold text-accent-fg tabular-nums">
                                {item.badge > 99 ? "99+" : item.badge}
                              </span>
                            )
                          ) : null}
                          {/* The count must be readable, not just visible. */}
                          {item.badge > 0 ? <span className="sr-only">{labels.pending}</span> : null}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse control, kept out of the nav's tab order at the bottom
            where it is not in the way of reaching the links. */}
        <div className={cn("hidden shrink-0 border-t border-line/10 p-3 lg:block", collapsed && "flex justify-center")}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? labels.expand : labels.collapse}
            aria-expanded={!collapsed}
            title={collapsed ? labels.expand : labels.collapse}
            className={cn(
              "flex items-center gap-2.5 rounded-xl py-2.5 text-[13px] font-semibold text-muted transition hover:bg-paper hover:text-ink",
              collapsed ? "size-10 justify-center" : "w-full px-3",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[18px] shrink-0 rtl:rotate-180" aria-hidden />
            ) : (
              <PanelLeftClose className="size-[18px] shrink-0 rtl:rotate-180" aria-hidden />
            )}
            {!collapsed ? <span className="truncate">{labels.collapse}</span> : null}
          </button>
        </div>
      </aside>
    </>
  );
}
