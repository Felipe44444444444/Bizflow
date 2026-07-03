"use client";
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  TrendingUp, Plus, Pencil, Trash2, Loader2, Sparkles,
  ChevronDown, ChevronRight, AlertCircle, RefreshCw, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Client { id: string; name: string; company: string | null; industry: string | null; }
interface Strategy {
  id: string; client_id: string; title: string; content: string | null;
  foda: any; kpis: any; calendar: any; status: string; created_at: string;
  pdf_url?: string | null; clients?: { name: string; company: string | null };
}

const STATUS_COLOR: Record<string, string> = {
  draft:    "bg-gray-500/10 text-gray-400 border-gray-500/20",
  active:   "bg-green-500/10 text-green-400 border-green-500/20",
  approved: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  archived: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const supabase = createClient();

export default function StrategyPage() {
  const [clients, setClients]       = useState<Client[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading]       = useState(true);
  const [open, setOpen]             = useState(false);
  const [editing, setEditing]       = useState<Strategy | null>(null);
  const [form, setForm]             = useState({ client_id: "", title: "", content: "", status: "draft" });
  const [saving, setSaving]         = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [genPrompt, setGenPrompt]   = useState("");
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    let fromCache = false;
    try {
      const raw = sessionStorage.getItem('xenttech_strategy_data');
      if (raw) {
        const { d, ts } = JSON.parse(raw);
        if (Date.now() - ts < 5 * 60_000) {
          setClients(d.clients); setStrategies(d.strategies);
          setLoading(false); fromCache = true;
        }
      }
    } catch {}
    if (!fromCache) setLoading(true);
    try {
      const [clientsRes, strategiesRes] = await Promise.all([
        supabase.from("clients").select("id,name,company,industry").order("name"),
        supabase.from("strategies")
          .select("*, clients(name,company)")
          .not("title", "ilike", "Manual de Marca%")
          .order("created_at", { ascending: false }),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      if (strategiesRes.error) throw strategiesRes.error;
      setClients(clientsRes.data ?? []);
      setStrategies(strategiesRes.data ?? []);
      try { sessionStorage.setItem('xenttech_strategy_data', JSON.stringify({ d: { clients: clientsRes.data ?? [], strategies: strategiesRes.data ?? [] }, ts: Date.now() })); } catch {}
    } catch {
      setError("Error de conexión. Verifica tu red y reintenta.");
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
    setError(null);
    try {
      let savedId = editing?.id ?? null;
      if (editing) {
        const { error: err } = await supabase.from("strategies").update(form).eq("id", editing.id);
        if (err) throw err;
      } else {
        const { data: inserted, error: err } = await supabase.from("strategies").insert(form).select("id").single();
        if (err) throw err;
        savedId = inserted?.id ?? null;
      }
      await supabase.from("activity_log").insert({
        client_id: form.client_id,
        action: `Estrategia "${form.title}" ${editing ? "actualizada" : "creada"}`,
        details: form.status,
      });
      // Generate PDF if content exists (best-effort)
      if (savedId && form.content) {
        const client = clients.find(c => c.id === form.client_id);
        try {
          await fetch("/api/generate-pdf", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: form.content, title: form.title,
              client_name: client?.name ?? "", company: client?.company ?? "",
              step_name: form.title, client_id: form.client_id,
              document_type: "strategy", document_id: savedId,
            }),
          });
        } catch {}
      }
      setOpen(false);
      load();
    } catch (e: any) {
      setError(e.message ?? "Error al guardar");
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      const { error: err } = await supabase.from("strategies").delete().eq("id", id);
      if (err) throw err;
      setStrategies(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      setError(e.message ?? "Error al eliminar");
    } finally { setDeleting(null); }
  }

  async function generateStrategy() {
    const client = clients.find(c => c.id === form.client_id);
    if (!client) return;
    setGenerating(true);
    try {
      const context = `Cliente: ${client.name}${client.company ? ` (${client.company})` : ""}. Industria: ${client.industry ?? "no especificada"}.`;
      const prompt = `Crea una estrategia de marketing digital completa y detallada para:
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

Sé específico, con números y ejemplos concretos.`;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, context }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
      const { result } = await res.json();
      setForm(f => ({ ...f, content: result }));
    } catch (e: any) {
      setError(e.message ?? "Error al generar");
    } finally { setGenerating(false); }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Estrategia" description="Estrategias de marketing con IA" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex justify-end">
          <Button onClick={openNew} className="bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 font-semibold gap-2">
            <Plus className="h-4 w-4" /> Nueva estrategia
          </Button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => load()} className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0">
              <RefreshCw className="h-3.5 w-3.5" /> Reintentar
            </Button>
          </div>
        )}

        {loading ? (
          <PageSkeleton rows={3} cols={1} cardHeight={180} />
        ) : strategies.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <TrendingUp className="h-10 w-10 text-[#64748B] mx-auto" />
            <p className="text-[#64748B]">No hay estrategias todavía.</p>
            <p className="text-xs text-[#64748B]">Crea una estrategia completa con IA en segundos.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {strategies.map(s => {
              const isOpen = expanded[s.id];
              return (
                <div key={s.id} className="rounded-xl border border-[#1A1A35] overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 bg-[#0D0D1F]">
                    <button onClick={() => setExpanded(e => ({ ...e, [s.id]: !isOpen }))}
                      className="flex items-center gap-3 flex-1 text-left">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-[#64748B]" /> : <ChevronRight className="h-4 w-4 text-[#64748B]" />}
                      <div>
                        <p className="font-semibold text-white">{s.title}</p>
                        <p className="text-xs text-[#64748B]">
                          {s.clients?.name}{s.clients?.company ? ` · ${s.clients.company}` : ""}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={cn("text-[10px] border", STATUS_COLOR[s.status] ?? STATUS_COLOR.draft)}>
                        {s.status}
                      </Badge>
                      {s.pdf_url && (
                        <a href={s.pdf_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-blue-500/10 text-[#64748B] hover:text-blue-400 transition-colors" title="Descargar PDF">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#64748B] hover:text-white transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(s.id)} disabled={deleting === s.id}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#64748B] hover:text-red-400 transition-colors">
                        {deleting === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  {isOpen && s.content && (
                    <div className="px-5 py-4 bg-black/10 border-t border-[#1A1A35]">
                      <pre className="whitespace-pre-wrap text-xs text-[#94A3B8] font-sans leading-relaxed">{s.content}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0D0D1F] border-white/[0.08] text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#00D4AA]">{editing ? "Editar estrategia" : "Nueva estrategia"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#64748B] mb-1 block">Cliente</label>
                <Select value={form.client_id} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                  <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white">
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-white hover:bg-white/[0.06]">
                        {c.name}{c.company ? ` — ${c.company}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#64748B] mb-1 block">Estado</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                    {["draft","active","approved","archived"].map(s => (
                      <SelectItem key={s} value={s} className="text-white hover:bg-white/[0.06]">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-[#64748B] mb-1 block">Título</label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ej: Estrategia Q2 2025 — Meta + Google"
                  className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B]" />
              </div>
            </div>

            <div className="border border-[#00D4AA]/20 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-[#00D4AA] flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Generador de estrategia IA
              </p>
              <Input value={genPrompt} onChange={e => setGenPrompt(e.target.value)}
                placeholder="Contexto adicional (opcional): presupuesto, canales preferidos, metas..."
                className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B] text-sm" />
              <Button onClick={generateStrategy} disabled={generating || !form.client_id || !form.title}
                className="w-full bg-[#00D4AA]/10 text-[#00D4AA] border border-[#00D4AA]/20 hover:bg-[#00D4AA]/20 font-semibold gap-2"
                variant="outline">
                {generating
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando estrategia completa...</>
                  : <><Sparkles className="h-4 w-4" /> Generar estrategia con XENTTECH AI</>}
              </Button>
            </div>

            <div>
              <label className="text-xs text-[#64748B] mb-1 block">Contenido de la estrategia</label>
              <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={12} className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B] resize-none text-xs font-mono"
                placeholder="La estrategia aparecerá aquí después de generar con IA, o escribe manualmente..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-[#64748B]">Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.client_id || !form.title}
              className="bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 font-semibold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
