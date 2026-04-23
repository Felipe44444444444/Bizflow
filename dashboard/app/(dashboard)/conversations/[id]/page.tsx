"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Send, Loader2, Bot, User, Headphones, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_ICONS: Record<string, React.ElementType> = {
  user: User, assistant: Bot, human_agent: Headphones, system: ShieldAlert,
};
const ROLE_COLORS: Record<string, string> = {
  user: "bg-secondary text-foreground",
  assistant: "bg-primary/10 border border-primary/20 text-foreground",
  human_agent: "bg-emerald-500/10 border border-emerald-500/20 text-foreground",
  system: "bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs italic",
};

export default function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [conv, setConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [token, setToken] = useState("");
  const [orgId, setOrgId] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setToken(session.access_token);
      const { data: m } = await supabase.from("organization_members").select("organization_id").eq("user_id", session.user.id).limit(1).single();
      if (!m) return;
      setOrgId(m.organization_id);

      const data = await api.get(`/api/conversations/${id}`, session.access_token, m.organization_id);
      setConv(data);
      setMessages(data.messages || []);
      setLoading(false);

      // Real-time messages
      const channel = supabase
        .channel(`conv_${id}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        }, (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
    load();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!text.trim()) return;
    setSending(true);
    const msg = await api.post("/api/messages/send", {
      conversation_id: id,
      content: text,
      role: "human_agent",
    }, token, orgId);
    setMessages((prev) => [...prev, msg]);
    setText("");
    setSending(false);
  }

  async function updateStatus(status: string) {
    await api.patch(`/api/conversations/${id}/status`, { status }, token, orgId);
    setConv((prev: any) => ({ ...prev, status }));
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const STATUS_VARIANTS: Record<string, any> = {
    open: "success", resolved: "secondary", handed_off: "warning", spam: "secondary",
  };

  return (
    <div className="flex flex-col h-[calc(100vh-0px)]">
      <Header
        title={conv?.contact_name || "Visitante"}
        description={conv?.contact_email || conv?.contact_phone || "Sin datos de contacto"}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANTS[conv?.status] ?? "secondary"}>{conv?.status}</Badge>
            <Select value={conv?.status} onValueChange={updateStatus}>
              <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Abrir</SelectItem>
                <SelectItem value="resolved">Resolver</SelectItem>
                <SelectItem value="handed_off">Escalar</SelectItem>
                <SelectItem value="spam">Spam</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const Icon = ROLE_ICONS[msg.role] ?? Bot;
          const isUser = msg.role === "user";
          return (
            <div key={msg.id} className={cn("flex gap-3", isUser ? "flex-row" : "flex-row-reverse")}>
              {isUser && (
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className={cn("max-w-[70%] space-y-1", isUser ? "" : "items-end flex flex-col")}>
                <div className={cn("rounded-2xl px-4 py-2.5 text-sm leading-relaxed", ROLE_COLORS[msg.role] ?? ROLE_COLORS.assistant, isUser ? "rounded-tl-sm" : "rounded-tr-sm")}>
                  {msg.content}
                </div>
                <p className="text-[10px] text-muted-foreground px-1">{formatDate(msg.created_at)}</p>
              </div>
              {!isUser && (
                <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {conv?.status !== "resolved" && (
        <div className="border-t border-border p-4">
          <div className="flex gap-3">
            <Textarea
              placeholder="Escribe un mensaje como agente humano..."
              className="min-h-[44px] max-h-32 text-sm resize-none"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            />
            <Button size="icon" onClick={sendMessage} disabled={!text.trim() || sending} className="shrink-0 h-11 w-11">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Enter para enviar · Shift+Enter para nueva línea</p>
        </div>
      )}
    </div>
  );
}
