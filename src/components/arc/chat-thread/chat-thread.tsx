"use client";

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ClipboardEvent as ReactClipboardEvent, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { ArrowDown, ArrowUp, FileText, Mic, Paperclip, Pause, Play, RotateCw, SmilePlus, X } from "lucide-react";
import { motionTokens } from "../lib/motion-tokens";
import styles from "./chat-thread.module.css";

export interface ChatParticipant {
  id: string;
  name: string;
  /** Portrait URL. Initials show when it is missing. */
  avatar?: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  kind: "image" | "file" | "audio";
  url?: string;
  /** Bytes. */
  size?: number;
  /** Intrinsic image size, used to reserve space before the image loads. */
  width?: number;
  height?: number;
  alt?: string;
  /** Length of a recording, in ms. Recorders often leave it out of the file, so it is passed alongside. */
  duration?: number;
}

export interface ChatReaction {
  emoji: string;
  count: number;
  /** The current user reacted with this emoji. */
  mine?: boolean;
}

export type ChatMessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface ChatMessage {
  id: string;
  authorId: string;
  text?: string;
  createdAt: Date | string | number;
  attachments?: ChatAttachment[];
  reactions?: ChatReaction[];
  /** Delivery state of the current user's own messages. */
  status?: ChatMessageStatus;
}

export interface ChatDraft {
  text: string;
  files: File[];
  /** A voice message recorded in the composer, sent on its own. */
  voice?: { file: File; durationMs: number };
}

/** Words the composer shows or announces. Each has an English default. */
export interface ChatComposerLabels {
  /** Accessible name of the send button. */
  send?: string;
  /** Accessible name of the attach button. */
  attach?: string;
  /** Accessible name of the list of files waiting to send. */
  attachments?: string;
  /** Accessible name of the button that takes a file back out. */
  removeFile?: (name: string) => string;
  /** Accessible name of the microphone button. */
  recordVoice?: string;
  /** Shown while recording. */
  recording?: string;
  /** Accessible name of the button that throws a recording away. */
  cancelRecording?: string;
  /** Accessible name of the button that sends a recording. */
  sendRecording?: string;
}

/** Every word the thread shows or announces. Each has an English default; words with a count or names are functions, so an app can apply its own plural rules. */
export interface ChatThreadLabels extends ChatComposerLabels {
  sending?: string;
  sent?: string;
  delivered?: string;
  read?: string;
  failed?: string;
  retry?: string;
  /** Accessible name of the read receipts under a message. */
  readBy?: (names: string[]) => string;
  /** Day separators for the last two days. Older days are formatted by `locale`. Defaults come from Intl for `locale`. */
  today?: string;
  yesterday?: string;
  /** Screen reader announcement of who is typing. */
  typing?: (names: string[]) => string;
  /** The pill when new messages land out of view. The count inside it rolls. */
  newMessages?: (count: number) => string;
  jumpToLatest?: string;
  /** Name shown for a message whose author is not in `participants`. */
  unknownAuthor?: string;
  addReaction?: string;
  /** Accessible name of the reaction picker and of the reactions under a message. */
  reactions?: string;
  /** Accessible name of an emoji in the picker. */
  reactWith?: (emoji: string) => string;
  /** Accessible name of a reaction under a message. */
  reactionCount?: (emoji: string, count: number, includesYou: boolean) => string;
  play?: string;
  pause?: string;
  /** Accessible name of a voice message's progress bar. */
  voiceMessage?: string;
}

const COMPOSER_LABELS: Required<ChatComposerLabels> = {
  send: "Send",
  attach: "Attach files",
  attachments: "Attachments",
  removeFile: name => `Remove ${name}`,
  recordVoice: "Record a voice message",
  recording: "Recording",
  cancelRecording: "Cancel recording",
  sendRecording: "Send voice message",
};

const firstName = (name: string) => name.split(" ")[0];
const THREAD_LABELS: Omit<Required<ChatThreadLabels>, "today" | "yesterday"> = {
  ...COMPOSER_LABELS,
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Not delivered",
  retry: "Retry",
  readBy: names => `Read by ${names.join(", ")}`,
  typing: names => names.length === 1 ? `${firstName(names[0]!)} is typing` : names.length === 2 ? `${firstName(names[0]!)} and ${firstName(names[1]!)} are typing` : "Several people are typing",
  newMessages: count => `${count} new ${count === 1 ? "message" : "messages"}`,
  jumpToLatest: "Jump to latest",
  unknownAuthor: "Unknown",
  addReaction: "Add reaction",
  reactions: "Reactions",
  reactWith: emoji => `React with ${emoji}`,
  reactionCount: (emoji, count, includesYou) => `${emoji} ${count}${includesYou ? ", including you" : ""}`,
  play: "Play",
  pause: "Pause",
  voiceMessage: "Voice message",
};

/** A key passed as undefined keeps its default too. */
const withDefaults = <T extends object, D extends object>(defaults: D, given?: T): D =>
  ({ ...defaults, ...Object.fromEntries(Object.entries(given ?? {}).filter(([, value]) => value !== undefined)) });

/** "Today" and "Yesterday" in the thread's language, from Intl, with a capital first letter. */
function relativeDay(locale: string, offset: 0 | -1) {
  const word = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(offset, "day");
  return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1);
}

export interface ChatThreadHandle {
  scrollToBottom: (smooth?: boolean) => void;
  focusComposer: () => void;
}

export interface ChatThreadProps {
  participants: ChatParticipant[];
  currentUserId: string;
  /** Controlled messages, oldest first. Leave it out to let the thread keep its own list. */
  messages?: ChatMessage[];
  defaultMessages?: ChatMessage[];
  /** Participant ids currently typing. */
  typing?: string[];
  /** The last message each participant has read, by participant id. Their avatar sits under that message and glides as it moves. */
  readBy?: Record<string, string>;
  /** Called with the composer's text and files. Uncontrolled threads also append the message themselves. */
  onSend?: (draft: ChatDraft) => void | Promise<void>;
  onReact?: (messageId: string, emoji: string) => void;
  onRetry?: (messageId: string) => void;
  /** Emoji offered by the reaction picker. */
  reactions?: string[];
  placeholder?: string;
  /** Show the composer. Defaults to true. */
  composer?: boolean;
  allowAttachments?: boolean;
  /** File types the attach button offers, as for `<input accept>`. */
  accept?: string;
  /** Offer a microphone button that records a voice message, where the browser can record. */
  allowVoice?: boolean;
  /** Recordings stop and send at this length, in ms. Defaults to five minutes. */
  maxVoiceMs?: number;
  /** Called when recording cannot start, usually because the microphone was refused. */
  onVoiceError?: (error: unknown) => void;
  /** Messages from one person closer together than this, in ms, share a group. Defaults to five minutes. */
  groupWindow?: number;
  locale?: string;
  /** Accessible name of the message log. */
  label?: string;
  /** Words for localization. Leave out any key to keep its English default. */
  labels?: ChatThreadLabels;
  /** Renders a message's text inside its bubble. Defaults to the plain text. */
  renderText?: (message: ChatMessage) => ReactNode;
  /** Renders extra content under a message's bubble, inside its group, such as cards. */
  renderAfter?: (message: ChatMessage) => ReactNode;
  className?: string;
}

type Row =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; message: ChatMessage; author: ChatParticipant; mine: boolean; first: boolean; last: boolean; index: number };

const { spring, duration, ease, blur } = motionTokens;
const enter = [...ease.enter] as [number, number, number, number];
const standard = [...ease.standard] as [number, number, number, number];
const physical = (visualDuration: number, bounce: number): Transition => {
  const root = 2 * Math.PI / (visualDuration * 1.2);
  return { type: "spring", stiffness: root * root, damping: 2 * (1 - bounce) * root, mass: 1 };
};
const SETTLE = physical(.44, 0), GROW = physical(spring.smooth.visualDuration, 0), POP = physical(.3, 0), ARRIVE = physical(.46, 0);
const DEFAULT_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"];
const STICK_DISTANCE = 48, FAR_DISTANCE = 180;

const subscribe = () => () => {};
function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

const toDate = (value: ChatMessage["createdAt"]) => value instanceof Date ? value : new Date(value);
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

function dayLabel(date: Date, locale: string, words: { today: string; yesterday: string }) {
  const today = new Date();
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((start(today) - start(date)) / 86_400_000);
  if (days === 0) return words.today;
  if (days === 1) return words.yesterday;
  if (days > 1 && days < 7) return date.toLocaleDateString(locale, { weekday: "long" });
  return date.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

/** Puts `node` where `value` appears in a translated sentence, so a rolling count sits wherever the language puts the number. */
function withCount(text: string, value: number, node: ReactNode) {
  const digits = String(value), at = text.indexOf(digits);
  return at < 0 ? text : <>{text.slice(0, at)}{node}{text.slice(at + digits.length)}</>;
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
}

function Avatar({ person, size }: { person: ChatParticipant; size: number }) {
  return <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * .38 }} aria-hidden="true">
    {person.avatar
      ? <img src={person.avatar} alt="" width={size} height={size} loading="lazy" />
      : initials(person.name)}
  </span>;
}

/** A count that rolls up or down when it changes. */
function Count({ value, reduced }: { value: number; reduced: boolean }) {
  const [last, setLast] = useState({ value, direction: 1 });
  if (last.value !== value) setLast({ value, direction: value > last.value ? 1 : -1 });
  const direction = last.value !== value ? (value > last.value ? 1 : -1) : last.direction;
  return <span className={styles.countRoll}>
    <AnimatePresence initial={false} mode="popLayout" custom={direction}>
      <motion.span key={value} custom={direction}
        variants={{ in: (dir: number) => ({ opacity: 0, y: reduced ? 0 : dir * 8 }), rest: { opacity: 1, y: 0 }, out: (dir: number) => ({ opacity: 0, y: reduced ? 0 : dir * -8 }) }}
        initial="in" animate="rest" exit="out" transition={reduced ? { duration: duration.fast } : spring.snappy}>{value}</motion.span>
    </AnimatePresence>
  </span>;
}

/** Three dots that breathe in sequence. Reduced motion shows them still. */
function TypingDots() {
  return <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>;
}

function useAutoHeight(mirror: RefObject<HTMLElement | null>, maxHeight: number, reduced: boolean) {
  const height = useMotionValue<number | "auto">("auto");
  const measured = useRef(false);
  useLayoutEffect(() => {
    const node = mirror.current;
    if (!node) return;
    const fit = () => {
      const target = Math.min(maxHeight, node.offsetHeight);
      if (!measured.current || reduced) { height.jump(target); measured.current = true; return; }
      animate(height, target, GROW);
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [height, maxHeight, mirror, reduced]);
  return height;
}

type Pending = { id: string; file: File; url?: string };

/** "0:07", "4:32". */
function formatDuration(ms = 0) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Chrome and Firefox record Opus in WebM or Ogg; Safari records AAC in MP4.
const VOICE_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
const canRecord = () => typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/** Records from the microphone. `stop(true)` hands the recording to `onDone`; `stop(false)` throws it away. Very short taps are dropped. */
function useVoiceRecorder(maxMs: number, onDone: (file: File, durationMs: number) => void, onError?: (error: unknown) => void) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const session = useRef<{ recorder: MediaRecorder; stream: MediaStream; keep: boolean } | null>(null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);

  const stop = useCallback((keep: boolean) => {
    const current = session.current;
    if (!current) return;
    current.keep = keep;
    if (current.recorder.state !== "inactive") current.recorder.stop();
    else current.stream.getTracks().forEach(track => track.stop());
  }, []);

  const start = useCallback(async () => {
    if (session.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = VOICE_TYPES.find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      const chunks: Blob[] = [];
      const began = Date.now();
      session.current = { recorder, stream, keep: false };
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const { keep } = session.current ?? { keep: false };
        session.current = null;
        stream.getTracks().forEach(track => track.stop());
        setStartedAt(null);
        const durationMs = Date.now() - began;
        const type = (recorder.mimeType || preferred || "audio/webm").split(";")[0]!;
        if (!keep || durationMs < 600 || !chunks.length) return;
        const extension = type === "audio/mp4" ? "m4a" : type.split("/")[1];
        done.current(new File(chunks, `Voice message.${extension}`, { type }), durationMs);
      };
      recorder.start(250);
      setElapsed(0);
      setStartedAt(began);
    } catch (error) {
      session.current = null;
      onError?.(error);
    }
  }, [onError]);

  useEffect(() => {
    if (startedAt === null) return;
    const tick = window.setInterval(() => {
      const ms = Date.now() - startedAt;
      setElapsed(ms);
      if (ms >= maxMs) stop(true);
    }, 200);
    return () => window.clearInterval(tick);
  }, [maxMs, startedAt, stop]);

  // Leaving the thread mid-recording throws the recording away and frees the microphone.
  useEffect(() => () => stop(false), [stop]);

  return { recording: startedAt !== null, elapsed, start, stop };
}

export interface ChatComposerProps {
  onSend: (draft: ChatDraft) => void;
  placeholder?: string;
  allowAttachments?: boolean;
  accept?: string;
  allowVoice?: boolean;
  maxVoiceMs?: number;
  onVoiceError?: (error: unknown) => void;
  disabled?: boolean;
  /** Words for localization. Leave out any key to keep its English default. */
  labels?: ChatComposerLabels;
  className?: string;
}

export interface ChatComposerHandle { focus: () => void }

/** The message box on its own: autosizing text, attachments by button, paste, or drop, a microphone for voice messages, and a send button that morphs when there is something to send. */
export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer({ onSend, placeholder = "Message", allowAttachments = true, accept, allowVoice = false, maxVoiceMs = 5 * 60_000, onVoiceError, disabled, labels, className }, ref) {
  const t = withDefaults(COMPOSER_LABELS, labels);
  const reduced = !!useReducedMotion();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sent, setSent] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const height = useAutoHeight(mirrorRef, 6 * 22 + 18, reduced);
  const ready = !disabled && (text.trim().length > 0 || files.length > 0);
  const counter = useRef(0);
  const hydrated = useHydrated();
  const voice = allowVoice && hydrated && canRecord();
  const recorder = useVoiceRecorder(maxVoiceMs, (file, durationMs) => {
    onSend({ text: "", files: [], voice: { file, durationMs } });
    setSent(count => count + 1);
  }, onVoiceError);
  // With nothing typed, the send button is the microphone.
  const mic = voice && !ready && !disabled;

  useImperativeHandle(ref, () => ({ focus: () => areaRef.current?.focus() }), []);

  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => () => filesRef.current.forEach(entry => entry.url && URL.revokeObjectURL(entry.url)), []);

  const add = (list: FileList | File[] | null) => {
    if (!allowAttachments || !list) return;
    const next = Array.from(list).slice(0, 10).map(file => ({ id: `file-${++counter.current}`, file, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined }));
    if (next.length) setFiles(current => [...current, ...next]);
  };
  const remove = (id: string) => setFiles(current => current.filter(entry => {
    if (entry.id === id && entry.url) URL.revokeObjectURL(entry.url);
    return entry.id !== id;
  }));

  const send = () => {
    if (!ready) return;
    onSend({ text: text.trim(), files: files.map(entry => entry.file) });
    files.forEach(entry => entry.url && URL.revokeObjectURL(entry.url));
    setFiles([]);
    setText("");
    setSent(count => count + 1);
    areaRef.current?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };
  const onPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    if (!allowAttachments || !event.clipboardData.files.length) return;
    event.preventDefault();
    add(event.clipboardData.files);
  };
  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!allowAttachments) return;
    event.preventDefault();
    setDragging(false);
    add(event.dataTransfer.files);
  };

  const tray = reduced ? { opacity: 0 } : { opacity: 0, scale: .9, filter: `blur(${blur.subtle}px)` };

  return <div className={[styles.composer, className].filter(Boolean).join(" ")} data-dragging={dragging || undefined}
    onDragOver={event => { if (allowAttachments && event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
    onDrop={onDrop}>
    <AnimatePresence initial={false}>
      {files.length > 0 && <motion.div key="tray" className={styles.trayClip}
        initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
        transition={reduced ? { duration: 0 } : { height: GROW, opacity: { duration: duration.fast } }}>
        <ul className={styles.tray} aria-label={t.attachments}>
          <AnimatePresence initial={false} mode="popLayout">
            {files.map(entry => <motion.li key={entry.id} className={styles.pending} layout={!reduced}
              initial={tray} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} exit={{ ...tray, transition: { duration: duration.exit, ease: standard } }} transition={POP}>
              {entry.url
                ? <img className={styles.pendingImage} src={entry.url} alt="" />
                : <span className={styles.pendingFile}><FileText size={16} strokeWidth={1.75} aria-hidden="true" /><span className={styles.pendingName}>{entry.file.name}</span><span className={styles.pendingSize}>{formatBytes(entry.file.size)}</span></span>}
              <button type="button" className={styles.remove} aria-label={t.removeFile(entry.file.name)} onClick={() => remove(entry.id)}><X size={12} strokeWidth={2.25} /></button>
            </motion.li>)}
          </AnimatePresence>
        </ul>
      </motion.div>}
    </AnimatePresence>
    <div className={styles.inputRow}>
      {recorder.recording ? <div className={styles.recorder} role="group" aria-label={t.recording}>
        <button type="button" className={styles.attach} aria-label={t.cancelRecording} onClick={() => recorder.stop(false)}><X size={18} strokeWidth={1.75} /></button>
        <div className={styles.recordingBox}>
          <span className={styles.recordingDot} aria-hidden="true" />
          <span className={styles.recordingTime} role="timer" aria-live="off">{formatDuration(recorder.elapsed)}</span>
          <span className={styles.recordingLabel}>{t.recording}</span>
          <button type="button" className={styles.send} data-ready="" aria-label={t.sendRecording} onClick={() => recorder.stop(true)}>
            <span className={styles.sendIcon}><ArrowUp size={16} strokeWidth={2.25} /></span>
          </button>
        </div>
      </div> : <>
      {allowAttachments && <>
        <button type="button" className={styles.attach} aria-label={t.attach} disabled={disabled} onClick={() => pickerRef.current?.click()}><Paperclip size={18} strokeWidth={1.75} /></button>
        <input ref={pickerRef} type="file" multiple accept={accept} hidden onChange={event => { add(event.target.files); event.target.value = ""; }} />
      </>}
      <div className={styles.box}>
      <motion.div className={styles.field} style={{ height }}>
        <div ref={mirrorRef} className={styles.mirror} aria-hidden="true">{text}{"\u200b"}</div>
        <textarea ref={areaRef} className={styles.textarea} value={text} rows={1} placeholder={placeholder} disabled={disabled} aria-label={placeholder}
          onChange={event => setText(event.target.value)} onKeyDown={onKeyDown} onPaste={onPaste} />
      </motion.div>
      <button type="button" className={styles.send} data-ready={ready || undefined} data-mic={mic || undefined} aria-label={mic ? t.recordVoice : t.send} aria-disabled={!ready && !mic}
        onClick={() => mic ? void recorder.start() : send()}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={`${sent}-${mic}`} className={styles.sendIcon}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: -18, transition: { duration: duration.fast, ease: standard } }}
            transition={reduced ? { duration: duration.fast } : spring.snappy}>
            {mic ? <Mic size={17} strokeWidth={1.75} /> : <ArrowUp size={16} strokeWidth={2.25} />}
          </motion.span>
        </AnimatePresence>
      </button>
      </div>
      </>}
    </div>
  </div>;
});

/**
 * A chat or support thread: grouped messages with day separators, reactions, read receipts that glide to the latest read message,
 * a typing indicator, and a composer. The list stays pinned to the newest message and offers a pill when new messages land out of view.
 */
export const ChatThread = forwardRef<ChatThreadHandle, ChatThreadProps>(function ChatThread({
  participants, currentUserId, messages: messagesProp, defaultMessages, typing = [], readBy, onSend, onReact, onRetry,
  reactions = DEFAULT_REACTIONS, placeholder = "Message", composer = true, allowAttachments = true, accept, allowVoice = false, maxVoiceMs, onVoiceError,
  groupWindow = 5 * 60_000, locale = "en-US", label = "Conversation", labels, renderText, renderAfter, className,
}, ref) {
  const t = useMemo(() => withDefaults({ ...THREAD_LABELS, today: relativeDay(locale, 0), yesterday: relativeDay(locale, -1) }, labels), [labels, locale]);
  const reduced = !!useReducedMotion();
  const hydrated = useHydrated();
  const uid = useId();
  const [inner, setInner] = useState<ChatMessage[]>(defaultMessages ?? []);
  const messages = messagesProp ?? inner;
  const controlled = messagesProp !== undefined;
  const people = useMemo(() => new Map(participants.map(entry => [entry.id, entry])), [participants]);
  const composerRef = useRef<ChatComposerHandle>(null);
  const [preview, setPreview] = useState<ChatAttachment | null>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDay = "";
    messages.forEach((message, index) => {
      const date = toDate(message.createdAt);
      const key = dayKey(date);
      if (key !== lastDay) { out.push({ type: "day", key: `day-${key}`, label: hydrated ? dayLabel(date, locale, t) : "" }); lastDay = key; }
      const joins = (other: ChatMessage | undefined) => !!other && other.authorId === message.authorId && dayKey(toDate(other.createdAt)) === key && Math.abs(toDate(other.createdAt).getTime() - date.getTime()) <= groupWindow;
      out.push({
        type: "message", key: message.id, message, index,
        author: people.get(message.authorId) ?? { id: message.authorId, name: t.unknownAuthor },
        mine: message.authorId === currentUserId,
        first: !joins(messages[index - 1]), last: !joins(messages[index + 1]),
      });
    });
    return out;
  }, [currentUserId, groupWindow, hydrated, locale, messages, people, t]);

  const receipts = useMemo(() => {
    const map = new Map<string, ChatParticipant[]>();
    for (const [personId, messageId] of Object.entries(readBy ?? {})) {
      const who = people.get(personId);
      const read = messages.find(message => message.id === messageId);
      // A reader's avatar under their own message says nothing new, so it stays hidden until they read past it.
      if (!who || personId === currentUserId || !read || read.authorId === personId) continue;
      map.set(messageId, [...(map.get(messageId) ?? []), who]);
    }
    return map;
  }, [currentUserId, messages, people, readBy]);
  const readIndex = useMemo(() => {
    let furthest = -1;
    receipts.forEach((_, messageId) => { furthest = Math.max(furthest, messages.findIndex(message => message.id === messageId)); });
    return furthest;
  }, [messages, receipts]);
  const lastMine = useMemo(() => { for (let index = messages.length - 1; index >= 0; index--) if (messages[index]!.authorId === currentUserId) return index; return -1; }, [currentUserId, messages]);

  const time = useMemo(() => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }), [locale]);

  /* Pinning. While the reader is at the bottom, every growth of the content keeps the newest message in view:
     the scroll jumps to the end before paint and the content springs up from where it was, so nothing snaps. */
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const stick = useRef(true);
  // Opening a conversation stays on the newest message until the reader scrolls away.
  const followLatest = useRef(true);
  const holding = useRef(false);
  const dragging = useRef(false);
  const lastHeight = useRef(0);
  const reducedRef = useRef(reduced);
  useEffect(() => { reducedRef.current = reduced; }, [reduced]);
  const [atBottom, setAtBottom] = useState(true);
  const [far, setFar] = useState(false);
  const [seen, setSeen] = useState(() => messages.length);
  const tail = messages.length ? `${messages.length}:${messages[messages.length - 1]!.id}:${messages[messages.length - 1]!.attachments?.length ?? 0}` : "0";

  const pinToEnd = useCallback((spring = false) => {
    const scroller = scrollRef.current;
    if (!scroller || (!followLatest.current && !stick.current)) return;
    const before = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    holding.current = true;
    scroller.scrollTop = scroller.scrollHeight;
    holding.current = false;
    stick.current = true;
    setAtBottom(true);
    setFar(false);
    setSeen(messages.length);
    if (spring && before < STICK_DISTANCE) {
      const content = contentRef.current;
      if (!content || reducedRef.current) return;
      const delta = content.offsetHeight - lastHeight.current;
      if (delta > 0 && delta < scroller.clientHeight) {
        y.jump(y.get() + delta);
        animate(y, 0, SETTLE);
      }
    }
  }, [messages.length, y]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current, content = contentRef.current;
    if (!scroller || !content) return;
    lastHeight.current = content.offsetHeight;
    pinToEnd();
    const pinSoon = () => { if (followLatest.current) pinToEnd(); };
    let frame = requestAnimationFrame(() => { pinSoon(); frame = requestAnimationFrame(pinSoon); });
    const onLoad = (event: Event) => { if (event.target instanceof HTMLImageElement) pinSoon(); };
    const onPointerDown = () => { dragging.current = true; };
    const onPointerUp = () => { dragging.current = false; };
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) followLatest.current = false; };
    const onTouchMove = () => { followLatest.current = false; };
    scroller.addEventListener("load", onLoad, true);
    scroller.addEventListener("wheel", onWheel, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: true });
    scroller.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    const stop = () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("load", onLoad, true);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
    };
    if (typeof ResizeObserver === "undefined") return stop;
    const observer = new ResizeObserver(() => {
      const height = content.offsetHeight;
      const grew = height - lastHeight.current;
      if (!followLatest.current && !stick.current) { lastHeight.current = height; return; }
      pinToEnd(grew > 0 && grew < scroller.clientHeight);
      lastHeight.current = content.offsetHeight;
    });
    observer.observe(content);
    observer.observe(scroller);
    return () => { observer.disconnect(); stop(); };
  }, [pinToEnd, tail, y]);

  // Your own message always brings the thread back to the bottom.
  const known = useRef(new Set(messages.map(message => message.id)));
  useLayoutEffect(() => {
    const fresh = messages.filter(message => !known.current.has(message.id));
    fresh.forEach(message => known.current.add(message.id));
    if (fresh.some(message => message.authorId === currentUserId)) {
      stick.current = true;
      followLatest.current = true;
    }
  }, [currentUserId, messages]);

  const onScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller || holding.current) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    // A photo settling in after the thread opens moves the end down. Stay with it
    // until the reader actually scrolls up.
    if (dragging.current && distance >= STICK_DISTANCE) followLatest.current = false;
    if (followLatest.current && distance >= STICK_DISTANCE) {
      holding.current = true;
      scroller.scrollTop = scroller.scrollHeight;
      holding.current = false;
      stick.current = true;
      setAtBottom(true);
      setFar(false);
      setSeen(messages.length);
      return;
    }
    stick.current = distance < STICK_DISTANCE;
    if (stick.current) followLatest.current = true;
    setAtBottom(stick.current);
    setFar(distance > FAR_DISTANCE);
    if (stick.current) setSeen(messages.length);
  };

  const scrollToBottom = useCallback((smooth = true) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    stick.current = true;
    followLatest.current = true;
    holding.current = true;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth && !reducedRef.current ? "smooth" : "auto" });
    holding.current = false;
  }, []);

  useImperativeHandle(ref, () => ({ scrollToBottom, focusComposer: () => composerRef.current?.focus() }), [scrollToBottom]);

  const unread = atBottom ? 0 : messages.slice(seen).filter(message => message.authorId !== currentUserId).length;
  const pill = !atBottom && (unread > 0 || far);

  /* Reactions and the picker. */
  const [picker, setPicker] = useState<string | null>(null);
  const react = (messageId: string, emoji: string) => {
    setPicker(null);
    onReact?.(messageId, emoji);
    if (controlled) return;
    setInner(current => current.map(message => {
      if (message.id !== messageId) return message;
      const list = [...(message.reactions ?? [])];
      const at = list.findIndex(entry => entry.emoji === emoji);
      const found = list[at];
      if (!found) list.push({ emoji, count: 1, mine: true });
      else if (found.mine) list[at] = { ...found, count: found.count - 1, mine: false };
      else list[at] = { ...found, count: found.count + 1, mine: true };
      return { ...message, reactions: list.filter(entry => entry.count > 0) };
    }));
  };

  const counter = useRef(0);
  const send = (draft: ChatDraft) => {
    stick.current = true;
    followLatest.current = true;
    const result = onSend?.(draft);
    if (controlled) return result;
    const attachments: ChatAttachment[] = draft.files.map((file, index) => ({
      id: `local-file-${++counter.current}-${index}`, name: file.name, size: file.size,
      kind: file.type.startsWith("image/") ? "image" : "file",
      url: URL.createObjectURL(file),
    }));
    if (draft.voice) attachments.push({ id: `local-voice-${++counter.current}`, name: draft.voice.file.name, size: draft.voice.file.size, kind: "audio", url: URL.createObjectURL(draft.voice.file), duration: draft.voice.durationMs });
    setInner(current => [...current, { id: `local-${Date.now()}-${++counter.current}`, authorId: currentUserId, text: draft.text || undefined, attachments, createdAt: new Date(), status: "sent" }]);
  };

  const typers = typing.map(id => people.get(id)).filter((entry): entry is ChatParticipant => !!entry && entry.id !== currentUserId);
  const typingLabel = typers.length ? t.typing(typers.map(entry => entry.name)) : "";

  const arrive = (mine: boolean) => reduced ? { opacity: 0 } : { opacity: 0, scale: .92, y: 14, x: mine ? 8 : -8, filter: `blur(${blur.subtle}px)` };

  return <div className={[styles.root, className].filter(Boolean).join(" ")}>
    <div className={styles.viewport}>
      <div ref={scrollRef} className={styles.scroller} onScroll={onScroll} data-chat-scroller="">
        <div className={styles.track}>
          <motion.div ref={contentRef} className={styles.content} style={{ y }}>
            <ol className={styles.list} role="log" aria-label={label} aria-live="polite" aria-relevant="additions">
              <AnimatePresence initial={false}>
                {rows.map(row => {
                  if (row.type === "day") return <li key={row.key} className={styles.day}><span suppressHydrationWarning>{row.label}</span></li>;
                  const { message, author, mine, first, last, index } = row;
                  const date = toDate(message.createdAt);
                  const seenBy = receipts.get(message.id) ?? [];
                  const showStatus = mine && (index === lastMine || message.status === "failed");
                  const status = message.status === "failed" ? "failed" : message.status === "sending" ? "sending" : readIndex >= index ? "read" : message.status ?? "sent";
                  const images = message.attachments?.filter(entry => entry.kind === "image" && entry.url) ?? [];
                  const voices = message.attachments?.filter(entry => entry.kind === "audio" && entry.url) ?? [];
                  const files = message.attachments?.filter(entry => entry.kind === "file" || !entry.url) ?? [];
                  return <motion.li key={row.key} className={styles.row} data-chat-message-id={message.id} data-mine={mine || undefined} data-first={first || undefined} data-last={last || undefined} data-failed={message.status === "failed" || undefined}
                    initial={arrive(mine)} animate={{ opacity: 1, scale: 1, y: 0, x: 0, filter: "blur(0px)" }} exit={{ opacity: 0, transition: { duration: duration.exit } }}
                    transition={reduced ? { duration: duration.fast } : { ...ARRIVE, opacity: { duration: duration.standard, ease: enter }, filter: { duration: duration.standard, ease: enter } }}
                    style={{ transformOrigin: mine ? "100% 100%" : "0 100%" }}>
                    {!mine && <div className={styles.gutter} />}
                    <div className={styles.stack}>
                      {first && <p className={styles.meta}>
                        {!mine && <span className={styles.author}>{author.name}</span>}
                        <time dateTime={date.toISOString()} suppressHydrationWarning>{hydrated ? time.format(date) : ""}</time>
                      </p>}
                      <div className={styles.line}>
                        {!mine && last && <span className={styles.face}><Avatar person={author} size={28} /></span>}
                        <div className={styles.parts}>
                          {images.length > 0 && <div className={styles.gallery} data-count={Math.min(images.length, 4)}>
                            {images.slice(0, 4).map((image, at) => <button key={image.id} type="button" className={styles.image} onClick={() => setPreview(image)}
                              style={images.length === 1 && image.width && image.height ? { aspectRatio: `${image.width} / ${image.height}` } : undefined}>
                              <img src={image.url} alt={image.alt ?? image.name} loading="lazy" />
                              {at === 3 && images.length > 4 && <span className={styles.more}>+{images.length - 4}</span>}
                            </button>)}
                          </div>}
                          {voices.map(voice => <VoiceNote key={voice.id} attachment={voice} labels={t} />)}
                          {files.map(file => /\.pdf$/i.test(file.name) && file.url
                            ? <button key={file.id} type="button" className={styles.file} onClick={() => setPreview(file)}>
                              <FileText size={18} strokeWidth={1.75} aria-hidden="true" />
                              <span className={styles.fileText}><span className={styles.fileName}>{file.name}</span>{file.size !== undefined && <span className={styles.fileSize}>{formatBytes(file.size)}</span>}</span>
                            </button>
                            : <a key={file.id} className={styles.file} href={file.url} download={file.name} target="_blank" rel="noreferrer">
                              <FileText size={18} strokeWidth={1.75} aria-hidden="true" />
                              <span className={styles.fileText}><span className={styles.fileName}>{file.name}</span>{file.size !== undefined && <span className={styles.fileSize}>{formatBytes(file.size)}</span>}</span>
                            </a>)}
                          {message.text && <div className={styles.bubble} title={hydrated ? date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : undefined}>{renderText ? renderText(message) : message.text}</div>}
                          {renderAfter?.(message)}
                        </div>
                        <ReactionPicker open={picker === message.id} mine={mine} reactions={reactions} reduced={reduced} labels={t} id={`${uid}-picker-${message.id}`}
                          onToggle={() => setPicker(current => current === message.id ? null : message.id)} onClose={() => setPicker(null)} onPick={emoji => react(message.id, emoji)} />
                      </div>
                      <AnimatePresence initial={false}>
                        {!!message.reactions?.length && <motion.div key="reactions" className={styles.reactionClip}
                          initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={reduced ? { duration: 0 } : { height: GROW, opacity: { duration: duration.fast } }}>
                          <ul className={styles.reactions} aria-label={t.reactions}>
                            <AnimatePresence initial={false} mode="popLayout">
                              {message.reactions.map(reaction => <motion.li key={reaction.emoji} layout={!reduced}
                                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1 }} exit={reduced ? { opacity: 0 } : { opacity: 0, scale: .6 }} transition={POP}>
                                <button type="button" className={styles.reaction} aria-pressed={!!reaction.mine} aria-label={t.reactionCount(reaction.emoji, reaction.count, !!reaction.mine)} onClick={() => react(message.id, reaction.emoji)}>
                                  <span aria-hidden="true">{reaction.emoji}</span><Count value={reaction.count} reduced={reduced} />
                                </button>
                              </motion.li>)}
                            </AnimatePresence>
                          </ul>
                        </motion.div>}
                      </AnimatePresence>
                      {(showStatus || seenBy.length > 0) && <div className={styles.receipts}>
                        {showStatus && <span className={styles.status} data-status={status}>
                          {status === "failed" ? <>{t.failed}{onRetry && <button type="button" className={styles.retry} onClick={() => onRetry(message.id)}><RotateCw size={12} strokeWidth={2} aria-hidden="true" />{t.retry}</button>}</>
                            : t[status]}
                        </span>}
                        {seenBy.length > 0 && <span className={styles.readers} aria-label={t.readBy(seenBy.map(entry => entry.name))}>
                          {seenBy.map(entry => <motion.span key={entry.id} layoutId={reduced ? undefined : `${uid}-receipt-${entry.id}`} className={styles.reader} transition={SETTLE}>
                            <Avatar person={entry} size={16} />
                          </motion.span>)}
                        </span>}
                      </div>}
                    </div>
                  </motion.li>;
                })}
                {typers.length > 0 && <motion.li key="typing" className={styles.row} data-first data-last aria-hidden="true"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: .9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, scale: .9, transition: { duration: duration.exit, ease: standard } }}
                  transition={reduced ? { duration: duration.fast } : spring.snappy} style={{ transformOrigin: "0 100%" }}>
                  <div className={styles.gutter} />
                  <div className={styles.stack}><div className={styles.line}><span className={styles.face}><Avatar person={typers[0]!} size={28} /></span><div className={`${styles.bubble} ${styles.typing}`}><TypingDots /></div></div></div>
                </motion.li>}
              </AnimatePresence>
            </ol>
          </motion.div>
        </div>
      </div>
      <span className={styles.srOnly} role="status">{typingLabel}</span>
      <AnimatePresence>
        {pill && <motion.button key="pill" type="button" className={styles.pill} onClick={() => scrollToBottom()} layout={!reduced} style={{ borderRadius: 16 }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: .94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: .94, transition: { duration: duration.exit, ease: standard } }}
          transition={reduced ? { duration: duration.fast } : { ...spring.morph, opacity: { duration: duration.fast } }}>
          {/* Icon and label hold their own size while the pill's width morphs, so the text never stretches. */}
          <motion.span className={styles.pillIcon} layout={reduced ? false : "position"} transition={spring.morph}><ArrowDown size={14} strokeWidth={2} aria-hidden="true" /></motion.span>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span key={unread > 0 ? "new" : "latest"} layout={reduced ? false : "position"} initial={{ opacity: 0, filter: `blur(${blur.subtle}px)` }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: `blur(${blur.subtle}px)` }} transition={{ duration: duration.fast }}>
              {unread > 0 ? withCount(t.newMessages(unread), unread, <Count value={unread} reduced={reduced} />) : t.jumpToLatest}
            </motion.span>
          </AnimatePresence>
        </motion.button>}
      </AnimatePresence>
    </div>
    {composer && <ChatComposer ref={composerRef} onSend={send} placeholder={placeholder} allowAttachments={allowAttachments} accept={accept}
      allowVoice={allowVoice} maxVoiceMs={maxVoiceMs} onVoiceError={onVoiceError} labels={t} />}
    <AnimatePresence>
      {preview?.url && <AttachmentPreview key={preview.id} attachment={preview} reduced={reduced} onClose={() => setPreview(null)} />}
    </AnimatePresence>
  </div>;
});

/** A photo or PDF over the app. Escape, the backdrop, or the close icon dismisses it. */
function AttachmentPreview({ attachment, reduced, onClose }: { attachment: ChatAttachment; reduced: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const pdf = attachment.kind === "file";
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  return createPortal(
    <motion.div className={styles.viewer} role="dialog" aria-modal="true" aria-label={attachment.name} onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : duration.standard, ease: standard }}>
      <button ref={closeRef} type="button" className={styles.viewerClose} aria-label="Close" onClick={onClose}><X size={18} strokeWidth={1.75} /></button>
      {pdf
        ? <motion.iframe className={styles.viewerSheet} title={attachment.name} src={attachment.url} onClick={event => event.stopPropagation()}
          initial={reduced ? false : { opacity: 0, y: 16, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
          transition={reduced ? { duration: 0 } : { duration: duration.standard, ease: enter }} />
        : <motion.img className={styles.viewerImage} src={attachment.url} alt={attachment.alt ?? attachment.name} onClick={event => event.stopPropagation()}
          initial={reduced ? false : { opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .98 }}
          transition={reduced ? { duration: 0 } : { duration: duration.standard, ease: enter }} />}
    </motion.div>,
    document.body,
  );
}

/** A voice message: play and pause, a bar that fills as it plays and seeks when pressed, and the time. Starting one pauses any other. */
function VoiceNote({ attachment, labels }: { attachment: ChatAttachment; labels: Pick<Required<ChatThreadLabels>, "play" | "pause" | "voiceMessage"> }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  // The recorder's length is the bar. Browser metadata for these files revises itself
  // while they play, and following that makes the bar jump.
  const recordedSeconds = (attachment.duration ?? 0) / 1000;
  const [length, setLength] = useState(recordedSeconds);
  const lengthRef = useRef(length);
  lengthRef.current = length;
  const positionRef = useRef(0);
  // Pressing the bar is the only time the fill is allowed to move backward.
  const seekToken = useRef(0);
  const progress = length > 0 ? Math.min(1, position / length) : 0;
  const showPosition = (seconds: number) => {
    positionRef.current = seconds;
    setPosition(seconds);
  };

  useEffect(() => {
    if (!playing) return;
    // The file clock on a just-recorded note runs ahead, then snaps back to the
    // start. Following that snap pulls the bar backward. The bar uses its own
    // clock from the moment play begins and ignores those corrections.
    let anchorAt = performance.now();
    let anchorPos = positionRef.current;
    let token = seekToken.current;
    let frame = 0;
    const tick = () => {
      const now = performance.now();
      if (seekToken.current !== token) {
        token = seekToken.current;
        anchorPos = positionRef.current;
        anchorAt = now;
      }
      const total = lengthRef.current;
      let next = anchorPos + (now - anchorAt) / 1000;
      if (total > 0) next = Math.min(total, next);
      next = Math.max(anchorPos, next);
      positionRef.current = next;
      setPosition(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    const total = lengthRef.current;
    if (audio.ended || (total > 0 && audio.currentTime >= total - 0.05)) {
      audio.currentTime = 0;
      showPosition(0);
    }
    document.querySelectorAll("audio[data-chat-voice]").forEach(other => { if (other !== audio) (other as HTMLAudioElement).pause(); });
    void audio.play().catch(() => setPlaying(false));
  };
  const seek = (ratio: number) => {
    const audio = audioRef.current;
    const total = lengthRef.current;
    if (!audio || !total) return;
    const target = Math.max(0, Math.min(1, ratio)) * total;
    audio.currentTime = target;
    seekToken.current += 1;
    showPosition(target);
  };

  return <div className={styles.voice}>
    <button type="button" className={styles.voicePlay} aria-label={playing ? labels.pause : labels.play} onClick={toggle}>
      {playing ? <Pause size={15} strokeWidth={2} fill="currentColor" /> : <Play size={15} strokeWidth={2} fill="currentColor" />}
    </button>
    <div className={styles.voiceTrack} role="slider" tabIndex={0} aria-label={labels.voiceMessage}
      aria-valuemin={0} aria-valuemax={Math.round(length)} aria-valuenow={Math.round(position)} aria-valuetext={`${formatDuration(position * 1000)} of ${formatDuration(length * 1000)}`}
      onPointerDown={event => { const box = event.currentTarget.getBoundingClientRect(); seek((event.clientX - box.left) / box.width); }}
      onKeyDown={event => {
        const step = event.key === "ArrowRight" ? 5 : event.key === "ArrowLeft" ? -5 : 0;
        if (step && length) { event.preventDefault(); seek((position + step) / length); }
      }}>
      <span className={styles.voiceFill} style={{ transform: `scaleX(${progress})` }} />
    </div>
    <span className={styles.voiceTime}>{formatDuration((playing || position > 0 ? position : length) * 1000)}</span>
    <audio ref={audioRef} src={attachment.url} preload="metadata" data-chat-voice=""
      onLoadedMetadata={event => {
        if (recordedSeconds > 0) return;
        const seconds = event.currentTarget.duration;
        if (Number.isFinite(seconds) && seconds > 0) setLength(seconds);
      }}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => { setPlaying(false); showPosition(lengthRef.current); }} />
  </div>;
}

function ReactionPicker({ open, mine, reactions, reduced, labels, id, onToggle, onClose, onPick }: { open: boolean; mine: boolean; reactions: string[]; reduced: boolean; labels: Pick<Required<ChatThreadLabels>, "addReaction" | "reactions" | "reactWith">; id: string; onToggle: () => void; onClose: () => void; onPick: (emoji: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState(0);
  const [below, setBelow] = useState(false);
  /** The picker opens above the bubble unless that would run past the top of the thread. */
  const toggle = () => {
    const wrap = wrapRef.current, scroller = wrap?.closest("[data-chat-scroller]");
    if (!open && wrap && scroller) setBelow(wrap.getBoundingClientRect().top - scroller.getBoundingClientRect().top < 56);
    onToggle();
  };

  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) closeRef.current(); };
    document.addEventListener("pointerdown", down);
    const frame = requestAnimationFrame(() => wrapRef.current?.querySelector<HTMLElement>("[data-emoji-index='0']")?.focus({ preventScroll: true }));
    return () => { document.removeEventListener("pointerdown", down); cancelAnimationFrame(frame); };
  }, [open]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); triggerRef.current?.focus(); return; }
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (active + step + reactions.length) % reactions.length;
    setActive(next);
    wrapRef.current?.querySelector<HTMLElement>(`[data-emoji-index='${next}']`)?.focus();
  };

  return <div ref={wrapRef} className={styles.pickerWrap} data-open={open || undefined} data-below={below || undefined}>
    <button ref={triggerRef} type="button" className={styles.reactButton} aria-label={labels.addReaction} aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle}>
      <SmilePlus size={16} strokeWidth={1.75} />
    </button>
    <AnimatePresence>
      {open && <motion.div id={id} role="group" aria-label={labels.reactions} className={styles.picker} data-mine={mine || undefined} onKeyDown={onKeyDown}
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: .85, y: below ? -6 : 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, scale: .9, y: below ? -4 : 4, transition: { duration: duration.exit, ease: standard } }}
        transition={reduced ? { duration: duration.fast } : POP}>
        {reactions.map((emoji, index) => <motion.button key={emoji} type="button" className={styles.emoji} aria-label={labels.reactWith(emoji)} data-emoji-index={index} tabIndex={index === active ? 0 : -1}
          initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...POP, delay: reduced ? 0 : index * .025 }}
          onFocus={() => setActive(index)} onClick={() => onPick(emoji)}>{emoji}</motion.button>)}
      </motion.div>}
    </AnimatePresence>
  </div>;
}

export default ChatThread;
