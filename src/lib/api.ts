import { getOrderHandlingSession, ORDER_HANDLING_CONFLICT_EVENT } from "@/lib/orderHandling";
import { supabase } from "@/integrations/supabase/client";

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const headers = new Headers(options.headers);
  if (!headers.has("X-Order-Handling-Session")) headers.set("X-Order-Handling-Session", getOrderHandlingSession());
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const reportConflict = async (response: Response) => {
    if (response.status === 409) {
      const body = await response.clone().json().catch(() => null);
      if (body?.code === "ORDER_HANDLING_CONFLICT") window.dispatchEvent(new CustomEvent(ORDER_HANDLING_CONFLICT_EVENT, { detail: body }));
    }
    return response;
  };
  const res = await fetch(url, {
    ...options,
    headers,
  });
  // Token may have expired between getSession() and the request while the
  // auto-refresh was still in flight. Retry once with a fresh token so a
  // transient 401 doesn't surface as "needs onboarding" / "failed to load".
  if (res.status !== 401) return reportConflict(res);
  try {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    const newToken = refreshed?.access_token;
    if (!newToken || newToken === token) return res;
    headers.set("Authorization", `Bearer ${newToken}`);
    return reportConflict(await fetch(url, {
      ...options,
      headers,
    }));
  } catch {
    return res;
  }
}

export type AppConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  stripePublishableKey?: string;
  aiProvider?: string;
  aiDefaultModel?: string;
};

let cachedConfig: AppConfig | null = null;

// Fetches /api/config once and caches it. Safe to call repeatedly.
export async function getAppConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (res.ok) cachedConfig = (await res.json()) as AppConfig;
  } catch {
    // ignore — fall back to defaults
  }
  return cachedConfig ?? ({} as AppConfig);
}
