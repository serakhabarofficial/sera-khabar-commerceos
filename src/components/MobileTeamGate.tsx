import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { TEAM_PHONE_HOME, isHiddenFromTeamOnPhone, useIsPhone } from "@/lib/mobileAccess";

/** Sends a team member who lands on Home or Products from a phone to Orders. Everyone else, and every other page, passes through. */
export function MobileTeamGate({ children }: { children: ReactNode }) {
  const { isTeamMember, loading } = useUserRole();
  const phone = useIsPhone();
  const { pathname } = useLocation();

  if (!phone || !isHiddenFromTeamOnPhone(pathname)) return <>{children}</>;
  // The role isn't known yet: hold the page back rather than flash it at someone who may not be allowed it.
  if (loading) return null;
  return isTeamMember ? <Navigate to={TEAM_PHONE_HOME} replace /> : <>{children}</>;
}
