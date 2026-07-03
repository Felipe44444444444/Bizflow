"use client";
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, Search, Pencil, Trash2, Loader2, Sparkles, ExternalLink,
  BookOpen, AlertCircle, RefreshCw, Download, ChevronDown, ChevronUp,
  Check, Save, ImagePlus, X,
} from "lucide-react";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
  company: string | null;
  industry: string | null;
}

interface Campaign {
  id: string;
  campaign_name: string;
  client_id: string;
  objective: string | null;
  audience: string | null;
}

interface Design {
  id: string;
  client_id: string;
  campaign_id: string | null;
  design_type: string;
  brief: string | null;
  canva_url: string | null;
  status: string;
  pdf_url: string | null;
  image_svg: string | null;
  image_url: string | null;
  width?: number | null;
  height?: number | null;
  reference_images?: string[] | null;
  created_at: string;
  clients?: { name: string; company: string | null };
  campaigns?: { campaign_name: string } | null;
}

interface BrandManual {
  id: string;
  title: string;
  foda: Record<string, string> | string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DESIGN_TYPES = [
  { key: "post_instagram",  label: "Post Instagram",          icon: "🖼️" },
  { key: "story_instagram", label: "Story Instagram",         icon: "📱" },
  { key: "reel_cover",      label: "Reel Cover",              icon: "🎬" },
  { key: "post_facebook",   label: "Post Facebook",           icon: "📘" },
  { key: "banner_facebook", label: "Banner Facebook",         icon: "🎯" },
  { key: "carousel",        label: "Carousel",                icon: "🎠" },
  { key: "flyer",           label: "Flyer",                   icon: "📄" },
  { key: "brochure",        label: "Brochure",                icon: "📚" },
  { key: "tarjeta",         label: "Tarjeta de Presentación", icon: "💼" },
  { key: "logo",            label: "Logo",                    icon: "✨" },
  { key: "banner_web",      label: "Banner Web",              icon: "🌐" },
  { key: "email_template",  label: "Email Template",          icon: "📧" },
  // Legacy values for backwards compatibility
  { key: "post",            label: "Post",                    icon: "🖼️" },
  { key: "story",           label: "Story",                   icon: "📱" },
  { key: "banner",          label: "Banner",                  icon: "🎯" },
  { key: "video_script",    label: "Video Script",            icon: "🎬" },
  { key: "reels_script",    label: "Reels Script",            icon: "🎥" },
  { key: "email_header",    label: "Email Header",            icon: "📧" },
];

const DESIGN_TYPE_MAP = Object.fromEntries(DESIGN_TYPES.map(t => [t.key, t]));

const STATUSES = ["pending", "in_review", "approved", "delivered"] as const;
type Status = typeof STATUSES[number];

const STATUS_META: Record<Status, { label: string; color: string; dot: string }> = {
  pending:   { label: "Pendiente",   color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",  dot: "bg-yellow-400"  },
  in_review: { label: "En revisión", color: "bg-blue-500/10 text-blue-400 border-blue-500/20",        dot: "bg-blue-400"    },
  approved:  { label: "Aprobado",    color: "bg-green-500/10 text-green-400 border-green-500/20",     dot: "bg-green-400"   },
  delivered: { label: "Entregado",   color: "bg-purple-500/10 text-purple-400 border-purple-500/20",  dot: "bg-purple-400"  },
};

const STATUS_COUNT_TEXT: Record<Status, string> = {
  pending:   "text-yellow-400",
  in_review: "text-blue-400",
  approved:  "text-green-400",
  delivered: "text-purple-400",
};

const DIMENSION_PRESETS = [
  { label: 'Post Instagram (1080×1350)',         w: 1080, h: 1350 },
  { label: 'Post Instagram Cuadrado (1080×1080)', w: 1080, h: 1080 },
  { label: 'Story / Reel (1080×1920)',            w: 1080, h: 1920 },
  { label: 'Post Facebook (1200×630)',            w: 1200, h: 630  },
  { label: 'Cover Facebook (820×312)',            w: 820,  h: 312  },
  { label: 'Banner Web (1920×600)',               w: 1920, h: 600  },
  { label: 'Flyer Vertical (1080×1920)',          w: 1080, h: 1920 },
  { label: 'Flyer Horizontal (1920×1080)',        w: 1920, h: 1080 },
  { label: 'Tarjeta de Presentación (1050×600)', w: 1050, h: 600  },
  { label: 'YouTube Thumbnail (1280×720)',        w: 1280, h: 720  },
  { label: 'LinkedIn Post (1200×627)',            w: 1200, h: 627  },
  { label: 'Email Header (600×200)',              w: 600,  h: 200  },
  { label: 'Personalizado',                       w: 0,    h: 0    },
] as const;

const BLANK_FORM = {
  client_id:    "",
  campaign_id:  "",
  design_type:  "post_instagram",
  brief_manual: "",
  brief:        "",
  canva_url:    "",
  status:       "pending" as Status,
};

const supabase = createClient();

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseFoda(foda: Record<string, string> | string | null): Record<string, string> {
  if (!foda) return {};
  if (typeof foda === "string") {
    try { return JSON.parse(foda); } catch { return {}; }
  }
  return foda;
}

function getTypeInfo(key: string) {
  return DESIGN_TYPE_MAP[key] ?? { key, label: key.replace(/_/g, " "), icon: "🎨" };
}

// ── Main component ───────────────────────────────────────────────────────────

export default function DesignPage() {
  const [clients, setClients]       = useState<Client[]>([]);
  const [campaigns, setCampaigns]   = useState<Campaign[]>([]);
  const [designs, setDesigns]       = useState<Design[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [error, setError]           = useState<string | null>(null);

  // Modal
  const [open, setOpen]             = useState(false);
  const [editing, setEditing]       = useState<Design | null>(null);
  const [form, setForm]             = useState({ ...BLANK_FORM });
  const [saving, setSaving]         = useState(false);
  const [generating, setGenerating] = useState(false);

  // Brand manual
  const [brandManual, setBrandManual]   = useState<BrandManual | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);

  // Per-card state
  const [expandedBrief, setExpandedBrief]   = useState<Record<string, boolean>>({});
  const [canvaInputs, setCanvaInputs]       = useState<Record<string, string>>({});
  const [canvaSaving, setCanvaSaving]       = useState<Record<string, boolean>>({});
  const [statusDropOpen, setStatusDropOpen] = useState<Record<string, boolean>>({});
  const [statusChanging, setStatusChanging] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]             = useState<string | null>(null);

  // Image generation state
  const [svgPreview, setSvgPreview]         = useState("");
  const [generatingImage, setGeneratingImage] = useState(false);
  const [cardGenImage, setCardGenImage]     = useState<Record<string, boolean>>({});
  const [imageModal, setImageModal]         = useState<Design | null>(null);

  // Dimensions
  const [designWidth, setDesignWidth]   = useState(1080);
  const [designHeight, setDesignHeight] = useState(1350);
  const [presetIdx, setPresetIdx]       = useState(0);
  const [customDims, setCustomDims]     = useState(false);

  // Reference images
  const [refPreviews, setRefPreviews]   = useState<string[]>([]);
  const [refUrls, setRefUrls]           = useState<string[]>([]);

  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── Data loading ─────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setError(null);

    let fromCache = false;
    try {
      const raw = sessionStorage.getItem('xenttech_design_data');
      if (raw) {
        const { d, ts } = JSON.parse(raw);
        if (Date.now() - ts < 5 * 60_000) {
          setClients(d.clients); setCampaigns(d.campaigns); setDesigns(d.designs);
          setLoading(false); fromCache = true;
        }
      }
    } catch {}

    if (!fromCache) setLoading(true);
    try {
      const [clientsRes, campaignsRes, designsRes] = await Promise.all([
        supabase.from("clients").select("id,name,company,industry").order("name"),
        supabase.from("campaigns").select("id,campaign_name,client_id,objective,audience").order("campaign_name"),
        supabase.from("designs").select("*, clients(name,company), campaigns(campaign_name)").order("created_at", { ascending: false }),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      if (campaignsRes.error) throw campaignsRes.error;
      if (designsRes.error) throw designsRes.error;
      setClients(clientsRes.data ?? []);
      setCampaigns(campaignsRes.data ?? []);
      setDesigns(designsRes.data ?? []);
      try { sessionStorage.setItem('xenttech_design_data', JSON.stringify({ d: { clients: clientsRes.data ?? [], campaigns: campaignsRes.data ?? [], designs: designsRes.data ?? [] }, ts: Date.now() })); } catch {}
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error de conexión";
      setError(msg || "Error de conexión. Verifica tu red y reintenta.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Close status dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anyOpen = Object.values(statusDropOpen).some(Boolean);
      if (!anyOpen) return;
      const target = e.target as Node;
      const clickedInside = Object.values(dropdownRefs.current).some(
        ref => ref && ref.contains(target)
      );
      if (!clickedInside) setStatusDropOpen({});
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [statusDropOpen]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const clientCampaigns = campaigns.filter(c => c.client_id === form.client_id);

  const filtered = designs.filter(d =>
    [d.design_type, d.clients?.name, d.clients?.company, d.status].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const statusCounts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = designs.filter(d => d.status === s).length;
    return acc;
  }, {});

  // ── Brand manual detection ────────────────────────────────────────────────

  async function onClientChange(clientId: string) {
    setForm(f => ({ ...f, client_id: clientId, campaign_id: "" }));
    setBrandManual(null);
    if (!clientId) return;
    setBrandLoading(true);
    try {
      const { data } = await supabase
        .from("strategies")
        .select("id,title,foda")
        .eq("client_id", clientId)
        .ilike("title", "Manual de Marca%")
        .limit(1);
      setBrandManual(data?.[0] ?? null);
    } finally {
      setBrandLoading(false);
    }
  }

  // ── Modal ─────────────────────────────────────────────────────────────────

  function openNew() {
    setEditing(null);
    setBrandManual(null);
    setSvgPreview("");
    setForm({ ...BLANK_FORM });
    setDesignWidth(1080); setDesignHeight(1350);
    setPresetIdx(0); setCustomDims(false);
    setRefPreviews([]); setRefUrls([]);
    setOpen(true);
  }

  async function handleRefUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const toUpload = files.slice(0, 3 - refUrls.length);
    for (const file of toUpload) {
      try {
        const fileName = `ref-images/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
        const { error } = await supabase.storage
          .from('client-documents')
          .upload(fileName, file, { contentType: file.type, upsert: false });
        if (error) { console.error('Ref image upload error:', error); continue; }
        const { data: urlData } = supabase.storage.from('client-documents').getPublicUrl(fileName);
        const preview = URL.createObjectURL(file);
        setRefPreviews(prev => [...prev, preview]);
        setRefUrls(prev => [...prev, urlData.publicUrl]);
      } catch (err) {
        console.error('Ref image upload failed:', err);
      }
    }
    e.target.value = '';
  }

  function openEdit(d: Design) {
    setEditing(d);
    setBrandManual(null);
    setSvgPreview(d.image_svg ?? "");
    setForm({
      client_id:    d.client_id,
      campaign_id:  d.campaign_id ?? "",
      design_type:  d.design_type,
      brief_manual: "",
      brief:        d.brief ?? "",
      canva_url:    d.canva_url ?? "",
      status:       (d.status as Status) ?? "pending",
    });
    const w = d.width ?? 1080;
    const h = d.height ?? 1350;
    setDesignWidth(w); setDesignHeight(h);
    const pi = DIMENSION_PRESETS.findIndex(p => p.w === w && p.h === h);
    setPresetIdx(pi >= 0 ? pi : DIMENSION_PRESETS.length - 1);
    setCustomDims(pi < 0);
    setRefPreviews([]);
    setRefUrls((d.reference_images ?? []) as string[]);
    setOpen(true);
  }

  // ── AI brief generation ───────────────────────────────────────────────────

  async function generateBrief() {
    const client = clients.find(c => c.id === form.client_id);
    if (!client) return;
    setGenerating(true);
    setError(null);
    try {
      const typeInfo = getTypeInfo(form.design_type);
      const campaign = campaigns.find(c => c.id === form.campaign_id);
      const bd = parseFoda(brandManual?.foda ?? null);

      const brandLine = brandManual
        ? `MANUAL DE MARCA: Colores: ${bd.color_primary ?? "—"} / ${bd.color_secondary ?? "—"} / ${bd.color_accent ?? "—"}. Tipografía: ${bd.typography_primary ?? "—"}. Tono: ${bd.tone_of_voice ?? "—"}. Aplicar estrictamente.`
        : null;

      const campaignLine = campaign
        ? `Campaña asociada: ${campaign.campaign_name}. Objetivo: ${campaign.objective ?? "—"}. Audiencia: ${campaign.audience ?? "—"}.`
        : null;

      const extraLine = form.brief_manual?.trim()
        ? `Indicaciones adicionales: ${form.brief_manual.trim()}`
        : null;

      const prompt = `Genera un brief creativo profesional para: ${typeInfo.label}

Cliente: ${client.name}${client.company ? ` / ${client.company}` : ""}
Industria: ${client.industry ?? "—"}
${brandLine ? brandLine + "\n" : ""}${campaignLine ? campaignLine + "\n" : ""}${extraLine ? extraLine + "\n" : ""}
ESTRUCTURA DEL BRIEF:
1. CONCEPTO CREATIVO (idea central, narrativa visual)
2. PALETA DE COLORES (HEX exactos, uso de cada color)
3. TIPOGRAFÍA (fuentes, jerarquía H1/H2/body)
4. COMPOSICIÓN Y LAYOUT (estructura, dimensiones recomendadas)
5. ELEMENTOS VISUALES (iconos, fotos, ilustraciones)
6. COPY SUGERIDO (headlines, body text, CTA)
7. ESPECIFICACIONES TÉCNICAS (dimensiones en px, resolución, formato de archivo)
8. NOTAS PARA EL DISEÑADOR`;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Error ${res.status}`);
      }
      const { result } = await res.json();
      setForm(f => ({ ...f, brief: result }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al generar el brief");
    } finally {
      setGenerating(false);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function save() {
    if (!form.client_id) {
      setError("Selecciona un cliente antes de guardar.");
      return;
    }
    setSaving(true);
    setError(null);
    console.log("[design save]", { client_id: form.client_id, design_type: form.design_type, status: form.status, editing: editing?.id ?? null });
    try {
      const cleanBrief = form.brief
        ? form.brief
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/---/g, '')
            .trim()
        : null;

      const payload = {
        client_id:        form.client_id,
        campaign_id:      form.campaign_id || null,
        design_type:      form.design_type,
        brief:            cleanBrief,
        canva_url:        form.canva_url || null,
        status:           form.status,
        image_svg:        svgPreview || (editing?.image_svg ?? null),
        width:            designWidth,
        height:           designHeight,
        reference_images: refUrls.length > 0 ? refUrls : null,
      };
      const typeInfo = getTypeInfo(form.design_type);
      let savedId = editing?.id ?? null;

      if (editing) {
        const { error: err } = await supabase.from("designs").update(payload).eq("id", editing.id);
        console.log("[design save] update result:", err);
        if (err) throw err;
      } else {
        const { data: inserted, error: err } = await supabase.from("designs").insert(payload).select("id").single();
        console.log("[design save] insert result:", { inserted, err });
        if (err) throw err;
        savedId = inserted?.id ?? null;
      }

      // Upload SVG to storage and save image_url
      if (svgPreview && savedId) {
        const imageUrl = await uploadSVGToStorage(svgPreview, form.client_id, form.design_type);
        if (imageUrl) {
          await supabase.from("designs").update({ image_url: imageUrl }).eq("id", savedId);
        }
      }

      await supabase.from("activity_log").insert({
        client_id: form.client_id,
        action: `Brief de diseño ${editing ? "actualizado" : "creado"}: ${typeInfo.label}`,
        details: form.campaign_id ? "campaña vinculada" : "sin campaña",
      });

      setSvgPreview("");
      setOpen(false);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      console.error("[design save] error:", e);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function remove(id: string) {
    setDeleting(id);
    try {
      const design = designs.find(d => d.id === id);
      const { error: err } = await supabase.from("designs").delete().eq("id", id);
      if (err) throw err;
      if (design) {
        await supabase.from("activity_log").insert({
          client_id: design.client_id,
          action: `Diseño eliminado: ${getTypeInfo(design.design_type).label}`,
          details: design.status,
        });
      }
      setDesigns(prev => prev.filter(d => d.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeleting(null);
    }
  }

  // ── Inline status change ──────────────────────────────────────────────────

  async function changeStatus(design: Design, newStatus: Status) {
    setStatusDropOpen(prev => ({ ...prev, [design.id]: false }));
    if (design.status === newStatus) return;
    setStatusChanging(prev => ({ ...prev, [design.id]: true }));
    try {
      const { error: err } = await supabase.from("designs").update({ status: newStatus }).eq("id", design.id);
      if (err) throw err;
      await supabase.from("activity_log").insert({
        client_id: design.client_id,
        action: `Diseño ${getTypeInfo(design.design_type).label} actualizado a ${newStatus}`,
        details: newStatus,
      });
      setDesigns(prev => prev.map(d => d.id === design.id ? { ...d, status: newStatus } : d));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cambiar estado");
    } finally {
      setStatusChanging(prev => ({ ...prev, [design.id]: false }));
    }
  }

  // ── Inline Canva URL save ─────────────────────────────────────────────────

  async function saveCanvaUrl(design: Design) {
    const url = canvaInputs[design.id]?.trim();
    if (!url) return;
    setCanvaSaving(prev => ({ ...prev, [design.id]: true }));
    try {
      const { error: err } = await supabase.from("designs").update({ canva_url: url }).eq("id", design.id);
      if (err) throw err;
      setDesigns(prev => prev.map(d => d.id === design.id ? { ...d, canva_url: url } : d));
      setCanvaInputs(prev => ({ ...prev, [design.id]: "" }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al guardar URL");
    } finally {
      setCanvaSaving(prev => ({ ...prev, [design.id]: false }));
    }
  }

  // ── SVG storage upload ────────────────────────────────────────────────────

  async function uploadSVGToStorage(svg: string, clientId: string, designType: string): Promise<string | null> {
    try {
      const fileName = `${clientId}/design-${designType.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.svg`;
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const { error } = await supabase.storage
        .from('client-documents')
        .upload(fileName, blob, { contentType: 'image/svg+xml', upsert: true });
      if (error) { console.error('Storage upload error:', error); return null; }
      const { data: urlData } = supabase.storage.from('client-documents').getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (e) {
      console.error('Upload failed:', e);
      return null;
    }
  }

  // ── Generate image (modal context) ───────────────────────────────────────

  async function generateImage() {
    const client = clients.find(c => c.id === form.client_id);
    if (!client || !form.brief) return;
    setGeneratingImage(true);
    setError(null);
    try {
      const bd = parseFoda(brandManual?.foda ?? null);
      const brandColors = brandManual
        ? [bd.color_primary, bd.color_secondary, bd.color_accent].filter(Boolean).join(', ')
        : 'Blue #0052CC, Purple #7C3AED, Cyan #06B6D4';

      const res = await fetch('/api/generate-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: form.brief,
          design_type: form.design_type,
          client_name: client.name,
          company: client.company,
          brand_colors: brandColors,
          width: designWidth,
          height: designHeight,
          reference_images: refUrls.length > 0 ? refUrls : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSvgPreview(data.svg);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al generar imagen');
    } finally {
      setGeneratingImage(false);
    }
  }

  // ── Generate image for an existing card ──────────────────────────────────

  async function generateImageForCard(design: Design) {
    const client = clients.find(c => c.id === design.client_id);
    if (!client || !design.brief) return;
    setCardGenImage(prev => ({ ...prev, [design.id]: true }));
    try {
      const res = await fetch('/api/generate-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: design.brief,
          design_type: design.design_type,
          client_name: client.name,
          company: client.company,
          brand_colors: 'Blue #0052CC, Purple #7C3AED, Cyan #06B6D4',
          width: design.width ?? 1080,
          height: design.height ?? 1350,
          reference_images: design.reference_images?.length ? design.reference_images : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const imageUrl = await uploadSVGToStorage(data.svg, design.client_id, design.design_type);
      const { error: err } = await supabase.from('designs').update({
        image_svg: data.svg,
        image_url: imageUrl,
      }).eq('id', design.id);
      if (err) throw err;

      await supabase.from('activity_log').insert({
        client_id: design.client_id,
        action: `Imagen generada: ${getTypeInfo(design.design_type).label}`,
        details: 'SVG creado automáticamente con IA',
      });
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al generar imagen');
    } finally {
      setCardGenImage(prev => ({ ...prev, [design.id]: false }));
    }
  }

  // ── Download SVG as PNG ──────────────────────────────────────────────────

  function downloadAsPNG(design: Design) {
    if (!design.image_svg) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = design.width ?? 1080;
    canvas.height = design.height ?? 1350;
    const blob = new Blob([design.image_svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(pngBlob => {
        if (!pngBlob) return;
        const link = document.createElement('a');
        link.download = `XENTTECH-${design.design_type.replace(/\s+/g, '-')}.png`;
        link.href = URL.createObjectURL(pngBlob);
        link.click();
        URL.revokeObjectURL(link.href);
      }, 'image/png');
    };
    img.src = url;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <Header title="Diseño" description="Briefs y piezas creativas para tus clientes" />

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

        {/* Status summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATUSES.map(status => (
            <div key={status} className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-4 text-center">
              <p className="text-[11px] text-[#64748B] uppercase tracking-wider mb-1.5">
                {STATUS_META[status].label}
              </p>
              <p className={cn("text-2xl font-bold", STATUS_COUNT_TEXT[status])}>
                {statusCounts[status] ?? 0}
              </p>
              <div className={cn("mx-auto mt-2 h-1 w-8 rounded-full", STATUS_META[status].dot, "opacity-40")} />
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
            <Input
              placeholder="Buscar piezas..."
              className="pl-9 bg-[#0D0D1F] border-[#1A1A35] text-white placeholder:text-[#64748B]"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button
            onClick={openNew}
            className="bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 font-semibold gap-2"
          >
            <Plus className="h-4 w-4" /> Nueva pieza
          </Button>
        </div>

        {/* Design list */}
        {loading ? (
          <PageSkeleton rows={4} cols={2} cardHeight={160} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.length === 0 && (
              <p className="col-span-2 text-center text-[#64748B] py-12">
                No hay piezas todavía. ¡Crea la primera!
              </p>
            )}

            {filtered.map(d => {
              const typeInfo   = getTypeInfo(d.design_type);
              const statusMeta = STATUS_META[(d.status as Status)] ?? STATUS_META.pending;
              const briefOpen  = expandedBrief[d.id] ?? false;
              const dropOpen   = statusDropOpen[d.id] ?? false;
              const isChanging = statusChanging[d.id] ?? false;

              return (
                <div
                  key={d.id}
                  className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-5 hover:border-[#00D4AA]/20 transition-colors flex flex-col gap-3"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-2xl leading-none mt-0.5 shrink-0">{typeInfo.icon}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-white leading-tight">{typeInfo.label}</p>
                        <p className="text-xs text-[#64748B] mt-0.5 truncate">
                          {d.clients?.name}
                          {d.clients?.company ? ` · ${d.clients.company}` : ""}
                          {d.campaigns?.campaign_name ? ` · ${d.campaigns.campaign_name}` : ""}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Status badge + dropdown */}
                      <div
                        className="relative"
                        ref={el => { dropdownRefs.current[d.id] = el; }}
                      >
                        <button
                          onClick={() => setStatusDropOpen(prev => ({ ...prev, [d.id]: !prev[d.id] }))}
                          disabled={isChanging}
                          className={cn(
                            "flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border transition-colors",
                            statusMeta.color,
                            "hover:opacity-80"
                          )}
                        >
                          {isChanging
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : statusMeta.label
                          }
                          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                        </button>

                        {dropOpen && (
                          <div className="absolute right-0 top-full mt-1 z-20 min-w-[130px] rounded-lg border border-white/[0.08] bg-[#0f1117] shadow-xl py-1">
                            {STATUSES.map(s => (
                              <button
                                key={s}
                                onClick={() => changeStatus(d, s)}
                                className={cn(
                                  "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-white/[0.06] transition-colors",
                                  d.status === s ? "text-[#00D4AA]" : "text-[#94A3B8]"
                                )}
                              >
                                {d.status === s && <Check className="h-3 w-3 shrink-0" />}
                                {d.status !== s && <span className="w-3 shrink-0" />}
                                {STATUS_META[s].label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* PDF download */}
                      {d.pdf_url && (
                        <a
                          href={d.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-blue-500/10 text-[#64748B] hover:text-blue-400 transition-colors"
                          title="Descargar PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}

                      {/* Canva link */}
                      {d.canva_url && (
                        <a
                          href={d.canva_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#64748B] hover:text-[#00D4AA] transition-colors"
                          title="Ver en Canva"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}

                      {/* Edit */}
                      <button
                        onClick={() => openEdit(d)}
                        className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#64748B] hover:text-white transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => remove(d.id)}
                        disabled={deleting === d.id}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#64748B] hover:text-red-400 transition-colors"
                        title="Eliminar"
                      >
                        {deleting === d.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                      </button>
                    </div>
                  </div>

                  {/* Canva URL inline input (if no URL yet) */}
                  {!d.canva_url && (
                    <div className="flex items-center gap-2">
                      <Input
                        value={canvaInputs[d.id] ?? ""}
                        onChange={e => setCanvaInputs(prev => ({ ...prev, [d.id]: e.target.value }))}
                        placeholder="Pegar URL de Canva..."
                        className="h-7 text-xs bg-white/[0.03] border-[#1A1A35] text-white placeholder:text-[#64748B] flex-1"
                      />
                      <Button
                        size="sm"
                        disabled={!canvaInputs[d.id]?.trim() || canvaSaving[d.id]}
                        onClick={() => saveCanvaUrl(d)}
                        className="h-7 px-2 bg-[#00D4AA]/10 text-[#00D4AA] hover:bg-[#00D4AA]/20 border border-[#00D4AA]/20 text-xs"
                      >
                        {canvaSaving[d.id]
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Save className="h-3 w-3" />
                        }
                      </Button>
                    </div>
                  )}

                  {/* Canva link text */}
                  {d.canva_url && (
                    <a
                      href={d.canva_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-[#00D4AA] hover:underline w-fit"
                    >
                      <ExternalLink className="h-3 w-3" /> Ver en Canva →
                    </a>
                  )}

                  {/* Brief expandable */}
                  {d.brief && (
                    <div>
                      <button
                        onClick={() => setExpandedBrief(prev => ({ ...prev, [d.id]: !prev[d.id] }))}
                        className="flex items-center gap-1 text-[10px] text-[#64748B] hover:text-[#94A3B8] transition-colors"
                      >
                        {briefOpen
                          ? <><ChevronUp className="h-3 w-3" /> Ocultar brief</>
                          : <><ChevronDown className="h-3 w-3" /> Ver brief</>
                        }
                      </button>
                      {briefOpen && (
                        <div className="mt-2 rounded-lg bg-white/[0.03] border border-[#1A1A35] p-3 max-h-48 overflow-y-auto">
                          <p className="text-xs text-[#94A3B8] whitespace-pre-wrap leading-relaxed">{d.brief}</p>
                        </div>
                      )}
                      {!briefOpen && (
                        <p className="mt-1 text-xs text-[#64748B] line-clamp-2 leading-relaxed">{d.brief}</p>
                      )}
                    </div>
                  )}

                  {/* SVG image preview */}
                  {d.image_svg && (
                    <div>
                      <div
                        className="w-full rounded-xl overflow-hidden border border-white/[0.08] cursor-pointer hover:border-purple-500/30 transition-colors [&_svg]:w-full [&_svg]:h-auto [&_svg]:block"
                        onClick={() => setImageModal(d)}
                        title="Ver en pantalla completa"
                      >
                        {/* eslint-disable-next-line react/no-danger */}
                        <div style={{ lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: d.image_svg }} />
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => downloadAsPNG(d)}
                          className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg border border-purple-500/30 bg-purple-500/[0.08] text-purple-400 hover:bg-purple-500/15 transition-colors"
                        >
                          <Download className="h-3 w-3" /> PNG
                        </button>
                        {d.image_url && (
                          <a href={d.image_url} target="_blank" rel="noopener noreferrer" download
                            className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg border border-blue-500/30 bg-blue-500/[0.08] text-blue-400 hover:bg-blue-500/15 transition-colors"
                          >
                            <Download className="h-3 w-3" /> SVG
                          </a>
                        )}
                        <button
                          onClick={() => generateImageForCard(d)}
                          disabled={cardGenImage[d.id]}
                          className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[#64748B] hover:text-[#94A3B8] transition-colors disabled:opacity-50"
                        >
                          {cardGenImage[d.id]
                            ? <><Loader2 className="h-3 w-3 animate-spin" /> Generando...</>
                            : <><RefreshCw className="h-3 w-3" /> Regenerar</>
                          }
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Generate image button (brief exists, no image yet) */}
                  {d.brief && !d.image_svg && (
                    <button
                      onClick={() => generateImageForCard(d)}
                      disabled={cardGenImage[d.id]}
                      className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50 transition-colors w-fit"
                    >
                      {cardGenImage[d.id]
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Generando imagen...</>
                        : <><Sparkles className="h-3 w-3" /> Generar imagen con IA</>
                      }
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ─────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0D0D1F] border-white/[0.08] text-white max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#00D4AA]">
              {editing ? "Editar pieza de diseño" : "Nueva pieza de diseño"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">

            {/* Row 1: client + design type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#64748B] mb-1.5 block">
                  Cliente <span className="text-red-400">*</span>
                </label>
                <Select value={form.client_id} onValueChange={onClientChange}>
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
                <label className="text-xs text-[#64748B] mb-1.5 block">
                  Tipo de pieza <span className="text-red-400">*</span>
                </label>
                <Select
                  value={form.design_type}
                  onValueChange={v => setForm(f => ({ ...f, design_type: v }))}
                >
                  <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                    {DESIGN_TYPES.map(t => (
                      <SelectItem key={t.key} value={t.key} className="text-white hover:bg-white/[0.06]">
                        {t.icon} {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Brand manual loading / detected */}
            {brandLoading && (
              <div className="flex items-center gap-2 text-xs text-[#64748B]">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando manual de marca...
              </div>
            )}
            {brandManual && !brandLoading && (
              <div className="rounded-lg border border-[#00D4AA]/30 bg-[#00D4AA]/[0.05] p-3 flex items-start gap-2.5">
                <BookOpen className="h-4 w-4 text-[#00D4AA] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-[#00D4AA]">
                    ✓ Manual de marca detectado — colores y estilo aplicados
                  </p>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">{brandManual.title}</p>
                </div>
              </div>
            )}

            {/* Campaign */}
            <div>
              <label className="text-xs text-[#64748B] mb-1.5 block">Campaña (opcional)</label>
              <Select
                value={form.campaign_id || "__none__"}
                onValueChange={v => setForm(f => ({ ...f, campaign_id: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white">
                  <SelectValue placeholder="Sin campaña asociada" />
                </SelectTrigger>
                <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                  <SelectItem value="__none__" className="text-[#64748B] hover:bg-white/[0.06]">
                    Sin campaña
                  </SelectItem>
                  {clientCampaigns.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-white hover:bg-white/[0.06]">
                      {c.campaign_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.client_id && clientCampaigns.length === 0 && (
                <p className="text-[11px] text-[#64748B] mt-1">No hay campañas para este cliente.</p>
              )}
            </div>

            {/* Dimension presets */}
            <div>
              <label className="text-xs text-[#64748B] mb-1.5 block">Dimensiones del canvas</label>
              <Select
                value={String(presetIdx)}
                onValueChange={v => {
                  const idx = Number(v);
                  setPresetIdx(idx);
                  const p = DIMENSION_PRESETS[idx];
                  if (p.w > 0) { setDesignWidth(p.w); setDesignHeight(p.h); setCustomDims(false); }
                  else setCustomDims(true);
                }}
              >
                <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                  {DIMENSION_PRESETS.map((p, i) => (
                    <SelectItem key={i} value={String(i)} className="text-white hover:bg-white/[0.06]">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customDims ? (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    value={designWidth}
                    onChange={e => setDesignWidth(Number(e.target.value))}
                    placeholder="Ancho (px)"
                    className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B] text-sm"
                  />
                  <span className="text-[#64748B] text-sm shrink-0">×</span>
                  <Input
                    type="number"
                    value={designHeight}
                    onChange={e => setDesignHeight(Number(e.target.value))}
                    placeholder="Alto (px)"
                    className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B] text-sm"
                  />
                </div>
              ) : (
                <p className="text-[11px] text-[#64748B] mt-1">{designWidth} × {designHeight} px</p>
              )}
            </div>

            {/* Extra context / brief_manual */}
            <div>
              <label className="text-xs text-[#64748B] mb-1.5 block">
                Indicaciones adicionales (opcional)
              </label>
              <Textarea
                value={form.brief_manual}
                onChange={e => setForm(f => ({ ...f, brief_manual: e.target.value }))}
                rows={2}
                placeholder="Describe detalles específicos: colores preferidos, referencias visuales, textos clave..."
                className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B] resize-none text-sm"
              />
            </div>

            {/* Reference images */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-[#64748B]">Imágenes de referencia (máx. 3)</label>
                {refUrls.length < 3 && (
                  <label className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 cursor-pointer transition-colors">
                    <ImagePlus className="h-3.5 w-3.5" />
                    Subir imagen
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleRefUpload}
                    />
                  </label>
                )}
              </div>
              {refUrls.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {refUrls.map((url, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={refPreviews[i] || url}
                        alt={`Referencia ${i + 1}`}
                        className="h-16 w-16 object-cover rounded-lg border border-white/[0.08]"
                      />
                      <button
                        onClick={() => {
                          setRefUrls(prev => prev.filter((_, j) => j !== i));
                          setRefPreviews(prev => prev.filter((_, j) => j !== i));
                        }}
                        className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#64748B]">
                  Sube hasta 3 imágenes para guiar el estilo del diseño generado por IA.
                </p>
              )}
            </div>

            {/* AI generate button */}
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#64748B]">Brief creativo</label>
              <Button
                size="sm"
                variant="ghost"
                onClick={generateBrief}
                disabled={generating || !form.client_id}
                className="h-7 px-3 text-[#00D4AA] hover:text-[#00D4AA] hover:bg-[#00D4AA]/10 disabled:opacity-40 gap-1.5 text-xs"
              >
                {generating
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Generando...</>
                  : <><Sparkles className="h-3 w-3" /> Generar brief con IA{brandManual ? " + Manual" : ""}</>
                }
              </Button>
            </div>
            <Textarea
              value={form.brief}
              onChange={e => setForm(f => ({ ...f, brief: e.target.value }))}
              rows={10}
              placeholder="El brief aparecerá aquí tras generarlo con IA, o escríbelo manualmente..."
              className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B] resize-none text-sm font-mono leading-relaxed"
            />

            {/* Row: status */}
            <div>
              <label className="text-xs text-[#64748B] mb-1.5 block">Estado</label>
              <Select
                value={form.status}
                onValueChange={v => setForm(f => ({ ...f, status: v as Status }))}
              >
                <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                  {STATUSES.map(s => (
                    <SelectItem key={s} value={s} className="text-white hover:bg-white/[0.06]">
                      {STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Canva URL in modal */}
            <div>
              <label className="text-xs text-[#64748B] mb-1.5 block">URL de Canva (opcional)</label>
              <Input
                value={form.canva_url}
                onChange={e => setForm(f => ({ ...f, canva_url: e.target.value }))}
                placeholder="https://www.canva.com/design/..."
                className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B]"
              />
            </div>

            {/* Generate image */}
            {form.brief && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-[#64748B]">Imagen del diseño (AI)</label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={generateImage}
                    disabled={generatingImage || !form.brief}
                    className="h-7 px-3 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 disabled:opacity-40 gap-1.5 text-xs"
                  >
                    {generatingImage
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Generando...</>
                      : <><Sparkles className="h-3 w-3" /> {svgPreview ? "Regenerar imagen" : "Generar imagen del diseño"}</>
                    }
                  </Button>
                </div>
                {svgPreview && (
                  <div
                    className="w-full rounded-xl overflow-hidden border border-white/[0.08] cursor-pointer hover:border-purple-500/30 transition-colors [&_svg]:w-full [&_svg]:h-auto [&_svg]:block"
                    title="Clic para ver en pantalla completa"
                    onClick={() => setImageModal({ id: 'preview', client_id: form.client_id, campaign_id: null, design_type: form.design_type, brief: form.brief, canva_url: null, status: form.status, pdf_url: null, image_svg: svgPreview, image_url: null, created_at: '' })}
                  >
                    {/* eslint-disable-next-line react/no-danger */}
                    <div style={{ lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svgPreview }} />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-[#64748B] hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              onClick={save}
              disabled={saving || !form.client_id}
              className="bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 font-semibold min-w-[90px]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Image full-screen modal ──────────────────────────────────────── */}
      {imageModal && (
        <Dialog open={!!imageModal} onOpenChange={() => setImageModal(null)}>
          <DialogContent className="bg-[#07070f] border-white/[0.08] text-white max-w-3xl w-full p-4">
            <DialogHeader>
              <DialogTitle className="text-purple-300 text-sm flex items-center gap-2">
                <span>{getTypeInfo(imageModal.design_type).icon}</span>
                <span>{getTypeInfo(imageModal.design_type).label}</span>
                {imageModal.clients?.name && (
                  <span className="text-[#64748B] font-normal">— {imageModal.clients.name}{imageModal.clients.company ? ` / ${imageModal.clients.company}` : ''}</span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="w-full rounded-xl border border-[#1A1A35] overflow-hidden [&_svg]:w-full [&_svg]:h-auto [&_svg]:block">
              {imageModal.image_svg && (
                // eslint-disable-next-line react/no-danger
                <div style={{ lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: imageModal.image_svg }} />
              )}
            </div>
            <DialogFooter className="gap-2">
              {imageModal.image_svg && (
                <Button
                  onClick={() => downloadAsPNG(imageModal)}
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-2 font-semibold"
                >
                  <Download className="h-4 w-4" /> Descargar PNG
                </Button>
              )}
              <Button variant="ghost" onClick={() => setImageModal(null)} className="text-[#64748B] hover:text-white">
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
