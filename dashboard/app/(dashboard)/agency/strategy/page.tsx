"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { TrendingUp, Plus, Pencil, Trash2, Loader2, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Client { id: string; name: string; company: string | null; industry: string | null; }
interface Strategy {
  id: string; client_id: string; title: string; content: string | null;
  foda: any; kpis: any; calendar: any; status: string; created_at: string;
  clients?: { name: string; company: string | null };
}

const STATUS_COLOR: Record<string, string> = {
  draft:    "bg-gray-500/10 text-gray-400 border-gray-500/20",
  active:   "bg-green-500/10 text-green-400 border-green-500/20",
  approved: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  archived: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

export default function StrategyPage() {
  const [clients, setClients]     = useState<Client[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading]     = useState(true);
  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState<Strategy | null>(null);
  const [form, setForm]           = useState({ client_id: "", title: "", content: "", status: "draft" });
  const [saving, setSaving]       = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded]   = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [genPrompt, setGenPrompt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        api.get("/api/agency/clients"),
        api.get("/api/agency/strategies"),
      ]);
      setClients(c ?? []);
      setStrategies(s ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing(null);
    setForm({ client_id: clients[0]?.id ?? "", title: "", content: "", status: "draft" });
    setGenPrompt("");
    setOpen(true);
  }
  function openEdit(s: Strategy) {
    setEditing(s);
    setForm({ client_id: s.client_id, title: s.title, content: s.content ?? "", status: s.status });
    setGenPrompt("");
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (editing) await api.put(`/api/agency/strategies/${editing.id}`, form);
      else await api.post("/api/agency/strategies", form);
      setOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      await api.del(`/api/agency/strategies/${id}`);
      setStrategies(prev => prev.filter(s => s.id !== id));
    } finally { setDeleting(null); }
  }

  async function generateStrategy() {
    const client = clients.find(c => c.id === form.client_id);
    if (!client) return;
    setGenerating(true);
    try {
      const context = `Cliente: ${client.name}${client.company ? ` (${client.company})` : ""}. Industria: ${client.industry ?? "no especificada"}.`;
      const { result } = await api.post("/api/agency/generate", {
        prompt: `Crea una estrategia de marketing digital completa y detallada para:
${context}
${genPrompt ? `\nRequisitos adicionales: ${genPrompt}` : ""}

La estrategia debe incluir:
1. ANÁLISIS FODA (Fortalezas, Oportunidades, Debilidades, Amenazas)
2. Objetivos SMART a 90 días
3. Estrategia de contenidos (pilares, frecuencia, formatos)
4. Estrategia de paid media (plataformas, budget sugerido, audiencias)
5. KPIs y métricas de seguimiento
6. Calendario editorial mes 1 (por semana)
7. Acciones prioritarias semana 1

Sé específico, con números y ejemplos concretos.`,
        context,
      });
      setForm(f => ({ ...f, content: result }));
    } finally { setGenerating(false); }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Estrategia" description="Estrategias de marketing con IA" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex justify-end">
          <Button onClick={openNew} className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold gap-2">
            <Plus className="h-4 w-4" /> Nueva estrategia
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#00FF88]" />
          </div>
        ) : strategies.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <TrendingUp className="h-10 w-10 text-[#4A5568] mx-auto" />
            <p className="text-[#4A5568]">No hay estrategias todavía.</p>
            <p className="text-xs text-[#4A5568]">Crea una estrategia completa con IA en segundos.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {strategies.map(s => {
              const isOpen = expanded[s.id];
              return (
                <div key={s.id} className="rounded-xl border border-white/[0.06] overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 bg-space-card">
                    <button
                      onClick={() => setExpanded(e => ({ ...e, [s.id]: !isOpen }))}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 text-[#4A5568]" /> : <ChevronRight className="h-4 w-4 text-[#4A5568]" />}
                      <div>
                        <p className="font-semibold text-white">{s.title}</p>
                        <p className="text-xs text-[#4A5568]">
                          {s.clients?.name}{s.clients?.company ? ` · ${s.clients.company}` : ""}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={cn("text-[10px] border", STATUS_COLOR[s.status] ?? STATUS_COLOR.draft)}>
                        {s.status}
                      </Badge>
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#4A5568] hover:text-white transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(s.id)} disabled={deleting === s.id} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#4A5568] hover:text-red-400 transition-colors">
                        {deleting === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  {isOpen && s.content && (
                    <div className="px-5 py-4 bg-black/10 border-t border-white/[0.04]">
                      <div className="prose prose-invert prose-sm max-w-none">
                        <pre className="whitespace-pre-wrap text-xs text-[#A0AEC0] font-sans leading-relaxed">{s.content}</pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-space-card border-white/[0.08] text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#00FF88]">{editing ? "Editar estrategia" : "Nueva estrategia"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Cliente</label>
                <Select value={form.client_id} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent className="bg-space-card border-white/[0.08]">
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-white hover:bg-white/[0.06]">
                        {c.name}{c.company ? ` — ${c.company}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Estado</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-space-card border-white/[0.08]">
                    {["draft","active","approved","archived"].map(s => (
                      <SelectItem key={s} value={s} className="text-white hover:bg-white/[0.06]">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-[#4A5568] mb-1 block">Título</label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ej: Estrategia Q2 2025 — Meta + Google"
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568]"
                />
              </div>
            </div>

            {/* AI Generator */}
            <div className="border border-[#00FF88]/20 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-[#00FF88] flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Generador de estrategia IA
              </p>
              <Input
                value={genPrompt}
                onChange={e => setGenPrompt(e.target.value)}
                placeholder="Contexto adicional (opcional): presupuesto, canales preferidos, metas..."
                className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568] text-sm"
              />
              <Button
                onClick={generateStrategy}
                disabled={generating || !form.client_id || !form.title}
                className="w-full bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20 hover:bg-[#00FF88]/20 font-semibold gap-2"
                variant="outline"
              >
                {generating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generando estrategia completa...</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Generar estrategia con XENTTECH AI</>
                )}
              </Button>
            </div>

            <div>
              <label className="text-xs text-[#4A5568] mb-1 block">Contenido de la estrategia</label>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={12}
                className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568] resize-none text-xs font-mono"
                placeholder="La estrategia aparecerá aquí después de generar con IA, o escribe manualmente..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-[#4A5568]">Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.client_id || !form.title} className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
