import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../AuthContext";

/**
 * The organiser list backing the "all organisers / one organiser" filter on
 * Events, Orders and Finance.
 *
 * Two different capabilities are at play here and they are deliberately not
 * conflated:
 *
 *   - `scope.any` is what the FILTER means. Showing another organiser's rows
 *     is crossing the ownership boundary, and that is the permission the
 *     backend checks when it honours `?organiserId=`. Gating the control on
 *     the ADMIN role instead would render a filter that 403s for anyone
 *     granted scope.any without the role, and would keep rendering it for an
 *     admin whose scope.any was revoked.
 *
 *   - `users.manage` is what POPULATING it needs, because the names come
 *     from /auth/users — the admin directory. Someone can hold scope.any
 *     without it, so the fetch is guarded separately: they still get the
 *     filter, just with no name list to pick from, rather than a failed
 *     request on every mount.
 *
 * Shared across the three screens instead of being re-fetched and
 * re-rendered three times with copy-pasted logic, same reasoning as
 * EventSwitcher being one component instead of three inline pickers.
 */
export function useOrganisers() {
  const { can } = useAuth();
  const [organisers, setOrganisers] = useState([]);

  const maySeeEveryone = can("scope.any");
  const mayListUsers = can("users.manage");

  useEffect(() => {
    if (!maySeeEveryone || !mayListUsers) return;
    api
      .get("/auth/users?role=ORGANISER")
      .then((data) => setOrganisers(data.users))
      .catch(() => {});
  }, [maySeeEveryone, mayListUsers]);

  return { maySeeAllOrganisers: maySeeEveryone, organisers };
}
