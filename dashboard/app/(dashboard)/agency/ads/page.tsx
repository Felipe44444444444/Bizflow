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
import { Megaphone, Plus, Search, Pencil, Trash2, Loader2, Sparkles, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface Client { id: string; name: string; company: string | null; }
interface Campaign {
  id: string; client_id: string; platform: string; campaign_name: string;
  objective: string | null; audience: string | null; budget_monthly: number | null;
  status: string; ad_copies: any; metrics: any; created_at: string;
  clients?: { name: string; company: string | null };
}

const PLATFORMS = ["meta", "google", "tiktok", "linkedin", "youtube"];
const OBJECTIVES = ["leads", "ventas", "awareness", "tráfico", "engagement", "retención"];
const STATUS_COLOR: Record<string, string> = {
  draft:     "bg-gray-500/10 text-gray-400 border-gray-500/20",
  active:    "bg-green-500/10 text-green-400 border-green-500/20",
  paused:    "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};
const PLATFORM_ICON: Record<string, string> = {
  meta: "📘", google: "🔍", tiktok: "🎵", linkedin: "💼", youtube: "▶️",
};

const BLANK = { client_id: "", platform: "meta", campaign_name: "", objective: "leads", audience: "", budget_monthly: "", status: "draft" };

export default function AdsPage() {
  const [clients, setClients]   = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [open, setOpen]         = useState(false);
  const [editing, setEditing]   = useState<Campaign | null>(null);
  const [form, setForm]         = useState<any>(BLANK);
  const [saving, setSaving]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, camp] = await Promise.all([
        api.get("/api/agency/clients"),
        api.get("/api/agency/campaigns"),
      ]);
      setClients(c ?? []);
      setCampaigns(camp ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setForm({ ...BLANK, client_id: clients[0]?.id ?? "" }); setAiResult(""); setOpen(true); }
  function openEdit(c: Campaign) {
    setEditing(c);
    setForm({ ...c, budget_monthly: c.budget_monthly ?? "" });
    setAiResult("");
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = { ...form, budget_monthly: form.budget_monthly ? Number(form.budget_monthly) : null };
      if (editing) await api.put(`/api/agency/campaigns/${editing.id}`, payload);
      else await api.post("/api/agency/campaigns", payload);
      setOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      await api.del(`/api/agency/campaigns/${id}`);
      setCampaigns(prev => prev.filter(c => c.id !== id));
    } finally { setDeleting(null); }
  }

  async function generateBrief() {
    const client = clients.find(c => c.id === form.client_id);
    if (!client || !form.campaign_name) return;
    setGenerating(true);
    try {
      const { result } = await api.post("/api/agency/generate", {
        prompt: `Crea un brief creativo detallado para la siguiente campaña de publicidad digital:
- Cliente: ${client.name}${client.company ? ` (${client.company})` : ""}
- Plataforma: ${form.platform}
- Nombre: ${form.campaign_name}
- Objetivo: ${form.objective}
- Audiencia: ${form.audience || "por definir"}
- Presupuesto: ${form.budget_monthly ? `$${form.budget_monthly}/mes` : "por definir"}

Incluye: propuesta de valor, mensajes clave, estructura del anuncio, copy de titulares y descripciones, y KPIs recomendados.`,
      });
      setAiResult(result);
    } finally { setGenerating(false); }
  }

  const filtered = campaigns.filter(c =>
    [c.campaign_name, c.clients?.name, c.platform, c.objective].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const totalBudget = campaigns.filter(c => c.status === "active")
    .reduce((s, c) => s + (Number(c.budget_monthly) ?? 0), 0);

  return (
    <div className="flex flex-col h-full">
      <Header title="Anuncios" description="Gestión de campañas publicitarias" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total campañas", value: campaigns.length, color: "text-[#00FF88]" },
            { label: "Activas", value: campaigns.filter(c => c.status === "active").length, color: "text-green-400" },
            { label: "Budget activo/mes", value: `$${totalBudget.toLocaleString()}`, color: "text-neon-cyan" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl bg-space-card border border-white/[0.06] p-4">
              <p className="text-xs text-[#4A5568]">{label}</p>
              <p className={cn("text-2xl font-bold mt-1", color)}>{value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#4A5568]" />
            <Input
              placeholder="Buscar campañas..."
              className="pl-9 bg-space-card border-white/[0.06] text-white placeholder:text-[#4A5568]"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={openNew} className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold gap-2">
            <Plus className="h-4 w-4" /> Nueva campaña
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#00FF88]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filtered.length === 0 && (
              <p className="text-center text-[#4A5568] py-12">No hay campañas todavía.</p>
            )}
            {filtered.map(camp => (
              <div key={camp.id} className="rounded-xl bg-space-card border border-white/[0.06] p-5 hover:border-[#00FF88]/20 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{PLATFORM_ICON[camp.platform] ?? "📣"}</span>
                    <div>
                      <p className="font-semibold text-white">{camp.campaign_name}</p>
                      <p className="text-xs text-[#4A5568] mt-0.5">
                        {camp.clients?.name}{camp.clients?.company ? ` · ${camp.clients.company}` : ""} · {camp.objective}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={cn("text-[10px] border", STATUS_COLOR[camp.status] ?? STATUS_COLOR.draft)}>
                      {camp.status}
                    </Badge>
                    <button onClick={() => openEdit(camp)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#4A5568] hover:text-white transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(camp.id)} disabled={deleting === camp.id} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#4A5568] hover:text-red-400 transition-colors">
                      {deleting === camp.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-[#A0AEC0]">
                  {camp.budget_monthly && (
                    <span className="flex items-center gap-1 text-[#00FF88]">
                      <DollarSign className="h-3 w-3" /> ${Number(camp.budget_monthly).toLocaleString()}/mes
                    </span>
                  )}
                  {camp.audience && <span>👥 {camp.audience}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-space-card border-white/[0.08] text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#00FF88]">{editing ? "Editar campaña" : "Nueva campaña"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-[#4A5568] mb-1 block">Cliente</label>
                <Select value={form.client_id} onValueChange={v => setForm((f: any) => ({ ...f, client_id: v }))}>
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
              <div className="col-span-2">
                <label className="text-xs text-[#4A5568] mb-1 block">Nombre de campaña *</label>
                <Input
                  value={form.campaign_name}
                  onChange={e => setForm((f: any) => ({ ...f, campaign_name: e.target.value }))}
                  className="bg-white/[0.04] border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Plataforma</label>
                <Select value={form.platform} onValueChange={v => setForm((f: any) => ({ ...f, platform: v }))}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-space-card border-white/[0.08]">
                    {PLATFORMS.map(p => (
                      <SelectItem key={p} value={p} className="text-white hover:bg-white/[0.06]">
                        {PLATFORM_ICON[p]} {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Objetivo</label>
                <Select value={form.objective} onValueChange={v => setForm((f: any) => ({ ...f, objective: v }))}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-space-card border-white/[0.08]">
                    {OBJECTIVES.map(o => (
                      <SelectItem key={o} value={o} className="text-white hover:bg-white/[0.06]">{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Budget mensual ($)</label>
                <Input
                  type="number"
                  value={form.budget_monthly}
                  onChange={e => setForm((f: any) => ({ ...f, budget_monthly: e.target.value }))}
                  className="bg-white/[0.04] border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Estado</label>
                <Select value={form.status} onValueChange={v => setForm((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-space-card border-white/[0.08]">
                    {["draft","active","paused","completed"].map(s => (
                      <SelectItem key={s} value={s} className="text-white hover:bg-white/[0.06]">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-[#4A5568] mb-1 block">Audiencia objetivo</label>
                <Input
                  value={form.audience}
                  onChange={e => setForm((f: any) => ({ ...f, audience: e.target.value }))}
                  placeholder="Ej: Empresarios 30-50, Colombia, intereses en marketing..."
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568]"
                />
              </div>
            </div>

            {/* AI Brief */}
            <div className="border border-[#00FF88]/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#00FF88]">Brief creativo IA</p>
                <button
                  onClick={generateBrief}
                  disabled={generating || !form.client_id || !form.campaign_name}
                  className="flex items-center gap-1.5 text-xs text-[#00FF88] hover:text-[#00FF88]/80 disabled:opacity-40 bg-[#00FF88]/10 px-3 py-1.5 rounded-lg border border-[#00FF88]/20 transition-colors"
                >
                  {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Generar brief
                </button>
              </div>
              {aiResult && (
                <div className="rounded-lg bg-black/20 p-3 text-xs text-[#A0AEC0] whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {aiResult}
                </div>
              )}
              {!aiResult && !generating && (
                <p className="text-xs text-[#4A5568]">Completa los campos y genera un brief con IA.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-[#4A5568]">Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.client_id || !form.campaign_name} className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
