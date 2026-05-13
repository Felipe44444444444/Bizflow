"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart3, Briefcase, Megaphone, Palette, TrendingUp, UserCheck,
  DollarSign, Sparkles, Loader2, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Stats {
  clients: number;
  activeClients: number;
  campaigns: number;
  activeCampaigns: number;
  designs: number;
  pendingDesigns: number;
  strategies: number;
  onboardingSteps: number;
  completedSteps: number;
  mrr: number;
}

export default function AgencyDashboardPage() {
  const [stats, setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [clients, campaigns, designs, strategies, onboarding] = await Promise.all([
        api.get("/api/agency/clients"),
        api.get("/api/agency/campaigns"),
        api.get("/api/agency/designs"),
        api.get("/api/agency/strategies"),
        api.get("/api/agency/onboarding"),
      ]);

      setStats({
        clients:        (clients ?? []).length,
        activeClients:  (clients ?? []).filter((c: any) => c.status === "active").length,
        campaigns:      (campaigns ?? []).length,
        activeCampaigns:(campaigns ?? []).filter((c: any) => c.status === "active").length,
        designs:        (designs ?? []).length,
        pendingDesigns: (designs ?? []).filter((d: any) => d.status === "pending").length,
        strategies:     (strategies ?? []).length,
        onboardingSteps:(onboarding ?? []).length,
        completedSteps: (onboarding ?? []).filter((d: any) => d.status === "completed").length,
        mrr:            (clients ?? []).reduce((s: number, c: any) => s + (Number(c.monthly_revenue) || 0), 0),
      });
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
- MRR total: $${stats.mrr.toLocaleString()}
- Diseños pendientes: ${stats.pendingDesigns}
- Estrategias: ${stats.strategies}
- Onboarding: ${stats.completedSteps}/${stats.onboardingSteps} pasos completados
` : "";
      const { result } = await api.post("/api/agency/generate", {
        prompt: aiPrompt,
        context,
      });
      setAiResult(result);
    } finally { setAiLoading(false); }
  }

  const modules = [
    { href: "/agency/clients",    label: "Clientes",   icon: Briefcase,  value: stats?.clients ?? 0,        sub: `${stats?.activeClients ?? 0} activos`,          color: "#00FF88" },
    { href: "/agency/onboarding", label: "Onboarding", icon: UserCheck,  value: stats?.completedSteps ?? 0, sub: `de ${stats?.onboardingSteps ?? 0} pasos`,        color: "#3B82F6" },
    { href: "/agency/ads",        label: "Anuncios",   icon: Megaphone,  value: stats?.campaigns ?? 0,      sub: `${stats?.activeCampaigns ?? 0} activas`,         color: "#F59E0B" },
    { href: "/agency/design",     label: "Diseño",     icon: Palette,    value: stats?.designs ?? 0,        sub: `${stats?.pendingDesigns ?? 0} pendientes`,       color: "#8B5CF6" },
    { href: "/agency/strategy",   label: "Estrategia", icon: TrendingUp, value: stats?.strategies ?? 0,     sub: "estrategias",                                    color: "#EC4899" },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title="Agency Dashboard" description="XENTTECH — Vista general de la agencia" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* MRR hero */}
        <div className="rounded-2xl border border-[#00FF88]/20 bg-gradient-to-br from-[#00FF88]/[0.06] to-transparent p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-[#00FF88]/10 border border-[#00FF88]/20">
              <DollarSign className="h-7 w-7 text-[#00FF88]" />
            </div>
            <div>
              <p className="text-sm text-[#A0AEC0]">MRR Total</p>
              {loading ? (
                <div className="h-9 w-32 rounded-lg bg-white/[0.06] animate-pulse mt-1" />
              ) : (
                <p className="text-4xl font-bold text-[#00FF88]">${(stats?.mrr ?? 0).toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>

        {/* Module cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map(({ href, label, icon: Icon, value, sub, color }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl bg-space-card border border-white/[0.06] p-5 hover:border-white/[0.12] transition-all duration-200 hover:-translate-y-0.5"
            >
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

        {/* Onboarding progress */}
        {stats && stats.onboardingSteps > 0 && (
          <div className="rounded-xl bg-space-card border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-white">Progreso de onboarding</p>
              <p className="text-sm font-bold text-[#00FF88]">
                {stats.completedSteps}/{stats.onboardingSteps}
              </p>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#00FF88] transition-all duration-700"
                style={{ width: `${(stats.completedSteps / stats.onboardingSteps) * 100}%` }}
              />
            </div>
          </div>
        )}

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
            <div className="rounded-xl bg-black/20 border border-white/[0.04] p-4">
              <p className="text-sm text-[#A0AEC0] whitespace-pre-wrap leading-relaxed">{aiResult}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAI(); } }}
              placeholder="Pregunta algo a XENTTECH AI... (Ej: ¿Cómo puedo aumentar el MRR? ¿Qué estrategia recomiendas para el cliente X?)"
              rows={2}
              className="flex-1 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568] resize-none text-sm"
            />
            <Button
              onClick={askAI}
              disabled={aiLoading || !aiPrompt.trim()}
              className="self-end bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold px-5"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-[#4A5568]">Enter para enviar · Shift+Enter para nueva línea</p>
        </div>
      </div>
    </div>
  );
}
