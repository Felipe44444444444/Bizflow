"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Palette, Plus, Search, Pencil, Trash2, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface Client { id: string; name: string; company: string | null; }
interface Campaign { id: string; campaign_name: string; client_id: string; }
interface Design {
  id: string; client_id: string; campaign_id: string | null; design_type: string;
  brief: string | null; canva_url: string | null; status: string; created_at: string;
  clients?: { name: string; company: string | null };
}

const DESIGN_TYPES = ["post", "story", "banner", "video_script", "carousel", "reels_script", "email_header"];
const STATUS_COLOR: Record<string, string> = {
  pending:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  in_review: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  approved:  "bg-green-500/10 text-green-400 border-green-500/20",
  delivered: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};
const TYPE_ICON: Record<string, string> = {
  post: "🖼️", story: "📱", banner: "🎯", video_script: "🎬",
  carousel: "🎠", reels_script: "🎥", email_header: "📧",
};

const BLANK = { client_id: "", campaign_id: "", design_type: "post", brief: "", canva_url: "", status: "pending" };

export default function DesignPage() {
  const [clients, setClients]   = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [designs, setDesigns]   = useState<Design[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [open, setOpen]         = useState(false);
  const [editing, setEditing]   = useState<Design | null>(null);
  const [form, setForm]         = useState<any>(BLANK);
  const [saving, setSaving]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, camp, d] = await Promise.all([
        api.get("/api/agency/clients"),
        api.get("/api/agency/campaigns"),
        api.get("/api/agency/designs"),
      ]);
      setClients(c ?? []);
      setCampaigns(camp ?? []);
      setDesigns(d ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clientCampaigns = campaigns.filter(c => c.client_id === form.client_id);

  function openNew() { setEditing(null); setForm({ ...BLANK, client_id: clients[0]?.id ?? "" }); setOpen(true); }
  function openEdit(d: Design) { setEditing(d); setForm({ ...d, campaign_id: d.campaign_id ?? "" }); setOpen(true); }

  async function save() {
    setSaving(true);
    try {
      const payload = { ...form, campaign_id: form.campaign_id || null };
      if (editing) await api.put(`/api/agency/designs/${editing.id}`, payload);
      else await api.post("/api/agency/designs", payload);
      setOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      await api.del(`/api/agency/designs/${id}`);
      setDesigns(prev => prev.filter(d => d.id !== id));
    } finally { setDeleting(null); }
  }

  async function generateBrief() {
    const client = clients.find(c => c.id === form.client_id);
    if (!client) return;
    setGenerating(true);
    try {
      const { result } = await api.post("/api/agency/generate", {
        prompt: `Genera un brief de diseño creativo y detallado para:
- Cliente: ${client.name}${client.company ? ` (${client.company})` : ""}
- Tipo de pieza: ${form.design_type}
- Contexto adicional: ${form.brief || "campaña de marketing digital"}

Incluye: objetivo visual, tono y estilo, elementos obligatorios (logo, colores, slogan), copy sugerido, dimensiones recomendadas, y referencias de estilo.`,
      });
      setForm((f: any) => ({ ...f, brief: result }));
    } finally { setGenerating(false); }
  }

  const filtered = designs.filter(d =>
    [d.design_type, d.clients?.name, d.status].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="flex flex-col h-full">
      <Header title="Diseño" description="Briefs y piezas creativas" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Status columns */}
        <div className="grid grid-cols-4 gap-3">
          {["pending","in_review","approved","delivered"].map(status => {
            const count = designs.filter(d => d.status === status).length;
            return (
              <div key={status} className="rounded-xl bg-space-card border border-white/[0.06] p-4 text-center">
                <p className="text-xs text-[#4A5568] uppercase tracking-wider mb-1">{status.replace("_", " ")}</p>
                <p className={cn("text-2xl font-bold", STATUS_COLOR[status]?.split(" ")[1] ?? "text-white")}>{count}</p>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#4A5568]" />
            <Input
              placeholder="Buscar piezas..."
              className="pl-9 bg-space-card border-white/[0.06] text-white placeholder:text-[#4A5568]"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={openNew} className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold gap-2">
            <Plus className="h-4 w-4" /> Nueva pieza
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#00FF88]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.length === 0 && (
              <p className="col-span-2 text-center text-[#4A5568] py-12">No hay piezas todavía.</p>
            )}
            {filtered.map(d => (
              <div key={d.id} className="rounded-xl bg-space-card border border-white/[0.06] p-5 hover:border-[#00FF88]/20 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{TYPE_ICON[d.design_type] ?? "🎨"}</span>
                    <div>
                      <p className="font-semibold text-white capitalize">{d.design_type.replace("_", " ")}</p>
                      <p className="text-xs text-[#4A5568]">{d.clients?.name}{d.clients?.company ? ` · ${d.clients.company}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={cn("text-[10px] border", STATUS_COLOR[d.status] ?? STATUS_COLOR.pending)}>
                      {d.status}
                    </Badge>
                    {d.canva_url && (
                      <a href={d.canva_url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#4A5568] hover:text-[#00FF88] transition-colors">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#4A5568] hover:text-white transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(d.id)} disabled={deleting === d.id} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#4A5568] hover:text-red-400 transition-colors">
                      {deleting === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                {d.brief && (
                  <p className="mt-3 text-xs text-[#A0AEC0] line-clamp-2">{d.brief}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-space-card border-white/[0.08] text-white max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#00FF88]">{editing ? "Editar pieza" : "Nueva pieza de diseño"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Cliente</label>
                <Select value={form.client_id} onValueChange={v => setForm((f: any) => ({ ...f, client_id: v, campaign_id: "" }))}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent className="bg-space-card border-white/[0.08]">
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-white hover:bg-white/[0.06]">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Tipo de pieza</label>
                <Select value={form.design_type} onValueChange={v => setForm((f: any) => ({ ...f, design_type: v }))}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-space-card border-white/[0.08]">
                    {DESIGN_TYPES.map(t => (
                      <SelectItem key={t} value={t} className="text-white hover:bg-white/[0.06]">
                        {TYPE_ICON[t]} {t.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {clientCampaigns.length > 0 && (
                <div className="col-span-2">
                  <label className="text-xs text-[#4A5568] mb-1 block">Campaña (opcional)</label>
                  <Select value={form.campaign_id} onValueChange={v => setForm((f: any) => ({ ...f, campaign_id: v }))}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                      <SelectValue placeholder="Sin campaña" />
                    </SelectTrigger>
                    <SelectContent className="bg-space-card border-white/[0.08]">
                      {clientCampaigns.map(c => (
                        <SelectItem key={c.id} value={c.id} className="text-white hover:bg-white/[0.06]">
                          {c.campaign_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="col-span-2">
                <label className="text-xs text-[#4A5568] mb-1 block">Estado</label>
                <Select value={form.status} onValueChange={v => setForm((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-space-card border-white/[0.08]">
                    {["pending","in_review","approved","delivered"].map(s => (
                      <SelectItem key={s} value={s} className="text-white hover:bg-white/[0.06]">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-[#4A5568] mb-1 block">URL de Canva</label>
                <Input
                  value={form.canva_url}
                  onChange={e => setForm((f: any) => ({ ...f, canva_url: e.target.value }))}
                  placeholder="https://www.canva.com/design/..."
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568]"
                />
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-[#4A5568]">Brief creativo</label>
                  <button
                    onClick={generateBrief}
                    disabled={generating || !form.client_id}
                    className="flex items-center gap-1 text-xs text-[#00FF88] hover:text-[#00FF88]/80 disabled:opacity-40"
                  >
                    {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Generar con IA
                  </button>
                </div>
                <Textarea
                  value={form.brief}
                  onChange={e => setForm((f: any) => ({ ...f, brief: e.target.value }))}
                  rows={6}
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568] resize-none text-sm"
                  placeholder="Describe la pieza: objetivo, tono, elementos clave, copy..."
                />
              </div>
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
