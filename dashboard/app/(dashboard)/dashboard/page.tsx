import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Users, Bot, TrendingUp, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { formatRelative } from "@/lib/utils";

async function getMetrics(orgId: string, supabase: ReturnType<typeof createClient>) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [{ count: msgsToday }, { count: activConvs }, { count: leads }, { data: usage }, { data: recentConvs }] = await Promise.all([
    supabase.from("messages").select("*", { count: "exact", head: true }).eq("role", "user").gte("created_at", todayStart),
    supabase.from("conversations").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "open"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", monthStart),
    supabase.from("usage_metrics").select("messages_count,tokens_used,conversations_count").eq("organization_id", orgId).gte("period_start", monthStart).single(),
    supabase.from("conversations").select("id,contact_name,status,last_message_at,channels(type)").eq("organization_id", orgId).order("last_message_at", { ascending: false }).limit(5),
  ]);

  return { msgsToday: msgsToday ?? 0, activConvs: activConvs ?? 0, leads: leads ?? 0, usage, recentConvs };
}

const statusMap: Record<string, { label: string; variant: "success" | "warning" | "info" | "secondary" }> = {
  open: { label: "Abierta", variant: "success" },
  resolved: { label: "Resuelta", variant: "secondary" },
  handed_off: { label: "Escalada", variant: "warning" },
  spam: { label: "Spam", variant: "secondary" },
};

const channelEmoji: Record<string, string> = {
  whatsapp: "💬", instagram: "📸", facebook: "👍", slack: "💼", web_widget: "🌐", api: "⚡",
};

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, organizations(name, plan)")
    .eq("user_id", user!.id)
    .limit(1)
    .single();

  const orgId = membership?.organization_id ?? "";
  const org = (Array.isArray(membership?.organizations) ? membership?.organizations[0] : membership?.organizations) as { name: string; plan: string } | null;
  const { msgsToday, activConvs, leads, usage, recentConvs } = await getMetrics(orgId, supabase);

  const stats = [
    { title: "Mensajes hoy", value: msgsToday, icon: MessageSquare, trend: "+12%", up: true, color: "text-blue-400" },
    { title: "Conversaciones activas", value: activConvs, icon: Bot, trend: "+5", up: true, color: "text-purple-400" },
    { title: "Leads este mes", value: leads, icon: Users, trend: "+8%", up: true, color: "text-emerald-400" },
    { title: "Tokens usados", value: usage ? (usage.tokens_used / 1000).toFixed(1) + "k" : "0", icon: TrendingUp, trend: "mensual", up: true, color: "text-amber-400" },
  ];

  return (
    <div>
      <Header
        title={`Dashboard — ${org?.name ?? "Mi organización"}`}
        description={`Plan: ${org?.plan ?? "free"}`}
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map(({ title, value, icon: Icon, trend, up, color }) => (
            <Card key={title} className="relative overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">{title}</p>
                  <div className={`p-2 rounded-lg bg-current/10 ${color}`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-bold">{value}</p>
                  <div className="flex items-center gap-1 text-xs">
                    {up ? (
                      <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-red-400" />
                    )}
                    <span className={up ? "text-emerald-400" : "text-red-400"}>{trend}</span>
                  </div>
                </div>
              </CardContent>
              <div className="absolute bottom-0 left-0 right-0 h-1 gradient-primary opacity-30 rounded-b-xl" />
            </Card>
          ))}
        </div>

        {/* Recent conversations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Conversaciones recientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!recentConvs?.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Aún no hay conversaciones</p>
            ) : (
              <div className="space-y-2">
                {recentConvs.map((conv: any) => {
                  const status = statusMap[conv.status] ?? { label: conv.status, variant: "secondary" as const };
                  const ch = conv.channels as { type: string } | null;
                  return (
                    <div key={conv.id} className="flex items-center justify-between rounded-lg p-3 hover:bg-accent transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{channelEmoji[ch?.type ?? "api"] ?? "💬"}</span>
                        <div>
                          <p className="text-sm font-medium">{conv.contact_name || "Visitante anónimo"}</p>
                          <p className="text-xs text-muted-foreground">{formatRelative(conv.last_message_at)}</p>
                        </div>
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
