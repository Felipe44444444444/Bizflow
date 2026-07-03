"use client";
import { useEffect, useState, useCallback } from "react";
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
  DollarSign, TrendingUp, Copy, X, CheckCircle2, Key, Database,
  Link, Link2Off,
} from "lucide-react";
import { TableSkeleton } from "@/components/ui/page-skeleton";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  currency: string;
  business_name?: string;
}

interface MetaPage {
  id: string;
  name: string;
  access_token?: string;
}

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
  contract_signed: boolean | null;
  signature_data: string | null;
  signed_at: string | null;
  supabase_url: string | null;
  supabase_anon_key: string | null;
  supabase_service_key: string | null;
  // Meta Ads OAuth
  meta_connected: boolean | null;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  meta_user_id: string | null;
  meta_token_expires_at: string | null;
}

const BLANK: Partial<Client> = {
  name: "", email: "", phone: "", company: "", industry: "",
  plan: "", status: "prospect", monthly_revenue: undefined, notes: "",
};

const STATUS_COLOR: Record<string, string> = {
  active:   "bg-green-500/10 text-green-400 border-green-500/20",
  inactive: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  churned:  "bg-red-500/10 text-red-400 border-red-500/20",
  prospect: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const STATUS_LABEL: Record<string, string> = {
  active:   "Activo",
  inactive: "Inactivo",
  churned:  "Churnado",
  prospect: "Prospecto",
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [open, setOpen]         = useState(false);
  const [editing, setEditing]   = useState<Client | null>(null);
  const [form, setForm]         = useState<Partial<Client>>(BLANK);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied]     = useState(false);

  // Meta OAuth
  const [metaError, setMetaError]           = useState<string | null>(null);
  const [metaSuccess, setMetaSuccess]       = useState<string | null>(null);
  const [metaSelector, setMetaSelector]     = useState<{
    clientId: string;
    adAccounts: MetaAdAccount[];
    pages: MetaPage[];
  } | null>(null);
  const [selAdAccount, setSelAdAccount]     = useState("");
  const [selPage, setSelPage]               = useState("");
  const [savingMeta, setSavingMeta]         = useState(false);

  // Client Supabase credentials
  const [sbUrl, setSbUrl]           = useState("");
  const [sbAnonKey, setSbAnonKey]   = useState("");
  const [sbServiceKey, setSbServiceKey] = useState("");
  const [sbStatus, setSbStatus]     = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [sbStatusMsg, setSbStatusMsg] = useState("");
  const [sbSaving, setSbSaving]     = useState(false);
  const [sbIniting, setSbIniting]   = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();

    let fromCache = false;
    try {
      const raw = sessionStorage.getItem('xenttech_clients_full');
      if (raw) {
        const { d, ts } = JSON.parse(raw);
        if (Date.now() - ts < 5 * 60_000) { setClients(d); setLoading(false); fromCache = true; }
      }
    } catch {}

    if (!fromCache) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("id,name,email,phone,company,industry,plan,status,monthly_revenue,onboarding_step,notes,created_at,contract_signed,signature_data,signed_at,supabase_url,supabase_anon_key,supabase_service_key,meta_connected,meta_ad_account_id,meta_page_id,meta_user_id,meta_token_expires_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setClients(data ?? []);
      try { sessionStorage.setItem('xenttech_clients_full', JSON.stringify({ d: data ?? [], ts: Date.now() })); } catch {}
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Handle Meta OAuth callback URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('meta_error');
    const success = params.get('meta_success');
    if (err) {
      setMetaError(decodeURIComponent(err));
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (success) {
      const cid = params.get('client_id');
      const user = params.get('meta_user');
      const rawAccounts = params.get('ad_accounts');
      const rawPages = params.get('pages');
      const accounts: MetaAdAccount[] = rawAccounts ? JSON.parse(rawAccounts) : [];
      const pages: MetaPage[] = rawPages ? JSON.parse(rawPages) : [];
      setMetaSuccess(`Meta conectado${user ? ` — ${user}` : ''}`);
      if ((accounts.length > 1 || pages.length > 1) && cid) {
        setMetaSelector({ clientId: cid, adAccounts: accounts, pages });
        setSelAdAccount(accounts[0]?.account_id ?? '');
        setSelPage(pages[0]?.id ?? '');
      }
      window.history.replaceState({}, '', window.location.pathname);
      load();
      setTimeout(() => setMetaSuccess(null), 5000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setEditing(null); setForm(BLANK); setSaveError(null);
    setSbUrl(""); setSbAnonKey(""); setSbServiceKey(""); setSbStatus('idle'); setSbStatusMsg("");
    setOpen(true);
  }

  function openEdit(c: Client) {
    setEditing(c); setForm({ ...c }); setSaveError(null);
    setSbUrl(c.supabase_url ?? "");
    setSbAnonKey(c.supabase_anon_key ?? "");
    setSbServiceKey(c.supabase_service_key ?? "");
    setSbStatus('idle'); setSbStatusMsg("");
    setOpen(true);
  }

  async function testClientSupabase() {
    if (!sbUrl || !sbAnonKey) return;
    setSbStatus('testing'); setSbStatusMsg("");
    try {
      const res = await fetch(`${sbUrl.replace(/\/$/, '')}/rest/v1/`, {
        headers: { apikey: sbAnonKey, Authorization: `Bearer ${sbAnonKey}` },
      });
      if (res.ok || res.status === 400) {
        setSbStatus('ok'); setSbStatusMsg("Conexión exitosa ✓");
      } else {
        setSbStatus('error'); setSbStatusMsg(`Error ${res.status} — verifica la URL y la clave.`);
      }
    } catch {
      setSbStatus('error'); setSbStatusMsg("No se pudo conectar. Verifica la URL y la clave.");
    }
  }

  async function saveClientSupabase() {
    if (!editing || !sbUrl) return;
    setSbSaving(true); setSbStatusMsg("");
    const supabase = createClient();
    try {
      const { error: err } = await supabase.from("clients").update({
        supabase_url:         sbUrl || null,
        supabase_anon_key:    sbAnonKey || null,
        supabase_service_key: sbServiceKey || null,
      }).eq("id", editing.id);
      if (err) throw err;
      setClients(prev => prev.map(c => c.id === editing.id
        ? { ...c, supabase_url: sbUrl, supabase_anon_key: sbAnonKey, supabase_service_key: sbServiceKey }
        : c
      ));
      setSbStatusMsg("Credenciales guardadas ✓");
    } catch (e: unknown) {
      setSbStatusMsg(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSbSaving(false);
    }
  }

  async function initClientSupabase() {
    if (!editing || !sbUrl || !sbServiceKey) return;
    setSbIniting(true); setSbStatusMsg("");
    try {
      const res = await fetch('/api/init-client-supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id:           editing.id,
          supabase_url:        sbUrl,
          supabase_service_key: sbServiceKey,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSbStatusMsg("Supabase inicializado correctamente ✓");
    } catch (e: unknown) {
      setSbStatusMsg(e instanceof Error ? e.message : "Error al inicializar");
    } finally {
      setSbIniting(false);
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();
    try {
      if (editing) {
        const { error: editError } = await supabase
          .from("clients")
          .update({
            name: form.name,
            email: form.email || null,
            phone: form.phone || null,
            company: form.company || null,
            industry: form.industry || null,
            plan: form.plan || null,
            status: form.status,
            monthly_revenue: form.monthly_revenue || null,
            notes: form.notes || null,
          })
          .eq("id", editing.id);
        if (editError) throw new Error(editError.message);
        setOpen(false);
        load();
      } else {
        // ── Step 1: INSERT client directly via Supabase ──────────────
        const { data: clientData, error: clientError } = await supabase
          .from("clients")
          .insert({
            name: form.name,
            email: form.email || null,
            phone: form.phone || null,
            company: form.company || null,
            industry: form.industry || null,
            plan: form.plan || null,
            status: form.status || "prospect",
            monthly_revenue: form.monthly_revenue || null,
            notes: form.notes || null,
          })
          .select()
          .single();

        if (clientError) throw new Error(clientError.message);

        // ── Step 2: Generate portal token XT-XXXXXXXX ────────────────
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let token = "XT-";
        for (let i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * chars.length)];

        // ── Step 3: INSERT portal_token ──────────────────────────────
        const { error: tokenError } = await supabase
          .from("portal_tokens")
          .insert({ client_id: clientData.id, token, is_active: true, label: "Portal Access" });

        if (tokenError) {
          console.error("[save client] portal_tokens insert failed:", tokenError);
          // Non-fatal: client was created — still show partial success
          setSaveError(`Cliente creado pero falló el token: ${tokenError.message}`);
        }

        // ── Step 4: INSERT activity_log ──────────────────────────────
        await supabase
          .from("activity_log")
          .insert({ client_id: clientData.id, action: "Cliente creado", details: `Token: ${token}` });

        // ── Step 5: Auto-generate Welcome Document (step 3) ──────────
        try {
          const welcomePrompt = `Genera un documento de bienvenida calido y profesional para el cliente ${form.name}${form.company ? ` (${form.company})` : ""} de la agencia XENTTECH.\n\nEstructura: 1) Bienvenida personalizada de XENTTECH, 2) Presentacion del equipo y roles, 3) Servicios de marketing digital que recibira con frecuencias y entregables, 4) Canales de comunicacion (WhatsApp, email, portal xenttech.com), 5) SLA de respuesta, 6) Acceso al portal con token ${token}, 7) Proceso de onboarding los proximos 14 dias, 8) Primeros pasos que necesitamos del cliente. Tono profesional y cercano. Sin markdown.`;
          const genRes = await fetch("/api/generate", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: welcomePrompt }),
          });
          if (genRes.ok) {
            const { result } = await genRes.json();
            await supabase.from("onboarding_documents").upsert({
              client_id: clientData.id,
              step_number: 3,
              step_name: "Welcome Document",
              content: result,
              status: "completado",
            }, { onConflict: "client_id,step_number" });
            await supabase.from("clients").update({ onboarding_step: 3 }).eq("id", clientData.id);
          }
        } catch {}

        // ── Step 6: Close, refresh, show token banner ─────────────────
        setOpen(false);
        load();
        setNewToken({ name: clientData.name, token });
        setCopied(false);
      }
    } catch (err: any) {
      console.error("[save client] error:", err);
      setSaveError(err.message || "Error al guardar el cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnectMeta(clientId: string) {
    if (!confirm('¿Desconectar Meta Ads de este cliente?')) return;
    const supabase = createClient();
    await supabase.from('clients').update({
      meta_access_token: null, meta_ad_account_id: null, meta_page_id: null,
      meta_user_id: null, meta_connected: false, meta_token_expires_at: null,
    }).eq('id', clientId);
    load();
  }

  async function remove(id: string) {
    setDeleting(id);
    const supabase = createClient();
    try {
      const { error: delError } = await supabase.from("clients").delete().eq("id", id);
      if (delError) throw new Error(delError.message);
      setClients(prev => prev.filter(c => c.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  function copyToken() {
    if (!newToken) return;
    const msg = `Token de acceso al portal XENTTECH:\n\nURL: https://xenttech.com/portal\nToken: ${newToken.token}\n\nIngresa este token en el portal para acceder a tu información de campaña.`;
    navigator.clipboard.writeText(msg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filtered = clients.filter(c =>
    [c.name, c.email, c.company, c.industry].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const activeMRR = clients
    .filter(c => c.status === "active")
    .reduce((s, c) => s + (c.monthly_revenue ?? 0), 0);
  const active = clients.filter(c => c.status === "active").length;

  return (
    <div className="flex flex-col h-full">
      <Header title="Clientes" description="Gestión de clientes de la agencia" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Meta OAuth banners */}
        {metaError && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
            <span className="text-red-400 text-sm font-semibold">Error Meta OAuth:</span>
            <p className="text-sm text-red-300 flex-1">{metaError}</p>
            <button onClick={() => setMetaError(null)} className="text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
          </div>
        )}
        {metaSuccess && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.05] px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" />
            <p className="text-sm text-blue-300 flex-1">{metaSuccess}</p>
          </div>
        )}

        {/* Token banner */}
        {newToken && (
          <div className="relative rounded-xl border border-[#00FF88]/30 bg-[#00FF88]/10 p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 p-2 rounded-lg bg-[#00FF88]/20">
                <Key className="h-5 w-5 text-[#00FF88]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#00FF88] mb-1">
                  Cliente creado — Token de portal generado
                </p>
                <p className="text-xs text-[#A0AEC0] mb-2">
                  Comparte este token con <span className="text-white font-medium">{newToken.name}</span> para que acceda al portal de cliente.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/30 rounded-lg px-3 py-2 text-sm font-mono text-[#00FF88] tracking-widest border border-[#00FF88]/20">
                    {newToken.token}
                  </code>
                  <Button
                    size="sm"
                    onClick={copyToken}
                    className={cn(
                      "shrink-0 gap-1.5 font-semibold transition-all",
                      copied
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : "bg-[#00FF88] text-black hover:bg-[#00FF88]/90"
                    )}
                  >
                    {copied ? (
                      <><CheckCircle2 className="h-3.5 w-3.5" /> Copiado</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copiar mensaje</>
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-[#4A5568] mt-2">
                  URL del portal: https://xenttech.com/portal
                </p>
              </div>
              <button
                onClick={() => setNewToken(null)}
                className="shrink-0 p-1 rounded-lg text-[#4A5568] hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total clientes", value: clients.length, icon: Briefcase, color: "text-[#00FF88]" },
            { label: "Activos",        value: active,         icon: TrendingUp, color: "text-green-400" },
            { label: "MRR activos",    value: `$${activeMRR.toLocaleString()}`, icon: DollarSign, color: "text-neon-cyan" },
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
          <TableSkeleton rows={5} />
        ) : (
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  {["Cliente", "Empresa", "Industria", "Plan", "MRR", "Estado", "Firma", "Meta", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-[#4A5568] uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-[#4A5568]">
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
                      <Badge className={cn("text-[10px] border", STATUS_COLOR[c.status] ?? STATUS_COLOR.prospect)}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {c.contract_signed ? (
                        <div className="flex flex-col gap-1">
                          <Badge className="text-[10px] border bg-green-500/10 text-green-400 border-green-500/20 w-fit">
                            Contrato Firmado
                          </Badge>
                          {c.signed_at && (
                            <span className="text-[10px] text-[#4A5568]">
                              {new Date(c.signed_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          )}
                          {c.signature_data && (
                            <img
                              src={c.signature_data}
                              alt="Firma"
                              className="h-8 w-auto max-w-[80px] rounded border border-white/[0.08] bg-white/5 object-contain"
                            />
                          )}
                        </div>
                      ) : (
                        <Badge className="text-[10px] border bg-yellow-500/10 text-yellow-400 border-yellow-500/20 w-fit">
                          Pendiente de firma
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.meta_connected ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge className="text-[10px] border bg-blue-500/10 text-blue-400 border-blue-500/20 w-fit gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                            Conectado
                          </Badge>
                          {c.meta_ad_account_id && (
                            <span className="text-[10px] text-[#4A5568] font-mono">{c.meta_ad_account_id}</span>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => { window.location.href = `/api/meta-oauth?client_id=${c.id}`; }}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-blue-500/30 text-blue-400 bg-blue-500/[0.08] hover:bg-blue-500/15 transition-colors whitespace-nowrap"
                        >
                          <Link className="h-2.5 w-2.5" /> Conectar
                        </button>
                      )}
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

      {/* Meta account selector modal */}
      {metaSelector && (
        <Dialog open={!!metaSelector} onOpenChange={() => setMetaSelector(null)}>
          <DialogContent className="bg-space-card border-white/[0.08] text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="text-blue-400 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Seleccionar cuenta publicitaria
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {metaSelector.adAccounts.length > 0 && (
                <div>
                  <label className="text-xs text-[#4A5568] mb-1.5 block">Cuenta publicitaria</label>
                  <select
                    value={selAdAccount}
                    onChange={e => setSelAdAccount(e.target.value)}
                    className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500/40"
                  >
                    {metaSelector.adAccounts.map(acc => (
                      <option key={acc.account_id} value={acc.account_id} className="bg-[#0f1117]">
                        {acc.name || acc.business_name || acc.account_id} ({acc.currency})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {metaSelector.pages.length > 0 && (
                <div>
                  <label className="text-xs text-[#4A5568] mb-1.5 block">Página de Facebook</label>
                  <select
                    value={selPage}
                    onChange={e => setSelPage(e.target.value)}
                    className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500/40"
                  >
                    {metaSelector.pages.map(p => (
                      <option key={p.id} value={p.id} className="bg-[#0f1117]">{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMetaSelector(null)} className="text-[#4A5568]">Cancelar</Button>
              <Button
                disabled={savingMeta}
                onClick={async () => {
                  setSavingMeta(true);
                  const supabase = createClient();
                  await supabase.from('clients').update({
                    meta_ad_account_id: selAdAccount || null,
                    meta_page_id: selPage || null,
                  }).eq('id', metaSelector.clientId);
                  setSavingMeta(false);
                  setMetaSelector(null);
                  load();
                }}
                className="bg-[#1877F2] text-white hover:bg-[#1877F2]/90 font-semibold"
              >
                {savingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar selección'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSaveError(null); }}>
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
              <Select value={form.status ?? "prospect"} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-space-card border-white/[0.08]">
                  {[
                    { value: "active",   label: "Activo"    },
                    { value: "inactive", label: "Inactivo"  },
                    { value: "prospect", label: "Prospecto" },
                    { value: "churned",  label: "Churnado"  },
                  ].map(s => (
                    <SelectItem key={s.value} value={s.value} className="text-white hover:bg-white/[0.06]">
                      {s.label}
                    </SelectItem>
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

            {/* Meta Ads — solo al editar */}
            {editing && (
              <div className="col-span-2 space-y-3 pt-3 border-t border-white/[0.06]">
                <p className="text-xs font-semibold text-[#A0AEC0] flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-[#1877F2] flex items-center justify-center shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </span>
                  Meta Ads
                </p>
                {editing.meta_connected ? (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.05] p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                      <span className="text-xs font-semibold text-blue-400">Conectado</span>
                    </div>
                    {editing.meta_ad_account_id && (
                      <p className="text-[11px] text-[#A0AEC0]">
                        Ad Account: <span className="font-mono">{editing.meta_ad_account_id}</span>
                      </p>
                    )}
                    {editing.meta_page_id && (
                      <p className="text-[11px] text-[#A0AEC0]">
                        Page ID: <span className="font-mono">{editing.meta_page_id}</span>
                      </p>
                    )}
                    {editing.meta_token_expires_at && (
                      <p className="text-[11px] text-[#4A5568]">
                        Token expira: {new Date(editing.meta_token_expires_at).toLocaleDateString('es-MX')}
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { window.location.href = `/api/meta-oauth?client_id=${editing.id}`; }}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-white/[0.08] text-[#A0AEC0] hover:text-white hover:bg-white/[0.06] transition-colors"
                      >
                        <Link className="h-3 w-3" /> Reconectar
                      </button>
                      <button
                        onClick={() => disconnectMeta(editing.id)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-red-500/20 text-red-400 bg-red-500/[0.06] hover:bg-red-500/10 transition-colors"
                      >
                        <Link2Off className="h-3 w-3" /> Desconectar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-[#4A5568] mb-2">
                      Conecta la cuenta de Meta Ads del cliente para gestionar sus campañas con su propio token.
                    </p>
                    <button
                      onClick={() => { window.location.href = `/api/meta-oauth?client_id=${editing.id}`; }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1877F2] text-white font-semibold text-sm hover:opacity-90 transition-opacity"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      Conectar con Facebook
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Supabase del cliente — solo al editar */}
            {editing && (
              <div className="col-span-2 space-y-3 pt-3 border-t border-white/[0.06]">
                <p className="text-xs font-semibold text-[#A0AEC0] flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-cyan-400" />
                  Supabase del cliente (chatbot / RAG)
                </p>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-[#4A5568] mb-1 block">URL de Supabase</label>
                    <Input
                      value={sbUrl}
                      onChange={e => setSbUrl(e.target.value)}
                      placeholder="https://xxxxx.supabase.co"
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568] font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#4A5568] mb-1 block">Anon Key</label>
                    <Input
                      value={sbAnonKey}
                      onChange={e => setSbAnonKey(e.target.value)}
                      placeholder="eyJ..."
                      type="password"
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568] font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#4A5568] mb-1 block">Service Role Key</label>
                    <Input
                      value={sbServiceKey}
                      onChange={e => setSbServiceKey(e.target.value)}
                      placeholder="eyJ..."
                      type="password"
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568] font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={testClientSupabase}
                    disabled={!sbUrl || !sbAnonKey || sbStatus === 'testing'}
                    className="h-7 px-3 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/20 gap-1.5"
                  >
                    {sbStatus === 'testing'
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Probando...</>
                      : 'Probar conexión'
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={saveClientSupabase}
                    disabled={!sbUrl || sbSaving}
                    className="h-7 px-3 text-xs text-[#00FF88] hover:text-[#00FF88] hover:bg-[#00FF88]/10 border border-[#00FF88]/20 gap-1.5"
                  >
                    {sbSaving
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</>
                      : 'Guardar credenciales'
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={initClientSupabase}
                    disabled={!sbUrl || !sbServiceKey || sbIniting}
                    className="h-7 px-3 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 border border-purple-500/20 gap-1.5"
                  >
                    {sbIniting
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Inicializando...</>
                      : 'Inicializar RAG'
                    }
                  </Button>
                </div>
                {sbStatusMsg && (
                  <p className={cn("text-xs", sbStatus === 'ok' ? "text-green-400" : sbStatus === 'error' ? "text-red-400" : "text-[#A0AEC0]")}>
                    {sbStatusMsg}
                  </p>
                )}
              </div>
            )}
          </div>
          {saveError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
              {saveError}
            </div>
          )}
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
