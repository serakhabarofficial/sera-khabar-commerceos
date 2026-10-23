import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, UsersThree } from "@phosphor-icons/react";
import { Avatar } from "@/components/arc/avatar/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiFetch } from "@/lib/api";
import { TEAM_CHAT_CHANNELS_KEY, postTeamChat, teamChatThreadKey, type TeamChatStaff } from "@/lib/teamChat";

const label = "text-[8px] font-medium uppercase tracking-[0.3em] text-black/45";

// Who is in a channel. Admins add and remove people here; #general always
// has everyone, so it only lists them.
export function TeamChannelMembers({ channelId, channelName, memberIds, staff, viewerId, canManage, onLeft }: {
  channelId: string; channelName: string; memberIds: string[]; staff: TeamChatStaff[]; viewerId: string; canManage: boolean; onLeft: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const everyone = channelName === "general";
  const editable = canManage && !everyone;
  const members = staff.filter((member) => memberIds.includes(member.user_id));
  const others = staff.filter((member) => !memberIds.includes(member.user_id));

  const change = async (userId: string, add: boolean) => {
    setBusy(userId);
    try {
      if (add) await postTeamChat(`/api/team-chat/channels/${channelId}/members`, { user_id: userId });
      else {
        const response = await apiFetch(`/api/team-chat/channels/${channelId}/members/${userId}`, { method: "DELETE" });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not remove them");
      }
      if (!add && userId === viewerId) {
        onLeft();
        void queryClient.invalidateQueries({ queryKey: TEAM_CHAT_CHANNELS_KEY });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: teamChatThreadKey(channelId) });
      void queryClient.invalidateQueries({ queryKey: TEAM_CHAT_CHANNELS_KEY });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update members");
    } finally {
      setBusy(null);
    }
  };

  const person = (member: TeamChatStaff, action?: ReactNode) => (
    <li key={member.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
      <Avatar name={member.display_name} size="sm" status={member.online ? "online" : "offline"} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
        {member.display_name}{member.user_id === viewerId && <span className="font-normal text-black/40"> (you)</span>}
      </span>
      {action}
    </li>
  );

  return (
    <Popover>
      <PopoverTrigger className="ml-auto inline-flex h-8 items-center gap-2 rounded-lg px-2 text-[12px] text-black/60 outline-none transition-[background-color,transform] duration-150 ease-out hover:bg-black/[0.05] hover:text-black focus-visible:ring-2 focus-visible:ring-black/15 active:scale-[0.97]">
        <span className="flex -space-x-1.5">
          {members.slice(0, 3).map((member) => <Avatar key={member.user_id} name={member.display_name} size="sm" className="ring-2 ring-[#FAFAF8]" />)}
        </span>
        <span className="tabular-nums">{memberIds.length}</span>
        <UsersThree weight="light" size={15} />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="team-chat-theme w-72 rounded-xl border-[#ecebe7] bg-[#FAFAF8] p-2">
        <p className={`${label} px-2 pb-1 pt-1.5`}>{memberIds.length} in #{channelName}</p>
        {everyone && <p className="px-2 pb-1 text-[11px] text-black/45">Everyone on the team is always here.</p>}
        <ul className="max-h-56 overflow-y-auto">
          {members.map((member) => person(member, editable && (
            <button type="button" disabled={busy === member.user_id} onClick={() => void change(member.user_id, false)}
              className="rounded-md px-2 py-1 text-[11px] text-black/50 transition-colors duration-150 hover:bg-[#FDECEC] hover:text-[#a12c2c] disabled:opacity-50">
              {member.user_id === viewerId ? "Leave" : "Remove"}
            </button>
          )))}
        </ul>
        {editable && others.length > 0 && (
          <>
            <p className={`${label} px-2 pb-1 pt-3`}>Add people</p>
            <ul className="max-h-48 overflow-y-auto">
              {others.map((member) => person(member, (
                <button type="button" disabled={busy === member.user_id} onClick={() => void change(member.user_id, true)} aria-label={`Add ${member.display_name}`}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-[#0b0b0a] px-2 text-[11px] font-medium text-white transition-transform duration-150 ease-out active:scale-[0.95] disabled:opacity-50">
                  <Plus weight="light" size={12} /> Add
                </button>
              )))}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
