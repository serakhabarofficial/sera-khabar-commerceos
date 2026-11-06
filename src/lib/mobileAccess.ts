import { useSyncExternalStore } from "react";

// The phone layout: below Tailwind's md breakpoint, the same line the bottom dock appears at.
const PHONE_QUERY = "(max-width: 767px)";

/** True on a phone-width screen. Read synchronously, so a page is never drawn and then taken away. */
export function useIsPhone() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(PHONE_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

/**
 * Admins have every page. On a phone a team member works from Orders and Team Inbox only: no Home, no Products
 * (and so no More, which is how a phone reaches the rest of the sidebar). This shapes the phone experience;
 * it is not an access control, which the server enforces.
 */
export const TEAM_PHONE_HOME = "/orders";
export const isHiddenFromTeamOnPhone = (pathname: string) => pathname === "/" || pathname === "/products" || pathname.startsWith("/products/");
