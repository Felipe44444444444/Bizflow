"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase, Megaphone, Palette, TrendingUp, UserCheck,
  DollarSign, Sparkles, Loader2, ArrowRight, BookOpen,
  Clock, AlertCircle, RefreshCw,
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
    { href: "/agency/clients",      label: "Clientes",   icon: Briefcase,  value: stats?.clients ?? 0,          sub: `${stats?.activeClients ?? 0} activos`,    color: "#00FF88" },
    { href: "/agency/onboarding",   label: "Onboarding", icon: UserCheck,  value: pipeline.filter(s => s.count > 0).length, sub: `pasos con actividad`, color: "#3B82F6" },
    { href: "/agency/ads",          label: "Anuncios",   icon: Megaphone,  value: stats?.campaigns ?? 0,        sub: `${stats?.activeCampaigns ?? 0} activas`,  color: "#F59E0B" },
    { href: "/agency/design",       label: "Diseño",     icon: Palette,    value: stats?.designs ?? 0,          sub: `${stats?.pendingDesigns ?? 0} pendientes`, color: "#8B5CF6" },
    { href: "/agency/brand-manual", label: "Manuales",   icon: BookOpen,   value: stats?.manuales ?? 0,         sub: "manuales de marca",                        color: "#EC4899" },
    { href: "/agency/strategy",     label: "Estrategia", icon: TrendingUp, value: stats?.strategies ?? 0,       sub: "estrategias",                              color: "#14B8A6" },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title="Agency Dashboard" description="XENTTECH — Vista general de la agencia" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-300 flex-1">{error}</p>
            <button onClick={load} className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs">
              <RefreshCw className="h-3 w-3" /> Reintentar
            </button>
          </div>
        )}

        {/* MRR hero */}
        <div className="rounded-2xl border border-[#00FF88]/20 bg-gradient-to-br from-[#00FF88]/[0.06] to-transparent p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-[#00FF88]/10 border border-[#00FF88]/20">
              <DollarSign className="h-7 w-7 text-[#00FF88]" />
            </div>
            <div>
              <p className="text-sm text-[#A0AEC0]">MRR — clientes activos</p>
              {loading ? (
                <div className="h-9 w-32 rounded-lg bg-white/[0.06] animate-pulse mt-1" />
              ) : (
                <p className="text-4xl font-bold text-[#00FF88]">${(stats?.mrr ?? 0).toLocaleString()}</p>
              )}
              {!loading && stats && (
                <p className="text-xs text-[#4A5568] mt-1">{stats.activeClients} de {stats.clients} clientes activos</p>
              )}
            </div>
          </div>
        </div>

        {/* Module cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map(({ href, label, icon: Icon, value, sub, color }) => (
            <Link key={href} href={href}
              className="group rounded-xl bg-space-card border border-white/[0.06] p-5 hover:border-white/[0.12] transition-all duration-200 hover:-translate-y-0.5">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2 rounded-lg bg-white/[0.04]" style={{ color }}>
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-[#4A5568] group-hover:text-white transition-colors" />
              </div>
              {loading ? (
                <div className="h-8 w-16 rounded bg-white/[0.06] animate-pulse mb-1" />
              ) : (
                <p className="text-2xl font-bold text-white">{value}</p>
              )}
              <p className="text-xs text-[#4A5568] mt-0.5">{label} · {sub}</p>
            </Link>
          ))}
        </div>

        {/* Onboarding pipeline per step */}
        {pipeline.length > 0 && (
          <div className="rounded-xl bg-space-card border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-white">Pipeline de Onboarding por paso</p>
              <Link href="/agency/onboarding" className="text-xs text-[#4A5568] hover:text-[#00FF88] transition-colors">
                Ver detalle →
              </Link>
            </div>
            {loading ? (
              <div className="h-16 rounded-lg bg-white/[0.04] animate-pulse" />
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {pipeline.map(step => (
                  <div key={step.number} className={cn(
                    "rounded-lg p-2 text-center transition-all",
                    step.count > 0
                      ? "bg-[#00FF88]/10 border border-[#00FF88]/20"
                      : "bg-white/[0.02] border border-white/[0.04]"
                  )}>
                    <p className="text-base mb-1">{step.icon}</p>
                    <p className={cn("text-lg font-bold", step.count > 0 ? "text-[#00FF88]" : "text-[#4A5568]")}>
                      {step.count}
                    </p>
                    <p className="text-[9px] text-[#4A5568] leading-tight truncate">{step.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Last clients + Last activities */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Last 5 clients */}
          <div className="rounded-xl bg-space-card border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-white">Últimos clientes</p>
              <Link href="/agency/clients" className="text-xs text-[#4A5568] hover:text-[#00FF88] transition-colors">
                Ver todos →
              </Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-white/[0.04] animate-pulse" />)}
              </div>
            ) : lastClients.length === 0 ? (
              <p className="text-xs text-[#4A5568] py-4 text-center">Sin clientes todavía</p>
            ) : (
              <div className="space-y-2">
                {lastClients.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{c.name}</p>
                      {c.company && <p className="text-xs text-[#4A5568] truncate">{c.company}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {c.monthly_revenue && (
                        <span className="text-xs text-[#00FF88] font-medium">${Number(c.monthly_revenue).toLocaleString()}</span>
                      )}
                      <Badge className={cn("text-[10px] border", STATUS_COLOR[c.status] ?? STATUS_COLOR.prospect)}>
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Last 10 activities */}
          <div className="rounded-xl bg-space-card border border-white/[0.06] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-[#4A5568]" />
              <p className="text-sm font-semibold text-white">Actividad reciente</p>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <div key={i} className="h-8 rounded-lg bg-white/[0.04] animate-pulse" />)}
              </div>
            ) : lastActivities.length === 0 ? (
              <p className="text-xs text-[#4A5568] py-4 text-center">Sin actividad todavía</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {lastActivities.map((a, i) => (
                  <div key={a.id ?? i} className="flex items-start gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#00FF88] shrink-0 mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white">{a.action}</p>
                      {a.details && <p className="text-[11px] text-[#4A5568] truncate">{a.details}</p>}
                    </div>
                    <p className="text-[10px] text-[#4A5568] shrink-0">
                      {new Date(a.created_at).toLocaleDateString("es", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* XENTTECH AI Chat */}
        <div className="rounded-xl bg-space-card border border-[#00FF88]/20 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#00FF88]/10">
              <Sparkles className="h-4 w-4 text-[#00FF88]" />
            </div>
            <p className="font-semibold text-white">XENTTECH AI</p>
            <span className="text-xs text-[#4A5568]">Estratega de marketing digital</span>
          </div>

          {aiResult && (
            <div className="rounded-xl bg-black/20 border border-white/[0.04] p-4 max-h-64 overflow-y-auto">
              <p className="text-sm text-[#A0AEC0] whitespace-pre-wrap leading-relaxed">{aiResult}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAI(); } }}
              placeholder="Pregunta algo a XENTTECH AI... (Ej: ¿Cómo puedo aumentar el MRR?)"
              rows={2}
              className="flex-1 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568] resize-none text-sm"
            />
            <Button onClick={askAI} disabled={aiLoading || !aiPrompt.trim()}
              className="self-end bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold px-5">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-[#4A5568]">Enter para enviar · Shift+Enter para nueva línea</p>
        </div>
      </div>
    </div>
  );
}
