"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import { Loader2, MessageSquare, Filter } from "lucide-react";

const STATUS_VARIANTS: Record<string, any> = {
  open: "success", resolved: "secondary", handed_off: "warning", spam: "secondary",
};
const STATUS_LABELS: Record<string, string> = {
  open: "Abierta", resolved: "Resuelta", handed_off: "Escalada", spam: "Spam",
};
const CHANNEL_EMOJI: Record<string, string> = {
  whatsapp: "💬", instagram: "📸", facebook: "👍", slack: "💼", web_widget: "🌐", api: "⚡",
};

export default function ConversationsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [convs, setConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [orgId, setOrgId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setToken(session.access_token);
      const { data: m } = await supabase.from("organization_members").select("organization_id").eq("user_id", session.user.id).limit(1).single();
      if (!m) return;
      setOrgId(m.organization_id);
      await fetchConvs(session.access_token, m.organization_id, "all");

      // Real-time subscription
      const channel = supabase
        .channel("conversations_changes")
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${m.organization_id}`,
        }, () => fetchConvs(session.access_token, m.organization_id, statusFilter))
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
    load();
  }, []);

  async function fetchConvs(t: string, o: string, status: string) {
    const qs = status !== "all" ? `?status=${status}` : "";
    const data = await api.get(`/api/conversations${qs}`, t, o);
    setConvs(data.data || []);
    setLoading(false);
  }

  function handleStatusChange(v: string) {
    setStatusFilter(v);
    if (token && orgId) fetchConvs(token, orgId, v);
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Conversaciones"
        description="Bandeja de entrada en tiempo real"
        action={
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <Filter className="h-3 w-3 mr-1" />
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
          <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : convs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">Sin conversaciones</p>
          </div>
        ) : (
          convs.map((conv) => {
            const ch = conv.channels as { type: string; name: string } | null;
            const agent = conv.agents as { name: string } | null;
            return (
              <div
                key={conv.id}
                onClick={() => router.push(`/dashboard/conversations/${conv.id}`)}
                className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-accent/30 cursor-pointer transition-all group"
              >
                <div className="relative">
                  <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-lg">
                    {CHANNEL_EMOJI[ch?.type ?? "api"]}
                  </div>
                  {conv.status === "open" && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-card" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate">{conv.contact_name || "Visitante"}</p>
                    <span className="text-xs text-muted-foreground shrink-0">{formatRelative(conv.last_message_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">{agent?.name ?? "Agente"}</p>
                    <span className="text-muted-foreground/30">·</span>
                    <p className="text-xs text-muted-foreground truncate">{ch?.name ?? ch?.type}</p>
                  </div>
                </div>
                <Badge variant={STATUS_VARIANTS[conv.status] ?? "secondary"}>
                  {STATUS_LABELS[conv.status] ?? conv.status}
                </Badge>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
