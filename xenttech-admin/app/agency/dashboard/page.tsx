"use client";
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import {
  Briefcase, Megaphone, Palette, TrendingUp, UserCheck, BookOpen,
  Sparkles, Loader2, ArrowRight, Clock, AlertCircle, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ONBOARDING_STEPS } from "@/lib/onboarding-prompts";

interface Stats {
  clients: number; activeClients: number;
  campaigns: number; activeCampaigns: number;
  designs: number; pendingDesigns: number;
  strategies: number; manuales: number;
  mrr: number;
}

interface PipelineStep {
  number: number; name: string; icon: string; count: number;
}

const STATUS_COLOR: Record<string, string> = {
  active:   "bg-green-500/10 text-green-400 border-green-500/20",
  inactive: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  churned:  "bg-red-500/10 text-red-400 border-red-500/20",
  prospect: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const supabase = createClient();

function Sparkline({ values, color = "#00D4AA", w = 80, h = 36 }: { values: number[]; color?: string; w?: number; h?: number }) {
  if (values.length < 2) return <div style={{ width: w, height: h }} />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = (h - 3) - ((v - min) / range) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = [...pts, `${w},${h}`, `0,${h}`].join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="overflow-visible">
      <polygon points={area} fill={`${color}18`} />
      <polyline points={pts.join(" ")} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AgencyDashboardPage() {
  const [stats, setStats]             = useState<Stats | null>(null);
  const [pipeline, setPipeline]       = useState<PipelineStep[]>([]);
  const [lastClients, setLastClients] = useState<any[]>([]);
  const [lastActivities, setLastActivities] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [aiPrompt, setAiPrompt]       = useState("");
  const [aiResult, setAiResult]       = useState("");
  const [aiLoading, setAiLoading]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        clientsRes, campaignsRes, designsRes,
        strategiesRes, onbDocsRes, activityRes,
      ] = await Promise.all([
        supabase.from("clients").select("id,name,company,status,monthly_revenue,onboarding_step").order("created_at", { ascending: false }),
        supabase.from("campaigns").select("id,status,budget_monthly"),
        supabase.from("designs").select("id,status"),
        supabase.from("strategies").select("id,title").not("title", "ilike", "Manual de Marca%"),
        supabase.from("onboarding_documents").select("step_number,status"),
        supabase.from("activity_log").select("id,action,details,created_at").order("created_at", { ascending: false }).limit(10),
      ]);

      if (clientsRes.error) throw clientsRes.error;
      if (campaignsRes.error) throw campaignsRes.error;
      if (designsRes.error) throw designsRes.error;
      if (strategiesRes.error) throw strategiesRes.error;
      if (onbDocsRes.error) throw onbDocsRes.error;
      if (activityRes.error) throw activityRes.error;

      const clients    = clientsRes.data   ?? [];
      const campaigns  = campaignsRes.data ?? [];
      const designs    = designsRes.data   ?? [];
      const strategies = strategiesRes.data ?? [];
      const onbDocs    = onbDocsRes.data   ?? [];
      const activities = activityRes.data  ?? [];

      const activeClients = clients.filter(c => c.status === "active");
      const manualesRes = await supabase.from("strategies").select("id").ilike("title", "Manual de Marca%");
      const manuales = (manualesRes.data ?? []).length;

      setLastClients(clients.slice(0, 5));
      setLastActivities(activities);

      setStats({
        clients:        clients.length,
        activeClients:  activeClients.length,
        campaigns:      campaigns.length,
        activeCampaigns: campaigns.filter(c => c.status === "active").length,
        designs:        designs.length,
        pendingDesigns: designs.filter(d => d.status === "pending").length,
        strategies:     strategies.length,
        manuales,
        mrr:            activeClients.reduce((s, c) => s + (Number(c.monthly_revenue) || 0), 0),
      });

      // Onboarding pipeline per step
      const completedDocs = onbDocs.filter(d => d.status === "completado");
      setPipeline(
        ONBOARDING_STEPS.map(step => ({
          number: step.number,
          name: step.name,
          icon: step.icon,
          count: completedDocs.filter(d => d.step_number === step.number).length,
        }))
      );
    } catch {
      setError("Error al cargar datos. Verifica tu conexión.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function askAI() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const context = stats ? `
Datos actuales de la agencia:
- Clientes totales: ${stats.clients} (${stats.activeClients} activos)
- Campañas: ${stats.campaigns} (${stats.activeCampaigns} activas)
- MRR activos: $${stats.mrr.toLocaleString()}
- Manuales de marca: ${stats.manuales}
- Diseños pendientes: ${stats.pendingDesigns}
- Estrategias: ${stats.strategies}
` : "";
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, context }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const { result } = await res.json();
      setAiResult(result);
    } catch (e: any) {
      setAiResult(`Error: ${e.message}`);
    } finally { setAiLoading(false); }
  }

  const modules = [
    { href: "/agency/clients",      label: "Clientes",   icon: Briefcase,  value: stats?.clients ?? 0,                         sub: `${stats?.activeClients ?? 0} activos`,    color: "#00D4AA" },
    { href: "/agency/onboarding",   label: "Onboarding", icon: UserCheck,  value: pipeline.filter(s => s.count > 0).length,  sub: "pasos con actividad",                     color: "#3B82F6" },
    { href: "/agency/ads",          label: "Anuncios",   icon: Megaphone,  value: stats?.campaigns ?? 0,                      sub: `${stats?.activeCampaigns ?? 0} activas`,  color: "#F59E0B" },
    { href: "/agency/design",       label: "Diseño",     icon: Palette,    value: stats?.designs ?? 0,                        sub: `${stats?.pendingDesigns ?? 0} pendientes`, color: "#7C3AED" },
    { href: "/agency/brand-manual", label: "Manuales",   icon: BookOpen,   value: stats?.manuales ?? 0,                       sub: "manuales de marca",                        color: "#EC4899" },
    { href: "/agency/strategy",     label: "Estrategia", icon: TrendingUp, value: stats?.strategies ?? 0,                     sub: "estrategias",                              color: "#14B8A6" },
  ];

  const mrrSparkline = lastClients.slice().reverse().map(c => Number(c.monthly_revenue) || 0);
  const mrrData = mrrSparkline.length > 1 ? mrrSparkline : [0, (stats?.mrr ?? 0) * .4, (stats?.mrr ?? 0) * .7, (stats?.mrr ?? 0) * .85, stats?.mrr ?? 0];

  return (
    <div className="flex flex-col h-full bg-[#080812]">
      <Header title="Dashboard" description="Vista general · XENTTECH Agency" />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-[#EF4444]/20 bg-[#EF4444]/[0.05] px-4 py-3">
            <AlertCircle className="h-4 w-4 text-[#EF4444] shrink-0" />
            <p className="text-sm text-[#EF4444]/80 flex-1">{error}</p>
            <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#EF4444]/60 hover:text-[#EF4444] transition-colors">
              <RefreshCw className="h-3 w-3" /> Reintentar
            </button>
          </div>
        )}

        {/* MRR Hero */}
        <div className="relative rounded-2xl border border-[#00D4AA]/20 bg-[#0D0D1F] p-6 overflow-hidden glow-teal">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#00D4AA]/[0.04] to-[#7C3AED]/[0.02]" />
          <div className="relative flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.12em] text-[#64748B] uppercase mb-2">MRR · Ingresos mensuales</p>
              {loading ? (
                <div className="skeleton h-14 w-52 mb-2" />
              ) : (
                <div className="flex items-end gap-2">
                  <span className="font-display text-[52px] leading-none text-[#00D4AA]">
                    ${(stats?.mrr ?? 0).toLocaleString()}
                  </span>
                  <span className="text-lg text-[#64748B] mb-1.5">/ mes</span>
                </div>
              )}
              <p className="text-sm text-[#64748B] mt-1">
                {stats?.activeClients ?? 0} de {stats?.clients ?? 0} clientes activos
              </p>
            </div>
            <div className="shrink-0 opacity-60">
              <Sparkline values={mrrData} w={160} h={56} />
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map(({ href, label, icon: Icon, value, sub, color }) => (
            <Link key={href} href={href}
              className="group relative rounded-xl border border-[#1A1A35] bg-[#0D0D1F] p-5 overflow-hidden card-lift">
              <div className="pointer-events-none absolute top-0 right-0 w-28 h-28 rounded-full blur-3xl opacity-[0.07]" style={{ background: color }} />
              <div className="flex items-start justify-between mb-4">
                <div className="p-2 rounded-lg bg-[#0D0D1F]" style={{ color }}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[#334155] group-hover:text-white group-hover:translate-x-0.5 transition-all duration-150" />
              </div>
              {loading ? (
                <div className="skeleton h-8 w-20 mb-1" />
              ) : (
                <p className="font-display text-3xl text-white">{value}</p>
              )}
              <p className="text-[11px] text-[#64748B] mt-1">{label} · {sub}</p>
            </Link>
          ))}
        </div>

        {/* Pipeline stepper */}
        {pipeline.length > 0 && (
          <div className="rounded-xl border border-[#1A1A35] bg-[#0D0D1F] p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-white">Pipeline de Onboarding</p>
              <Link href="/agency/onboarding" className="text-xs text-[#64748B] hover:text-[#00D4AA] transition-colors">
                Ver detalle →
              </Link>
            </div>
            {loading ? (
              <div className="skeleton h-16 w-full" />
            ) : (
              <div className="flex items-center gap-1.5">
                {pipeline.map((step, i) => (
                  <div key={step.number} className="flex items-center flex-1">
                    <div className={cn(
                      "flex-1 rounded-lg p-2.5 text-center transition-all duration-200",
                      step.count > 0
                        ? "bg-[#00D4AA]/[0.09] border border-[#00D4AA]/25"
                        : "bg-[#080812] border border-[#1A1A35]"
                    )}>
                      <p className="text-sm mb-0.5">{step.icon}</p>
                      <p className={cn("font-display text-lg leading-none", step.count > 0 ? "text-[#00D4AA]" : "text-[#334155]")}>
                        {step.count}
                      </p>
                      <p className="text-[9px] text-[#64748B] truncate leading-tight mt-0.5">{step.name}</p>
                    </div>
                    {i < pipeline.length - 1 && (
                      <div className="w-2 shrink-0 border-t border-dashed border-[#1A1A35]" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Last clients + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Last 5 clients */}
          <div className="rounded-xl border border-[#1A1A35] bg-[#0D0D1F] p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-white">Últimos clientes</p>
              <Link href="/agency/clients" className="text-xs text-[#64748B] hover:text-[#00D4AA] transition-colors">
                Ver todos →
              </Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-12" />)}
              </div>
            ) : lastClients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Briefcase className="h-8 w-8 text-[#334155] mb-2" />
                <p className="text-sm text-[#334155]">Sin clientes todavía</p>
                <Link href="/agency/clients" className="text-xs text-[#00D4AA] mt-2">Agregar cliente →</Link>
              </div>
            ) : (
              <div className="space-y-0.5">
                {lastClients.map(c => {
                  const initials = (c.name || "?").split(" ").slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase();
                  const gradients = ["from-[#00D4AA] to-[#7C3AED]","from-[#7C3AED] to-[#EC4899]","from-[#F59E0B] to-[#EF4444]","from-[#3B82F6] to-[#00D4AA]","from-[#14B8A6] to-[#3B82F6]"];
                  const grad = gradients[(c.name?.charCodeAt(0) ?? 0) % gradients.length];
                  return (
                    <div key={c.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[#12122A] transition-colors duration-150">
                      <div className={cn("h-8 w-8 rounded-full bg-gradient-to-br flex items-center justify-center text-[11px] font-bold text-white shrink-0", grad)}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{c.name}</p>
                        {c.company && <p className="text-[11px] text-[#64748B] truncate">{c.company}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.monthly_revenue != null && (
                          <span className="font-mono text-xs text-[#00D4AA]">${Number(c.monthly_revenue).toLocaleString()}</span>
                        )}
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium",
                          c.status === "active"   ? "bg-[#10B981]/10 text-[#10B981]" :
                          c.status === "prospect" ? "bg-[#3B82F6]/10 text-[#3B82F6]" :
                          c.status === "inactive" ? "bg-[#F59E0B]/10 text-[#F59E0B]" :
                                                    "bg-[#EF4444]/10 text-[#EF4444]"
                        )}>
                          {c.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="rounded-xl border border-[#1A1A35] bg-[#0D0D1F] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-[#64748B]" />
              <p className="text-sm font-semibold text-white">Actividad reciente</p>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-9" />)}
              </div>
            ) : lastActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Clock className="h-8 w-8 text-[#334155] mb-2" />
                <p className="text-sm text-[#334155]">Sin actividad todavía</p>
              </div>
            ) : (
              <div className="space-y-0.5 max-h-72 overflow-y-auto">
                {lastActivities.map((a, i) => (
                  <div key={a.id ?? i} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-[#12122A] transition-colors">
                    <div className={cn("h-2 w-2 rounded-full shrink-0 mt-1.5",
                      a.action?.includes("crear") || a.action?.includes("nuevo") ? "bg-[#00D4AA]" :
                      a.action?.includes("conectar") ? "bg-[#7C3AED]" :
                      a.action?.includes("actualizar") || a.action?.includes("editar") ? "bg-[#F59E0B]" :
                      a.action?.includes("eliminar") ? "bg-[#EF4444]" : "bg-[#64748B]"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#F1F5F9] leading-tight">{a.action}</p>
                      {a.details && <p className="text-[11px] text-[#64748B] truncate mt-0.5">{a.details}</p>}
                    </div>
                    <p className="font-mono text-[10px] text-[#334155] shrink-0 mt-0.5">
                      {new Date(a.created_at).toLocaleDateString("es", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* XENTTECH AI */}
        <div className="rounded-xl border border-[#00D4AA]/20 bg-[#0D0D1F] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#00D4AA]/10">
              <Sparkles className="h-4 w-4 text-[#00D4AA]" />
            </div>
            <p className="font-semibold text-white text-sm">XENTTECH AI</p>
            <span className="text-[11px] text-[#64748B]">Estratega de marketing digital</span>
          </div>

          {aiResult && (
            <div className="rounded-xl bg-[#080812] border border-[#1A1A35] p-4 max-h-56 overflow-y-auto">
              <p className="text-sm text-[#94A3B8] whitespace-pre-wrap leading-relaxed">{aiResult}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAI(); } }}
              placeholder="Pregunta algo a XENTTECH AI… (Ej: ¿Cómo aumentar el MRR?)"
              rows={2}
              className="flex-1 bg-[#080812] border-[#1A1A35] text-[#F1F5F9] placeholder:text-[#334155] resize-none text-sm focus:border-[#00D4AA]/40"
            />
            <Button onClick={askAI} disabled={aiLoading || !aiPrompt.trim()}
              className="self-end bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 font-semibold px-5 btn-press">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-[#334155]">Enter para enviar · Shift+Enter para nueva línea</p>
        </div>
      </div>
    </div>
  );
}
