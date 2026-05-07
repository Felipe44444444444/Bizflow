import { createClient, getCachedUser } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import {
  MessageSquare, Users, Bot, TrendingUp, ArrowUpRight,
  Clock, Brain, Radio, Zap, ArrowUp, ArrowDown, Minus,
  Activity,
} from "lucide-react";
import { formatRelative } from "@/lib/utils";
import Link from "next/link";

async function getMetrics(orgId: string, supabase: ReturnType<typeof createClient>) {
  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const yesterday  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();

  const [
    { count: msgsToday },
    { count: msgsYesterday },
    { count: activConvs },
    { count: leads },
    { data: usage },
    { data: recentConvs },
    { count: agentCount },
    { data: recentActivity },
  ] = await Promise.all([
    supabase.from("messages").select("*", { count: "exact", head: true }).eq("role", "user").gte("created_at", todayStart),
    supabase.from("messages").select("*", { count: "exact", head: true }).eq("role", "user").gte("created_at", yesterday).lt("created_at", todayStart),
    supabase.from("conversations").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "open"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", monthStart),
    supabase.from("usage_metrics").select("messages_count,tokens_used,conversations_count").eq("organization_id", orgId).gte("period_start", monthStart).single(),
    supabase.from("conversations").select("id,contact_name,status,last_message_at,channels(type)").eq("organization_id", orgId).order("last_message_at", { ascending: false }).limit(6),
    supabase.from("agents").select("*", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("notifications").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(8),
  ]);

  return { msgsToday: msgsToday ?? 0, msgsYesterday: msgsYesterday ?? 0, activConvs: activConvs ?? 0, leads: leads ?? 0, usage, recentConvs, agentCount: agentCount ?? 0, recentActivity };
}

const statusMap: Record<string, { label: string; color: string }> = {
  open:       { label: "Abierta",  color: "text-neon-green" },
  resolved:   { label: "Resuelta", color: "text-[#A0AEC0]" },
  handed_off: { label: "Escalada", color: "text-neon-yellow" },
  spam:       { label: "Spam",     color: "text-[#4A5568]" },
};

const channelEmoji: Record<string, string> = {
  whatsapp: "💬", instagram: "📸", facebook: "👍", slack: "💼", web_widget: "🌐", api: "⚡",
};

const channelBg: Record<string, string> = {
  whatsapp:   "bg-[#25D366]/10 border-[#25D366]/20",
  instagram:  "bg-pink-500/10 border-pink-500/20",
  facebook:   "bg-[#1877F2]/10 border-[#1877F2]/20",
  slack:      "bg-[#4A154B]/30 border-purple-500/20",
  web_widget: "bg-neon-cyan/10 border-neon-cyan/20",
  api:        "bg-neon-purple/10 border-neon-purple/20",
};

// Notification type → display config
const notifConfig: Record<string, { emoji: string; color: string }> = {
  new_lead:      { emoji: "👤", color: "text-neon-green" },
  new_message:   { emoji: "💬", color: "text-neon-cyan" },
  handoff:       { emoji: "🔔", color: "text-neon-yellow" },
  agent_error:   { emoji: "⚠️", color: "text-neon-red" },
  campaign_sent: { emoji: "📢", color: "text-neon-purple" },
};

function ActivityItem({ notif }: { notif: any }) {
  const cfg = notifConfig[notif.type] ?? { emoji: "🔔", color: "text-[#A0AEC0]" };
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-neon-cyan/[0.04] last:border-0">
      <span className="text-base shrink-0 mt-0.5">{cfg.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${cfg.color}`}>
          {notif.title || notif.type || "Notificación"}
        </p>
        {notif.body && (
          <p className="text-[10px] text-[#4A5568] truncate">{notif.body}</p>
        )}
      </div>
      <span className="text-[10px] text-[#4A5568] shrink-0 mt-0.5">
        {notif.created_at ? formatRelative(notif.created_at) : ""}
      </span>
    </div>
  );
}

function Trend({ now, prev }: { now: number; prev: number }) {
  if (prev === 0 && now === 0) return <span className="text-[#4A5568] text-xs flex items-center gap-0.5"><Minus className="h-3 w-3" />sin datos</span>;
  if (prev === 0) return <span className="text-neon-green text-xs flex items-center gap-0.5"><ArrowUp className="h-3 w-3" />nuevo</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return <span className="text-[#A0AEC0] text-xs flex items-center gap-0.5"><Minus className="h-3 w-3" />igual</span>;
  return pct > 0
    ? <span className="text-neon-green text-xs flex items-center gap-0.5"><ArrowUp className="h-3 w-3" />+{pct}% vs ayer</span>
    : <span className="text-neon-red text-xs flex items-center gap-0.5"><ArrowDown className="h-3 w-3" />{pct}% vs ayer</span>;
}

export default async function DashboardPage() {
  const [user, supabase] = await Promise.all([getCachedUser(), Promise.resolve(createClient())]);

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, organizations(name, plan, credits_balance, plan_credits_limit)")
    .eq("user_id", user!.id)
    .limit(1)
    .single();

  const orgId = membership?.organization_id ?? "";
  const org   = (Array.isArray(membership?.organizations)
    ? membership?.organizations[0]
    : membership?.organizations) as { name: string; plan: string; credits_balance: number; plan_credits_limit: number } | null;

  const { msgsToday, msgsYesterday, activConvs, leads, usage, recentConvs, agentCount, recentActivity } =
    await getMetrics(orgId, supabase);

  const hour        = new Date().getHours();
  const greeting    = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";
  const displayName = user?.email?.split("@")[0] ?? "usuario";
  const creditsUsed = (org?.plan_credits_limit ?? 1000) - (org?.credits_balance ?? 0);
  const creditsPct  = Math.min(100, Math.round((creditsUsed / (org?.plan_credits_limit ?? 1000)) * 100));

  // Current date formatted
  const dateStr = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const dateDisplay = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  // ── Onboarding (no agents yet) ─────────────────────────────────────────────
  if (agentCount === 0) {
    const steps = [
      { n: 1, icon: Bot,    title: "Crea tu primer agente",  desc: "Define nombre, tono y comportamiento",             href: "/agents?new=1", cta: "Crear agente" },
      { n: 2, icon: Brain,  title: "Entrena al agente",      desc: "Sube documentos o URLs para enseñarle tu negocio", href: "/agents?new=1", cta: "Crear agente" },
      { n: 3, icon: Radio,  title: "Conecta un canal",       desc: "Activa el Web Widget, WhatsApp o Instagram",       href: "/agents?new=1", cta: "Crear agente" },
      { n: 4, icon: Zap,    title: "Prueba el chat",         desc: "Envía un mensaje de prueba y verifica todo",       href: "/conversations", cta: "Ver chat" },
    ];

    return (
      <div className="min-h-full">
        <Header
          title={`${greeting}, ${displayName} 👋`}
          description={dateDisplay}
        />
        <div className="p-6 max-w-2xl mx-auto animate-slide-in-up">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="relative inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-neon-cyan/10 border border-neon-cyan/20 mb-6 mx-auto animate-float">
              <Bot className="h-10 w-10 text-neon-cyan" />
              <div className="absolute inset-0 rounded-2xl glow-cyan opacity-50" />
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <h2 className="font-display text-2xl font-bold">
                Automatiza tu atención al cliente
              </h2>
            </div>
            <p className="text-[#A0AEC0] text-sm max-w-sm mx-auto">
              Tu agente IA estará listo en minutos. Sin código. Sin complicaciones.
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {steps.map(({ n, icon: Icon, title, desc, href, cta }) => (
              <div
                key={n}
                className="flex items-center gap-4 p-4 rounded-xl border border-neon-cyan/[0.08] bg-space-card hover:border-neon-cyan/25 hover:bg-space-el transition-all duration-200 group"
                style={{ animationDelay: `${n * 0.08}s` }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neon-cyan/10 border border-neon-cyan/20 font-display font-bold text-neon-cyan text-sm">
                  {n}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Icon className="h-3.5 w-3.5 text-[#4A5568] group-hover:text-neon-cyan transition-colors" />
                    <p className="font-semibold text-sm text-white">{title}</p>
                  </div>
                  <p className="text-xs text-[#A0AEC0]">{desc}</p>
                </div>
                <Button asChild size="sm" variant="outline" className="border-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/10 hover:border-neon-cyan/40 shrink-0">
                  <Link href={href}>{cta} →</Link>
                </Button>
              </div>
            ))}
          </div>

          {/* Credits banner */}
          <div className="mt-8 p-4 rounded-xl border border-neon-cyan/20 bg-neon-cyan/5 flex items-center gap-3">
            <Zap className="h-5 w-5 text-neon-cyan shrink-0" />
            <div>
              <p className="text-sm font-semibold text-neon-cyan">
                {org?.credits_balance?.toLocaleString() ?? "1,000"} créditos disponibles
              </p>
              <p className="text-xs text-[#A0AEC0]">Cada mensaje procesado consume 1 crédito</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main dashboard ─────────────────────────────────────────────────────────
  const kpis = [
    {
      title: "Mensajes hoy",
      value: msgsToday,
      icon: MessageSquare,
      color: "text-neon-cyan",
      bg: "bg-neon-cyan/10 border-neon-cyan/20",
      trend: <Trend now={msgsToday} prev={msgsYesterday} />,
    },
    {
      title: "Conversaciones activas",
      value: activConvs,
      icon: Bot,
      color: "text-neon-purple",
      bg: "bg-neon-purple/10 border-neon-purple/20",
      trend: null,
    },
    {
      title: "Leads este mes",
      value: leads,
      icon: Users,
      color: "text-neon-green",
      bg: "bg-neon-green/10 border-neon-green/20",
      trend: null,
    },
    {
      title: "Tokens usados",
      value: usage ? `${(usage.tokens_used / 1000).toFixed(1)}k` : "0",
      icon: TrendingUp,
      color: "text-neon-yellow",
      bg: "bg-neon-yellow/10 border-neon-yellow/20",
      trend: null,
    },
  ];

  return (
    <div className="min-h-full">
      {/* Custom header with date + status chip */}
      <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-neon-cyan/[0.06]">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-display text-2xl font-bold text-white">
              {greeting}, {displayName} 👋
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neon-green/10 border border-neon-green/20 text-neon-green text-[11px] font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-neon-green animate-pulse" />
              Sistema operativo
            </span>
          </div>
          <p className="text-sm text-[#A0AEC0]">
            {dateDisplay} · {org?.name ?? "Mi organización"} · Plan {org?.plan ?? "starter"}
          </p>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Credits warning */}
        {org && org.credits_balance < 100 && (
          <div className="flex items-center justify-between rounded-xl border border-neon-yellow/30 bg-neon-yellow/5 p-4 animate-slide-in-up">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-neon-yellow shrink-0" />
              <div>
                <p className="text-sm font-semibold text-neon-yellow">Créditos bajos</p>
                <p className="text-xs text-[#A0AEC0]">Te quedan {org.credits_balance} créditos</p>
              </div>
            </div>
            <Button asChild size="sm" className="bg-neon-yellow/10 border border-neon-yellow/30 text-neon-yellow hover:bg-neon-yellow/20">
              <Link href="/settings">Recargar</Link>
            </Button>
          </div>
        )}

        {/* KPI grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map(({ title, value, icon: Icon, color, bg, trend }, i) => (
            <div
              key={title}
              className="relative rounded-xl border border-neon-cyan/[0.08] bg-space-card p-5 overflow-hidden card-hover group animate-slide-in-up"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              {/* Ambient corner glow */}
              <div className={`absolute -top-6 -right-6 h-16 w-16 rounded-full opacity-20 blur-xl ${bg}`} />

              <div className="flex items-start justify-between mb-4">
                <p className="text-xs text-[#A0AEC0] font-medium">{title}</p>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
              </div>

              <p className={`font-display text-3xl font-bold ${color} mb-1`}>{value}</p>

              {trend && <div className="mt-1">{trend}</div>}

              {/* Bottom accent bar */}
              <div className={`absolute bottom-0 left-0 right-0 h-0.5 opacity-40 ${bg}`} />
            </div>
          ))}
        </div>

        {/* 2-column layout: left 60% + right 40% */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          {/* LEFT: Credits + Recent convs */}
          <div className="xl:col-span-3 space-y-4">
            {/* Credits usage */}
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-white">Créditos</p>
                <span className="text-xs text-[#A0AEC0] capitalize">{org?.plan ?? "starter"}</span>
              </div>
              <div className="flex items-end gap-1 mb-3">
                <span className="font-display text-2xl font-bold text-neon-cyan">
                  {(org?.credits_balance ?? 0).toLocaleString()}
                </span>
                <span className="text-xs text-[#4A5568] mb-1">
                  / {(org?.plan_credits_limit ?? 1000).toLocaleString()}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-space-el overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-purple transition-all duration-500"
                  style={{ width: `${100 - creditsPct}%` }}
                />
              </div>
              <p className="text-[10px] text-[#4A5568] mt-2">{creditsPct}% usado este mes</p>
              <Button asChild size="sm" variant="outline" className="w-full mt-4 border-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/5 text-xs">
                <Link href="/settings?tab=billing">Recargar créditos</Link>
              </Button>
            </div>

            {/* Recent conversations */}
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#4A5568]" />
                  <p className="text-sm font-semibold text-white">Conversaciones recientes</p>
                </div>
                <Button asChild variant="ghost" size="sm" className="text-xs text-neon-cyan hover:bg-neon-cyan/5">
                  <Link href="/conversations">Ver todas →</Link>
                </Button>
              </div>

              {!recentConvs?.length ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <MessageSquare className="h-8 w-8 text-[#4A5568]" />
                  <p className="text-sm text-[#4A5568]">Aún no hay conversaciones</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentConvs.map((conv: any) => {
                    const s  = statusMap[conv.status] ?? { label: conv.status, color: "text-[#A0AEC0]" };
                    const ch = conv.channels as { type: string } | null;
                    const chType = ch?.type ?? "api";
                    return (
                      <Link
                        key={conv.id}
                        href={`/conversations/${conv.id}`}
                        className="flex items-center justify-between rounded-lg p-2.5 hover:bg-space-el transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-lg border flex items-center justify-center text-sm ${channelBg[chType] ?? "bg-space-el border-white/10"}`}>
                            {channelEmoji[chType] ?? "💬"}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white group-hover:text-neon-cyan transition-colors">
                              {conv.contact_name || "Visitante anónimo"}
                            </p>
                            <p className="text-[10px] text-[#4A5568]">{formatRelative(conv.last_message_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${s.color}`}>{s.label}</span>
                          <ArrowUpRight className="h-3 w-3 text-[#4A5568] group-hover:text-neon-cyan transition-colors" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Activity Feed */}
          <div className="xl:col-span-2">
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card p-5 h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-neon-green animate-pulse" />
                  <p className="text-sm font-semibold text-white">Actividad reciente</p>
                </div>
                <Activity className="h-4 w-4 text-[#4A5568]" />
              </div>

              {!recentActivity?.length ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Activity className="h-8 w-8 text-[#4A5568]" />
                  <p className="text-sm text-[#4A5568]">Sin actividad reciente</p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[400px]">
                  {recentActivity.map((notif: any) => (
                    <ActivityItem key={notif.id} notif={notif} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
