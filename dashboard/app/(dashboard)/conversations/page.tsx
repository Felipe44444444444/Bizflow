"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import { Loader2, MessageSquare, Filter } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  open: "Abierta", resolved: "Resuelta", handed_off: "Escalada", spam: "Spam",
};
const STATUS_COLORS: Record<string, string> = {
  open:       "text-neon-green bg-neon-green/10 border-neon-green/20",
  resolved:   "text-[#A0AEC0] bg-white/5 border-white/10",
  handed_off: "text-neon-yellow bg-neon-yellow/10 border-neon-yellow/20",
  spam:       "text-[#4A5568] bg-white/5 border-white/10",
};
const CHANNEL_EMOJI: Record<string, string> = {
  whatsapp: "💬", instagram: "📸", facebook: "👍", slack: "💼", web_widget: "🌐", api: "⚡",
};
const CHANNEL_BG: Record<string, string> = {
  whatsapp:   "bg-[#25D366]/10 border-[#25D366]/20",
  instagram:  "bg-pink-500/10 border-pink-500/20",
  facebook:   "bg-[#1877F2]/10 border-[#1877F2]/20",
  slack:      "bg-purple-500/10 border-purple-500/20",
  web_widget: "bg-neon-cyan/10 border-neon-cyan/20",
  api:        "bg-neon-purple/10 border-neon-purple/20",
};

export default function ConversationsPage() {
  const supabase = createClient();
  const router   = useRouter();
  const [convs,        setConvs]        = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [orgId,        setOrgId]        = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: m } = await supabase
        .from("organization_members").select("organization_id")
        .eq("user_id", session.user.id).limit(1).single();
      if (!m) return;
      setOrgId(m.organization_id);
      await fetchConvs(m.organization_id, "all");

      const channel = supabase
        .channel("conversations_changes")
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${m.organization_id}`,
        }, () => fetchConvs(m.organization_id, statusFilter))
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
    load();
  }, []);

  async function fetchConvs(o: string, status: string) {
    const qs   = status !== "all" ? `?status=${status}` : "";
    const data = await api.get(`/api/conversations${qs}`, o);
    setConvs(data.data || []);
    setLoading(false);
  }

  function handleStatusChange(v: string) {
    setStatusFilter(v);
    if (orgId) fetchConvs(orgId, v);
  }

  const openCount = convs.filter((c) => c.status === "open").length;

  return (
    <div className="flex flex-col h-full min-h-full">
      <Header
        title="Conversaciones"
        description={openCount > 0 ? `${openCount} conversación${openCount > 1 ? "es" : ""} abierta${openCount > 1 ? "s" : ""}` : "Bandeja de entrada en tiempo real"}
        action={
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-36 h-8 text-xs bg-space-el border-neon-cyan/15 text-[#A0AEC0]">
              <Filter className="h-3 w-3 mr-1 text-neon-cyan" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="open">Abiertas</SelectItem>
              <SelectItem value="handed_off">Escaladas</SelectItem>
              <SelectItem value="resolved">Resueltas</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-neon-cyan/50" />
          </div>
        ) : convs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 animate-fade-in">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-space-card border border-neon-cyan/10">
              <MessageSquare className="h-7 w-7 text-[#4A5568]" />
            </div>
            <p className="text-[#A0AEC0] text-sm font-medium">Sin conversaciones</p>
            <p className="text-[#4A5568] text-xs">Las conversaciones de tus canales aparecerán aquí</p>
          </div>
        ) : (
          convs.map((conv, i) => {
            const ch     = conv.channels as { type: string; name: string } | null;
            const agent  = conv.agents as { name: string } | null;
            const chType = ch?.type ?? "api";
            const sc     = STATUS_COLORS[conv.status] ?? STATUS_COLORS.resolved;

            return (
              <div
                key={conv.id}
                onClick={() => router.push(`/conversations/${conv.id}`)}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-neon-cyan/[0.06] bg-space-card hover:border-neon-cyan/20 hover:bg-space-el cursor-pointer transition-all duration-200 group animate-slide-in-up"
                style={{ animationDelay: `${i * 0.03}s` }}
              >
                {/* Channel icon */}
                <div className={`relative h-10 w-10 rounded-xl border flex items-center justify-center text-base shrink-0 ${CHANNEL_BG[chType] ?? "bg-space-el border-white/10"}`}>
                  {CHANNEL_EMOJI[chType]}
                  {conv.status === "open" && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-neon-green border-2 border-space-card animate-pulse" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="font-semibold text-sm text-white group-hover:text-neon-cyan transition-colors truncate">
                      {conv.contact_name || "Visitante anónimo"}
                    </p>
                    <span className="text-[10px] text-[#4A5568] shrink-0">{formatRelative(conv.last_message_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[#4A5568]">{agent?.name ?? "Agente"}</span>
                    <span className="text-[#4A5568]/40">·</span>
                    <span className="text-[11px] text-[#4A5568]">{ch?.name ?? chType}</span>
                  </div>
                </div>

                {/* Status */}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${sc}`}>
                  {STATUS_LABELS[conv.status] ?? conv.status}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
