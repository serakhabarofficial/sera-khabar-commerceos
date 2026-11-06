import { Hash } from "@phosphor-icons/react";
import type { TeamChatStaff } from "@/lib/teamChat";

const COLORS = ["#0ea5a4", "#f59e0b", "#a78bfa", "#ec4899", "#22a05b", "#0a7cff", "#ef4444", "#64748b"];
// The same person always gets the same colour, in the list, the header and their messages.
const colorOf = (id: string) => COLORS[[...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % COLORS.length];

/**
 * A channel's face, like a Messenger group: two of its people as overlapping circles.
 * Whoever spoke last comes first, then the rest by name; you only appear when nobody else is in it.
 * Falls back to a # when the members are not known yet.
 */
export function TeamChannelAvatar({ members, staff, viewerId, lastAuthor, size }: {
  members?: string[] | null; staff: TeamChatStaff[]; viewerId: string; lastAuthor?: string | null; size: number;
}) {
  const byId = new Map(staff.map((person) => [person.user_id, person]));
  const people = (members ?? []).filter((id) => byId.has(id));
  const others = people.filter((id) => id !== viewerId)
    .sort((a, b) => Number(b === lastAuthor) - Number(a === lastAuthor) || byId.get(a)!.display_name.localeCompare(byId.get(b)!.display_name));
  const shown = (others.length ? others : people).slice(0, 2);

  if (!shown.length) {
    return (
      <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#f0f0f0] text-[#0a7cff]" style={{ width: size, height: size }}>
        <Hash weight="bold" size={Math.round(size * 0.42)} />
      </span>
    );
  }
  const face = shown.length === 1 ? size : Math.round(size * 0.66);
  return (
    <span aria-hidden="true" className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {shown.map((id, index) => (
        <span key={id} className="absolute inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-white"
          style={{
            width: face, height: face, fontSize: face * 0.42, background: colorOf(id),
            ...(shown.length === 1 ? { inset: 0 } : index === 0 ? { right: 0, top: 0 } : { bottom: 0, left: 0 }),
          }}>
          {byId.get(id)!.display_name.trim()[0]?.toUpperCase()}
        </span>
      ))}
    </span>
  );
}
