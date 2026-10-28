import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

/**
 * Route guard. Gate on a capability (`permission`) wherever possible —
 * `roles` remains for the rare case that genuinely means "is this person a
 * CUSTOMER", not "may they do X".
 *
 * This is a redirect, not security. The server refuses the same request
 * regardless; what this prevents is rendering a screen that would then fire
 * a string of 403s at someone who was never meant to see it.
 */
export function Protected({ children, roles, permission }) {
  const { user, loading, can } = useAuth();

  if (loading) return <div className="p-8 text-center text-muted">...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  if (permission && !can(permission)) return <Navigate to="/" replace />;

  return children;
}
