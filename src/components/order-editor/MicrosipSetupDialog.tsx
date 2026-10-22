import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, DownloadSimple } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyTextToClipboard } from "./CustomerPanel";

export const callHelperKeyQueryKey = ["/api/order-calls/helper-key"];
const FOLDER = "C:\\SeraKhabar";
const SETUP_FILE_NAME = "SeraKhabar-MicroSIP-setup.bat";
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

const curlLine = (event: string, key: string, origin: string) =>
  `curl -s -m 5 -G -X POST -H "Authorization: Bearer ${key}" --data-urlencode "event=${event}" --data-urlencode "number=%~1" "${origin}/api/webhooks/microsip"`;

/** The helper file MicroSIP runs for one event. */
export function microsipHelperFile(event: string, key: string, origin: string) {
  return `@echo off\r\n${curlLine(event, key, origin)} >nul 2>&1\r\n`;
}

export function microsipIniLines() {
  return EVENTS.map(({ setting, file }) => `${setting}=${FOLDER}\\${file}`).join("\n");
}

// Edits microsip.ini: MicroSIP is stopped first (it rewrites the file when it
// closes), the four cmd* lines are replaced under [Settings] in the file's own
// encoding, and MicroSIP is started again. Single quotes only, so it can sit
// inside the setup file's double-quoted -Command.
function microsipIniEditor() {
  const add = EVENTS.map(({ setting, file }) => `'${setting}=${FOLDER}\\${file}'`).join(",");
  return [
    "$p=Get-Process microsip -ErrorAction SilentlyContinue | Select-Object -First 1",
    "$exe=$null",
    "if($p){$exe=$p.Path}",
    "$c=@((Join-Path $env:APPDATA 'MicroSIP\\microsip.ini'))",
    "if($exe){$c+=(Join-Path (Split-Path $exe) 'microsip.ini')}",
    "$ini=$c | Where-Object {Test-Path $_} | Select-Object -Last 1",
    "if(-not $ini){Write-Host 'MicroSIP settings were not found. Open MicroSIP once, then run this file again.'; exit 1}",
    "if($p){Stop-Process -Id $p.Id -Force; Start-Sleep -Seconds 1}",
    "$b=[System.IO.File]::ReadAllBytes($ini)",
    "$enc=[System.Text.Encoding]::Default",
    "if($b.Length -ge 2 -and $b[0] -eq 255 -and $b[1] -eq 254){$enc=[System.Text.Encoding]::Unicode}",
    "$k=[System.IO.File]::ReadAllText($ini,$enc) -split '\\r?\\n' | Where-Object {$_ -notmatch '^cmd(IncomingCall|CallAnswer|CallStart|CallEnd)='}",
    `$add=@(${add})`,
    "$o=New-Object System.Collections.Generic.List[string]",
    "$d=$false",
    "foreach($l in $k){$o.Add($l); if(-not $d -and $l -match '^\\[Settings\\]'){$o.AddRange([string[]]$add); $d=$true}}",
    "if(-not $d){$o.Add('[Settings]'); $o.AddRange([string[]]$add)}",
    "[System.IO.File]::WriteAllText($ini,($o -join [Environment]::NewLine),$enc)",
    "if(-not $exe){foreach($x in @((Join-Path ${env:ProgramFiles(x86)} 'MicroSIP\\microsip.exe'),(Join-Path $env:ProgramFiles 'MicroSIP\\microsip.exe'),(Join-Path $env:LOCALAPPDATA 'MicroSIP\\microsip.exe'))){if(Test-Path $x){$exe=$x; break}}}",
    "if($exe){Start-Process $exe}",
  ].join("; ");
}

/**
 * One file staff download and double-click: it writes the four helper files
 * with their key and connects them in microsip.ini, then restarts MicroSIP.
 */
export function microsipSetupFile(key: string, origin: string) {
  const helpers = EVENTS.flatMap(({ event, file }) => [
    `>"%DIR%\\${file}" echo @echo off`,
    // %%~1 becomes %~1 and ^> becomes > in the written file.
    `>>"%DIR%\\${file}" echo ${curlLine(event, key, origin).replace("%~1", "%%~1")} ^>nul 2^>^&1`,
  ]);
  return [
    "@echo off",
    "title Sera Khabar - MicroSIP setup",
    "echo Setting up the Sera Khabar call log for MicroSIP...",
    `set "DIR=${FOLDER}"`,
    'if not exist "%DIR%" mkdir "%DIR%"',
    ...helpers,
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "${microsipIniEditor()}"`,
    "echo.",
    "if errorlevel 1 (",
    "  echo Setup could not finish. Send a photo of this window to your admin.",
    ") else (",
    "  echo Done. MicroSIP has restarted. Call your own mobile from an order to test it.",
    ")",
    "echo.",
    "pause",
    "",
  ].join("\r\n");
}

function downloadTextFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const origin = window.location.origin;
  const create = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/order-calls/helper-key", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not create the setup file");
      return json as { key: string };
    },
    onSuccess: ({ key: created }) => {
      setKey(created);
      downloadTextFile(SETUP_FILE_NAME, microsipSetupFile(created, origin));
      void queryClient.invalidateQueries({ queryKey: callHelperKeyQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["/api/order-calls/incoming"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setKey(null); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set up MicroSIP</DialogTitle>
          <DialogDescription>
            Do this once on your own Windows PC, logged in as yourself. Then calls save by themselves under your name.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-3 text-[13px] text-black/75">
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black text-[12px] font-medium text-white">1</span>
            <div className="flex min-w-0 flex-col gap-2">
              <span>Download your setup file.</span>
              <button type="button" onClick={() => create.mutate()} disabled={create.isPending}
                className="inline-flex items-center gap-2 self-start rounded-[10px] bg-black px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#262626] active:scale-[0.97] disabled:opacity-40">
                <DownloadSimple weight="light" size={16} />{create.isPending ? "Preparing…" : key ? "Download again" : "Download setup file"}
              </button>
              {status.data?.configured && !key && <span className="text-[11.5px] text-black/45">You set this up before. A new file replaces the old one.</span>}
            </div>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/[0.08] text-[12px] font-medium text-black">2</span>
            <span>Open the downloaded file. If your browser asks, click <b className="font-medium text-black">Keep</b>. If Windows shows “Windows protected your PC”, click <b className="font-medium text-black">More info</b>, then <b className="font-medium text-black">Run anyway</b>.</span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/[0.08] text-[12px] font-medium text-black">3</span>
            <span>When it says <b className="font-medium text-black">Done</b>, call your own mobile from an order. It should show <b className="font-medium text-black">Answered</b> with the call length.</span>
          </li>
        </ol>

        <p className="text-[11.5px] text-black/45">The file holds your personal key. Don't share it.</p>

        {key && (
          <details className="text-[12.5px] text-black/70">
            <summary className="cursor-pointer text-[#0262B8]">Set up by hand instead</summary>
            <ol className="mt-3 flex list-decimal flex-col gap-4 pl-4 marker:text-black/40">
              <li>Make a folder <span className="font-mono">{FOLDER}</span>.</li>
              <li className="flex flex-col gap-3">
                <span>In Notepad, save each of these 4 files in that folder, with “All files” as the type.</span>
                {EVENTS.map(({ event, file }) => <CopyBlock key={file} label={file} text={microsipHelperFile(event, key, origin)} />)}
              </li>
              <li className="flex flex-col gap-2">
                <span>Close MicroSIP. Open <span className="font-mono">microsip.ini</span> (in <span className="font-mono">%APPDATA%\MicroSIP</span>), add these lines under <span className="font-mono">[Settings]</span>, save, and start MicroSIP again.</span>
                <CopyBlock label="microsip.ini" text={microsipIniLines()} />
              </li>
            </ol>
          </details>
        )}
      </DialogContent>
    </Dialog>
  );
}
