import { useEffect, useMemo, useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { IconButton } from "../../../ui";
import { cn } from "../../../utils";

/**
 * Dashboard navigation.
 *
 * The rail is stable — it no longer expands on hover when collapsed, which
 * used to slide the nav under the pointer on its way to the page content —
 * and the groups are always visible rather than hidden behind a search box
 * seven items did not need.
 *
 * Shape v3: every item carries its own icon tile instead of a bare glyph
 * sitting in the text colour, so the rail reads as a set of distinct
 * destinations rather than a plain link list — the same "give each thing
 * its own visual weight" move used on the card-grid screens. The active
 * tile still gets the solid violet fill; the rest get a neutral tile that
 * only lifts to brand colour on hover, so the active state stays the one
 * unambiguous signal.
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
          className="fixed inset-0 z-[55] bg-stage/50 backdrop-blur-[2px] lg:hidden"
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
        {/* Brand. A taller block than a plain header row, with the mark
            on its own line from the wordmark on desktop — closer to a
            masthead than a logo-plus-name strip. */}
        <div className={cn("flex shrink-0 flex-col gap-3 border-b border-line/10 px-4 py-4", collapsed && "items-center px-0")}>
          <div className="flex items-center gap-2">
            <Link
              to="/pro"
              className={cn("flex min-w-0 items-center gap-2.5 font-display font-bold tracking-tight", collapsed && "justify-center")}
            >
              <span
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-card bg-primary text-[17px] text-primary-fg"
                aria-hidden
              >
                E
              </span>
              {!collapsed ? (
                <span className="min-w-0 truncate text-[18px]">
                  Eventick<span className="border-b-2 border-accent pb-px">.ma</span>
                </span>
              ) : null}
            </Link>
            {!collapsed ? (
              <IconButton label={labels.close} size="sm" className="ms-auto lg:hidden" onClick={onClose}>
                <X className="size-5" />
              </IconButton>
            ) : null}
          </div>
          {!collapsed ? <p className="truncate text-[11px] font-bold uppercase tracking-[0.09em] text-muted">{labels.brand}</p> : null}
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

              <ul className="grid gap-1">
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
                          "group relative flex items-center gap-2.5 rounded-control py-2 text-sm font-semibold transition",
                          collapsed ? "justify-center px-0" : "px-2",
                          // Solid violet fill for the active row — matches the
                          // reference dashboard's nav exactly (pink is kept
                          // for the brand mark/avatar so the two read as
                          // distinct, deliberate colours rather than one hue
                          // used for everything).
                          isActive ? "bg-secondary text-secondary-fg" : "text-muted hover:bg-sunken hover:text-ink",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-control transition",
                              isActive ? "bg-secondary-fg/15" : "bg-sunken text-muted group-hover:bg-card group-hover:text-primary",
                            )}
                            aria-hidden
                          >
                            {item.icon}
                          </span>
                          {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                          {item.badge > 0 ? (
                            collapsed ? (
                              <span className="absolute end-2.5 top-2 size-2 rounded-full bg-accent" aria-hidden />
                            ) : (
                              <span
                                className={cn(
                                  "min-w-5 shrink-0 rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums",
                                  isActive ? "bg-secondary-fg/20 text-secondary-fg" : "bg-accent text-accent-fg",
                                )}
                              >
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
              "flex items-center gap-2.5 rounded-control py-2.5 text-[13px] font-semibold text-muted transition hover:bg-sunken hover:text-ink",
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
