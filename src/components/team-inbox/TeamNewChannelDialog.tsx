import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, X } from "@phosphor-icons/react";
import { Avatar } from "@/components/arc/avatar/avatar";
import { cn } from "@/lib/utils";
import type { TeamChatStaff } from "@/lib/teamChat";

const label = "text-[8px] font-medium uppercase tracking-[0.3em] text-black/45";
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Name a channel and choose who is in it. The creator is always added.
export function TeamNewChannelDialog({ open, onOpenChange, staff, viewerId, onCreate }: {
  open: boolean; onOpenChange: (open: boolean) => void; staff: TeamChatStaff[]; viewerId: string;
  onCreate: (input: { name: string; topic: string; memberIds: string[] }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const reduceMotion = useReducedMotion();
  const teammates = staff.filter((member) => member.user_id !== viewerId);
  const allPicked = teammates.length > 0 && picked.length === teammates.length;

  const reset = () => { setName(""); setTopic(""); setPicked([]); };
  const toggle = (id: string) => setPicked((all) => all.includes(id) ? all.filter((value) => value !== id) : [...all, id]);
  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const created = await onCreate({ name, topic, memberIds: picked });
    setSaving(false);
    if (created) { reset(); onOpenChange(false); }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: 0.15, ease: "easeIn" } }}
              />
            </DialogPrimitive.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <DialogPrimitive.Content asChild forceMount>
                <motion.div
                  className="team-chat-theme pointer-events-auto relative flex max-h-[85dvh] w-full max-w-[420px] flex-col gap-5 overflow-y-auto rounded-[20px] bg-[#FAFAF8] p-6 text-[#0b0b0a] shadow-[0_30px_80px_-30px_rgba(11,11,10,0.5)] outline-none"
                  style={{ transformOrigin: "center" }}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
                  animate={reduceMotion ? { opacity: 1, transition: { duration: 0.15 } } : { opacity: 1, scale: 1, y: 0, transition: { duration: 0.26, ease: EASE_OUT } }}
                  exit={reduceMotion ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.16, ease: "easeIn" } }}
                >
                  <DialogPrimitive.Close aria-label="Close" className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-black/55 transition-[background-color,color,transform] duration-150 ease-out hover:bg-black/[0.05] hover:text-black active:scale-[0.94]">
                    <X weight="light" size={18} />
                  </DialogPrimitive.Close>
                  <div className="space-y-1">
                    <p className={label}>New channel</p>
                    <DialogPrimitive.Title className="text-[19px] font-semibold tracking-tight">Create a channel</DialogPrimitive.Title>
                    <DialogPrimitive.Description className="text-[12px] text-black/50">Only the people you add can see it. You can change members later.</DialogPrimitive.Description>
                  </div>
                  <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[12px] font-medium">Name</span>
                      <span className="flex h-10 items-center gap-1 rounded-xl border border-[#e3e2de] bg-white px-3 focus-within:border-black/40">
                        <span className="text-black/35">#</span>
                        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="eid-orders"
                          className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-black/30" />
                      </span>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[12px] font-medium">Description <span className="font-normal text-black/40">optional</span></span>
                      <input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={200} placeholder="What this channel is for"
                        className="h-10 rounded-xl border border-[#e3e2de] bg-white px-3 text-[13px] outline-none placeholder:text-black/30 focus:border-black/40" />
                    </label>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-medium">Members <span className="font-normal text-black/40">{picked.length + 1} incl. you</span></span>
                        {teammates.length > 0 && (
                          <button type="button" onClick={() => setPicked(allPicked ? [] : teammates.map((member) => member.user_id))} className="text-[11.5px] font-medium text-black/55 hover:text-black">
                            {allPicked ? "Clear" : "Add everyone"}
                          </button>
                        )}
                      </div>
                      <ul className="max-h-56 overflow-y-auto rounded-xl border border-[#e3e2de] bg-white p-1">
                        {teammates.map((member) => {
                          const on = picked.includes(member.user_id);
                          return (
                            <li key={member.user_id}>
                              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(member.user_id)}
                                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-black/[0.035]">
                                <Avatar name={member.display_name} size="sm" status={member.online ? "online" : "offline"} />
                                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{member.display_name}</span>
                                <span className={cn("inline-flex h-[18px] w-[18px] items-center justify-center rounded-md border transition-colors duration-150",
                                  on ? "border-[#0b0b0a] bg-[#0b0b0a] text-white" : "border-[#d3d2cd] bg-white text-transparent")}>
                                  <Check weight="bold" size={11} />
                                </span>
                              </button>
                            </li>
                          );
                        })}
                        {!teammates.length && <li className="px-2 py-2 text-[12px] text-black/40">No teammates yet.</li>}
                      </ul>
                    </div>
                    <button type="submit" disabled={!name.trim() || saving}
                      className="h-10 rounded-xl bg-[#0b0b0a] text-[13px] font-medium text-white transition-[transform,opacity] duration-150 ease-out active:scale-[0.98] disabled:opacity-40">
                      {saving ? "Creating…" : "Create channel"}
                    </button>
                  </form>
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
