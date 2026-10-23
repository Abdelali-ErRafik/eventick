import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export function Protected({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-8 text-center text-muted">...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}
