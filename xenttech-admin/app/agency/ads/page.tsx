"use client";
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Megaphone, Search, Loader2, Sparkles,
  DollarSign, Copy, CheckCircle2, AlertCircle, RefreshCw, Download,
  ChevronDown, ChevronUp, FileSpreadsheet, Database,
} from "lucide-react";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetaAdAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  business_name?: string;
  account_status?: number;
}

interface MetaPage {
  id: string;
  name: string;
  category?: string;
}

interface MetaExportData {
  campaigns: Record<string, unknown>[];
  adsets: Record<string, unknown>[];
  ads: Record<string, unknown>[];
  insights: Record<string, unknown>[];
  daily: Record<string, unknown>[];
  demographics: Record<string, unknown>[];
  placements: Record<string, unknown>[];
  local_campaigns: Record<string, unknown>[];
  date_range: string;
  exported_at: string;
  account_id: string;
  error?: string;
}

interface Client {
  id: string;
  name: string;
  company: string | null;
  meta_connected?: boolean | null;
  meta_ad_account_id?: string | null;
}

interface Campaign {
  id: string;
  client_id: string;
  platform: string;
  campaign_name: string;
  objective: string | null;
  audience: string | null;
  budget_monthly: number | null;
  status: string;
  meta_campaign_id: string | null;
  ad_copies: Record<string, unknown> | string | null;
  metrics: Record<string, unknown> | null;
  pdf_url?: string | null;
  created_at: string;
  clients?: { name: string; company: string | null };
}

interface ClientDesign {
  id: string;
  design_type: string;
  image_svg: string | null;
  image_url: string | null;
  brief: string | null;
  status: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS = ["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads"] as const;
type Platform = (typeof PLATFORMS)[number];

const OBJECTIVES = [
  "Reconocimiento",
  "Tráfico",
  "Interacción",
  "Clientes potenciales",
  "Ventas",
] as const;

const OBJECTIVE_DESCRIPTIONS: Record<string, string> = {
  "Reconocimiento": "Maximizar alcance y recordación de marca",
  "Tráfico": "Enviar personas a tu sitio web o app",
  "Interacción": "Obtener más interacciones en tus publicaciones",
  "Clientes potenciales": "Capturar datos de contacto de interesados",
  "Ventas": "Generar compras o conversiones en tu sitio",
};

const CTA_OPTIONS = [
  { value: "LEARN_MORE",  label: "Más información" },
  { value: "SHOP_NOW",    label: "Comprar" },
  { value: "SIGN_UP",     label: "Registrarte" },
  { value: "CONTACT_US",  label: "Contactar" },
  { value: "BOOK_NOW",    label: "Reservar" },
  { value: "GET_OFFER",   label: "Obtener oferta" },
  { value: "DOWNLOAD",    label: "Descargar" },
  { value: "APPLY_NOW",   label: "Solicitar" },
];

const GENDER_OPTIONS = ["Todos", "Hombres", "Mujeres"] as const;

const AD_FORMATS = [
  "Single Image",
  "Carousel",
  "Video",
  "Reels",
  "Stories",
] as const;

const AGE_OPTIONS = Array.from({ length: 48 }, (_, i) => i + 18); // 18–65

const STATUS_COLOR: Record<string, string> = {
  draft:     "bg-gray-500/10 text-gray-400 border-gray-500/20",
  active:    "bg-green-500/10 text-green-400 border-green-500/20",
  paused:    "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const PLATFORM_ICON: Record<Platform, string> = {
  "Meta Ads":     "📘",
  "Google Ads":   "🔍",
  "TikTok Ads":   "🎵",
  "LinkedIn Ads": "💼",
};

const BLANK_FORM = {
  client_id:      "",
  campaign_name:  "",
  platform:       "Meta Ads" as Platform,
  objective:      "Reconocimiento",
  audience:       "",
  budget_monthly: "",
  budget_type:    "Mensual",
  status:         "draft",
  // Meta Ads segmentation
  location:       "",
  age_min:        "18",
  age_max:        "45",
  ad_format:      "Single Image",
  interests:      "",
  gender:         "Todos",
  // Creative fields
  website_url:    "",
  cta:            "LEARN_MORE",
  headline:       "",
  primary_text:   "",
  description:    "",
};

const supabase = createClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(val: unknown, type: 'count' | 'money' | 'pct' | 'decimal' = 'count'): string {
  const n = Number(val ?? 0);
  if (isNaN(n)) return '—';
  if (type === 'count')   return n.toLocaleString('es-MX');
  if (type === 'money')   return '$' + n.toFixed(2);
  if (type === 'pct')     return n.toFixed(2) + '%';
  if (type === 'decimal') return n.toFixed(1);
  return String(n);
}

function adCopiesToString(ad_copies: Campaign["ad_copies"]): string {
  if (!ad_copies) return "";
  if (typeof ad_copies === "string") return ad_copies;
  if (typeof (ad_copies as Record<string, unknown>).text === "string") {
    return (ad_copies as { text: string }).text;
  }
  return JSON.stringify(ad_copies, null, 2);
}

function extractFirstCopy(ad_copies: Campaign["ad_copies"]): string {
  const text = adCopiesToString(ad_copies);
  if (!text) return '';
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('**'));
  return lines.slice(0, 2).join(' ').substring(0, 125);
}

// ─── DesignPicker (inline for "add ad to existing campaign") ─────────────────

interface DesignPickerDesign {
  id: string;
  design_type: string;
  image_svg: string | null;
  client_id: string;
}

function DesignPicker({ clientId, onSelect }: { clientId: string; onSelect: (d: DesignPickerDesign) => void }) {
  const [designs, setDesigns] = useState<DesignPickerDesign[]>([]);
  useEffect(() => {
    supabase.from('designs')
      .select('id,design_type,image_svg,client_id')
      .eq('client_id', clientId)
      .not('image_svg', 'is', null)
      .then(({ data }) => setDesigns((data ?? []) as DesignPickerDesign[]));
  }, [clientId]);

  if (!designs.length) {
    return (
      <p className="text-[10px] text-[#64748B] mt-1">
        No hay diseños con SVG para este cliente.{' '}
        <a href="/agency/design" className="text-blue-400 underline">Crear uno</a>
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 mt-2">
      {designs.map(d => (
        <div
          key={d.id}
          onClick={() => onSelect(d)}
          className="border border-white/[0.08] rounded-lg p-1.5 cursor-pointer hover:border-[#00D4AA]/40 transition-colors"
        >
          <div
            className="rounded overflow-hidden"
            style={{ lineHeight: 0 }}
            /* eslint-disable-next-line react/no-danger */
            dangerouslySetInnerHTML={{ __html: d.image_svg ?? '' }}
          />
          <p className="text-[9px] text-[#64748B] mt-1 truncate">{d.design_type}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function AdsPage() {
  const [clients, setClients]         = useState<Client[]>([]);
  const [campaigns, setCampaigns]     = useState<Campaign[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [open, setOpen]               = useState(false);
  const [editing, setEditing]         = useState<Campaign | null>(null);
  const [form, setForm]               = useState<typeof BLANK_FORM>(BLANK_FORM);
  const [saving, setSaving]           = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [adCopies, setAdCopies]       = useState("");
  const [copied, setCopied]           = useState(false);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  // post-save state
  const [savedCampId, setSavedCampId] = useState<string | null>(null);
  const [generatingBriefs, setGeneratingBriefs] = useState(false);
  // card expand state
  const [expanded, setExpanded]       = useState<Record<string, boolean>>({});
  // meta ads publishing
  const [metaPublishing, setMetaPublishing] = useState<Record<string, boolean>>({});
  const [metaResults, setMetaResults]       = useState<Record<string, string>>({});
  const [toggling, setToggling]             = useState<Record<string, boolean>>({});
  const [addingAdForCamp, setAddingAdForCamp] = useState<string | null>(null);
  // meta stats
  const [fetchingStats, setFetchingStats]   = useState<Record<string, boolean>>({});
  const [statsDatePreset, setStatsDatePreset] = useState("last_30d");
  // design picker
  const [clientDesigns, setClientDesigns]   = useState<ClientDesign[]>([]);
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  // designs keyed by id for campaign card previews
  const [campaignDesigns, setCampaignDesigns] = useState<Record<string, { image_svg: string | null; design_type: string; image_url: string | null }>>({});

  // export state
  const [exportRange, setExportRange]   = useState("maximum");
  const [exporting, setExporting]       = useState(false);
  const [syncing, setSyncing]           = useState(false);
  const [syncMsg, setSyncMsg]           = useState<string | null>(null);
  const [exportPreview, setExportPreview] = useState<MetaExportData | null>(null);

  // client filter + meta sync
  const [selectedClientId, setSelectedClientId] = useState("");
  const [syncingCampaigns, setSyncingCampaigns] = useState(false);
  const [refreshing, setRefreshing]             = useState(false);
  const [syncCampMsg, setSyncCampMsg]           = useState<string | null>(null);

  // filters
  const [statusFilter, setStatusFilter] = useState("active");

  // AI analysis
  const [analysis, setAnalysis]   = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  // Reporte IA descargable (legacy last_30d)
  const [generatingReport, setGeneratingReport] = useState(false);

  // Reporte IA ejecutivo
  const [showReportModal, setShowReportModal]   = useState(false);
  const [reportClientId, setReportClientId]     = useState('');
  const [reportPeriodMode, setReportPeriodMode] = useState<'preset' | 'month' | 'range'>('preset');
  const [reportPreset, setReportPreset]         = useState('last_30d');
  const [reportMonth, setReportMonth]           = useState(() => new Date().getMonth() + 1);
  const [reportYear, setReportYear]             = useState(() => new Date().getFullYear());
  // Range defaults: últimos 30 días
  const [reportSince, setReportSince]           = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [reportUntil, setReportUntil]           = useState(() => new Date().toISOString().split('T')[0]);
  const [reportLoading, setReportLoading]       = useState(false);
  const [reportStep, setReportStep]             = useState('');
  const [reportError, setReportError]           = useState('');

  // account picker
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState<MetaAdAccount[]>([]);
  const [availablePages, setAvailablePages]       = useState<MetaPage[]>([]);
  const [loadingAccounts, setLoadingAccounts]     = useState(false);
  const [selAccountId, setSelAccountId]           = useState("");
  const [selPageId, setSelPageId]                 = useState("");
  const [savingAccount, setSavingAccount]         = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setError(null);

    let fromCache = false;
    try {
      const raw = sessionStorage.getItem('xenttech_ads_data');
      if (raw) {
        const { d, ts } = JSON.parse(raw);
        if (Date.now() - ts < 5 * 60_000) {
          setClients(d.clients); setCampaigns(d.campaigns);
          setLoading(false); fromCache = true;
        }
      }
    } catch {}

    if (!fromCache) setLoading(true);
    try {
      const [clientsRes, campaignsRes] = await Promise.all([
        supabase.from("clients").select("id,name,company,meta_connected,meta_ad_account_id").order("name"),
        supabase
          .from("campaigns")
          .select("*, clients(name,company)")
          .order("created_at", { ascending: false }),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      if (campaignsRes.error) throw campaignsRes.error;
      setClients(clientsRes.data ?? []);
      setCampaigns((campaignsRes.data ?? []) as Campaign[]);
      try { sessionStorage.setItem('xenttech_ads_data', JSON.stringify({ d: { clients: clientsRes.data ?? [], campaigns: campaignsRes.data ?? [] }, ts: Date.now() })); } catch {}
    } catch {
      setError("Error de conexión. Verifica tu red y reintenta.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Load available Meta accounts when picker opens
  useEffect(() => {
    if (!showAccountPicker) return;
    const client = clients.find(c => c.id === selectedClientId);
    if (!client?.meta_connected) return;
    setLoadingAccounts(true);
    fetch('/api/meta-ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_accounts', client_id: client.id, payload: {} }),
    })
      .then(r => r.json() as Promise<{ ad_accounts?: MetaAdAccount[]; pages?: MetaPage[] }>)
      .then(data => {
        const accs = data.ad_accounts ?? [];
        const pages = data.pages ?? [];
        setAvailableAccounts(accs);
        setAvailablePages(pages);
        setSelAccountId(accs[0]?.account_id ?? '');
        setSelPageId(pages[0]?.id ?? '');
      })
      .finally(() => setLoadingAccounts(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAccountPicker]);

  // Load design thumbnails for campaign cards
  useEffect(() => {
    const ids = Array.from(new Set(
      campaigns.flatMap(c => {
        const m = (c.metrics ?? {}) as Record<string, unknown>;
        return m.design_id ? [m.design_id as string] : [];
      })
    ));
    if (ids.length === 0) return;
    supabase.from("designs").select("id,image_svg,design_type,image_url").in("id", ids)
      .then(({ data }) => {
        const map: Record<string, { image_svg: string | null; design_type: string; image_url: string | null }> = {};
        for (const d of data ?? []) map[d.id] = d;
        setCampaignDesigns(map);
      });
  }, [campaigns]);

  // ── Dialog helpers ──────────────────────────────────────────────────────────

  // Load designs for design picker when client changes
  useEffect(() => {
    if (!form.client_id) { setClientDesigns([]); setSelectedDesignId(null); return; }
    supabase
      .from("designs")
      .select("id,design_type,image_svg,image_url,brief,status")
      .eq("client_id", form.client_id)
      .not("image_svg", "is", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => setClientDesigns((data ?? []) as ClientDesign[]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.client_id]);

  function openNew() {
    setEditing(null);
    setSavedCampId(null);
    setAdCopies("");
    setSelectedDesignId(null);
    setClientDesigns([]);
    setForm({ ...BLANK_FORM, client_id: clients[0]?.id ?? "" });
    setOpen(true);
  }

  function openEdit(c: Campaign) {
    setEditing(c);
    setSavedCampId(null);
    setSelectedDesignId((c.metrics as Record<string,unknown>)?.design_id as string ?? null);
    const m = (c.metrics ?? {}) as Record<string, unknown>;
    setForm({
      client_id:      c.client_id,
      campaign_name:  c.campaign_name,
      platform:       (c.platform as Platform) ?? "Meta Ads",
      objective:      c.objective ?? "Reconocimiento",
      audience:       c.audience ?? "",
      budget_monthly: c.budget_monthly != null ? String(c.budget_monthly) : "",
      budget_type:    (m.budget_type as string) ?? "Mensual",
      status:         c.status ?? "draft",
      location:       (m.location as string) ?? "",
      age_min:        String((m.age_min as number) ?? 18),
      age_max:        String((m.age_max as number) ?? 45),
      ad_format:      (m.ad_format as string) ?? "Single Image",
      interests:      (m.interests as string) ?? "",
      gender:         (m.gender as string) ?? "Todos",
      website_url:    (m.website_url as string) ?? "",
      cta:            (m.cta as string) ?? "LEARN_MORE",
      headline:       (m.headline as string) ?? "",
      primary_text:   (m.primary_text as string) ?? "",
      description:    (m.description as string) ?? "",
    });
    setAdCopies(adCopiesToString(c.ad_copies));
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setSavedCampId(null);
    setAdCopies("");
  }

  function setField<K extends keyof typeof BLANK_FORM>(key: K, value: (typeof BLANK_FORM)[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  // ── Save campaign ───────────────────────────────────────────────────────────

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const isMetaAds = form.platform === "Meta Ads";

      const payload = {
        client_id:      form.client_id,
        campaign_name:  form.campaign_name,
        platform:       form.platform,
        objective:      form.objective,
        audience:       form.audience || null,
        budget_monthly: form.budget_monthly ? Number(form.budget_monthly) : null,
        status:         form.status,
        ad_copies: adCopies
          ? { text: adCopies, format: isMetaAds ? form.ad_format : null }
          : null,
        metrics: {
          location:     isMetaAds ? (form.location || null) : null,
          age_min:      isMetaAds ? Number(form.age_min) : null,
          age_max:      isMetaAds ? Number(form.age_max) : null,
          interests:    isMetaAds ? (form.interests || null) : null,
          ad_format:    isMetaAds ? form.ad_format : null,
          budget_type:  isMetaAds ? form.budget_type : null,
          gender:       isMetaAds ? form.gender : null,
          website_url:  isMetaAds ? (form.website_url || null) : null,
          cta:          isMetaAds ? form.cta : null,
          headline:     isMetaAds ? (form.headline || null) : null,
          primary_text: isMetaAds ? (form.primary_text || null) : null,
          description:  isMetaAds ? (form.description || null) : null,
          design_id:    selectedDesignId || null,
        },
      };

      if (editing) {
        const { error: err } = await supabase
          .from("campaigns")
          .update(payload)
          .eq("id", editing.id);
        if (err) throw err;

        await supabase.from("activity_log").insert({
          client_id: form.client_id,
          action: `Campaña actualizada: ${form.campaign_name}`,
          details: form.platform,
        });

        closeDialog();
        load();
      } else {
        const { data: inserted, error: err } = await supabase
          .from("campaigns")
          .insert(payload)
          .select("id")
          .single();
        if (err) throw err;

        const newId = inserted?.id ?? null;
        setSavedCampId(newId);

        // Link selected design to this campaign
        if (selectedDesignId && newId) {
          await supabase
            .from("designs")
            .update({ campaign_id: newId, status: "approved" })
            .eq("id", selectedDesignId);
        }

        await supabase.from("activity_log").insert({
          client_id: form.client_id,
          action: `Campaña creada: ${form.campaign_name}`,
          details: form.platform,
        });

        load();
      }
    } catch (e: unknown) {
      setError((e as Error).message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete campaign ─────────────────────────────────────────────────────────

  async function remove(id: string) {
    setDeleting(id);
    try {
      const camp = campaigns.find(c => c.id === id);
      const { error: err } = await supabase.from("campaigns").delete().eq("id", id);
      if (err) throw err;
      if (camp) {
        await supabase.from("activity_log").insert({
          client_id: camp.client_id,
          action: `Campaña eliminada: ${camp.campaign_name}`,
          details: camp.platform,
        });
      }
      setCampaigns(prev => prev.filter(c => c.id !== id));
    } catch (e: unknown) {
      setError((e as Error).message ?? "Error al eliminar");
    } finally {
      setDeleting(null);
    }
  }

  // ── Generate ad copies ──────────────────────────────────────────────────────

  async function generateAdCopies() {
    const client = clients.find(c => c.id === form.client_id);
    if (!client || !form.campaign_name) return;
    setGenerating(true);
    setError(null);
    try {
      const isMetaAds = form.platform === "Meta Ads";

      const prompt = `Eres un experto en publicidad digital y copywriting. Crea 3 variaciones de anuncio para ${form.platform} con los siguientes datos:

Cliente: ${client.name}${client.company ? ` (${client.company})` : ""}
Campaña: ${form.campaign_name}
Objetivo: ${form.objective}
Audiencia: ${form.audience || "por definir"}
Presupuesto mensual: ${form.budget_monthly ? `$${form.budget_monthly} USD/mes` : "por definir"}${
  isMetaAds
    ? `
Ubicación: ${form.location || "Colombia"}
Rango de edad: ${form.age_min}–${form.age_max} años
Formato del anuncio: ${form.ad_format}
Intereses: ${form.interests || "por definir"}`
    : ""
}

Genera exactamente 3 variaciones con el siguiente formato. Respeta los límites de caracteres de Meta Ads y escribe en español. Sé creativo, persuasivo y orientado a conversión.

VARIACIÓN 1:
HEADLINE (máx 40 caracteres): [texto]
PRIMARY TEXT (máx 125 caracteres): [texto]
DESCRIPTION (máx 30 caracteres): [texto]
CTA: [texto]
COPY LARGO: [párrafo extenso de 3-5 líneas con el mensaje completo del anuncio]
DESCRIPCIÓN VISUAL: [descripción detallada de qué debe mostrar la imagen o video]
SEGMENTACIÓN SUGERIDA: [segmentos de audiencia recomendados en Meta Ads]

VARIACIÓN 2:
HEADLINE (máx 40 caracteres): [texto]
PRIMARY TEXT (máx 125 caracteres): [texto]
DESCRIPTION (máx 30 caracteres): [texto]
CTA: [texto]
COPY LARGO: [párrafo extenso de 3-5 líneas con el mensaje completo del anuncio]
DESCRIPCIÓN VISUAL: [descripción detallada de qué debe mostrar la imagen o video]
SEGMENTACIÓN SUGERIDA: [segmentos de audiencia recomendados en Meta Ads]

VARIACIÓN 3:
HEADLINE (máx 40 caracteres): [texto]
PRIMARY TEXT (máx 125 caracteres): [texto]
DESCRIPTION (máx 30 caracteres): [texto]
CTA: [texto]
COPY LARGO: [párrafo extenso de 3-5 líneas con el mensaje completo del anuncio]
DESCRIPCIÓN VISUAL: [descripción detallada de qué debe mostrar la imagen o video]
SEGMENTACIÓN SUGERIDA: [segmentos de audiencia recomendados en Meta Ads]`;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((body.error as string) ?? `Error ${res.status}`);
      }

      const { result } = (await res.json()) as { result: string };
      setAdCopies(result);

      await supabase.from("activity_log").insert({
        client_id: form.client_id,
        action: `Copies generados para: ${form.campaign_name}`,
        details: form.platform,
      });
    } catch (e: unknown) {
      setError((e as Error).message ?? "Error al generar copies");
    } finally {
      setGenerating(false);
    }
  }

  // ── Create design briefs ────────────────────────────────────────────────────

  async function createDesignBriefs() {
    if (!savedCampId || !adCopies) return;
    setGeneratingBriefs(true);
    setError(null);
    try {
      // Split on variation markers
      const splitRegex = /VARIACIÓN\s+[123]:/;
      const parts = adCopies.split(splitRegex);
      // parts[0] is text before first marker (may be empty); parts[1..3] are variation bodies
      const variations = parts.slice(1, 4);

      const designType = (form.ad_format || "Single Image")
        .toLowerCase()
        .replace(/\s+/g, "_");

      const rows = variations.map((text, idx) => ({
        client_id:   form.client_id,
        campaign_id: savedCampId,
        design_type: designType,
        brief: `Brief para ${form.campaign_name} — Variación ${idx + 1}:\n\n${text.trim()}`,
        status: "pending",
      }));

      const { error: err } = await supabase.from("designs").insert(rows);
      if (err) throw err;

      // Activity log per brief
      for (let i = 0; i < rows.length; i++) {
        await supabase.from("activity_log").insert({
          client_id: form.client_id,
          action: `Brief de diseño creado: ${designType} Variación ${i + 1}`,
          details: form.campaign_name,
        });
      }

      // Done — close dialog
      closeDialog();
      load();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Error al crear briefs");
    } finally {
      setGeneratingBriefs(false);
    }
  }

  // ── SVG → PNG conversion + Supabase upload for Meta Ads ───────────────────

  async function convertSvgToPngAndUpload(design: { image_svg: string | null; client_id?: string }): Promise<string | null> {
    if (!design?.image_svg) return null;
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      const img = new Image();
      const svgBlob = new Blob([design.image_svg!], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(svgBlob);
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 1080, 1350);
        URL.revokeObjectURL(blobUrl);
        canvas.toBlob(async (pngBlob) => {
          if (!pngBlob) { resolve(null); return; }
          const clientId = design.client_id ?? 'shared';
          const fileName = `${clientId}/ad-png-${Date.now()}.png`;
          const { error } = await supabase.storage
            .from('client-documents')
            .upload(fileName, pngBlob, { contentType: 'image/png', upsert: true });
          if (error) { console.error('PNG upload error:', error); resolve(null); return; }
          const { data: urlData } = supabase.storage
            .from('client-documents')
            .getPublicUrl(fileName);
          resolve(urlData.publicUrl);
        }, 'image/png', 0.95);
      };
      img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
      img.src = blobUrl;
    });
  }

  // ── Publish to Meta Ads ─────────────────────────────────────────────────────

  async function publishToMeta(camp: Campaign) {
    setMetaPublishing(prev => ({ ...prev, [camp.id]: true }));
    setMetaResults(prev => ({ ...prev, [camp.id]: "" }));
    try {
      const m = (camp.metrics ?? {}) as Record<string, unknown>;
      const res = await fetch("/api/meta-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_campaign",
          client_id: camp.client_id,
          payload: {
            campaign_name: camp.campaign_name,
            objective: camp.objective ?? "Tráfico",
            budget_monthly: camp.budget_monthly ?? 600,
            budget_type: m.budget_type ?? "Mensual",
            age_min: m.age_min ?? 25,
            age_max: m.age_max ?? 55,
            location: m.location ?? "",
            interests: m.interests ?? "",
            gender: m.gender ?? "Todos",
          },
        }),
      });
      const data = await res.json() as { success?: boolean; message?: string; campaign_id?: string; adset_id?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error al publicar");

      let updatedMetrics: Record<string, unknown> = { ...m, meta_campaign_id: data.campaign_id, meta_adset_id: data.adset_id };

      // Save campaign/adset IDs immediately so they're not lost if creative fails
      await supabase.from("campaigns").update({ metrics: updatedMetrics }).eq("id", camp.id);

      // Upload creative + create ad if design is linked
      let adCreated = false;
      if (m.design_id && data.adset_id) {
        const { data: design } = await supabase
          .from("designs")
          .select("image_url,image_svg,client_id")
          .eq("id", m.design_id as string)
          .single();
        if (design?.image_svg) {
          // Convert SVG → PNG (Meta doesn't accept SVG)
          const pngUrl = await convertSvgToPngAndUpload({ image_svg: design.image_svg, client_id: camp.client_id });
          if (pngUrl) {
            const creativeRes = await fetch("/api/meta-ads", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "create_ad_with_creative",
                payload: {
                  adset_id: data.adset_id,
                  campaign_name: camp.campaign_name,
                  image_url: pngUrl,
                  headline: (m.headline as string) || camp.campaign_name,
                  primary_text: (m.primary_text as string) || extractFirstCopy(camp.ad_copies),
                  description: (m.description as string) || "",
                  cta: (m.cta as string) || "LEARN_MORE",
                  website_url: (m.website_url as string) || "https://xenttech.com",
                },
              }),
            });
            const creativeData = await creativeRes.json() as { ad_id?: string; creative_id?: string; image_hash?: string; error?: string };
            if (creativeData.ad_id) {
              adCreated = true;
              updatedMetrics = {
                ...updatedMetrics,
                meta_ad_id: creativeData.ad_id,
                meta_creative_id: creativeData.creative_id,
                meta_image_hash: creativeData.image_hash,
                png_url: pngUrl,
              };
            } else if (creativeData.error) {
              console.error('Ad creation error:', creativeData.error);
            }
          }
        }
      }

      await supabase.from("campaigns").update({ metrics: updatedMetrics, status: "active" }).eq("id", camp.id);
      await supabase.from("activity_log").insert({
        client_id: camp.client_id,
        action: `Campaña publicada en Meta Ads: ${camp.campaign_name}`,
        details: `ID: ${data.campaign_id}${adCreated ? ' · Anuncio creado con diseño' : ''}`,
      });
      const resultMsg = adCreated
        ? `Campaña + Anuncio creados en Meta (pausados). ID: ${data.campaign_id}`
        : `Campaña creada en Meta (pausada). ID: ${data.campaign_id}${m.design_id ? ' — Anuncio no creado, agrega el diseño manualmente.' : ''}`;
      setMetaResults(prev => ({ ...prev, [camp.id]: resultMsg }));
      load();
    } catch (e: unknown) {
      setMetaResults(prev => ({ ...prev, [camp.id]: "Error: " + ((e as Error).message ?? "Error desconocido") }));
    } finally {
      setMetaPublishing(prev => ({ ...prev, [camp.id]: false }));
    }
  }

  // ── Toggle Meta campaign ACTIVE / PAUSED ───────────────────────────────────

  async function toggleMetaCampaign(camp: Campaign, newStatus: 'ACTIVE' | 'PAUSED') {
    const m = (camp.metrics ?? {}) as Record<string, unknown>;
    const confirmed = window.confirm(
      newStatus === 'ACTIVE'
        ? '¿Activar esta campaña? Se empezará a gastar presupuesto real en Meta Ads.'
        : '¿Pausar esta campaña en Meta Ads?'
    );
    if (!confirmed) return;
    setToggling(prev => ({ ...prev, [camp.id]: true }));
    try {
      const res = await fetch('/api/meta-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_campaign',
          payload: {
            campaign_id: m.meta_campaign_id,
            adset_id: m.meta_adset_id,
            ad_id: m.meta_ad_id,
            status: newStatus,
          },
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (data.error) throw new Error(data.error);
      const dbStatus = newStatus === 'ACTIVE' ? 'active' : 'paused';
      await supabase.from('campaigns').update({ status: dbStatus }).eq('id', camp.id);
      await supabase.from('activity_log').insert({
        client_id: camp.client_id,
        action: newStatus === 'ACTIVE' ? 'Campaña activada en Meta Ads' : 'Campaña pausada en Meta Ads',
        details: camp.campaign_name,
      });
      load();
    } catch (e: unknown) {
      setMetaResults(prev => ({ ...prev, [camp.id]: 'Error: ' + ((e as Error).message ?? 'Error') }));
    } finally {
      setToggling(prev => ({ ...prev, [camp.id]: false }));
    }
  }

  // ── Fetch Meta Ads stats ────────────────────────────────────────────────────

  async function fetchMetaStats(camp: Campaign) {
    const m = (camp.metrics ?? {}) as Record<string, unknown>;
    // Use top-level column first, fall back to JSONB for old records
    const metaCampId = camp.meta_campaign_id || (m.meta_campaign_id as string);
    if (!metaCampId) {
      setError(`Campaña "${camp.campaign_name}" sin ID de Meta. Resincroniza.`);
      return;
    }
    setFetchingStats(prev => ({ ...prev, [camp.id]: true }));
    try {
      const res = await fetch("/api/meta-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_stats",
          client_id: camp.client_id,
          payload: { campaign_id: metaCampId, date_preset: statsDatePreset },
        }),
      });
      const data = await res.json() as { success?: boolean; stats?: Record<string, unknown>[]; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.stats && data.stats.length > 0) {
        const raw = data.stats[0];
        type AE = { action_type: string; value: string };
        const actions = (raw.actions as AE[]) ?? [];
        const cpa     = (raw.cost_per_action_type as AE[]) ?? [];
        const msgA    = actions.find(a => a.action_type?.includes('messaging'));
        const msgC    = cpa.find(a => a.action_type?.includes('messaging'));
        const parsed  = {
          ...raw,
          results_count:    Number(actions[0]?.value  ?? 0),
          results_type:     actions[0]?.action_type   ?? '',
          messages_count:   Number(msgA?.value ?? 0),
          cost_per_result:  Number(cpa[0]?.value      ?? 0),
          cost_per_message: Number(msgC?.value ?? 0),
        };
        const updatedMetrics = {
          ...m,
          meta_campaign_id: metaCampId,
          last_stats: parsed,
          stats_updated_at: new Date().toISOString(),
          date_range: statsDatePreset,
        };
        await supabase.from("campaigns").update({
          meta_campaign_id: metaCampId,
          metrics: updatedMetrics,
        }).eq("id", camp.id);
        load();
      }
    } catch (e: unknown) {
      setError((e as Error).message ?? "Error al obtener estadísticas");
    } finally {
      setFetchingStats(prev => ({ ...prev, [camp.id]: false }));
    }
  }

  // ── Sync client's Meta campaigns into local DB ──────────────────────────────

  async function syncClientCampaigns(client: Client) {
    if (!client.meta_connected) {
      setError('Este cliente no tiene Meta Ads conectado. Conéctalo primero desde Clientes.');
      return;
    }
    setSyncingCampaigns(true);
    setSyncCampMsg(null);
    try {
      const res = await fetch('/api/meta-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_all_campaigns',
          client_id: client.id,
          payload: {},
        }),
      });
      const data = await res.json() as { success?: boolean; synced?: number; total_in_meta?: number; error?: string };
      if (data.error) throw new Error(data.error);
      setSyncCampMsg(`✓ ${data.synced} campañas sincronizadas (${data.total_in_meta} en Meta)`);
      load();
    } catch (e: unknown) {
      setSyncCampMsg('Error: ' + ((e as Error).message ?? 'desconocido'));
    } finally {
      setSyncingCampaigns(false);
    }
  }

  // ── Refresh stats for all linked campaigns ───────────────────────────────────

  async function refreshAllStats() {
    setRefreshing(true);
    setSyncCampMsg(null);
    const withMeta = campaigns.filter(c => {
      const m = (c.metrics ?? {}) as Record<string, unknown>;
      const id = c.meta_campaign_id || m.meta_campaign_id;
      return id && (selectedClientId ? c.client_id === selectedClientId : true);
    });
    let updated = 0;
    for (const camp of withMeta) {
      try {
        const m = (camp.metrics ?? {}) as Record<string, unknown>;
        const metaId = camp.meta_campaign_id || (m.meta_campaign_id as string);
        const res = await fetch('/api/meta-ads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_stats',
            client_id: camp.client_id,
            payload: { campaign_id: metaId, date_preset: 'maximum' },
          }),
        });
        const data = await res.json() as { stats?: Record<string, unknown>[]; error?: string };
        if (data.stats?.length) {
          await supabase.from('campaigns').update({
            metrics: { ...m, last_stats: data.stats[0], stats_updated_at: new Date().toISOString() },
          }).eq('id', camp.id);
          updated++;
        }
      } catch {}
    }
    setSyncCampMsg(`✓ Estadísticas actualizadas: ${updated}/${withMeta.length} campañas`);
    load();
    setRefreshing(false);
  }

  // ── Meta Ads export helpers ─────────────────────────────────────────────────

  function exportToExcel(data: MetaExportData, clientName?: string) {
    const wb    = XLSX.utils.book_new();
    const date  = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    const iRows = data.insights as Record<string, unknown>[];
    const lRows = data.local_campaigns as Record<string, unknown>[];

    // ── Sheet 1: Resumen ejecutivo ────────────────────────────────────
    const totalSpend    = iRows.reduce((s, i) => s + parseFloat(String(i.spend  ?? 0)), 0);
    const totalImpr     = iRows.reduce((s, i) => s + parseInt(String(i.impressions ?? 0)), 0);
    const totalClicks   = iRows.reduce((s, i) => s + parseInt(String(i.clicks ?? 0)), 0);
    const totalReach    = iRows.reduce((s, i) => s + parseInt(String(i.reach  ?? 0)), 0);
    const ws1 = XLSX.utils.aoa_to_sheet([
      [`REPORTE DE CAMPAÑAS META ADS — ${clientName || 'XENTTECH'}`],
      [`Generado: ${date}   |   Período: ${data.date_range}`],
      [],
      ['RESUMEN EJECUTIVO'],
      ['Métrica', 'Valor'],
      ['Total campañas',       data.campaigns?.length ?? lRows.length],
      ['Campañas activas',     (data.campaigns as Record<string,unknown>[]).filter(c => String(c.status).toUpperCase() === 'ACTIVE').length || lRows.filter(c => c.status === 'active').length],
      ['Total invertido MXN',  `$${totalSpend.toFixed(2)}`],
      ['Total impresiones',    totalImpr.toLocaleString()],
      ['Total clicks',         totalClicks.toLocaleString()],
      ['Total alcance',        totalReach.toLocaleString()],
      ['CTR promedio',         totalImpr > 0 ? `${(totalClicks / totalImpr * 100).toFixed(2)}%` : '—'],
      ['CPC promedio',         totalClicks > 0 ? `$${(totalSpend / totalClicks).toFixed(2)}` : '—'],
    ]);
    ws1['!cols'] = [{ wch: 28 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

    // ── Sheet 2: Campañas detalle ─────────────────────────────────────
    const campH = ['Campaña', 'Estado', 'Objetivo', 'Presupuesto Diario', 'Impresiones', 'Alcance', 'Clicks', 'CTR %', 'CPC', 'CPM', 'Gastado MXN', 'Frecuencia', 'Resultados', 'Costo/Resultado', 'Mensajes', 'Costo/Mensaje'];
    const campR = iRows.map(i => {
      type AE = { action_type: string; value: string };
      const acts = (i.actions as AE[]) ?? [];
      const cpa  = (i.cost_per_action_type as AE[]) ?? [];
      return [
        i.campaign_name, i.campaign_status ?? '', i.objective ?? '',
        '',
        parseInt(String(i.impressions ?? 0)),
        parseInt(String(i.reach       ?? 0)),
        parseInt(String(i.clicks      ?? 0)),
        parseFloat(String(i.ctr       ?? 0)).toFixed(2),
        parseFloat(String(i.cpc       ?? 0)).toFixed(2),
        parseFloat(String(i.cpm       ?? 0)).toFixed(2),
        parseFloat(String(i.spend     ?? 0)).toFixed(2),
        parseFloat(String(i.frequency ?? 0)).toFixed(1),
        acts[0]?.value ?? 0,
        cpa[0]?.value  ?? 0,
        acts.find(a => a.action_type?.includes('messaging'))?.value ?? 0,
        cpa.find(a  => a.action_type?.includes('messaging'))?.value ?? 0,
      ];
    });
    // Fallback: local DB campaigns if no Meta API data
    if (!campR.length && lRows.length) {
      lRows.forEach(c => {
        const s = (((c.metrics ?? {}) as Record<string,unknown>).last_stats ?? {}) as Record<string,unknown>;
        campR.push([c.campaign_name, c.status, c.objective ?? '', c.budget_monthly ?? '',
          s.impressions ?? 0, s.reach ?? 0, s.clicks ?? 0,
          s.ctr ?? 0, s.cpc ?? 0, s.cpm ?? 0, s.spend ?? 0, s.frequency ?? 0,
          s.results_count ?? 0, s.cost_per_result ?? 0, s.messages_count ?? 0, s.cost_per_message ?? 0,
        ]);
      });
    }
    const ws2 = XLSX.utils.aoa_to_sheet([campH, ...campR]);
    ws2['!cols'] = [{ wch: 40 }, ...campH.slice(1).map(() => ({ wch: 16 }))];
    XLSX.utils.book_append_sheet(wb, ws2, 'Campañas');

    // ── Sheet 3: Diario ───────────────────────────────────────────────
    if (data.daily?.length) {
      const dH = ['Fecha', 'Campaña', 'Impresiones', 'Clicks', 'CTR %', 'CPC', 'Gastado MXN', 'Alcance'];
      const dR = (data.daily as Record<string, unknown>[]).map(d => [
        d.date_start, d.campaign_name,
        parseInt(String(d.impressions ?? 0)), parseInt(String(d.clicks ?? 0)),
        parseFloat(String(d.ctr ?? 0)).toFixed(2), parseFloat(String(d.cpc ?? 0)).toFixed(2),
        parseFloat(String(d.spend ?? 0)).toFixed(2), parseInt(String(d.reach ?? 0)),
      ]);
      const ws3 = XLSX.utils.aoa_to_sheet([dH, ...dR]);
      ws3['!cols'] = [{ wch: 12 }, { wch: 36 }, ...dH.slice(2).map(() => ({ wch: 14 }))];
      XLSX.utils.book_append_sheet(wb, ws3, 'Diario');
    }

    // ── Sheet 4: Demografía ───────────────────────────────────────────
    if (data.demographics?.length) {
      const dmoH = ['Campaña', 'Edad', 'Género', 'Impresiones', 'Clicks', 'CTR %', 'Gastado MXN'];
      const dmoR = (data.demographics as Record<string, unknown>[]).map(d => [
        d.campaign_name, d.age,
        d.gender === 'male' ? 'Hombre' : d.gender === 'female' ? 'Mujer' : String(d.gender ?? ''),
        parseInt(String(d.impressions ?? 0)), parseInt(String(d.clicks ?? 0)),
        parseFloat(String(d.ctr ?? 0)).toFixed(2), parseFloat(String(d.spend ?? 0)).toFixed(2),
      ]);
      const ws4 = XLSX.utils.aoa_to_sheet([dmoH, ...dmoR]);
      ws4['!cols'] = [{ wch: 36 }, { wch: 10 }, { wch: 10 }, ...dmoH.slice(3).map(() => ({ wch: 14 }))];
      XLSX.utils.book_append_sheet(wb, ws4, 'Demografía');
    }

    // ── Sheet 5: Ubicaciones ──────────────────────────────────────────
    if (data.placements?.length) {
      const pH = ['Campaña', 'Plataforma', 'Ubicación', 'Impresiones', 'Clicks', 'CTR %', 'Gastado MXN'];
      const pR = (data.placements as Record<string, unknown>[]).map(p => [
        p.campaign_name, p.publisher_platform, p.platform_position,
        parseInt(String(p.impressions ?? 0)), parseInt(String(p.clicks ?? 0)),
        parseFloat(String(p.ctr ?? 0)).toFixed(2), parseFloat(String(p.spend ?? 0)).toFixed(2),
      ]);
      const ws5 = XLSX.utils.aoa_to_sheet([pH, ...pR]);
      ws5['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 18 }, ...pH.slice(3).map(() => ({ wch: 14 }))];
      XLSX.utils.book_append_sheet(wb, ws5, 'Ubicaciones');
    }

    const fileName = `XENTTECH-${clientName || 'MetaAds'}-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  function exportToCSV(data: MetaExportData) {
    const rows = (data.insights ?? []) as Record<string, unknown>[];
    if (!rows.length) { alert('Sin datos de rendimiento para exportar'); return; }
    const ws = XLSX.utils.json_to_sheet(rows.map(i => ({
      campaña: i.campaign_name, conjunto: i.adset_name, anuncio: i.ad_name,
      impresiones: i.impressions, alcance: i.reach, clicks: i.clicks,
      ctr: i.ctr, cpc: i.cpc, cpm: i.cpm, gastado: i.spend, frecuencia: i.frequency,
      inicio: i.date_start, fin: i.date_stop,
    })));
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `XENTTECH-Meta-Ads-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function syncMetaToDb(data: MetaExportData) {
    setSyncing(true); setSyncMsg(null);
    const supabase = createClient();
    let updated = 0, created = 0;
    try {
      const { data: localCamps } = await supabase.from('campaigns').select('id,metrics');
      const local = localCamps ?? [];

      for (const insight of (data.insights ?? []) as Record<string, unknown>[]) {
        const match = local.find(c => {
          const m = (c.metrics ?? {}) as Record<string, unknown>;
          return m.meta_campaign_id === insight.campaign_id;
        });
        if (match) {
          const existing = (match.metrics ?? {}) as Record<string, unknown>;
          await supabase.from('campaigns').update({
            metrics: {
              ...existing,
              last_stats: {
                impressions: insight.impressions, clicks: insight.clicks,
                spend: insight.spend, cpc: insight.cpc, cpm: insight.cpm,
                ctr: insight.ctr, reach: insight.reach, frequency: insight.frequency,
              },
              stats_updated_at: new Date().toISOString(),
              date_range: data.date_range,
            }
          }).eq('id', match.id);
          updated++;
        }
      }

      for (const camp of (data.campaigns ?? []) as Record<string, unknown>[]) {
        const exists = local.some(c => {
          const m = (c.metrics ?? {}) as Record<string, unknown>;
          return m.meta_campaign_id === camp.id;
        });
        if (!exists) {
          const { data: firstClient } = await supabase.from('clients').select('id').limit(1).single();
          if (firstClient) {
            await supabase.from('campaigns').insert({
              client_id: firstClient.id,
              campaign_name: camp.name,
              platform: 'Meta Ads',
              objective: camp.objective as string,
              status: (camp.status as string).toLowerCase(),
              budget_monthly: camp.daily_budget ? Math.round(parseInt(camp.daily_budget as string) / 100 * 30) : 0,
              metrics: { meta_campaign_id: camp.id },
            });
            created++;
          }
        }
      }

      setSyncMsg(`✓ ${updated} campañas actualizadas${created ? `, ${created} creadas` : ''}`);
      load();
    } catch (e: unknown) {
      setSyncMsg('Error: ' + ((e as Error).message ?? 'desconocido'));
    } finally {
      setSyncing(false);
    }
  }

  async function fetchAndExport(action: 'excel' | 'csv' | 'sync') {
    if (action !== 'sync' && !selectedClientId) {
      alert('Selecciona un cliente primero para exportar sus datos.');
      return;
    }
    if (action !== 'sync') setExporting(true); else setSyncing(true);
    setSyncMsg(null);
    try {
      const exportUrl = `/api/meta-ads-export?date_preset=${exportRange}${selectedClientId ? `&client_id=${selectedClientId}` : ''}`;
      const res = await fetch(exportUrl);
      const data = await res.json() as MetaExportData;
      if (data.error) throw new Error(data.error);
      setExportPreview(data);
      const clientName = selectedClient?.name ?? '';
      if (action === 'excel') exportToExcel(data, clientName);
      else if (action === 'csv') exportToCSV(data);
      else await syncMetaToDb(data);
    } catch (e: unknown) {
      const msg = (e as Error).message ?? 'Error';
      if (action === 'sync') setSyncMsg('Error: ' + msg); else alert('Error: ' + msg);
    } finally {
      if (action !== 'sync') setExporting(false);
    }
  }

  // ── Download campaign PDF report ────────────────────────────────────────────

  function downloadCampaignReport(camp: Campaign) {
    const m = (camp.metrics ?? {}) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsPDFLib = (window as any).jspdf?.jsPDF || (window as any).jsPDF;
    if (!jsPDFLib) { alert("Recarga la página e intenta de nuevo"); return; }
    const doc = new jsPDFLib("p", "mm", "letter");
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight(), mg = 20;
    let y = mg;
    doc.setFontSize(18); doc.setTextColor(0, 230, 122);
    doc.text("XENTTECH", mg, y); y += 3;
    doc.setDrawColor(0, 230, 122); doc.setLineWidth(0.5); doc.line(mg, y, pw - mg, y); y += 10;
    doc.setFontSize(14); doc.setTextColor(0, 0, 0); doc.text("REPORTE DE CAMPAÑA", pw / 2, y, { align: "center" }); y += 10;
    doc.setFontSize(10); doc.setTextColor(50, 50, 50);
    doc.text(`Campaña: ${camp.campaign_name}`, mg, y); y += 6;
    doc.text(`Plataforma: ${camp.platform}`, mg, y); y += 6;
    doc.text(`Objetivo: ${camp.objective ?? "—"}`, mg, y); y += 6;
    doc.text(`Presupuesto: $${Number(camp.budget_monthly ?? 0).toLocaleString()} MXN/mes`, mg, y); y += 6;
    if (camp.audience) { doc.text(`Audiencia: ${camp.audience.slice(0, 80)}`, mg, y); y += 6; }
    y += 4;
    const s = m.last_stats as Record<string, unknown> | undefined;
    if (s) {
      doc.setFontSize(12); doc.setTextColor(0, 0, 0); doc.text("MÉTRICAS DE RENDIMIENTO", mg, y); y += 8;
      doc.setFontSize(10); doc.setTextColor(50, 50, 50);
      const rows: [string, string][] = [
        ["Impresiones", Number(s.impressions ?? 0).toLocaleString()],
        ["Alcance",     Number(s.reach ?? 0).toLocaleString()],
        ["Clicks",      Number(s.clicks ?? 0).toLocaleString()],
        ["CTR",         `${String(s.ctr ?? "0")}%`],
        ["CPC",         `$${Number(s.cpc ?? 0).toFixed(2)}`],
        ["CPM",         `$${Number(s.cpm ?? 0).toFixed(2)}`],
        ["Gastado MXN", `$${Number(s.spend ?? 0).toFixed(2)}`],
        ["Frecuencia",  Number(s.frequency ?? 0).toFixed(1)],
      ];
      rows.forEach(([label, val]) => { doc.text(`${label}: ${val}`, mg, y); y += 6; });
      y += 4;
    }
    const copyText = adCopiesToString(camp.ad_copies);
    if (copyText) {
      doc.setFontSize(12); doc.setTextColor(0, 0, 0); doc.text("COPIES DEL ANUNCIO", mg, y); y += 8;
      doc.setFontSize(9); doc.setTextColor(80, 80, 80);
      const lines = doc.splitTextToSize(copyText.slice(0, 3000), pw - mg * 2) as string[];
      lines.forEach((line) => { if (y > ph - 30) { doc.addPage(); y = mg; } doc.text(line, mg, y); y += 4.5; });
    }
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text("XENTTECH — Reporte Confidencial — " + new Date().toLocaleDateString("es-MX"), pw / 2, ph - 10, { align: "center" });
    doc.save(`XENTTECH-${(camp.campaign_name ?? "campaña").replace(/\s+/g, "-")}.pdf`);
  }

  // ── AI Campaign Analysis ────────────────────────────────────────────────────

  async function analyzeCampaigns() {
    const toAnalyze = filtered.length > 0 ? filtered : clientFiltered;
    if (!toAnalyze.length) { setError('No hay campañas para analizar.'); return; }
    setAnalyzing(true);
    setAnalysis("");
    try {
      const summary = toAnalyze.map(c => {
        const m = (c.metrics ?? {}) as Record<string, unknown>;
        const s = (m.last_stats ?? {}) as Record<string, unknown>;
        return {
          nombre: c.campaign_name,
          objetivo: c.objective,
          estado: c.status,
          presupuesto_mes: c.budget_monthly,
          impresiones: s.impressions, alcance: s.reach, clicks: s.clicks,
          ctr: s.ctr, cpc: s.cpc, gastado: s.spend,
          resultados: s.results_count, mensajes: s.messages_count,
          costo_por_resultado: s.cost_per_result, costo_por_mensaje: s.cost_per_message,
        };
      });
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Analiza estas campañas de Meta Ads y da recomendaciones concretas.\n\nCAMPAÑAS:\n${JSON.stringify(summary, null, 2)}\n\nANALIZA:\n1. RESUMEN GENERAL: rendimiento global, presupuesto total invertido, ROI estimado\n2. MEJORES CAMPAÑAS: cuáles tienen mejor CTR, menor CPC, más resultados\n3. PEORES CAMPAÑAS: cuáles desperdician presupuesto y por qué\n4. RECOMENDACIONES: acciones específicas (pausar X, escalar Y, cambiar audiencia de Z)\n5. OPORTUNIDADES: qué campañas escalar, qué nuevas campañas crear\n\nRespuesta en español, directa y accionable. Texto corrido profesional sin markdown.`,
        }),
      });
      const data = await res.json() as { result?: string };
      setAnalysis(data.result ?? '');
    } catch (e: unknown) {
      setError('Error analizando: ' + ((e as Error).message ?? ''));
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Reporte IA descargable (campañas con gasto real) ────────────────────────

  async function handleDownloadReport() {
    if (!selectedClientId) { alert('Selecciona un cliente primero.'); return; }
    setGeneratingReport(true);
    try {
      const res = await fetch('/api/meta-ads/active-report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ client_id: selectedClientId, period: 'last_30d' }),
      });
      const data = await res.json() as {
        error?: string;
        analysis?: string;
        campaigns?: Record<string, unknown>[];
        client?: { name: string };
        period?: string;
        totalSpend?: string;
        totalReach?: number;
        avgCTR?: string;
        activeSinceGasto?: number;
        activeSinGasto?: number;
      };
      if (data.error && !data.analysis) { alert('Error: ' + data.error); return; }
      downloadReportPDF(data);
    } catch (e: unknown) {
      alert('Error al generar el reporte: ' + ((e as Error).message ?? ''));
    } finally {
      setGeneratingReport(false);
    }
  }

  function downloadReportPDF(reportData: {
    analysis?: string;
    campaigns?: Record<string, unknown>[];
    client?: { name: string };
    period?: string;
    totalSpend?: string;
    totalReach?: number;
    avgCTR?: string;
    activeSinceGasto?: number;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsPDFLib = (window as any).jspdf?.jsPDF || (window as any).jsPDF;
    if (!jsPDFLib) { alert('Recarga la página e intenta de nuevo'); return; }

    const doc      = new jsPDFLib('p', 'mm', 'letter');
    const pw       = doc.internal.pageSize.getWidth() as number;
    const ph       = doc.internal.pageSize.getHeight() as number;
    const mg       = 18;
    let y          = 0;

    // ── Header ──
    doc.setFillColor(13, 13, 31);
    doc.rect(0, 0, pw, 38, 'F');
    doc.setFontSize(22); doc.setTextColor(0, 212, 170);
    doc.text('XENTTECH', mg, 18);
    doc.setFontSize(11); doc.setTextColor(200, 200, 200);
    doc.text('Reporte de Meta Ads — Campañas con Gasto Real', mg, 27);
    doc.setFontSize(9); doc.setTextColor(100, 180, 160);
    doc.text(new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }), pw - mg, 18, { align: 'right' });
    doc.text(reportData.client?.name ?? '', pw - mg, 27, { align: 'right' });
    y = 46;

    // ── KPI cards ──
    doc.setFontSize(12); doc.setTextColor(0, 0, 0);
    doc.text('Resumen del período (últimos 30 días)', mg, y); y += 6;
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(mg, y, pw - mg, y); y += 6;

    const kpis = [
      { label: 'Gasto total',        value: `$${reportData.totalSpend ?? '0'} MXN` },
      { label: 'Alcance total',       value: (reportData.totalReach ?? 0).toLocaleString('es-MX') + ' personas' },
      { label: 'Campañas con gasto',  value: String(reportData.activeSinceGasto ?? reportData.campaigns?.length ?? 0) },
      { label: 'CTR promedio',        value: `${reportData.avgCTR ?? '0'}%` },
    ];
    kpis.forEach((kpi, i) => {
      const x = mg + (i % 2) * 90;
      if (i % 2 === 0 && i > 0) y += 14;
      doc.setFontSize(8); doc.setTextColor(100, 100, 100);
      doc.text(kpi.label, x, y);
      doc.setFontSize(14); doc.setTextColor(0, 0, 0);
      doc.text(kpi.value, x, y + 7);
    });
    y += 20;

    // ── Tabla de campañas ──
    if (reportData.campaigns?.length) {
      doc.setFontSize(12); doc.setTextColor(0, 0, 0);
      doc.text('Campañas activas con gasto real', mg, y); y += 6;
      doc.line(mg, y, pw - mg, y); y += 5;

      const headers = ['Campaña', 'Gasto', 'Alcance', 'CTR', 'CPC'];
      const colX    = [mg, mg + 72, mg + 102, mg + 128, mg + 152];
      doc.setFontSize(8); doc.setTextColor(80, 80, 80);
      headers.forEach((h, i) => doc.text(h, colX[i], y));
      y += 4; doc.line(mg, y, pw - mg, y); y += 4;

      doc.setFontSize(8.5); doc.setTextColor(30, 30, 30);
      (reportData.campaigns as Array<Record<string, unknown>>).forEach(c => {
        if (y > ph - 40) { doc.addPage(); y = mg; }
        const ins = (c.insights as Record<string, unknown> | undefined)?.data as Array<Record<string, string>> | undefined;
        const d   = ins?.[0];
        const spend = d ? `$${parseFloat(d.spend).toFixed(2)}` : '$0';
        const reach = d ? parseInt(d.reach, 10).toLocaleString('es-MX') : '0';
        const ctr   = d ? `${parseFloat(d.ctr).toFixed(2)}%` : '0%';
        const cpc   = d ? `$${parseFloat(d.cpc ?? '0').toFixed(2)}` : '$0';

        const nameLines = doc.splitTextToSize(String(c.name ?? ''), 68) as string[];
        doc.text(nameLines[0], colX[0], y);
        doc.text(spend, colX[1], y);
        doc.text(reach, colX[2], y);

        // Colorear CTR
        const ctrVal = d ? parseFloat(d.ctr) : 0;
        doc.setTextColor(ctrVal >= 3 ? 0 : ctrVal >= 1 ? 180 : 200, ctrVal >= 3 ? 160 : ctrVal >= 1 ? 130 : 50, ctrVal >= 3 ? 100 : 0);
        doc.text(ctr, colX[3], y);
        doc.setTextColor(30, 30, 30);
        doc.text(cpc, colX[4], y);
        y += 6;
      });
      y += 4;
    }

    // ── Análisis de Claude ──
    if (reportData.analysis) {
      if (y > ph - 60) { doc.addPage(); y = mg; }
      doc.setFontSize(12); doc.setTextColor(0, 0, 0);
      doc.text('Análisis IA — Diagnóstico y Recomendaciones', mg, y); y += 6;
      doc.line(mg, y, pw - mg, y); y += 5;
      doc.setFontSize(9); doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(reportData.analysis, pw - mg * 2) as string[];
      lines.forEach((line: string) => {
        if (y > ph - 20) { doc.addPage(); y = mg; }
        doc.text(line, mg, y); y += 4.5;
      });
    }

    // ── Footer ──
    const pageCount = (doc.internal as { getNumberOfPages: () => number }).getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFontSize(7); doc.setTextColor(160, 160, 160);
      doc.text(`XENTTECH — Reporte Confidencial — ${new Date().toLocaleDateString('es-MX')} — Página ${p} de ${pageCount}`, pw / 2, ph - 8, { align: 'center' });
    }

    const clientSlug = (reportData.client?.name ?? 'cliente').replace(/\s+/g, '-').toLowerCase();
    doc.save(`XENTTECH-reporte-meta-ads-${clientSlug}-${new Date().toISOString().split('T')[0]}.pdf`);
  }

  // ── Reporte ejecutivo con mes/año (nuevo endpoint) ─────────────────────────

  async function handleGenerateReport() {
    if (!reportClientId) { setReportError('Selecciona un cliente antes de generar el reporte.'); return; }
    setReportLoading(true);
    setReportError('');
    setReportStep('🔍 Obteniendo campañas de Meta...');
    try {
      const body: Record<string, unknown> = { client_id: reportClientId };
      if (reportPeriodMode === 'preset') {
        body.date_preset = reportPreset;
      } else if (reportPeriodMode === 'range') {
        if (!reportSince || !reportUntil) { setReportError('Ingresa fecha de inicio y fin.'); setReportLoading(false); setReportStep(''); return; }
        body.since = reportSince;
        body.until = reportUntil;
      } else {
        body.month = reportMonth;
        body.year  = reportYear;
      }

      const res = await fetch('/api/meta-ads/report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json() as {
        error?:     string;
        client?:    { id: string; name: string };
        period?:    { month: number; year: number; monthName: string; since: string; until: string };
        campaigns?: Record<string, unknown>[];
        totals?:    {
          spend: number; impressions: number; reach: number; clicks: number;
          avgCTR: number; avgCPC: number; avgCPM: number; conversions: number; campaigns: number;
        };
        analysis?:  {
          resumen: string;
          rendimiento_general: string;
          campanas: Array<{ nombre: string; decision: string; razon: string; accion: string; score: number }>;
          observaciones: string[];
          oportunidades: string[];
          proximos_pasos: string[];
          advertencias: string[];
        };
      };

      if (data.error && !data.campaigns?.length) {
        setReportError(data.error);
        setReportLoading(false);
        setReportStep('');
        return;
      }

      setReportStep('🤖 Claude analizando rendimiento...');
      // Claude ya corrió en el servidor — pequeña pausa visual
      await new Promise(r => setTimeout(r, 400));

      setReportStep('📄 Generando PDF visual...');
      await generateReportPDF(data);

      setReportStep('✅ Listo — descargando');
      await new Promise(r => setTimeout(r, 800));
      setShowReportModal(false);
      setReportStep('');
    } catch (e: unknown) {
      setReportError('Error inesperado: ' + ((e as Error).message ?? 'desconocido'));
      setReportStep('');
    } finally {
      setReportLoading(false);
    }
  }

  async function generateReportPDF(reportData: {
    client?:   { id: string; name: string };
    period?:   { month: number; year: number; monthName: string; since: string; until: string };
    campaigns?: Record<string, unknown>[];
    totals?:   {
      spend: number; impressions: number; reach: number; clicks: number;
      avgCTR: number; avgCPC: number; avgCPM: number; conversions: number; campaigns: number;
    };
    analysis?: {
      resumen: string;
      rendimiento_general: string;
      campanas: Array<{ nombre: string; decision: string; razon: string; accion: string; score: number }>;
      observaciones: string[];
      oportunidades: string[];
      proximos_pasos: string[];
      advertencias: string[];
    };
  }) {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF('p', 'mm', 'letter');
    const pw  = doc.internal.pageSize.getWidth();
    const ph  = doc.internal.pageSize.getHeight();
    const mg  = 18;
    let y     = 0;

    const t  = reportData.totals;
    const a  = reportData.analysis;
    const p  = reportData.period;
    const cl = reportData.client;

    const TEAL   = [0,  212, 170] as [number, number, number];
    const DARK   = [13,  13,  31] as [number, number, number];
    const GRAY   = [100, 116, 139] as [number, number, number];

    const DECISION_COLOR: Record<string, [number, number, number]> = {
      escalar:   [0, 200, 100],
      mantener:  [59, 130, 246],
      optimizar: [251, 191, 36],
      pausar:    [239, 68, 68],
    };

    const PERF_LABEL: Record<string, string> = {
      excellent: 'Excelente', good: 'Bueno', average: 'Regular', poor: 'Bajo',
    };
    const PERF_COLOR: Record<string, [number, number, number]> = {
      excellent: [0, 200, 100], good: [59, 130, 246], average: [251, 191, 36], poor: [239, 68, 68],
    };

    function addPage() { doc.addPage(); y = mg; }
    function checkPage(needed = 20) { if (y > ph - needed) addPage(); }

    // ── Header ──────────────────────────────────────────────────────────────────
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pw, 42, 'F');
    doc.setFontSize(24); doc.setTextColor(...TEAL);
    doc.text('XENTTECH', mg, 18);
    doc.setFontSize(10); doc.setTextColor(200, 200, 200);
    doc.text('Reporte Ejecutivo Meta Ads', mg, 27);
    doc.setFontSize(9); doc.setTextColor(...GRAY);
    // monthName ya puede incluir el año (ej "Julio 2026" o "Últimos 30 días")
    const periodLabel = p
      ? (p.since && p.until ? `${p.monthName} · ${p.since} al ${p.until}` : p.monthName ?? '')
      : '';
    doc.text(periodLabel, mg, 35);
    doc.setFontSize(10); doc.setTextColor(...TEAL);
    doc.text(cl?.name ?? '', pw - mg, 22, { align: 'right' });
    doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text(new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }), pw - mg, 31, { align: 'right' });
    y = 52;

    // ── Rendimiento general badge ────────────────────────────────────────────────
    if (a?.rendimiento_general) {
      const perfColor = PERF_COLOR[a.rendimiento_general] ?? PERF_COLOR.average;
      const perfLabel = PERF_LABEL[a.rendimiento_general] ?? a.rendimiento_general;
      doc.setFillColor(...perfColor);
      doc.roundedRect(mg, y - 5, 44, 8, 2, 2, 'F');
      doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
      doc.text(`Rendimiento: ${perfLabel}`, mg + 3, y + 0.5);
      y += 12;
    }

    // ── Resumen ──────────────────────────────────────────────────────────────────
    if (a?.resumen) {
      doc.setFontSize(9); doc.setTextColor(60, 60, 60);
      const lines = doc.splitTextToSize(a.resumen, pw - mg * 2) as string[];
      lines.forEach(l => { checkPage(8); doc.text(l, mg, y); y += 5; });
      y += 3;
    }

    // ── KPI grid (8 metrics) ──────────────────────────────────────────────────────
    doc.setFontSize(11); doc.setTextColor(0, 0, 0);
    doc.text('Métricas del período', mg, y); y += 5;
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(mg, y, pw - mg, y); y += 5;

    if (t) {
      const kpis = [
        { label: 'Gasto total',     value: `$${t.spend.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`,  color: [239, 68,  68]  as [number,number,number] },
        { label: 'Alcance',         value: t.reach.toLocaleString('es-MX') + ' personas',                            color: [59,  130, 246] as [number,number,number] },
        { label: 'Impresiones',     value: t.impressions.toLocaleString('es-MX'),                                     color: [0,   212, 170] as [number,number,number] },
        { label: 'Clicks',          value: t.clicks.toLocaleString('es-MX'),                                          color: [168, 85,  247] as [number,number,number] },
        { label: 'CTR promedio',    value: `${t.avgCTR.toFixed(2)}%`,                                                 color: [34,  197, 94]  as [number,number,number] },
        { label: 'CPC promedio',    value: `$${t.avgCPC.toFixed(2)}`,                                                 color: [234, 179, 8]   as [number,number,number] },
        { label: 'CPM promedio',    value: `$${t.avgCPM.toFixed(2)}`,                                                 color: [249, 115, 22]  as [number,number,number] },
        { label: 'Resultados',       value: String(t.conversions),                                                      color: [20,  184, 166] as [number,number,number] },
      ];
      const cols = 4;
      const cellW = (pw - mg * 2) / cols;
      kpis.forEach((k, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        if (col === 0 && row > 0) y += 18;
        const x = mg + col * cellW;
        doc.setFillColor(248, 248, 252);
        doc.roundedRect(x, y - 4, cellW - 2, 16, 2, 2, 'F');
        doc.setFontSize(7.5); doc.setTextColor(...GRAY);
        doc.text(k.label, x + 3, y + 1);
        doc.setFontSize(13); doc.setTextColor(...k.color);
        doc.text(k.value, x + 3, y + 10);
      });
      y += 24;
    }

    // ── Campaigns table ───────────────────────────────────────────────────────────
    if (reportData.campaigns?.length) {
      checkPage(30);
      doc.setFontSize(11); doc.setTextColor(0, 0, 0);
      doc.text('Campañas con gasto real', mg, y); y += 5;
      doc.line(mg, y, pw - mg, y); y += 5;

      const headers = ['Campaña', 'Gasto', 'Alcance', 'CTR', 'CPC', 'Decisión'];
      const colX    = [mg, mg + 68, mg + 97, mg + 121, mg + 142, mg + 163];
      doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      headers.forEach((h, i) => doc.text(h, colX[i], y));
      y += 3; doc.line(mg, y, pw - mg, y); y += 5;

      for (const camp of (reportData.campaigns as Record<string, unknown>[])) {
        checkPage(10);
        const ins     = (camp.insights as Record<string,unknown> | undefined)?.data as Array<Record<string,string>> | undefined;
        const d       = ins?.[0];
        const spend   = d ? `$${parseFloat(d.spend).toFixed(2)}`    : '$0';
        const reach   = d ? parseInt(d.reach, 10).toLocaleString('es-MX') : '0';
        const ctr     = d ? `${parseFloat(d.ctr ?? '0').toFixed(2)}%` : '0%';
        const cpc     = d ? `$${parseFloat(d.cpc ?? '0').toFixed(2)}` : '$0';

        // Match with Claude analysis decision
        const campAnalysis = a?.campanas?.find(ca =>
          String(camp.name).toLowerCase().includes(ca.nombre.toLowerCase().slice(0, 20)) ||
          ca.nombre.toLowerCase().includes(String(camp.name).toLowerCase().slice(0, 20))
        );
        const decision = campAnalysis?.decision ?? 'mantener';
        const decColor = DECISION_COLOR[decision] ?? DECISION_COLOR.mantener;

        doc.setFontSize(8); doc.setTextColor(30, 30, 30);
        const nameLines = doc.splitTextToSize(String(camp.name ?? ''), 64) as string[];
        doc.text(nameLines[0], colX[0], y);
        doc.text(spend, colX[1], y);
        doc.text(reach, colX[2], y);

        const ctrVal = d ? parseFloat(d.ctr ?? '0') : 0;
        doc.setTextColor(ctrVal >= 3 ? 0 : ctrVal >= 1 ? 180 : 200, ctrVal >= 3 ? 160 : ctrVal >= 1 ? 130 : 50, ctrVal >= 3 ? 100 : 0);
        doc.text(ctr, colX[3], y);
        doc.setTextColor(30, 30, 30);
        doc.text(cpc, colX[4], y);

        // Decision badge
        doc.setFillColor(...decColor);
        doc.roundedRect(colX[5], y - 4, 30, 6, 1.5, 1.5, 'F');
        doc.setFontSize(7); doc.setTextColor(255, 255, 255);
        doc.text(decision.toUpperCase(), colX[5] + 3, y + 0.2);
        doc.setFontSize(8); doc.setTextColor(30, 30, 30);
        y += 7;
      }
      y += 4;
    }

    // ── Campaign analysis details ─────────────────────────────────────────────────
    if (a?.campanas?.length) {
      checkPage(20);
      doc.setFontSize(11); doc.setTextColor(0, 0, 0);
      doc.text('Diagnóstico por campaña', mg, y); y += 5;
      doc.line(mg, y, pw - mg, y); y += 5;

      for (const ca of a.campanas) {
        checkPage(24);
        const decColor = DECISION_COLOR[ca.decision] ?? DECISION_COLOR.mantener;
        doc.setFillColor(...decColor);
        doc.roundedRect(mg, y - 3, 28, 5.5, 1.5, 1.5, 'F');
        doc.setFontSize(7); doc.setTextColor(255, 255, 255);
        doc.text(ca.decision.toUpperCase(), mg + 2, y + 0.8);

        doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
        const nameStr = doc.splitTextToSize(ca.nombre, pw - mg * 2 - 34) as string[];
        doc.text(nameStr[0], mg + 32, y);
        y += 7;

        doc.setFontSize(7.5); doc.setTextColor(60, 60, 60);
        const razonLines = doc.splitTextToSize(`Razón: ${ca.razon}`, pw - mg * 2) as string[];
        razonLines.forEach(l => { checkPage(6); doc.text(l, mg, y); y += 4.5; });

        const accionLines = doc.splitTextToSize(`Acción: ${ca.accion}`, pw - mg * 2) as string[];
        accionLines.forEach(l => { checkPage(6); doc.text(l, mg, y); y += 4.5; });
        y += 3;
      }
      y += 2;
    }

    // ── Observaciones + Oportunidades (2-col) ─────────────────────────────────────
    if ((a?.observaciones?.length ?? 0) > 0 || (a?.oportunidades?.length ?? 0) > 0) {
      checkPage(30);
      const halfW = (pw - mg * 2 - 6) / 2;
      const obsX  = mg;
      const oppX  = mg + halfW + 6;

      doc.setFontSize(10); doc.setTextColor(0, 0, 0);
      if (a?.observaciones?.length) doc.text('Observaciones', obsX, y);
      if (a?.oportunidades?.length) doc.text('Oportunidades', oppX, y);
      y += 4;
      doc.setDrawColor(220, 220, 220);
      if (a?.observaciones?.length) doc.line(obsX, y, obsX + halfW, y);
      if (a?.oportunidades?.length) doc.line(oppX, y, oppX + halfW, y);
      y += 5;

      doc.setFontSize(8); doc.setTextColor(50, 50, 50);
      const maxLen = Math.max(a?.observaciones?.length ?? 0, a?.oportunidades?.length ?? 0);
      for (let i = 0; i < maxLen; i++) {
        const obs = a?.observaciones?.[i];
        const opp = a?.oportunidades?.[i];
        let rowHeight = 0;
        if (obs) {
          const obsLines = doc.splitTextToSize(`• ${obs}`, halfW) as string[];
          obsLines.forEach((l, li) => doc.text(l, obsX, y + li * 4));
          rowHeight = Math.max(rowHeight, obsLines.length * 4 + 3);
        }
        if (opp) {
          const oppLines = doc.splitTextToSize(`• ${opp}`, halfW) as string[];
          oppLines.forEach((l, li) => doc.text(l, oppX, y + li * 4));
          rowHeight = Math.max(rowHeight, oppLines.length * 4 + 3);
        }
        y += rowHeight;
        checkPage(16);
      }
      y += 4;
    }

    // ── Próximos pasos ────────────────────────────────────────────────────────────
    if (a?.proximos_pasos?.length) {
      checkPage(20);
      doc.setFontSize(10); doc.setTextColor(0, 0, 0);
      doc.text('Próximos pasos', mg, y); y += 4;
      doc.setDrawColor(220, 220, 220); doc.line(mg, y, pw - mg, y); y += 5;
      doc.setFontSize(8); doc.setTextColor(50, 50, 50);
      a.proximos_pasos.forEach((ps, i) => {
        checkPage(10);
        const lines = doc.splitTextToSize(`${i + 1}. ${ps}`, pw - mg * 2 - 6) as string[];
        doc.setFillColor(0, 212, 170);
        doc.circle(mg + 2.5, y - 0.5, 2, 'F');
        doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
        doc.text(String(i + 1), mg + 1.7, y + 0.2);
        doc.setFontSize(8); doc.setTextColor(50, 50, 50);
        lines.forEach((l, li) => doc.text(l, mg + 7, y + li * 4));
        y += lines.length * 4 + 3;
      });
    }

    // ── Advertencias ─────────────────────────────────────────────────────────────
    if (a?.advertencias?.length) {
      checkPage(16);
      y += 3;
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(mg, y - 3, pw - mg * 2, a.advertencias.length * 8 + 6, 3, 3, 'F');
      doc.setFontSize(8); doc.setTextColor(239, 68, 68);
      a.advertencias.forEach(w => {
        const lines = doc.splitTextToSize(`⚠ ${w}`, pw - mg * 2 - 6) as string[];
        lines.forEach(l => { doc.text(l, mg + 3, y); y += 5; });
      });
      y += 4;
    }

    // ── Footer ────────────────────────────────────────────────────────────────────
    const pageCount = (doc as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
    for (let pg = 1; pg <= pageCount; pg++) {
      doc.setPage(pg);
      doc.setFontSize(7); doc.setTextColor(160, 160, 160);
      doc.text(
        `XENTTECH — Reporte Confidencial — ${cl?.name ?? ''} — ${periodLabel} — Pág. ${pg} de ${pageCount}`,
        pw / 2, ph - 8, { align: 'center' },
      );
    }

    const slug = (cl?.name ?? 'cliente').replace(/\s+/g, '-').toLowerCase();
    const mStr = p
      ? (p.month ? `${p.year}-${String(p.month).padStart(2, '0')}` : `${p.since ?? new Date().toISOString().split('T')[0]}`)
      : new Date().toISOString().split('T')[0];
    doc.save(`XENTTECH-reporte-${slug}-${mStr}.pdf`);
  }

  // ── Copy to clipboard ───────────────────────────────────────────────────────

  function copyAdCopies() {
    navigator.clipboard.writeText(adCopies);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const clientFiltered = selectedClientId
    ? campaigns.filter(c => c.client_id === selectedClientId)
    : campaigns;

  const statusFiltered = statusFilter === "all"
    ? clientFiltered
    : clientFiltered.filter(c => c.status === statusFilter);

  const filtered = statusFiltered.filter(c =>
    [c.campaign_name, c.clients?.name, c.platform, c.objective].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;

  const totalCampaigns  = clientFiltered.length;
  const activeCampaigns = clientFiltered.filter(c => c.status === "active").length;
  const activeBudget    = clientFiltered
    .filter(c => c.status === "active")
    .reduce((sum, c) => sum + (Number(c.budget_monthly) || 0), 0);

  const isMetaAdsForm = form.platform === "Meta Ads";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <Header title="Anuncios" description="Campañas de publicidad digital" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-300 flex-1">{error}</p>
            <button
              onClick={() => { setError(null); load(); }}
              className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs"
            >
              <RefreshCw className="h-3 w-3" /> Reintentar
            </button>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-4">
            <div className="flex items-center gap-2 mb-1">
              <Megaphone className="h-3.5 w-3.5 text-[#64748B]" />
              <p className="text-xs text-[#64748B]">Total campañas</p>
            </div>
            <p className="text-2xl font-bold text-[#00D4AA]">{totalCampaigns}</p>
          </div>
          <div className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#64748B]" />
              <p className="text-xs text-[#64748B]">Activas</p>
            </div>
            <p className="text-2xl font-bold text-green-400">{activeCampaigns}</p>
          </div>
          <div className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-[#64748B]" />
              <p className="text-xs text-[#64748B]">Presupuesto activo / mes</p>
            </div>
            <p className="text-2xl font-bold text-cyan-400">
              ${activeBudget.toLocaleString()} MXN
            </p>
          </div>
        </div>

        {/* Client selector + Meta status */}
        <div className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#64748B] shrink-0">Cliente</label>
              <select
                value={selectedClientId}
                onChange={e => setSelectedClientId(e.target.value)}
                className="h-8 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-xs px-2 focus:outline-none focus:border-[#00D4AA]/40 min-w-[160px]"
              >
                <option value="" className="bg-[#0f1117]">Todos los clientes</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id} className="bg-[#0f1117]">
                    {c.name}{c.meta_connected ? ' ●' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedClient && (
              selectedClient.meta_connected ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-[#00D4AA] font-semibold">
                    <span className="w-2 h-2 rounded-full bg-[#00D4AA]" />
                    Meta conectado
                  </span>
                  <span className="text-xs text-[#64748B] font-mono">{selectedClient.meta_ad_account_id}</span>

                  <button
                    onClick={() => syncClientCampaigns(selectedClient)}
                    disabled={syncingCampaigns}
                    className="flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg border border-blue-500/30 text-blue-400 bg-blue-500/[0.08] hover:bg-blue-500/15 transition-colors disabled:opacity-50"
                  >
                    {syncingCampaigns
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Sincronizando...</>
                      : <><RefreshCw className="h-3 w-3" /> Sincronizar campañas</>
                    }
                  </button>

                  <button
                    onClick={refreshAllStats}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg border border-[#00D4AA]/30 text-[#00D4AA] bg-[#00D4AA]/[0.08] hover:bg-[#00D4AA]/15 transition-colors disabled:opacity-50"
                  >
                    {refreshing
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Actualizando...</>
                      : <><RefreshCw className="h-3 w-3" /> Actualizar stats</>
                    }
                  </button>

                  <button
                    onClick={() => setShowAccountPicker(true)}
                    className="flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg border border-white/[0.08] text-[#94A3B8] bg-[#0D0D1F] hover:bg-white/[0.08] transition-colors"
                  >
                    Cambiar cuenta
                  </button>

                  <a
                    href={`/api/meta-oauth?client_id=${selectedClient.id}`}
                    className="flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg bg-[#1877F2] text-white font-semibold hover:opacity-90 transition-opacity"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    Reconectar
                  </a>
                </div>
              ) : (
                <a
                  href={`/api/meta-oauth?client_id=${selectedClient.id}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1877F2] text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Conectar Meta Ads
                </a>
              )
            )}

            {!selectedClient && (
              <button
                onClick={refreshAllStats}
                disabled={refreshing}
                className="flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg border border-[#00D4AA]/30 text-[#00D4AA] bg-[#00D4AA]/[0.08] hover:bg-[#00D4AA]/15 transition-colors disabled:opacity-50"
              >
                {refreshing
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Actualizando...</>
                  : <><RefreshCw className="h-3 w-3" /> Actualizar todas las estadísticas</>
                }
              </button>
            )}
          </div>

          {syncCampMsg && (
            <p className={cn("text-xs", syncCampMsg.startsWith('Error') ? "text-red-400" : "text-[#00D4AA]")}>
              {syncCampMsg}
            </p>
          )}
        </div>

        {/* Export panel */}
        <div className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileSpreadsheet className="h-4 w-4 text-[#00D4AA]" />
            <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
              Exportar datos de Meta Ads
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={exportRange}
              onChange={e => setExportRange(e.target.value)}
              className="h-8 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-[#94A3B8] text-xs px-2 focus:outline-none focus:border-[#00D4AA]/40"
            >
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="last_7d">7 días</option>
              <option value="last_14d">14 días</option>
              <option value="last_30d">30 días</option>
              <option value="this_month">Este mes</option>
              <option value="last_month">Mes pasado</option>
              <option value="last_90d">90 días</option>
              <option value="last_year">Último año</option>
              <option value="maximum">Todo el historial</option>
            </select>

            <button
              onClick={() => fetchAndExport('excel')}
              disabled={exporting || syncing}
              className="flex items-center gap-1.5 text-xs px-3 h-8 rounded-lg border border-[#00D4AA]/30 text-[#00D4AA] bg-[#00D4AA]/[0.08] hover:bg-[#00D4AA]/15 transition-colors disabled:opacity-50"
            >
              {exporting
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Exportando...</>
                : <><Download className="h-3 w-3" /> Excel (.xlsx)</>
              }
            </button>

            <button
              onClick={() => fetchAndExport('csv')}
              disabled={exporting || syncing}
              className="flex items-center gap-1.5 text-xs px-3 h-8 rounded-lg border border-blue-500/30 text-blue-400 bg-blue-500/[0.08] hover:bg-blue-500/15 transition-colors disabled:opacity-50"
            >
              <Download className="h-3 w-3" /> CSV
            </button>

            <button
              onClick={() => fetchAndExport('sync')}
              disabled={exporting || syncing}
              className="flex items-center gap-1.5 text-xs px-3 h-8 rounded-lg border border-purple-500/30 text-purple-400 bg-purple-500/[0.08] hover:bg-purple-500/15 transition-colors disabled:opacity-50"
            >
              {syncing
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Sincronizando...</>
                : <><Database className="h-3 w-3" /> Sincronizar con DB</>
              }
            </button>

            <button
              onClick={() => {
                setReportClientId(selectedClientId || '');
                setReportError('');
                setReportStep('');
                setShowReportModal(true);
              }}
              className="flex items-center gap-1.5 text-xs px-3 h-8 rounded-lg border border-blue-500/40 text-blue-300 bg-blue-500/[0.10] hover:bg-blue-500/20 transition-colors font-medium"
            >
              <Sparkles className="h-3 w-3" /> 📊 Reporte IA
            </button>
          </div>

          {syncMsg && (
            <p className={cn("mt-2 text-xs", syncMsg.startsWith('Error') ? "text-red-400" : "text-[#00D4AA]")}>
              {syncMsg}
            </p>
          )}

          {exportPreview && (
            <div className="mt-3 flex flex-wrap gap-3">
              {[
                { label: 'Campañas', count: (exportPreview.campaigns as unknown[])?.length ?? 0 },
                { label: 'Conjuntos', count: (exportPreview.adsets as unknown[])?.length ?? 0 },
                { label: 'Anuncios', count: (exportPreview.ads as unknown[])?.length ?? 0 },
                { label: 'Insights', count: (exportPreview.insights as unknown[])?.length ?? 0 },
                { label: 'Días', count: (exportPreview.daily as unknown[])?.length ?? 0 },
              ].map(({ label, count }) => (
                <div key={label} className="text-center">
                  <p className="text-sm font-bold text-[#00D4AA]">{count}</p>
                  <p className="text-[10px] text-[#64748B]">{label}</p>
                </div>
              ))}
              <p className="text-[10px] text-[#64748B] self-end">
                Rango: {exportPreview.date_range as string}
              </p>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="space-y-3">
          {/* Status filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {[
              { id: "all",    label: "Todas",    count: clientFiltered.length },
              { id: "active", label: "Activas",  count: clientFiltered.filter(c => c.status === "active").length },
              { id: "paused", label: "Pausadas", count: clientFiltered.filter(c => c.status === "paused").length },
              { id: "draft",  label: "Borrador", count: clientFiltered.filter(c => c.status === "draft").length },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                  statusFilter === f.id
                    ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                    : "border-[#1A1A35] text-[#64748B] hover:text-white hover:border-white/[0.12]"
                )}
              >
                {f.label} ({f.count})
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={analyzeCampaigns}
              disabled={analyzing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-purple-500/30 text-purple-400 bg-purple-500/[0.08] hover:bg-purple-500/15 transition-colors disabled:opacity-50"
            >
              {analyzing
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Analizando...</>
                : <><Sparkles className="h-3 w-3" /> Analizar con IA</>
              }
            </button>
          </div>

          {/* Analysis result */}
          {analysis && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.05] p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Análisis IA de campañas</p>
                <button onClick={() => setAnalysis("")} className="text-[#64748B] hover:text-white text-xs">✕</button>
              </div>
              <p className="text-sm text-[#94A3B8] leading-relaxed whitespace-pre-wrap">{analysis}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
              <Input
                placeholder="Buscar campañas..."
                className="pl-9 bg-[#0D0D1F] border-[#1A1A35] text-white placeholder:text-[#64748B]"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Campaign list */}
        {loading ? (
          <PageSkeleton rows={3} cols={1} cardHeight={200} />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filtered.length === 0 && (
              <p className="text-center text-[#64748B] py-12">
                {selectedClientId
                  ? 'No hay campañas para este cliente. Usa "Sincronizar campañas" para importar desde Meta.'
                  : 'Selecciona un cliente para ver sus campañas.'}
              </p>
            )}
            {filtered.map(camp => {
              const m = (camp.metrics ?? {}) as Record<string, unknown>;
              const copiesText = adCopiesToString(camp.ad_copies);
              const isExpanded = expanded[camp.id] ?? false;

              return (
                <div
                  key={camp.id}
                  className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-5 hover:border-[#00D4AA]/20 transition-colors"
                >
                  {/* Card header — read only */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">
                        {PLATFORM_ICON[camp.platform as Platform] ?? "📣"}
                      </span>
                      <div>
                        <p className="font-semibold text-white">{camp.campaign_name}</p>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          {camp.clients?.name}
                          {camp.clients?.company ? ` · ${camp.clients.company}` : ""}
                          {camp.objective ? ` · ${camp.objective}` : ""}
                          {camp.meta_campaign_id
                            ? <span className="ml-1 font-mono text-[#64748B]">· #{camp.meta_campaign_id}</span>
                            : null}
                        </p>
                      </div>
                    </div>
                    <Badge className={cn("text-[10px] border shrink-0", STATUS_COLOR[camp.status] ?? STATUS_COLOR.draft)}>
                      {camp.status}
                    </Badge>
                  </div>

                  {/* Budget + ad count pills */}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#94A3B8]">
                    {camp.budget_monthly != null && camp.budget_monthly > 0 && (
                      <span className="flex items-center gap-1 text-[#00D4AA]">
                        <DollarSign className="h-3 w-3" />
                        ${Number(camp.budget_monthly).toLocaleString()} MXN/mes
                      </span>
                    )}
                    {camp.platform && (
                      <span className="rounded-md bg-[#0D0D1F] px-2 py-0.5">{camp.platform}</span>
                    )}
                    {(Number(m.ad_count) > 0) && (
                      <span className="rounded-md bg-[#0D0D1F] px-2 py-0.5">
                        {Number(m.ad_count)} anuncio{Number(m.ad_count) !== 1 ? 's' : ''}{' '}
                        ({Number(m.active_ads)} activo{Number(m.active_ads) !== 1 ? 's' : ''})
                      </span>
                    )}
                  </div>

                  {/* Ad copies expandable */}
                  {copiesText && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <button
                          onClick={() =>
                            setExpanded(prev => ({ ...prev, [camp.id]: !isExpanded }))
                          }
                          className="flex items-center gap-1 text-[10px] text-[#64748B] hover:text-[#94A3B8] uppercase tracking-wider transition-colors"
                        >
                          Ad Copies
                          {isExpanded
                            ? <ChevronUp className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" />}
                        </button>
                        {camp.pdf_url && (
                          <a
                            href={camp.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <Download className="h-3 w-3" /> PDF
                          </a>
                        )}
                      </div>
                      <div
                        className={cn(
                          "rounded-lg bg-black/20 border border-[#1A1A35] p-3 text-xs text-[#94A3B8] whitespace-pre-wrap font-mono leading-relaxed transition-all",
                          isExpanded ? "max-h-none" : "max-h-20 overflow-hidden"
                        )}
                      >
                        {copiesText}
                      </div>
                    </div>
                  )}

                  {/* Linked design thumbnail */}
                  {Boolean(m.design_id) && (() => {
                    const design = campaignDesigns[m.design_id as string];
                    const linkedSvg = design?.image_svg ?? null;
                    return linkedSvg ? (
                      <div className="mt-3 rounded-xl overflow-hidden border border-[#1A1A35] [&_svg]:w-full [&_svg]:h-auto [&_svg]:block max-w-[200px]">
                        {/* eslint-disable-next-line react/no-danger */}
                        <div style={{ lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: linkedSvg }} />
                      </div>
                    ) : null;
                  })()}

                  {/* Stats grid */}
                  {Boolean(m.last_stats) && (() => {
                    const s = m.last_stats as Record<string, unknown>;
                    const hasResults = Number(s.results_count ?? 0) > 0 || Number(s.messages_count ?? 0) > 0;
                    return (
                      <div className="mt-3 p-3 rounded-xl bg-black/20 border border-[#1A1A35]">
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: "Impresiones", value: fmtNum(s.impressions, 'count'),   color: "text-[#00D4AA]"  },
                            { label: "Alcance",     value: fmtNum(s.reach,       'count'),   color: "text-blue-400"  },
                            { label: "Clicks",      value: fmtNum(s.clicks,      'count'),   color: "text-purple-400"},
                            { label: "CTR",         value: fmtNum(s.ctr,         'pct'),     color: "text-cyan-400"  },
                            { label: "CPC",         value: fmtNum(s.cpc,         'money'),   color: "text-yellow-400"},
                            { label: "CPM",         value: fmtNum(s.cpm,         'money'),   color: "text-orange-400"},
                            { label: "Gastado MXN", value: fmtNum(s.spend,       'money'),   color: "text-red-400"   },
                            { label: "Frecuencia",  value: fmtNum(s.frequency,   'decimal'), color: "text-gray-400"  },
                          ].map((stat, i) => (
                            <div key={i}>
                              <p className={`text-base font-bold ${stat.color}`}>{stat.value}</p>
                              <p className="text-[10px] text-[#64748B]">{stat.label}</p>
                            </div>
                          ))}
                        </div>
                        {hasResults && (
                          <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-[#1A1A35]">
                            {[
                              { label: "Resultados",      value: fmtNum(s.results_count,    'count'), color: "text-cyan-400"   },
                              { label: "Mensajes",        value: fmtNum(s.messages_count,   'count'), color: "text-violet-400" },
                              { label: "Costo/Resultado", value: fmtNum(s.cost_per_result,  'money'), color: "text-pink-400"   },
                              { label: "Costo/Mensaje",   value: fmtNum(s.cost_per_message, 'money'), color: "text-orange-300" },
                            ].map((stat, i) => (
                              <div key={i}>
                                <p className={`text-base font-bold ${stat.color}`}>{stat.value}</p>
                                <p className="text-[10px] text-[#64748B]">{stat.label}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {Boolean(m.stats_updated_at) && (
                          <p className="text-[10px] text-[#64748B] mt-2">
                            Actualizado: {new Date(m.stats_updated_at as string).toLocaleDateString('es-MX')}
                            {m.date_range ? ` · ${String(m.date_range)}` : ''}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Stats controls (date range + refresh + PDF) — read only */}
                  {camp.platform === "Meta Ads" && (camp.meta_campaign_id || (m.meta_campaign_id as string)) && (
                    <div className="mt-3 pt-3 border-t border-[#1A1A35] flex items-center gap-1.5 flex-wrap">
                      <select
                        value={statsDatePreset}
                        onChange={e => setStatsDatePreset(e.target.value)}
                        className="h-6 rounded-md bg-[#0D0D1F] border border-white/[0.08] text-[#94A3B8] text-[10px] px-1.5"
                      >
                        <option value="today">Hoy</option>
                        <option value="yesterday">Ayer</option>
                        <option value="last_7d">7 días</option>
                        <option value="last_30d">30 días</option>
                        <option value="last_90d">90 días</option>
                        <option value="maximum">Todo</option>
                      </select>
                      <button
                        onClick={() => fetchMetaStats(camp)}
                        disabled={fetchingStats[camp.id]}
                        className="flex items-center gap-1 text-[10px] px-2.5 h-6 rounded-lg border border-blue-500/30 text-blue-400 bg-blue-500/[0.08] hover:bg-blue-500/15 transition-colors disabled:opacity-50"
                      >
                        {fetchingStats[camp.id]
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <><RefreshCw className="h-3 w-3" /> Stats</>
                        }
                      </button>
                      <button
                        onClick={() => downloadCampaignReport(camp)}
                        className="flex items-center gap-1 text-[10px] px-2.5 h-6 rounded-lg border border-purple-500/30 text-purple-400 bg-purple-500/[0.08] hover:bg-purple-500/15 transition-colors"
                      >
                        <Download className="h-3 w-3" /> PDF
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Read-only note */}
        <p className="text-center text-[11px] text-[#64748B] pb-2">
          Las campañas se gestionan exclusivamente desde Meta Ads Manager. Conectaachat solo sincroniza y muestra estadísticas.
        </p>

      </div>

      {/* ── Account picker modal ────────────────────────────────────────────── */}
      {showAccountPicker && (
        <Dialog open={showAccountPicker} onOpenChange={v => { if (!v) setShowAccountPicker(false); }}>
          <DialogContent className="bg-[#0D0D1F] border-white/[0.08] text-white max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-blue-400 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Cambiar cuenta publicitaria
              </DialogTitle>
            </DialogHeader>

            {loadingAccounts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                <span className="ml-2 text-sm text-[#64748B]">Cargando cuentas...</span>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {/* Ad accounts */}
                <div>
                  <label className="text-xs text-[#64748B] mb-2 block">Cuenta publicitaria</label>
                  {availableAccounts.length === 0 ? (
                    <p className="text-xs text-[#64748B]">No se encontraron cuentas publicitarias.</p>
                  ) : (
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {availableAccounts.map(acc => (
                        <div
                          key={acc.account_id}
                          onClick={() => setSelAccountId(acc.account_id)}
                          className={cn(
                            "p-3 rounded-xl cursor-pointer border transition-colors",
                            selAccountId === acc.account_id
                              ? "border-[#00D4AA]/40 bg-[#00D4AA]/[0.05]"
                              : "border-[#1A1A35] hover:border-white/[0.12] bg-[#080812]"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-white">{acc.name || acc.business_name || 'Sin nombre'}</p>
                              <p className="text-[11px] text-[#64748B] font-mono mt-0.5">ID: {acc.account_id} · {acc.currency}</p>
                            </div>
                            {selAccountId === acc.account_id && (
                              <span className="text-[11px] text-[#00D4AA] font-semibold">✓ Seleccionada</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pages */}
                {availablePages.length > 0 && (
                  <div>
                    <label className="text-xs text-[#64748B] mb-1.5 block">Página de Facebook</label>
                    <select
                      value={selPageId}
                      onChange={e => setSelPageId(e.target.value)}
                      className="w-full rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500/40"
                    >
                      {availablePages.map(p => (
                        <option key={p.id} value={p.id} className="bg-[#0f1117]">
                          {p.name} (ID: {p.id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setShowAccountPicker(false)} className="text-[#64748B]">
                Cancelar
              </Button>
              <Button
                disabled={!selAccountId || savingAccount}
                onClick={async () => {
                  setSavingAccount(true);
                  try {
                    await supabase.from('clients').update({
                      meta_ad_account_id: selAccountId || null,
                      meta_page_id: selPageId || null,
                    }).eq('id', selectedClientId);

                    // Delete previously synced campaigns for this client so they re-sync with the new account
                    await supabase
                      .from('campaigns')
                      .delete()
                      .eq('client_id', selectedClientId)
                      .not('metrics->>meta_campaign_id', 'is', null);

                    setShowAccountPicker(false);
                    setSyncCampMsg('✓ Cuenta actualizada. Haz clic en "Sincronizar campañas" para importar.');
                    load();
                  } finally {
                    setSavingAccount(false);
                  }
                }}
                className="bg-[#1877F2] text-white hover:bg-[#1877F2]/90 font-semibold"
              >
                {savingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar y cambiar cuenta'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Dialog ──────────────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={v => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="bg-[#0D0D1F] border-white/[0.08] text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#00D4AA]">
              {editing ? "Notas de campaña" : "Nueva campaña (local)"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">

            {/* Client selector */}
            <div>
              <label className="text-xs text-[#64748B] mb-1 block">Cliente *</label>
              <Select
                value={form.client_id}
                onValueChange={v => setField("client_id", v)}
              >
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

            {/* Meta status hint */}
            {form.client_id && (() => {
              const sel = clients.find(c => c.id === form.client_id);
              if (!sel) return null;
              return sel.meta_connected ? (
                <div className="flex items-center gap-1.5 text-[11px] text-blue-400 -mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  Meta Ads conectado · Cuenta: {sel.meta_ad_account_id}
                </div>
              ) : (
                <div className="text-[11px] text-yellow-400 -mt-1">
                  ⚠ Meta no conectado —{" "}
                  <a href={`/api/meta-oauth?client_id=${sel.id}`} className="text-blue-400 underline">
                    Conectar ahora
                  </a>
                  {" "}· Se usará la cuenta XENTTECH como respaldo.
                </div>
              );
            })()}

            {/* Campaign name */}
            <div>
              <label className="text-xs text-[#64748B] mb-1 block">Nombre de campaña *</label>
              <Input
                value={form.campaign_name}
                onChange={e => setField("campaign_name", e.target.value)}
                placeholder="Ej: Lanzamiento Producto Q1 2025"
                className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B]"
              />
            </div>

            {/* Platform + Objective */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#64748B] mb-1 block">Plataforma</label>
                <Select
                  value={form.platform}
                  onValueChange={v => setField("platform", v as Platform)}
                >
                  <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                    {PLATFORMS.map(p => (
                      <SelectItem key={p} value={p} className="text-white hover:bg-white/[0.06]">
                        {PLATFORM_ICON[p]} {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#64748B] mb-1 block">Objetivo</label>
                <Select
                  value={form.objective}
                  onValueChange={v => setField("objective", v)}
                >
                  <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                    {OBJECTIVES.map(o => (
                      <SelectItem key={o} value={o} className="text-white hover:bg-white/[0.06]">
                        <div>
                          <div>{o}</div>
                          {OBJECTIVE_DESCRIPTIONS[o] && (
                            <div className="text-[10px] text-[#64748B]">{OBJECTIVE_DESCRIPTIONS[o]}</div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Audience */}
            <div>
              <label className="text-xs text-[#64748B] mb-1 block">Audiencia objetivo</label>
              <Textarea
                value={form.audience}
                onChange={e => setField("audience", e.target.value)}
                rows={2}
                placeholder="Ej: Empresarios, dueños de negocio 25-45 años, interesados en marketing digital..."
                className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B] resize-none text-sm"
              />
            </div>

            {/* Budget */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-[#64748B]">Presupuesto MXN</label>
                <div className="flex rounded-lg overflow-hidden border border-white/[0.08] text-[10px]">
                  {["Mensual", "Diario"].map(t => (
                    <button key={t} type="button"
                      onClick={() => setField("budget_type", t)}
                      className={`px-2.5 py-1 transition-colors ${form.budget_type === t ? "bg-[#00D4AA] text-black font-semibold" : "bg-[#0D0D1F] text-[#64748B] hover:text-white"}`}
                    >{t}</button>
                  ))}
                </div>
              </div>
              <Input
                type="number"
                min={0}
                value={form.budget_monthly}
                onChange={e => setField("budget_monthly", e.target.value)}
                placeholder={form.budget_type === "Diario" ? "Ej: 200 MXN/día" : "Ej: 5000 MXN/mes"}
                className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B]"
              />
            </div>

            {/* Status */}
            <div>
              <label className="text-xs text-[#64748B] mb-1 block">Estado</label>
              <Select value={form.status} onValueChange={v => setField("status", v)}>
                <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                  {["draft", "active", "paused", "completed"].map(s => (
                    <SelectItem key={s} value={s} className="text-white hover:bg-white/[0.06]">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Info: campaigns managed via sync */}
            {isMetaAdsForm && (
              <div className="rounded-xl border border-[#00D4AA]/15 bg-[#00D4AA]/[0.03] p-3">
                <p className="text-[11px] text-[#64748B] leading-relaxed">
                  Crea la campaña en <span className="text-white font-medium">Meta Ads Manager</span>, luego usa{" "}
                  <span className="text-[#00D4AA] font-medium">Sincronizar campañas</span> para importarla aquí con sus estadísticas automáticamente.
                </p>
              </div>
            )}

            {/* AI copy generation */}
            <div className="rounded-xl border border-white/[0.08] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
                  Generador de Ad Copies · IA
                </p>
                <div className="flex items-center gap-2">
                  {adCopies && (
                    <button
                      onClick={copyAdCopies}
                      className={cn(
                        "flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors",
                        copied
                          ? "text-green-400 border-green-500/30 bg-green-500/10"
                          : "text-[#94A3B8] border-white/[0.08] hover:text-white"
                      )}
                    >
                      {copied
                        ? <CheckCircle2 className="h-3 w-3" />
                        : <Copy className="h-3 w-3" />}
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                  )}
                  <button
                    onClick={generateAdCopies}
                    disabled={generating || !form.client_id || !form.campaign_name}
                    className="flex items-center gap-1.5 text-xs text-[#00D4AA] hover:text-[#00D4AA]/80 disabled:opacity-40 bg-[#00D4AA]/10 px-3 py-1.5 rounded-lg border border-[#00D4AA]/20 transition-colors"
                  >
                    {generating
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Sparkles className="h-3 w-3" />}
                    Generar 3 variaciones
                  </button>
                </div>
              </div>

              {adCopies ? (
                <div className="rounded-lg bg-black/20 p-3 text-xs text-[#94A3B8] whitespace-pre-wrap max-h-64 overflow-y-auto font-mono leading-relaxed">
                  {adCopies}
                </div>
              ) : (
                <p className="text-xs text-[#64748B]">
                  Completa los campos y genera 3 variaciones con HEADLINE, PRIMARY TEXT, DESCRIPTION, CTA, COPY LARGO, DESCRIPCIÓN VISUAL y SEGMENTACIÓN SUGERIDA.
                </p>
              )}
            </div>

            {/* Design picker */}
            {form.client_id && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
                  Diseño para el anuncio <span className="text-[#64748B] normal-case font-normal">(opcional)</span>
                </p>
                {clientDesigns.length === 0 ? (
                  <p className="text-xs text-[#64748B]">
                    No hay diseños con imagen para este cliente.{" "}
                    <a href="/agency/design" className="text-[#00D4AA] hover:underline">Crear diseño primero →</a>
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                    {clientDesigns.map(d => (
                      <div
                        key={d.id}
                        onClick={() => setSelectedDesignId(prev => prev === d.id ? null : d.id)}
                        className={cn(
                          "rounded-xl overflow-hidden cursor-pointer border-2 transition-colors",
                          selectedDesignId === d.id
                            ? "border-[#00D4AA]"
                            : "border-[#1A1A35] hover:border-white/20"
                        )}
                      >
                        <div
                          className="w-full [&_svg]:w-full [&_svg]:h-auto [&_svg]:block"
                          style={{ lineHeight: 0 }}
                          // eslint-disable-next-line react/no-danger
                          dangerouslySetInnerHTML={{ __html: d.image_svg! }}
                        />
                        <div className="px-2 py-1 bg-black/20">
                          <p className="text-[10px] text-[#64748B] truncate">{d.design_type?.replace(/_/g, " ")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Dialog footer */}
          <DialogFooter className="gap-2">
            {/* Case: just saved a new campaign */}
            {!editing && savedCampId ? (
              <>
                <Button
                  variant="ghost"
                  onClick={closeDialog}
                  className="text-[#64748B]"
                >
                  Cerrar
                </Button>
                {adCopies && (
                  <Button
                    onClick={createDesignBriefs}
                    disabled={generatingBriefs}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-semibold gap-2"
                  >
                    {generatingBriefs
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Sparkles className="h-4 w-4" />}
                    Crear 3 Briefs de Diseño
                  </Button>
                )}
              </>
            ) : (
              /* Case: editing OR new with no savedCampId yet */
              <>
                <Button
                  variant="ghost"
                  onClick={closeDialog}
                  className="text-[#64748B]"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={save}
                  disabled={saving || !form.client_id || !form.campaign_name}
                  className="bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 font-semibold gap-2"
                >
                  {saving
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : "Guardar campaña"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reporte IA ejecutivo ─────────────────────────────────────── */}
      <Dialog open={showReportModal} onOpenChange={v => { if (!reportLoading) setShowReportModal(v); }}>
        <DialogContent className="bg-[#0D0D1F] border border-[#1A1A35] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#00D4AA]" />
              Generar Reporte de Meta Ads
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">

            {/* Cliente — obligatorio */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#64748B] uppercase tracking-wide">
                Cliente <span className="text-red-400">*</span>
              </label>
              <select
                value={reportClientId}
                onChange={e => setReportClientId(e.target.value)}
                disabled={reportLoading}
                className="w-full h-9 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-sm px-2 focus:outline-none focus:border-[#00D4AA]/40 disabled:opacity-50"
              >
                <option value="" className="bg-[#0f1117]">— Selecciona un cliente —</option>
                {clients
                  .filter(c => c.meta_connected)
                  .map(c => (
                    <option key={c.id} value={c.id} className="bg-[#0f1117]">{c.name}</option>
                  ))}
                {clients.filter(c => !c.meta_connected).length > 0 && (
                  <>
                    <option disabled className="bg-[#0f1117] text-[#64748B]">── Sin Meta conectado ──</option>
                    {clients.filter(c => !c.meta_connected).map(c => (
                      <option key={c.id} value={c.id} disabled className="bg-[#0f1117] text-[#64748B]">{c.name}</option>
                    ))}
                  </>
                )}
              </select>
              {!clients.some(c => c.meta_connected) && (
                <p className="text-[11px] text-yellow-400">Ningún cliente tiene Meta Ads conectado.</p>
              )}
            </div>

            {/* Período */}
            <div className="space-y-2.5">
              <label className="text-xs text-[#64748B] uppercase tracking-wide">Período</label>

              {/* Tabs */}
              <div className="flex gap-1.5">
                {([['preset','Rápido'],['month','Por mes'],['range','Rango']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setReportPeriodMode(mode)}
                    disabled={reportLoading}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg text-xs border transition-colors',
                      reportPeriodMode === mode
                        ? 'border-[#00D4AA]/50 bg-[#00D4AA]/10 text-[#00D4AA] font-semibold'
                        : 'border-white/[0.08] text-[#64748B] hover:text-white',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Preset rápido */}
              {reportPeriodMode === 'preset' && (
                <select
                  value={reportPreset}
                  onChange={e => setReportPreset(e.target.value)}
                  disabled={reportLoading}
                  className="w-full h-9 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-sm px-2 focus:outline-none focus:border-[#00D4AA]/40 disabled:opacity-50"
                >
                  <option value="last_30d"  className="bg-[#0f1117]">Últimos 30 días (recomendado)</option>
                  <option value="last_month" className="bg-[#0f1117]">Mes anterior completo</option>
                  <option value="this_month" className="bg-[#0f1117]">Este mes (hasta hoy)</option>
                  <option value="last_7d"   className="bg-[#0f1117]">Últimos 7 días</option>
                  <option value="last_90d"  className="bg-[#0f1117]">Últimos 90 días</option>
                </select>
              )}

              {/* Por mes */}
              {reportPeriodMode === 'month' && (
                <div className="space-y-1">
                  <div className="flex gap-3">
                    <div className="flex-1 space-y-1">
                      <label className="text-[11px] text-[#64748B]">Mes</label>
                      <select
                        value={reportMonth}
                        onChange={e => setReportMonth(Number(e.target.value))}
                        disabled={reportLoading}
                        className="w-full h-9 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-sm px-2 focus:outline-none focus:border-[#00D4AA]/40 disabled:opacity-50"
                      >
                        {([
                          [1,'Enero'],[2,'Febrero'],[3,'Marzo'],[4,'Abril'],
                          [5,'Mayo'],[6,'Junio'],[7,'Julio'],[8,'Agosto'],
                          [9,'Septiembre'],[10,'Octubre'],[11,'Noviembre'],[12,'Diciembre'],
                        ] as [number, string][]).map(([v, l]) => (
                          <option key={v} value={v} className="bg-[#0f1117]">{l}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-[11px] text-[#64748B]">Año</label>
                      <select
                        value={reportYear}
                        onChange={e => setReportYear(Number(e.target.value))}
                        disabled={reportLoading}
                        className="w-full h-9 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-sm px-2 focus:outline-none focus:border-[#00D4AA]/40 disabled:opacity-50"
                      >
                        {[2024, 2025, 2026].map(yr => (
                          <option key={yr} value={yr} className="bg-[#0f1117]">{yr}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {reportMonth === new Date().getMonth() + 1 && reportYear === new Date().getFullYear() && (
                    <p className="text-[11px] text-yellow-400">
                      ⚠ El mes actual está en curso — solo verás datos hasta hoy.
                      Usa "Mes anterior completo" para datos definitivos.
                    </p>
                  )}
                </div>
              )}

              {/* Rango personalizado */}
              {reportPeriodMode === 'range' && (
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] text-[#64748B]">Desde</label>
                    <input
                      type="date"
                      value={reportSince}
                      onChange={e => setReportSince(e.target.value)}
                      disabled={reportLoading}
                      className="w-full h-9 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-sm px-2 focus:outline-none focus:border-[#00D4AA]/40 disabled:opacity-50 [color-scheme:dark]"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] text-[#64748B]">Hasta</label>
                    <input
                      type="date"
                      value={reportUntil}
                      onChange={e => setReportUntil(e.target.value)}
                      disabled={reportLoading}
                      className="w-full h-9 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-sm px-2 focus:outline-none focus:border-[#00D4AA]/40 disabled:opacity-50 [color-scheme:dark]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Steps / Loading */}
            {reportLoading && reportStep && (
              <div className="rounded-lg border border-[#00D4AA]/20 bg-[#00D4AA]/[0.05] px-4 py-3 flex items-center gap-3">
                <Loader2 className="h-4 w-4 text-[#00D4AA] animate-spin shrink-0" />
                <p className="text-sm text-[#00D4AA]">{reportStep}</p>
              </div>
            )}

            {/* Error */}
            {reportError && !reportLoading && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{reportError}</p>
              </div>
            )}

            <p className="text-[11px] text-[#64748B] leading-relaxed">
              Solo incluye campañas con gasto real en el período seleccionado. Claude analiza el rendimiento y genera un PDF ejecutivo descargable.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowReportModal(false)}
              disabled={reportLoading}
              className="text-[#64748B]"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleGenerateReport()}
              disabled={reportLoading || !reportClientId}
              className="bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 font-semibold gap-2 disabled:opacity-50"
            >
              {reportLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</>
                : <><Sparkles className="h-4 w-4" /> 📊 Generar PDF</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
