import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type ProvisionStatus = { provisioned?: boolean; url?: string | null };

/** The storefront's live origin (custom domain when connected), or null when no storefront is provisioned. */
export function useStorefrontUrl() {
  const { data } = useQuery<string | null>({
    queryKey: ["/api/storefront/provision"],
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      const res = await apiFetch("/api/storefront/provision");
      if (!res.ok) return null;
      const json = (await res.json().catch(() => ({}))) as ProvisionStatus;
      return json.provisioned && json.url ? json.url.replace(/\/+$/, "") : null;
    },
  });
  return data ?? null;
}
