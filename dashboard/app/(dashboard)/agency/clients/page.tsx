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
import {
  Briefcase, Plus, Search, Pencil, Trash2, Loader2, Building2,
  Mail, Phone, DollarSign, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  industry: string | null;
  plan: string | null;
  status: string;
  monthly_revenue: number | null;
  onboarding_step: number | null;
  notes: string | null;
  created_at: string;
}

const BLANK: Partial<Client> = {
  name: "", email: "", phone: "", company: "", industry: "",
  plan: "", status: "active", monthly_revenue: undefined, notes: "",
};

const STATUS_COLOR: Record<string, string> = {
  active:   "bg-green-500/10 text-green-400 border-green-500/20",
  paused:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  churned:  "bg-red-500/10 text-red-400 border-red-500/20",
  prospect: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [open, setOpen]         = useState(false);
  const [editing, setEditing]   = useState<Client | null>(null);
  const [form, setForm]         = useState<Partial<Client>>(BLANK);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/agency/clients");
      setClients(data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setForm(BLANK); setOpen(true); }
  function openEdit(c: Client) { setEditing(c); setForm({ ...c }); setOpen(true); }

  async function save() {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/api/agency/clients/${editing.id}`, form);
      } else {
        await api.post("/api/agency/clients", form);
      }
      setOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      await api.del(`/api/agency/clients/${id}`);
      setClients(prev => prev.filter(c => c.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  const filtered = clients.filter(c =>
    [c.name, c.email, c.company, c.industry].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const totalMRR = clients.reduce((s, c) => s + (c.monthly_revenue ?? 0), 0);
  const active   = clients.filter(c => c.status === "active").length;

  return (
    <div className="flex flex-col h-full">
      <Header title="Clientes" description="Gestión de clientes de la agencia" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total clientes", value: clients.length, icon: Briefcase, color: "text-[#00FF88]" },
            { label: "Activos", value: active, icon: TrendingUp, color: "text-green-400" },
            { label: "MRR total", value: `$${totalMRR.toLocaleString()}`, icon: DollarSign, color: "text-neon-cyan" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl bg-space-card border border-white/[0.06] p-4 flex items-center gap-4">
              <div className={cn("p-2 rounded-lg bg-white/5", color)}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-[#4A5568]">{label}</p>
                <p className={cn("text-xl font-bold", color)}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#4A5568]" />
            <Input
              placeholder="Buscar clientes..."
              className="pl-9 bg-space-card border-white/[0.06] text-white placeholder:text-[#4A5568]"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={openNew} className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold gap-2">
            <Plus className="h-4 w-4" /> Nuevo cliente
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#00FF88]" />
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  {["Cliente", "Empresa", "Industria", "Plan", "MRR", "Estado", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-[#4A5568] uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-[#4A5568]">
                      No hay clientes todavía.
                    </td>
                  </tr>
                )}
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{c.name}</p>
                      {c.email && <p className="text-xs text-[#4A5568]">{c.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-[#A0AEC0]">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        {c.company ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#A0AEC0]">{c.industry ?? "—"}</td>
                    <td className="px-4 py-3 text-[#A0AEC0]">{c.plan ?? "—"}</td>
                    <td className="px-4 py-3 text-[#00FF88] font-medium">
                      {c.monthly_revenue ? `$${Number(c.monthly_revenue).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn("text-[10px] border", STATUS_COLOR[c.status] ?? STATUS_COLOR.active)}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#4A5568] hover:text-white transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => remove(c.id)}
                          disabled={deleting === c.id}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#4A5568] hover:text-red-400 transition-colors"
                        >
                          {deleting === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-space-card border-white/[0.08] text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#00FF88]">
              {editing ? "Editar cliente" : "Nuevo cliente"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {[
              { key: "name",     label: "Nombre *",   full: true  },
              { key: "company",  label: "Empresa",    full: false },
              { key: "email",    label: "Email",      full: false },
              { key: "phone",    label: "Teléfono",   full: false },
              { key: "industry", label: "Industria",  full: false },
              { key: "plan",     label: "Plan",       full: false },
            ].map(({ key, label, full }) => (
              <div key={key} className={full ? "col-span-2" : ""}>
                <label className="text-xs text-[#4A5568] mb-1 block">{label}</label>
                <Input
                  value={(form as any)[key] ?? ""}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568]"
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-[#4A5568] mb-1 block">MRR mensual ($)</label>
              <Input
                type="number"
                value={form.monthly_revenue ?? ""}
                onChange={e => setForm(f => ({ ...f, monthly_revenue: Number(e.target.value) || undefined }))}
                className="bg-white/[0.04] border-white/[0.08] text-white"
              />
            </div>
            <div>
              <label className="text-xs text-[#4A5568] mb-1 block">Estado</label>
              <Select value={form.status ?? "active"} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-space-card border-white/[0.08]">
                  {["active","paused","churned","prospect"].map(s => (
                    <SelectItem key={s} value={s} className="text-white hover:bg-white/[0.06]">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[#4A5568] mb-1 block">Notas</label>
              <Textarea
                value={form.notes ?? ""}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-[#4A5568]">Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.name} className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
