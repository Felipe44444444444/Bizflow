"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import {
  Bot, Plus, Settings, Zap, Loader2,
  Globe, Hash, Share2, Radio,
} from "lucide-react";

const AGENT_COLORS = [
  "#00F5FF", "#7B2FFF", "#FF2F7B", "#00FF88", "#FFB800",
  "#FF3860", "#00B4D8", "#F72585", "#4CC9F0", "#7209B7",
];

const TONE_OPTIONS = [
  { value: "professional", label: "Profesional 🎩", desc: "Formal y corporativo" },
  { value: "friendly",     label: "Amigable 😊",    desc: "Cálido y cercano" },
  { value: "technical",    label: "Técnico 💻",     desc: "Preciso y detallado" },
  { value: "casual",       label: "Casual 🤙",      desc: "Relajado y natural" },
];

const CHANNEL_ICONS = [
  { icon: Globe,  label: "Web",   color: "text-neon-cyan"   },
  { icon: Hash,   label: "Slack", color: "text-purple-400"  },
  { icon: Share2, label: "Meta",  color: "text-blue-400"    },
  { icon: Radio,  label: "WA",    color: "text-neon-green"  },
];

function AgentCard({ agent, onClick }: { agent: any; onClick: () => void }) {
  const color   = agent.color ?? AGENT_COLORS[0];
  const initial = (agent.name ?? "A")[0].toUpperCase();

  return (
    <div
      onClick={onClick}
      className="relative flex flex-col rounded-xl border border-neon-cyan/[0.08] bg-space-card p-5 cursor-pointer card-hover group overflow-hidden"
    >
      {/* Corner glow */}
      <div
        className="absolute -top-8 -right-8 h-20 w-20 rounded-full opacity-15 blur-2xl pointer-events-none transition-opacity group-hover:opacity-30"
        style={{ background: color }}
      />

      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl font-display font-bold text-lg text-white shrink-0"
          style={{
            background: `linear-gradient(135deg, ${color}30, ${color}10)`,
            border: `1px solid ${color}30`,
            boxShadow: `0 0 16px ${color}20`,
          }}
        >
          {initial}
        </div>

        <span
          className={`flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
            agent.is_active
              ? "text-neon-green bg-neon-green/10 border-neon-green/20"
              : "text-[#4A5568] bg-white/5 border-white/10"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${agent.is_active ? "bg-neon-green animate-pulse" : "bg-[#4A5568]"}`} />
          {agent.is_active ? "Activo" : "Inactivo"}
        </span>
      </div>

      {/* Info */}
      <h3 className="font-display font-semibold text-white text-base mb-0.5 group-hover:text-neon-cyan transition-colors">
        {agent.name}
      </h3>
      <p className="text-[11px] text-[#4A5568] capitalize mb-3">{agent.tone ?? "profesional"} · {agent.language?.toUpperCase() ?? "ES"}</p>

      {agent.description && (
        <p className="text-xs text-[#A0AEC0] line-clamp-2 mb-4 flex-1">{agent.description}</p>
      )}

      {/* Channel icons */}
      <div className="flex items-center gap-1.5 mb-4">
        {CHANNEL_ICONS.map(({ icon: Icon, label, color: c }) => (
          <div
            key={label}
            title={label}
            className="flex h-6 w-6 items-center justify-center rounded-md bg-space-el border border-white/5 opacity-40 hover:opacity-100 transition-opacity"
          >
            <Icon className={`h-3 w-3 ${c}`} />
          </div>
        ))}
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-space-el border border-white/5 opacity-40 hover:opacity-100 transition-opacity">
          <Zap className="h-3 w-3 text-neon-yellow" />
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 pt-3 border-t border-neon-cyan/[0.06]">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 text-xs text-[#A0AEC0] hover:text-neon-cyan hover:bg-neon-cyan/5 gap-1.5"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        >
          <Settings className="h-3 w-3" />
          Configurar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 text-xs text-[#A0AEC0] hover:text-neon-purple hover:bg-neon-purple/5 gap-1.5"
          onClick={(e) => e.stopPropagation()}
          asChild
        >
          <a href={`/agents/${agent.id}/channels`} onClick={(e) => e.stopPropagation()}>
            <Globe className="h-3 w-3" />
            Canales
          </a>
        </Button>
      </div>
    </div>
  );
}

function AgentsInner() {
  const [agents,  setAgents]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [orgId,   setOrgId]   = useState("");
  const [step,    setStep]    = useState(1);
  const [form,    setForm]    = useState({
    name: "", description: "", language: "es", tone: "professional", system_prompt: "", color: AGENT_COLORS[0],
  });
  const [error, setError] = useState("");
  const router      = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();

  useEffect(() => {
    if (searchParams.get("new") === "1") { setOpen(true); setStep(1); }
  }, [searchParams]);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000);
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data: m } = await supabase
          .from("organization_members").select("organization_id")
          .eq("user_id", session.user.id).limit(1).single();
        if (!m) return;
        setOrgId(m.organization_id);
        const data = await api.get("/api/agents", m.organization_id);
        setAgents(data || []);
      } catch { setAgents([]); }
      finally { clearTimeout(timeout); setLoading(false); }
    }
    load();
    return () => clearTimeout(timeout);
  }, []);

  async function createAgent() {
    setSaving(true);
    setError("");
    try {
      const agent = await api.post("/api/agents", form, orgId);
      setAgents((p) => [agent, ...p]);
      setOpen(false);
      setForm({ name: "", description: "", language: "es", tone: "professional", system_prompt: "", color: AGENT_COLORS[0] });
      setStep(1);
      router.push(`/agents/${agent.id}?tab=cerebro`);
    } catch (e: any) {
      setError(e.message ?? "Error al crear el agente");
    } finally { setSaving(false); }
  }

  function openCreate() { setOpen(true); setStep(1); setError(""); }
  function closeModal() { setOpen(false); setError(""); setStep(1); }

  return (
    <div className="min-h-full">
      <Header
        title="Agentes IA"
        description={`${agents.length} agente${agents.length !== 1 ? "s" : ""} configurado${agents.length !== 1 ? "s" : ""}`}
        action={
          <Button onClick={openCreate} size="sm" className="bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan/50 gap-1.5 font-semibold">
            <Plus className="h-3.5 w-3.5" />
            Nuevo agente
          </Button>
        }
      />

      <div className="p-6">
        {loading ? (
          /* Skeleton */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1,2,3].map((i) => (
              <div key={i} className="h-52 rounded-xl border border-neon-cyan/[0.06] bg-space-card overflow-hidden">
                <div className="h-full shimmer" />
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 gap-4 animate-fade-in">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-neon-cyan/10 border border-neon-cyan/20 animate-float">
                <Bot className="h-10 w-10 text-neon-cyan" />
              </div>
              <div className="absolute inset-0 rounded-2xl glow-cyan opacity-30" />
            </div>
            <h3 className="font-display text-xl font-bold text-white">Sin agentes todavía</h3>
            <p className="text-[#A0AEC0] text-sm text-center max-w-xs">
              Crea tu primer agente IA para empezar a atender clientes automáticamente en todos tus canales.
            </p>
            <Button onClick={openCreate} className="bg-gradient-cyan-purple text-white font-semibold px-6 mt-2 glow-cyan">
              <Plus className="h-4 w-4 mr-2" />
              Crear primer agente
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={() => router.push(`/agents/${agent.id}`)}
              />
            ))}
            {/* Add card */}
            <button
              onClick={openCreate}
              className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neon-cyan/20 bg-transparent hover:bg-neon-cyan/[0.03] hover:border-neon-cyan/40 transition-all duration-200 p-5 min-h-[200px] gap-3 group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-neon-cyan/20 bg-neon-cyan/5 group-hover:bg-neon-cyan/10 transition-colors">
                <Plus className="h-5 w-5 text-neon-cyan/50 group-hover:text-neon-cyan transition-colors" />
              </div>
              <span className="text-sm text-[#4A5568] group-hover:text-neon-cyan transition-colors font-medium">
                Nuevo agente
              </span>
            </button>
          </div>
        )}
      </div>

      {/* ── Create Agent Modal ─── */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeModal(); }}>
        <DialogContent className="max-w-lg bg-space-card border-neon-cyan/15">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neon-cyan/10 border border-neon-cyan/20">
                <Bot className="h-4 w-4 text-neon-cyan" />
              </div>
              <DialogTitle className="font-display text-white">Nuevo agente</DialogTitle>
            </div>
            {/* Step dots */}
            <div className="flex gap-1.5 mt-3">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                    step >= s ? "bg-neon-cyan" : "bg-space-el"
                  }`}
                />
              ))}
            </div>
          </DialogHeader>

          {/* Step 1: Identity */}
          {step === 1 && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-neon-cyan font-semibold uppercase tracking-widest">Paso 1 — Identidad</p>
              <div className="space-y-2">
                <Label className="text-xs text-[#A0AEC0]">Nombre del agente *</Label>
                <Input
                  placeholder="Ej: Soporte Técnico"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="bg-space-el border-neon-cyan/15 focus:border-neon-cyan/40 text-white"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-[#A0AEC0]">Descripción</Label>
                <Input
                  placeholder="Ej: Atiende consultas de soporte técnico"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="bg-space-el border-neon-cyan/15 focus:border-neon-cyan/40 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-[#A0AEC0]">Color del agente</Label>
                <div className="flex gap-2 flex-wrap">
                  {AGENT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={`h-7 w-7 rounded-full transition-all ${form.color === c ? "scale-125 ring-2 ring-white/40" : "hover:scale-110"}`}
                      style={{ background: c, boxShadow: form.color === c ? `0 0 12px ${c}60` : undefined }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Personality */}
          {step === 2 && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-neon-cyan font-semibold uppercase tracking-widest">Paso 2 — Personalidad</p>
              <div className="space-y-2">
                <Label className="text-xs text-[#A0AEC0]">Tono de comunicación</Label>
                <div className="grid grid-cols-2 gap-2">
                  {TONE_OPTIONS.map(({ value, label, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, tone: value })}
                      className={`text-left p-3 rounded-lg border transition-all duration-200 ${
                        form.tone === value
                          ? "border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan"
                          : "border-neon-cyan/10 bg-space-el text-[#A0AEC0] hover:border-neon-cyan/20"
                      }`}
                    >
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-[10px] opacity-60 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-[#A0AEC0]">Idioma</Label>
                <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                  <SelectTrigger className="bg-space-el border-neon-cyan/15 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="pt">Português</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 3: System prompt */}
          {step === 3 && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-neon-cyan font-semibold uppercase tracking-widest">Paso 3 — Instrucciones</p>
              <div className="space-y-2">
                <Label className="text-xs text-[#A0AEC0]">System Prompt (opcional — puedes editarlo después)</Label>
                <Textarea
                  className="min-h-[120px] font-mono text-xs bg-space-el border-neon-cyan/15 focus:border-neon-cyan/40 text-white"
                  placeholder="Eres un asistente de soporte para [Empresa]. Tu objetivo es ayudar a los clientes con sus dudas sobre [producto]. Sé conciso, amable y preciso."
                  value={form.system_prompt}
                  onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                />
                <p className="text-[11px] text-[#4A5568]">{form.system_prompt.length} / 2000 caracteres</p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-neon-red bg-neon-red/10 border border-neon-red/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <DialogFooter className="gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} className="border-neon-cyan/15 text-[#A0AEC0]">
                ← Atrás
              </Button>
            )}
            <Button
              onClick={() => step < 3 ? setStep(step + 1) : createAgent()}
              disabled={step === 1 && !form.name.trim() || saving}
              className="bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 font-semibold"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {step < 3 ? "Siguiente →" : "Crear agente 🚀"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AgentsPage() {
  return <Suspense><AgentsInner /></Suspense>;
}
