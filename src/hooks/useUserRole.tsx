import { useMe } from "@/hooks/useMe";

export function useUserRole() {
  const { data, isLoading } = useMe();
  const role = data?.role ?? null;

  const isAdmin = role === "admin";
  const isTeamMember = role === "team_member";
  const canViewReports = isAdmin || data?.canViewReports === true;

  return { role, isAdmin, isTeamMember, canViewReports, loading: isLoading };
}
