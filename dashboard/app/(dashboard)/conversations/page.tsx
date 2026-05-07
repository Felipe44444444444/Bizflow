"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { formatRelative, formatDate, cn, getDisplayName } from "@/lib/utils";
import {
  Search,
  MessageSquare,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Bot,
  User,
  Headphones,
  ShieldAlert,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  source_channel?: string | null;
  external_id?: string | null;
  status: "open" | "resolved" | "handed_off" | "spam";
  handed_off?: boolean;
  last_message_at?: string | null;
  created_at: string;
  channels?: { type: string; name: string } | null;
  agents?: { name: string } | null;
}

interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "human_agent" | "system";
  content: string;
  created_at: string;
}

interface ConversationDetail extends Conversation {
  messages: Message[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_EMOJI: Record<string, string> = {
  whatsapp: "💬",
  instagram: "📸",
  facebook: "👍",
  slack: "💼",
  web_widget: "🌐",
  api: "⚡",
};

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "text-[#25D366] bg-[#25D366]/10 border-[#25D366]/20",
  instagram: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  facebook: "text-[#1877F2] bg-[#1877F2]/10 border-[#1877F2]/20",
  slack: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  web_widget: "text-neon-cyan bg-neon-cyan/10 border-neon-cyan/20",
  api: "text-neon-purple bg-neon-purple/10 border-neon-purple/20",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Abierta",
  resolved: "Resuelta",
  handed_off: "Escalada",
  spam: "Spam",
};

const AVATAR_COLORS = [
  "bg-neon-cyan/20 text-neon-cyan border-neon-cyan/30",
  "bg-neon-purple/20 text-neon-purple border-neon-purple/30",
  "bg-neon-green/20 text-neon-green border-neon-green/30",
  "bg-neon-yellow/20 text-neon-yellow border-neon-yellow/30",
  "bg-pink-500/20 text-pink-400 border-pink-500/30",
  "bg-[#1877F2]/20 text-[#1877F2] border-[#1877F2]/30",
];

type FilterType = "all" | "open" | "handed_off" | "resolved";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function isChannelName(name: string): boolean {
  return /^[A-Z][a-z]+ #[A-Z0-9]{4}$/.test(name);
}

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
}

function formatDaySeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (same(d, today)) return "Hoy";
  if (same(d, yesterday)) return "Ayer";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" }).format(d);
}

function groupMessagesByDay(messages: Message[]): Array<{ day: string; messages: Message[] }> {
  const groups: Array<{ day: string; messages: Message[] }> = [];
  let currentDay = "";

  for (const msg of messages) {
    const day = formatDaySeparator(msg.created_at);
    if (day !== currentDay) {
      currentDay = day;
      groups.push({ day, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }
  return groups;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConvAvatar({ conv, size = "md" }: { conv: Conversation; size?: "sm" | "md" }) {
  const name = getDisplayName(conv);
  const ch = conv.source_channel ?? "api";
  const sz = size === "sm" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs";

  if (isChannelName(name)) {
    return (
      <div
        className={cn(
          sz,
          "rounded-xl border flex items-center justify-center text-base shrink-0",
          CHANNEL_COLORS[ch]
            ? CHANNEL_COLORS[ch].split(" ").slice(1).join(" ")
            : "bg-space-el border-white/10"
        )}
      >
        {CHANNEL_EMOJI[ch] ?? "💬"}
      </div>
    );
  }

  const colorClass = getAvatarColor(name);
  return (
    <div
      className={cn(
        sz,
        "rounded-xl border flex items-center justify-center font-semibold shrink-0",
        colorClass
      )}
    >
      {getInitials(name)}
    </div>
  );
}

function ChannelBadge({ channel }: { channel?: string | null }) {
  const ch = channel ?? "api";
  const emoji = CHANNEL_EMOJI[ch] ?? "⚡";
  const color = CHANNEL_COLORS[ch] ?? "text-[#A0AEC0] bg-white/5 border-white/10";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
        color
      )}
    >
      {emoji} {ch.replace("_", " ")}
    </span>
  );
}

function ConvListSkeleton() {
  return (
    <div className="space-y-1 px-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-xl border border-neon-cyan/[0.04] bg-space-card/50 animate-pulse"
        >
          <div className="h-10 w-10 rounded-xl bg-space-el shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-3 w-2/3 rounded bg-space-el" />
            <div className="h-2.5 w-1/2 rounded bg-space-el" />
          </div>
          <div className="h-3 w-10 rounded bg-space-el shrink-0" />
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "system") {
    return (
      <div className="flex justify-center my-1">
        <span className="text-[11px] italic text-[#4A5568] bg-space-el/50 px-3 py-1 rounded-full border border-white/5">
          {msg.content}
        </span>
      </div>
    );
  }

  const isUser = msg.role === "user";
  const isHuman = msg.role === "human_agent";
  const isAssistant = msg.role === "assistant";

  const bubbleClass = cn(
    "max-w-[72%] px-4 py-2.5 text-sm leading-relaxed break-words",
    isUser &&
      "rounded-2xl rounded-tr-sm bg-neon-cyan/10 border border-neon-cyan/20 text-white",
    isAssistant &&
      "rounded-2xl rounded-tl-sm bg-space-card border border-neon-cyan/[0.06] text-white",
    isHuman &&
      "rounded-2xl rounded-tl-sm bg-neon-green/5 border border-neon-green/20 text-white"
  );

  const Icon =
    msg.role === "user"
      ? User
      : msg.role === "human_agent"
      ? Headphones
      : Bot;

  const iconWrapClass = cn(
    "h-7 w-7 rounded-full flex items-center justify-center shrink-0 border",
    isUser && "bg-neon-cyan/10 border-neon-cyan/20",
    isAssistant && "bg-space-el border-neon-cyan/[0.06]",
    isHuman && "bg-neon-green/10 border-neon-green/20"
  );

  const iconClass = cn(
    "h-3.5 w-3.5",
    isUser && "text-neon-cyan",
    isAssistant && "text-[#A0AEC0]",
    isHuman && "text-neon-green"
  );

  return (
    <div className={cn("flex gap-2 items-end", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={iconWrapClass}>
        <Icon className={iconClass} />
      </div>
      <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
        <div className={bubbleClass}>{msg.content}</div>
        <span className="text-[10px] text-[#4A5568] px-1">{formatDate(msg.created_at)}</span>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4 animate-pulse">
      {[false, true, false, true, false].map((right, i) => (
        <div key={i} className={cn("flex gap-2 items-end", right ? "flex-row-reverse" : "flex-row")}>
          <div className="h-7 w-7 rounded-full bg-space-el shrink-0" />
          <div
            className={cn(
              "rounded-2xl bg-space-el",
              right ? "w-48 h-10" : "w-64 h-14"
            )}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConversationsPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");

  // Left panel state
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [orgId, setOrgId] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  // Right panel state
  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const orgIdRef = useRef("");

  // ── Init: load org + conversations ─────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data: m } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();
      if (!m) return;

      setOrgId(m.organization_id);
      orgIdRef.current = m.organization_id;
      await fetchConvs(m.organization_id, "all");

      // Real-time: conversation list
      const channel = supabase
        .channel("conversations_list")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `organization_id=eq.${m.organization_id}`,
          },
          () => fetchConvs(orgIdRef.current, filter)
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep orgIdRef in sync so the Supabase callback always has the latest filter
  useEffect(() => {
    orgIdRef.current = orgId;
  }, [orgId]);

  const fetchConvs = useCallback(async (o: string, status: FilterType) => {
    try {
      const qs = status !== "all" ? `?status=${status}` : "";
      const data = await api.get(`/api/conversations${qs}`, o);
      setConvs(data.data || []);
    } catch {
      // silently ignore
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Re-fetch when filter changes
  useEffect(() => {
    if (orgId) fetchConvs(orgId, filter);
  }, [filter, orgId, fetchConvs]);

  // ── Load selected conversation ──────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId || !orgId) return;

    let cleanup: (() => void) | undefined;

    async function loadDetail() {
      setLoadingDetail(true);
      setConv(null);
      try {
        const data: ConversationDetail = await api.get(
          `/api/conversations/${selectedId}`,
          orgId
        );
        setConv(data);
      } catch {
        setConv(null);
      } finally {
        setLoadingDetail(false);
      }

      // Real-time messages for this conversation
      const msgChannel = supabase
        .channel(`conv_msgs_${selectedId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${selectedId}`,
          },
          (payload) => {
            setConv((prev) => {
              if (!prev) return prev;
              const newMsg = payload.new as Message;
              if (prev.messages.some((m) => m.id === newMsg.id)) return prev;
              return { ...prev, messages: [...prev.messages, newMsg] };
            });
          }
        )
        .subscribe();

      cleanup = () => supabase.removeChannel(msgChannel);
    }

    loadDetail();

    return () => {
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, orgId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  function selectConv(convId: string) {
    router.push(`/conversations?id=${convId}`, { scroll: false });
  }

  async function sendMessage() {
    if (!text.trim() || !selectedId || !conv) return;
    setSending(true);
    try {
      const msg: Message = await api.post(
        "/api/messages/send",
        { conversation_id: selectedId, content: text, role: "human_agent" },
        orgId
      );
      setConv((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
      setText("");
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  async function updateStatus(status: string) {
    if (!selectedId) return;
    try {
      await api.patch(`/api/conversations/${selectedId}/status`, { status }, orgId);
      setConv((prev) => (prev ? { ...prev, status: status as Conversation["status"] } : prev));
      setConvs((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, status: status as Conversation["status"] } : c))
      );
    } catch {
      // ignore
    }
  }

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filteredConvs = convs.filter((c) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = getDisplayName(c).toLowerCase();
      if (!name.includes(q) && !(c.contact_email ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const openCount = convs.filter((c) => c.status === "open").length;
  const handoffCount = convs.filter((c) => c.status === "handed_off").length;

  const FILTERS: { key: FilterType; label: string; count?: number }[] = [
    { key: "all", label: "Todas" },
    { key: "open", label: "Abiertas", count: openCount },
    { key: "handed_off", label: "Handoff", count: handoffCount },
    { key: "resolved", label: "Resueltas" },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">
      {/* ── LEFT PANEL ───────────────────────────────────────────────── */}
      <aside className="w-[35%] min-w-[280px] max-w-[400px] flex flex-col border-r border-neon-cyan/[0.08] bg-space-card shrink-0">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-neon-cyan/[0.06] shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-sm text-white">Conversaciones</h2>
            {openCount > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan">
                {openCount} abiertas
              </span>
            )}
          </div>
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#4A5568]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversaciones..."
              className="w-full pl-9 pr-9 py-2 rounded-lg bg-space-el border border-neon-cyan/[0.08] text-xs text-white placeholder-[#4A5568] outline-none focus:border-neon-cyan/30 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-white transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTERS.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all",
                  filter === key
                    ? "bg-neon-cyan/15 border-neon-cyan/40 text-neon-cyan"
                    : "bg-transparent border-white/[0.06] text-[#A0AEC0] hover:border-neon-cyan/20 hover:text-white"
                )}
              >
                {label}
                {key === "handed_off" && count !== undefined && count > 0 && (
                  <span className="h-4 w-4 rounded-full bg-neon-red/80 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {count}
                  </span>
                )}
                {key === "open" && count !== undefined && count > 0 && filter !== "open" && (
                  <span className="h-4 w-4 rounded-full bg-neon-green/80 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2">
          {loadingList ? (
            <ConvListSkeleton />
          ) : filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
              <div className="h-12 w-12 rounded-2xl bg-space-el border border-neon-cyan/[0.08] flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-[#4A5568]" />
              </div>
              <p className="text-[#A0AEC0] text-xs font-medium">Sin conversaciones</p>
              <p className="text-[#4A5568] text-[11px]">
                {search ? "Ningún resultado para esta búsqueda" : "Las conversaciones aparecerán aquí"}
              </p>
            </div>
          ) : (
            <div className="px-2 space-y-0.5">
              {filteredConvs.map((c) => {
                const isSelected = c.id === selectedId;
                const name = getDisplayName(c);
                return (
                  <div
                    key={c.id}
                    onClick={() => selectConv(c.id)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 group relative",
                      isSelected
                        ? "bg-neon-cyan/10 border-l-2 border-neon-cyan"
                        : "border-l-2 border-transparent hover:bg-space-el"
                    )}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <ConvAvatar conv={c} />
                      {c.status === "open" && (
                        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-neon-green border-2 border-space-card" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={cn(
                            "font-semibold text-[13px] truncate transition-colors",
                            isSelected ? "text-neon-cyan" : "text-white group-hover:text-neon-cyan"
                          )}
                        >
                          {name}
                        </span>
                        <span className="text-[10px] text-[#4A5568] shrink-0">
                          {c.last_message_at ? formatRelative(c.last_message_at) : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <ChannelBadge channel={c.source_channel} />
                        {c.status === "handed_off" && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-neon-red/10 border border-neon-red/30 text-neon-red tracking-wide">
                            HANDOFF
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-space">
        {!selectedId ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="h-16 w-16 rounded-2xl bg-space-card border border-neon-cyan/[0.08] flex items-center justify-center">
              <MessageSquare className="h-8 w-8 text-[#4A5568]" />
            </div>
            <div>
              <p className="text-[#A0AEC0] font-medium text-sm">Selecciona una conversación</p>
              <p className="text-[#4A5568] text-xs mt-1">para ver los mensajes</p>
            </div>
          </div>
        ) : loadingDetail ? (
          /* Loading detail */
          <div className="flex flex-col h-full">
            <div className="h-16 shrink-0 border-b border-neon-cyan/[0.08] bg-space-card/80 flex items-center px-5 gap-3 animate-pulse">
              <div className="h-10 w-10 rounded-xl bg-space-el shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-40 rounded bg-space-el" />
                <div className="h-2.5 w-24 rounded bg-space-el" />
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatSkeleton />
            </div>
          </div>
        ) : conv ? (
          /* Loaded conversation */
          <ChatPanel
            conv={conv}
            text={text}
            setText={setText}
            sending={sending}
            onSend={sendMessage}
            onStatusChange={updateStatus}
            bottomRef={bottomRef}
          />
        ) : (
          /* Error state */
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
            <div className="h-14 w-14 rounded-2xl bg-space-card border border-neon-red/20 flex items-center justify-center">
              <ShieldAlert className="h-7 w-7 text-neon-red/60" />
            </div>
            <p className="text-[#A0AEC0] text-sm">No se pudo cargar la conversación</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

interface ChatPanelProps {
  conv: ConversationDetail;
  text: string;
  setText: (v: string) => void;
  sending: boolean;
  onSend: () => void;
  onStatusChange: (status: string) => void;
  bottomRef: React.RefObject<HTMLDivElement>;
}

function ChatPanel({
  conv,
  text,
  setText,
  sending,
  onSend,
  onStatusChange,
  bottomRef,
}: ChatPanelProps) {
  const groups = groupMessagesByDay(conv.messages);
  const isHandedOff = conv.status === "handed_off";
  const isResolved = conv.status === "resolved";
  const name = getDisplayName(conv);

  const STATUS_OPTIONS = [
    { value: "open", label: "Abrir", icon: CheckCircle2, color: "text-neon-green" },
    { value: "resolved", label: "Resolver", icon: CheckCircle2, color: "text-[#A0AEC0]" },
    { value: "handed_off", label: "Escalar", icon: AlertTriangle, color: "text-neon-yellow" },
  ];

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === conv.status);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-auto min-h-[64px] shrink-0 border-b border-neon-cyan/[0.08] bg-space-card/80 backdrop-blur-xl flex items-center px-5 gap-3">
        <ConvAvatar conv={conv} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white truncate">{name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <ChannelBadge channel={conv.source_channel} />
            <span
              className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
                conv.status === "open"
                  ? "text-neon-green bg-neon-green/10 border-neon-green/20"
                  : conv.status === "handed_off"
                  ? "text-neon-yellow bg-neon-yellow/10 border-neon-yellow/20"
                  : "text-[#A0AEC0] bg-white/5 border-white/10"
              )}
            >
              {STATUS_LABEL[conv.status] ?? conv.status}
            </span>
          </div>
        </div>
        {/* Status dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative group/status">
            <button className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-space-el border border-neon-cyan/[0.08] text-[#A0AEC0] hover:border-neon-cyan/25 hover:text-white transition-all">
              {currentStatus && (
                <currentStatus.icon className={cn("h-3.5 w-3.5", currentStatus.color)} />
              )}
              Cambiar estado
              <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-neon-cyan/[0.08] bg-space-card shadow-modal py-1 hidden group-hover/status:block z-30">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onStatusChange(opt.value)}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 text-[12px] hover:bg-space-el transition-colors",
                    conv.status === opt.value ? "text-neon-cyan" : "text-[#A0AEC0]"
                  )}
                >
                  <opt.icon className={cn("h-3.5 w-3.5", opt.color)} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Handoff banner */}
      {isHandedOff && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neon-yellow/5 border border-neon-yellow/20 text-neon-yellow text-xs font-medium shrink-0">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Usuario solicitó hablar con un humano</span>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {conv.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
            <MessageSquare className="h-8 w-8 text-[#4A5568]" />
            <p className="text-[#4A5568] text-xs">Sin mensajes aún</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.day} className="space-y-3">
              {/* Day separator */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-neon-cyan/[0.06]" />
                <span className="text-[11px] text-[#4A5568] font-medium px-2">{group.day}</span>
                <div className="flex-1 h-px bg-neon-cyan/[0.06]" />
              </div>
              {group.messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {!isResolved ? (
        <div className="shrink-0 border-t border-neon-cyan/[0.08] p-4 bg-space-card/80">
          <div className="flex items-end gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Escribe un mensaje como agente humano..."
              rows={1}
              className="flex-1 resize-none min-h-[44px] max-h-32 rounded-xl bg-space-el border border-neon-cyan/[0.08] focus:border-neon-cyan/30 px-4 py-3 text-sm text-white placeholder-[#4A5568] outline-none transition-colors leading-relaxed"
              style={{ height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 128) + "px";
              }}
            />
            <button
              onClick={onSend}
              disabled={!text.trim() || sending}
              className="h-11 w-11 rounded-xl bg-neon-cyan/15 border border-neon-cyan/30 text-neon-cyan flex items-center justify-center hover:bg-neon-cyan/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-[#4A5568] mt-1.5">
            Enter para enviar · Shift+Enter para nueva línea
          </p>
        </div>
      ) : (
        <div className="shrink-0 border-t border-neon-cyan/[0.08] p-4 bg-space-card/80 flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#4A5568]" />
          <p className="text-xs text-[#4A5568]">
            Conversación resuelta.{" "}
            <button
              onClick={() => onStatusChange("open")}
              className="text-neon-cyan hover:underline"
            >
              Reabrir
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
