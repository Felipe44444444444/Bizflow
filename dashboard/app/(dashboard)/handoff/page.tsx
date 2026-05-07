"use client";
import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, User, MessageSquare, Clock, CheckCircle, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const CANAL_ICONS: Record<string, string> = {
  whatsapp: "💬", facebook: "👤", instagram: "📸", slack: "💼", widget: "🌐",
};

const STATUS_CONFIG = {
  pending:     { label: "Pendiente",   color: "border-red-500/30 text-red-400",       dot: "bg-red-400" },
  in_progress: { label: "En Proceso",  color: "border-yellow-500/30 text-yellow-400", dot: "bg-yellow-400" },
  resolved:    { label: "Resuelto",    color: "border-green-500/30 text-green-400",   dot: "bg-green-400" },
};

function timeElapsed(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora mismo";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)} días`;
}

export default function HandoffPage() {
  const supabase = createClient();
  const [orgId, setOrgId] = useState("");
  const [handoffs, setHandoffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: m } = await supabase.from("organization_members")
        .select("organization_id").eq("user_id", session.user.id).limit(1).single();
      if (!m) return;
      setOrgId(m.organization_id);

      const data = await api.get("/api/handoff/all", m.organization_id).catch(() => []);
      setHandoffs(Array.isArray(data) ? data : []);
      setLoading(false);
    }
    load();

    // Realtime subscription
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase.from("organization_members").select("organization_id")
        .eq("user_id", session.user.id).limit(1).single().then(({ data: m }) => {
          if (!m) return;
          const ch = supabase.channel(`handoff-${m.organization_id}`)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "handoff_requests",
              filter: `organization_id=eq.${m.organization_id}` }, payload => {
              setHandoffs(prev => [payload.new, ...prev]);
            })
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "handoff_requests",
              filter: `organization_id=eq.${m.organization_id}` }, payload => {
              setHandoffs(prev => prev.map(h => h.id === payload.new.id ? payload.new : h));
            })
            .subscribe();
        });
    });
  }, []);

  async function assign(handoffId: string) {
    const updated = await api.patch(`/api/handoff/${handoffId}/assign`, {}, orgId).catch(() => null);
    if (updated) setHandoffs(prev => prev.map(h => h.id === handoffId ? updated : h));
  }

  async function resolve(handoffId: string) {
    const updated = await api.patch(`/api/handoff/${handoffId}/resolve`, {}, orgId).catch(() => null);
    if (updated) {
      setHandoffs(prev => prev.map(h => h.id === handoffId ? updated : h));
      if (selected?.id === handoffId) setSelected(null);
    }
  }

  async function openChat(handoff: any) {
    setSelected(handoff);
    if (!handoff.conversation_id) return;
    const msgs = await api.get(`/api/messages/${handoff.conversation_id}`, orgId).catch(() => []);
    setMessages(Array.isArray(msgs) ? msgs : []);
  }

  async function sendReply() {
    if (!reply.trim() || !selected?.conversation_id) return;
    setSending(true);
    const msg = await api.post("/api/messages/send", {
      conversation_id: selected.conversation_id,
      content: reply,
      role: "human_agent",
    }, orgId).catch(() => null);
    if (msg) setMessages(prev => [...prev, msg]);
    setReply("");
    setSending(false);
  }

  const byStatus = (status: string) => handoffs.filter(h => h.status === status);
  const pending = byStatus("pending");
  const inProgress = byStatus("in_progress");
  const resolved = byStatus("resolved").slice(0, 20);

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-neon-cyan" />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Centro de Atención"
        description="Solicitudes de clientes que necesitan atención humana"
        action={pending.length > 0 ? (
          <Badge className="bg-red-500/20 border border-red-500/30 text-red-400 animate-pulse">
            {pending.length} urgente{pending.length > 1 ? "s" : ""}
          </Badge>
        ) : undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Kanban ── */}
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-4 h-full min-w-[760px]">
            {[
              { status: "pending",     label: "🔴 Pendiente",  items: pending },
              { status: "in_progress", label: "🟡 En Proceso", items: inProgress },
              { status: "resolved",    label: "✅ Resuelto",   items: resolved },
            ].map(col => (
              <div key={col.status} className="flex flex-col w-64 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white/80">{col.label}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-space-el text-[#4A5568] border border-neon-cyan/[0.06]">
                    {col.items.length}
                  </span>
                </div>
                <div className="space-y-2 overflow-y-auto flex-1">
                  {col.items.map(h => (
                    <div
                      key={h.id}
                      className={cn(
                        "rounded-xl border p-3 cursor-pointer transition-all hover:border-neon-cyan/20",
                        selected?.id === h.id
                          ? "border-neon-cyan/30 bg-neon-cyan/[0.04]"
                          : "border-neon-cyan/[0.08] bg-space-card"
                      )}
                      onClick={() => openChat(h)}
                    >
                      {/* Avatar + canal */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-space-el border border-neon-cyan/[0.08] text-sm">
                          {(h.contact_name || "?")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{h.contact_name || "Desconocido"}</p>
                          <p className="text-[10px] text-[#4A5568]">
                            {CANAL_ICONS[h.canal] || "📱"} {h.canal}
                          </p>
                        </div>
                      </div>

                      {/* Last message */}
                      {h.last_message && (
                        <p className="text-[10px] text-[#4A5568] line-clamp-2 mb-2">
                          &ldquo;{h.last_message}&rdquo;
                        </p>
                      )}

                      {/* Time */}
                      <div className="flex items-center gap-1 text-[10px] text-[#4A5568] mb-2">
                        <Clock className="h-2.5 w-2.5" />
                        {timeElapsed(h.created_at)}
                      </div>

                      {/* Buttons */}
                      <div className="flex gap-1">
                        {h.status === "pending" && (
                          <Button
                            size="sm"
                            className="flex-1 h-6 text-[10px] bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/20"
                            onClick={(e) => { e.stopPropagation(); assign(h.id); }}
                          >
                            Atender
                          </Button>
                        )}
                        {h.status === "in_progress" && (
                          <Button
                            size="sm"
                            className="flex-1 h-6 text-[10px] bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20"
                            onClick={(e) => { e.stopPropagation(); resolve(h.id); }}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" /> Resolver
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] border-neon-cyan/[0.08] text-[#4A5568] hover:text-white"
                          onClick={(e) => { e.stopPropagation(); openChat(h); }}
                        >
                          <MessageSquare className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {col.items.length === 0 && (
                    <div className="rounded-xl border border-dashed border-neon-cyan/[0.06] p-6 text-center">
                      <p className="text-[10px] text-[#4A5568]">Sin solicitudes</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Side panel ── */}
        {selected && (
          <div className="w-96 border-l border-neon-cyan/[0.08] flex flex-col bg-space-card shrink-0">
            {/* Panel header */}
            <div className="flex items-center justify-between p-4 border-b border-neon-cyan/[0.08]">
              <div>
                <p className="text-sm font-semibold text-white">{selected.contact_name || "Desconocido"}</p>
                <p className="text-[10px] text-[#4A5568]">{CANAL_ICONS[selected.canal]} {selected.canal}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.status === "in_progress" && (
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20"
                    onClick={() => resolve(selected.id)}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" /> Resolver
                  </Button>
                )}
                <button onClick={() => setSelected(null)} className="text-[#4A5568] hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-center text-[10px] text-[#4A5568] py-8">Sin historial disponible</p>
              )}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={cn(
                    "max-w-[80%] rounded-xl px-3 py-2",
                    msg.role === "user" || msg.role === "human"
                      ? "bg-space-el text-[#A0AEC0] text-xs"
                      : msg.role === "human_agent"
                      ? "ml-auto bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan text-xs"
                      : "ml-auto bg-neon-purple/10 border border-neon-purple/20 text-[#A0AEC0] text-xs"
                  )}
                >
                  <p className="text-[9px] font-semibold mb-1 opacity-60 uppercase">
                    {msg.role === "assistant" ? "Bot" : msg.role === "human_agent" ? "Agente" : "Cliente"}
                  </p>
                  {msg.content}
                </div>
              ))}
            </div>

            {/* Reply box */}
            <div className="p-4 border-t border-neon-cyan/[0.08]">
              <div className="flex gap-2">
                <Textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  placeholder="Escribe tu respuesta..."
                  rows={2}
                  className="flex-1 bg-space-el border-neon-cyan/[0.08] text-white text-xs resize-none"
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                />
                <Button
                  size="sm"
                  className="h-16 w-10 bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/20"
                  onClick={sendReply}
                  disabled={sending}
                >
                  {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
