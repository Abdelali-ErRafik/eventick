import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../api";
import { useAuth } from "../../AuthContext";
import { useI18n } from "../../i18n";
import { longDate } from "../../utils";
import { useConfirm } from "./ConfirmContext";
import { Badge, EmptyState, FilterBar, InfoTip, PageHead, Pager, PersonCell } from "./ui";
import { text } from "./copy";

const PAGE_SIZE_DEFAULT = 20;
const ROLES = ["CUSTOMER", "ORGANISER", "ADMIN"];

/**
 * Administration — the users directory, ADMIN-only (both at the route via
 * Protected and here as a defence-in-depth 403 if that guard were ever
 * dropped).
 *
 * This is the actual fix for "every role sees the same pages": ADMIN and
 * ORGANISER were functionally identical everywhere except the one backend
 * endpoint (PATCH /auth/users/:id/role) this screen finally gives a UI to.
 * Role changes go through the same confirm-dialog pattern as every other
 * destructive-ish action in /pro (Orders' cancel/refund), and the caller's
 * own row is disabled rather than left to fail server-side — the backend
 * guard against self-demotion still exists, this just means nobody hits it
 * by accident.
 */
export default function Users() {
  const { locale, tf } = useI18n();
  const t = text[locale];
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const [users, setUsers] = useState(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE_DEFAULT);
  const [busyId, setBusyId] = useState(null);

  const load = () => api.get("/auth/users").then((data) => setUsers(data.users));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, role, limit]);

  const roleLabel = (value) => (value === "ADMIN" ? t.roleAdmin : value === "ORGANISER" ? t.roleOrganiser : t.roleCustomer);
  const roleTone = (value) => (value === "ADMIN" ? "info" : value === "ORGANISER" ? "success" : "neutral");

  const allRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (role && u.role !== role) return false;
      if (!needle) return true;
      return `${u.name} ${u.email}`.toLowerCase().includes(needle);
    });
  }, [users, query, role]);

  const pages = Math.max(1, Math.ceil(allRows.length / limit));
  const rows = allRows.slice((page - 1) * limit, page * limit);
  const activeCount = [query, role].filter(Boolean).length;

  const changeRole = async (target, nextRole) => {
    const ok = await confirm({
      title: t.confirmRoleChangeTitle,
      message: `${roleLabel(nextRole)} ${t.confirmRoleChange.replace("{name}", target.name)}`,
      tone: "warn",
      confirmLabel: t.changeRole,
      cancelLabel: t.close,
    });
    if (!ok) return;

    setBusyId(target.id);
    try {
      await api.patch(`/auth/users/${target.id}/role`, { role: nextRole });
      await load();
      toast.success(t.roleChanged);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHead title={t.team} sub={t.teamSub} />

      <FilterBar
        search={{ value: query, onChange: setQuery, placeholder: t.search }}
        controls={[
          {
            key: "role",
            label: t.allRoles,
            value: role,
            onChange: (e) => setRole(e.target.value),
            style: { width: 170 },
            options: [
              { value: "", label: t.allRoles },
              { value: "CUSTOMER", label: t.roleCustomer },
              { value: "ORGANISER", label: t.roleOrganiser },
              { value: "ADMIN", label: t.roleAdmin },
            ],
          },
        ]}
        activeCount={activeCount}
        resetLabel={t.reset}
        onReset={() => {
          setQuery("");
          setRole("");
        }}
      />

      {users && rows.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="size-6" />} title={activeCount ? t.noUsersFilter : t.noUsersYet} />
      ) : (
        <div className="grid gap-3">
          {rows.map((u) => {
            const isSelf = u.id === me?.id;
            return (
              <article key={u.id} className="flex flex-wrap items-center gap-4 rounded-card border border-line/10 bg-card p-4 shadow-card">
                <div className="min-w-0 flex-1">
                  <PersonCell name={u.name} sub={u.email} />
                </div>

                <div className="flex shrink-0 items-center gap-4 text-xs text-muted">
                  <span>
                    {t.eventsCount} <span className="font-bold tabular-nums text-ink">{u.eventCount}</span>
                  </span>
                  <span>
                    {t.ordersCount} <span className="font-bold tabular-nums text-ink">{u.orderCount}</span>
                  </span>
                  <span>
                    {t.joined} {longDate(u.createdAt, locale)}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={roleTone(u.role)}>{roleLabel(u.role)}</Badge>
                  <label className="sr-only" htmlFor={`role-${u.id}`}>
                    {t.changeRole}
                  </label>
                  <select
                    id={`role-${u.id}`}
                    value={u.role}
                    disabled={isSelf || busyId === u.id}
                    onChange={(e) => changeRole(u, e.target.value)}
                    title={isSelf ? t.cannotChangeOwnRole : t.changeRole}
                    className="h-10 rounded-control border border-line/20 bg-card px-2.5 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ROLES.map((value) => (
                      <option key={value} value={value}>
                        {roleLabel(value)}
                      </option>
                    ))}
                  </select>
                  {isSelf ? <InfoTip text={t.cannotChangeOwnRole} /> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Pager page={page} pages={pages} onPage={setPage} limit={limit} onLimit={setLimit} labels={{ rows: t.rows, prev: t.prev, next: t.next }} />
    </div>
  );
}
