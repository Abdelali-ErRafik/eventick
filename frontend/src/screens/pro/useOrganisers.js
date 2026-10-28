import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../AuthContext";

/**
 * The organiser list backing the "all organisers / one organiser" filter on
 * Events, Orders and Finance. Only fetched for an admin — a plain organiser
 * never sees the control, so there's nothing to load for them.
 *
 * Shared across the three screens instead of being re-fetched and
 * re-rendered three times with copy-pasted logic, same reasoning as
 * EventSwitcher being one component instead of three inline pickers.
 */
export function useOrganisers() {
  const { isAdmin } = useAuth();
  const [organisers, setOrganisers] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get("/auth/users?role=ORGANISER")
      .then((data) => setOrganisers(data.users))
      .catch(() => {});
  }, [isAdmin]);

  return { isAdmin, organisers };
}
