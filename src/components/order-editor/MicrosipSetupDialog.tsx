import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyTextToClipboard } from "./CustomerPanel";

export const callHelperKeyQueryKey = ["/api/order-calls/helper-key"];
const FOLDER = "C:\\SeraKhabar";
// One small file per MicroSIP event; MicroSIP passes the caller ID as the first argument.
const EVENTS = [
  { event: "incoming", file: "sk-incoming.bat", setting: "cmdIncomingCall" },
  { event: "answer", file: "sk-answer.bat", setting: "cmdCallAnswer" },
  { event: "start", file: "sk-start.bat", setting: "cmdCallStart" },
  { event: "end", file: "sk-end.bat", setting: "cmdCallEnd" },
] as const;

export function useCallHelperKey() {
  return useQuery<{ configured: boolean; created_at: string | null; last_used_at: string | null }>({
    queryKey: callHelperKeyQueryKey,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await apiFetch("/api/order-calls/helper-key");
      if (!res.ok) throw new Error("Could not check MicroSIP");
      return res.json();
    },
  });
}

/** The helper file MicroSIP runs for one event. */
export function microsipHelperFile(event: string, key: string, origin: string) {
  return `@echo off\r\ncurl -s -m 5 -G -X POST -H "Authorization: Bearer ${key}" --data-urlencode "event=${event}" --data-urlencode "number=%~1" "${origin}/api/webhooks/microsip" >nul 2>&1\r\n`;
}

export function microsipIniLines() {
  return EVENTS.map(({ setting, file }) => `${setting}=${FOLDER}\\${file}`).join("\n");
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[11.5px] text-black/70">{label}</span>
        <button type="button" onClick={async () => { if (await copyTextToClipboard(text)) { setCopied(true); window.setTimeout(() => setCopied(false), 1500); } }}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] text-black/60 transition hover:bg-black/[0.05] hover:text-black">
          {copied ? <Check weight="light" size={13} /> : <Copy weight="light" size={13} />}{copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre rounded-lg bg-black/[0.04] p-2.5 font-mono text-[11px] leading-relaxed text-black/80">{text.replace(/\r\n/g, "\n").trim()}</pre>
    </div>
  );
}

export function MicrosipSetupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const status = useCallHelperKey();
  const [key, setKey] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/order-calls/helper-key", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not create the key");
      return json as { key: string };
    },
    onSuccess: ({ key: created }) => {
      setKey(created);
      void queryClient.invalidateQueries({ queryKey: callHelperKeyQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["/api/order-calls/incoming"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const origin = window.location.origin;

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setKey(null); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set up MicroSIP</DialogTitle>
          <DialogDescription>
            Do this once on your own Windows PC. MicroSIP will then tell the app when a customer picks up and when the call ends, and calls save under your name.
          </DialogDescription>
        </DialogHeader>

        {!key ? (
          <div className="flex flex-col gap-3 text-[13px] text-black/70">
            {status.data?.configured && <p>You already have a key. Making a new one stops the old one, so update the files on your PC too.</p>}
            <button type="button" onClick={() => create.mutate()} disabled={create.isPending}
              className="self-start rounded-[10px] bg-black px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#262626] active:scale-[0.97] disabled:opacity-40">
              {create.isPending ? "Creating…" : status.data?.configured ? "Make a new key" : "Create my key"}
            </button>
          </div>
        ) : (
          <ol className="flex list-decimal flex-col gap-4 pl-4 text-[13px] text-black/75 marker:text-black/40">
            <li>Make a folder <span className="font-mono">{FOLDER}</span>.</li>
            <li className="flex flex-col gap-3">
              <span>In Notepad, save each of these 4 files in that folder. Choose “All files” as the type so the name ends in <span className="font-mono">.bat</span>. They contain your personal key, so don't share them.</span>
              {EVENTS.map(({ event, file }) => <CopyBlock key={file} label={file} text={microsipHelperFile(event, key, origin)} />)}
            </li>
            <li className="flex flex-col gap-2">
              <span>Close MicroSIP. Open <span className="font-mono">microsip.ini</span> (in <span className="font-mono">%APPDATA%\MicroSIP</span>, or next to MicroSIP), add these lines under <span className="font-mono">[Settings]</span>, and save.</span>
              <CopyBlock label="microsip.ini" text={microsipIniLines()} />
            </li>
            <li>Start MicroSIP again and call your own mobile from an order. The call should show as Answered with its length.</li>
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
