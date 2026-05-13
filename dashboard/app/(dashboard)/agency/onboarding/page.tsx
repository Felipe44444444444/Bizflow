"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { UserCheck, Plus, ChevronDown, ChevronRight, Loader2, Sparkles, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Client { id: string; name: string; company: string | null; onboarding_step: number | null; }
interface OnbDoc {
  id: string; client_id: string; step_number: number; step_name: string;
  content: string | null; status: string; created_at: string;
  clients?: { name: string; company: string | null };
}

const STATUS_COLOR: Record<string, string> = {
  pending:    "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  in_progress:"bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed:  "bg-green-500/10 text-green-400 border-green-500/20",
};

const STEPS = [
  "Cuestionario inicial", "Accesos & credenciales", "Brief de marca",
  "Estrategia aprobada", "Materiales entregados", "Onboarding completado",
];

export default function OnboardingPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [docs, setDocs]       = useState<OnbDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]       = useState(false);
  const [form, setForm]       = useState({ client_id: "", step_number: 1, step_name: STEPS[0], content: "", status: "pending" });
  const [editing, setEditing] = useState<OnbDoc | null>(null);
  const [saving, setSaving]   = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([
        api.get("/api/agency/clients"),
        api.get("/api/agency/onboarding"),
      ]);
      setClients(c ?? []);
      setDocs(d ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Group docs by client
  const grouped = clients.map(c => ({
    client: c,
    docs: docs.filter(d => d.client_id === c.id).sort((a, b) => a.step_number - b.step_number),
  })).filter(g => g.docs.length > 0);

  function openNew() {
    setEditing(null);
    setForm({ client_id: clients[0]?.id ?? "", step_number: 1, step_name: STEPS[0], content: "", status: "pending" });
    setOpen(true);
  }
  function openEdit(d: OnbDoc) {
    setEditing(d);
    setForm({ client_id: d.client_id, step_number: d.step_number, step_name: d.step_name, content: d.content ?? "", status: d.status });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (editing) await api.put(`/api/agency/onboarding/${editing.id}`, form);
      else await api.post("/api/agency/onboarding", form);
      setOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      await api.del(`/api/agency/onboarding/${id}`);
      setDocs(prev => prev.filter(d => d.id !== id));
    } finally { setDeleting(null); }
  }

  async function generateContent() {
    const client = clients.find(c => c.id === form.client_id);
    if (!client) return;
    setGenerating(true);
    try {
      const { result } = await api.post("/api/agency/generate", {
        prompt: `Genera el contenido para el paso de onboarding "${form.step_name}" del cliente ${client.name}${client.company ? ` (${client.company})` : ""}. Sé específico, accionable y profesional. Incluye checklist si aplica.`,
      });
      setForm(f => ({ ...f, content: result }));
    } finally { setGenerating(false); }
  }

  async function markComplete(doc: OnbDoc) {
    await api.put(`/api/agency/onboarding/${doc.id}`, { status: "completed" });
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, status: "completed" } : d));
  }

  const completed = docs.filter(d => d.status === "completed").length;
  const total     = docs.length;

  return (
    <div className="flex flex-col h-full">
      <Header title="Onboarding" description="Seguimiento de incorporación de clientes" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Progress KPI */}
        <div className="rounded-xl bg-space-card border border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-[#A0AEC0]">Progreso global</p>
            <p className="text-sm font-bold text-[#00FF88]">{completed}/{total} pasos</p>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#00FF88] transition-all duration-500"
              style={{ width: total ? `${(completed / total) * 100}%` : "0%" }}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={openNew} className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold gap-2">
            <Plus className="h-4 w-4" /> Nuevo paso
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#00FF88]" />
          </div>
        ) : grouped.length === 0 ? (
          <p className="text-center text-[#4A5568] py-12">No hay pasos de onboarding todavía.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(({ client, docs: clientDocs }) => {
              const isOpen = expanded[client.id] !== false;
              const done   = clientDocs.filter(d => d.status === "completed").length;
              return (
                <div key={client.id} className="rounded-xl border border-white/[0.06] overflow-hidden">
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [client.id]: !isOpen }))}
                    className="w-full flex items-center justify-between px-5 py-4 bg-space-card hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-[#4A5568]" /> : <ChevronRight className="h-4 w-4 text-[#4A5568]" />}
                      <span className="font-semibold text-white">{client.name}</span>
                      {client.company && <span className="text-xs text-[#4A5568]">{client.company}</span>}
                    </div>
                    <span className="text-xs text-[#00FF88] font-medium">{done}/{clientDocs.length} completados</span>
                  </button>
                  {isOpen && (
                    <div className="divide-y divide-white/[0.04]">
                      {clientDocs.map(doc => (
                        <div key={doc.id} className="px-5 py-4 flex items-start gap-4 bg-black/10">
                          <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
                            <div className={cn(
                              "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold border",
                              doc.status === "completed"
                                ? "bg-[#00FF88]/20 text-[#00FF88] border-[#00FF88]/30"
                                : "bg-white/[0.04] text-[#4A5568] border-white/[0.08]"
                            )}>
                              {doc.status === "completed" ? "✓" : doc.step_number}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-white text-sm">{doc.step_name}</p>
                              <Badge className={cn("text-[10px] border", STATUS_COLOR[doc.status] ?? STATUS_COLOR.pending)}>
                                {doc.status}
                              </Badge>
                            </div>
                            {doc.content && (
                              <p className="text-xs text-[#A0AEC0] whitespace-pre-wrap line-clamp-3">{doc.content}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {doc.status !== "completed" && (
                              <button onClick={() => markComplete(doc)} className="p-1.5 rounded-lg hover:bg-[#00FF88]/10 text-[#4A5568] hover:text-[#00FF88] transition-colors" title="Marcar completado">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button onClick={() => openEdit(doc)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#4A5568] hover:text-white transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => remove(doc.id)} disabled={deleting === doc.id} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#4A5568] hover:text-red-400 transition-colors">
                              {deleting === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-space-card border-white/[0.08] text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#00FF88]">{editing ? "Editar paso" : "Nuevo paso de onboarding"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Nombre del paso</label>
                <Select value={form.step_name} onValueChange={v => setForm(f => ({ ...f, step_name: v }))}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-space-card border-white/[0.08]">
                    {STEPS.map(s => (
                      <SelectItem key={s} value={s} className="text-white hover:bg-white/[0.06]">{s}</SelectItem>
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
                    {["pending","in_progress","completed"].map(s => (
                      <SelectItem key={s} value={s} className="text-white hover:bg-white/[0.06]">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-[#4A5568]">Contenido / checklist</label>
                <button
                  onClick={generateContent}
                  disabled={generating || !form.client_id}
                  className="flex items-center gap-1 text-xs text-[#00FF88] hover:text-[#00FF88]/80 disabled:opacity-40"
                >
                  {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Generar con IA
                </button>
              </div>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={5}
                className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568] resize-none text-sm"
                placeholder="Instrucciones, checklist o notas del paso..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-[#4A5568]">Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.client_id} className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
