import { createFileRoute, redirect } from "@tanstack/react-router";
import { proSearch } from "@/lib/pro";

export const Route = createFileRoute("/strategie")({
  beforeLoad: () => {
    throw redirect({ to: "/pro", search: proSearch() });
  },
});
