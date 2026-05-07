"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, RotateCcw, ChevronDown, ChevronUp, Zap, TrendingUp, MessageSquare, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_STEPS = [
  { step: 0, label: "Inmediato — al primer contacto", delayField: "step_0_delay_minutes", delayLabel: "minutos", delayDefault: 5, defaultMsg: "¡Hola {nombre}! 👋 Gracias por contactarnos. Soy {bot_name} de {empresa}. ¿En qué puedo ayudarte hoy?" },
  { step: 1, label: "Seguimiento — 1 día después",    delayField: "step_1_delay_hours",   delayLabel: "horas",   delayDefault: 24, defaultMsg: "Hola {nombre}, ¿pudiste resolver tu consulta? Estoy aquí si necesitas más ayuda 😊" },
  { step: 2, label: "Recordatorio — 3 días después",  delayField: "step_2_delay_hours",   delayLabel: "horas",   delayDefault: 72, defaultMsg: "Hey {nombre} 👋 Quería recordarte que en {empresa} seguimos disponibles para ayudarte." },
  { step: 3, label: "Reactivación — 1 semana",        delayField: "step_3_delay_hours",   delayLabel: "horas",   delayDefault: 168, defaultMsg: "¡Hola {nombre}! Ha pasado una semana. ¿Podemos ayudarte con algo? En {empresa} tenemos novedades 🚀" },
  { step: 4, label: "Última oportunidad — 2 semanas", delayField: "step_4_delay_hours",   delayLabel: "horas",   delayDefault: 336, defaultMsg: "Hola {nombre}, este es nuestro último mensaje de seguimiento. Si alguna vez necesitas ayuda, aquí estaremos en {empresa} 💙" },
];

const VARS = ["{nombre}", "{empresa}", "{bot_name}"];

export default function RetargetingPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [orgId, setOrgId]     = useState("");
  const [agent, setAgent]     = useState<any>(null);
  const [config, setConfig]   = useState<any>({});
  const [stats, setStats]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [expanded, setExpanded] = useState<number | null>(0);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: m } = await supabase.from("organization_members")
        .select("organization_id").eq("user_id", session.user.id).limit(1).single();
      if (!m) return;
      setOrgId(m.organization_id);

      const [agentData, configData, statsData] = await Promise.all([
        api.get(`/api/agents/${id}`, m.organization_id).catch(() => null),
        api.get(`/api/retargeting/config/${id}`, m.organization_id).catch(() => ({})),
        api.get(`/api/retargeting/stats/${id}`, m.organization_id).catch(() => null),
      ]);

      setAgent(agentData);
      // Initialize config with defaults for empty fields
      const cfg = configData || {};
      DEFAULT_STEPS.forEach(s => {
        if (cfg[`step_${s.step}_message`] === undefined) cfg[`step_${s.step}_message`] = s.defaultMsg;
        if (cfg[s.delayField] === undefined) cfg[s.delayField] = s.delayDefault;
        if (cfg[`step_${s.step}_enabled`] === undefined) cfg[`step_${s.step}_enabled`] = true;
      });
      setConfig(cfg);
      setStats(statsData);
      setLoading(false);
    }
    load();
  }, [id]);

  function updateConfig(key: string, value: any) {
    setConfig((prev: any) => ({ ...prev, [key]: value }));
  }

  async function saveConfig() {
    setSaving(true);
    try {
      await api.put(`/api/retargeting/config/${id}`, config, orgId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(step: number) {
    setTesting(step);
    try {
      await api.post(`/api/retargeting/test/${id}`, { step, phone: testPhone || undefined }, orgId);
    } finally {
      setTesting(null);
    }
  }

  function insertVar(step: number, variable: string) {
    const key = `step_${step}_message`;
    const current = config[key] || "";
    updateConfig(key, current + variable);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-neon-cyan" />
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Retargeting Automático"
        description={`Secuencias automáticas para convertir leads de ${agent?.name || "tu agente"}`}
      />

      <div className="p-6 space-y-6 max-w-3xl">

        {/* ── Global toggle ── */}
        <div className={cn(
          "rounded-xl border p-5 transition-all duration-300",
          config.is_enabled
            ? "border-neon-cyan/30 bg-neon-cyan/[0.04]"
            : "border-neon-cyan/[0.08] bg-space-card"
        )}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Estado del Retargeting</h2>
              <p className="text-sm text-[#4A5568] mt-0.5">
                Envía mensajes automáticos a leads que interactuaron con tu bot
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn("text-sm font-medium", config.is_enabled ? "text-neon-cyan" : "text-[#4A5568]")}>
                {config.is_enabled ? "Activo" : "Inactivo"}
              </span>
              <Switch
                checked={!!config.is_enabled}
                onCheckedChange={v => updateConfig("is_enabled", v)}
                className="data-[state=checked]:bg-neon-cyan"
              />
            </div>
          </div>

          {config.is_enabled && (
            <div className="mt-4 flex items-center gap-2 text-xs text-neon-cyan/70">
              <span className="h-1.5 w-1.5 rounded-full bg-neon-cyan animate-pulse" />
              Secuencias activas — se enviarán automáticamente según la configuración
            </div>
          )}
        </div>

        {/* ── Stats ── */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Mensajes enviados", value: stats.mensajes_enviados ?? 0, icon: Send, color: "text-neon-cyan" },
              { label: "Pendientes",        value: stats.pendientes ?? 0,        icon: RotateCcw, color: "text-neon-yellow" },
              { label: "Leads totales",     value: stats.leads_total ?? 0,       icon: Users, color: "text-neon-purple" },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-neon-cyan/[0.08] bg-space-card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={cn("h-3.5 w-3.5", s.color)} />
                  <p className="text-[10px] text-[#4A5568] uppercase tracking-wide">{s.label}</p>
                </div>
                <p className={cn("text-2xl font-bold font-display", s.color)}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Test phone (shared) ── */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-[#4A5568] mb-1.5 block">Teléfono para pruebas (WhatsApp)</label>
            <Input
              placeholder="+521234567890"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              className="bg-space-el border-neon-cyan/[0.08] text-white text-sm h-9"
            />
          </div>
          <p className="text-[10px] text-[#4A5568] mb-2.5 max-w-[200px]">
            Deja vacío para no enviar por WhatsApp
          </p>
        </div>

        {/* ── Steps ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white/80">Secuencia de mensajes</h3>

          {DEFAULT_STEPS.map((s) => {
            const isEnabled = config[`step_${s.step}_enabled`] !== false;
            const isExpanded = expanded === s.step;
            const message = config[`step_${s.step}_message`] || "";
            const delay = config[s.delayField] ?? s.delayDefault;

            return (
              <div
                key={s.step}
                className={cn(
                  "rounded-xl border transition-all duration-200",
                  isEnabled
                    ? "border-neon-cyan/[0.12] bg-space-card"
                    : "border-neon-cyan/[0.04] bg-space-el/50 opacity-60"
                )}
              >
                {/* Step header */}
                <button
                  className="w-full flex items-center gap-3 p-4 text-left"
                  onClick={() => setExpanded(isExpanded ? null : s.step)}
                >
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={v => { updateConfig(`step_${s.step}_enabled`, v); }}
                    className="data-[state=checked]:bg-neon-cyan shrink-0"
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-neon-cyan/60 uppercase tracking-widest">
                        PASO {s.step + 1}
                      </span>
                      <span className="text-sm font-medium text-white">{s.label}</span>
                    </div>
                    {!isExpanded && message && (
                      <p className="text-xs text-[#4A5568] truncate mt-0.5">{message.slice(0, 60)}…</p>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-[#4A5568] shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#4A5568] shrink-0" />
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-neon-cyan/[0.06] pt-4">
                    {/* Delay */}
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-[#A0AEC0] shrink-0">Enviar después de</label>
                      <Input
                        type="number"
                        min={0}
                        value={delay}
                        onChange={e => updateConfig(s.delayField, Number(e.target.value))}
                        className="w-20 bg-space-el border-neon-cyan/[0.08] text-white text-sm h-8 text-center"
                      />
                      <span className="text-xs text-[#4A5568]">{s.delayLabel}</span>
                    </div>

                    {/* Message textarea */}
                    <div className="space-y-2">
                      <label className="text-xs text-[#A0AEC0]">Mensaje</label>
                      <Textarea
                        value={message}
                        onChange={e => updateConfig(`step_${s.step}_message`, e.target.value)}
                        rows={4}
                        className="bg-space-el border-neon-cyan/[0.08] text-white text-sm resize-none"
                        placeholder="Escribe el mensaje..."
                      />
                    </div>

                    {/* Variables */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-[#4A5568] uppercase tracking-wide">Variables:</span>
                      {VARS.map(v => (
                        <button
                          key={v}
                          onClick={() => insertVar(s.step, v)}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/20 transition-colors font-mono"
                        >
                          {v}
                        </button>
                      ))}
                    </div>

                    {/* Test button */}
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-neon-purple/30 text-neon-purple hover:bg-neon-purple/10"
                        onClick={() => sendTest(s.step)}
                        disabled={testing === s.step}
                      >
                        {testing === s.step ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Send className="h-3 w-3 mr-1" />
                        )}
                        Enviar prueba
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Save button ── */}
        <div className="flex justify-end pt-2 pb-8">
          <Button
            onClick={saveConfig}
            disabled={saving}
            className={cn(
              "px-8 h-10 font-semibold transition-all",
              saved
                ? "bg-neon-green/20 border border-neon-green/40 text-neon-green"
                : "bg-gradient-to-r from-neon-cyan to-neon-purple text-white hover:opacity-90"
            )}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {saved ? "✓ Guardado" : "Guardar configuración"}
          </Button>
        </div>

      </div>
    </div>
  );
}
