"use client";
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  BookOpen, Sparkles, Loader2, Copy, Check, RefreshCw,
  ChevronDown, ChevronRight, Trash2, AlertCircle, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Client { id: string; name: string; company: string | null; industry: string | null; }
interface BrandManual {
  id: string; client_id: string; title: string; content: string | null;
  foda: any; status: string; created_at: string; pdf_url?: string | null;
  clients?: { name: string; company: string | null };
}

const TONES = ["profesional", "casual", "divertido", "autoritativo", "inspiracional"];

const BLANK_FORM = {
  client_id: "", brand_name: "", slogan: "", industry: "", target_audience: "",
  brand_values: "", primary_color: "#00D4AA", secondary_color: "#0F0F1A",
  accent_color: "#00C8FF", typography_primary: "", typography_secondary: "",
  tone_of_voice: "profesional", logo_description: "", competitors: "",
};

const supabase = createClient();

export default function BrandManualPage() {
  const [clients, setClients]     = useState<Client[]>([]);
  const [manuals, setManuals]     = useState<BrandManual[]>([]);
  const [loading, setLoading]     = useState(true);
  const [form, setForm]           = useState<any>({ ...BLANK_FORM });
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [preview, setPreview]     = useState<BrandManual | null>(null);
  const [copied, setCopied]       = useState(false);
  const [expanded, setExpanded]   = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    let fromCache = false;
    try {
      const raw = sessionStorage.getItem('xenttech_brandmanual_data');
      if (raw) {
        const { d, ts } = JSON.parse(raw);
        if (Date.now() - ts < 5 * 60_000) {
          setClients(d.clients); setManuals(d.manuals);
          setLoading(false); fromCache = true;
        }
      }
    } catch {}
    if (!fromCache) setLoading(true);
    try {
      const [clientsRes, manualsRes] = await Promise.all([
        supabase.from("clients").select("id,name,company,industry").order("name"),
        supabase.from("strategies").select("*, clients(name,company)").ilike("title", "Manual de Marca%").order("created_at", { ascending: false }),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      if (manualsRes.error) throw manualsRes.error;
      setClients(clientsRes.data ?? []);
      setManuals(manualsRes.data ?? []);
      try { sessionStorage.setItem('xenttech_brandmanual_data', JSON.stringify({ d: { clients: clientsRes.data ?? [], manuals: manualsRes.data ?? [] }, ts: Date.now() })); } catch {}
    } catch {
      setError("Error de conexión. Verifica tu red y reintenta.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const c = clients.find(c => c.id === form.client_id);
    if (c?.industry) setForm((f: any) => ({ ...f, industry: c.industry ?? f.industry }));
  }, [form.client_id, clients]);

  function set(k: string, v: string) { setForm((f: any) => ({ ...f, [k]: v })); }

  async function generateManual() {
    if (!form.client_id || !form.brand_name) return;
    setGenerating(true);
    setError(null);
    try {
      const prompt = `Genera un Manual de Marca profesional completo para:

Marca: ${form.brand_name}
Slogan: ${form.slogan || "N/A"}
Industria: ${form.industry}
Audiencia: ${form.target_audience}
Valores: ${form.brand_values}
Colores: Primario ${form.primary_color}, Secundario ${form.secondary_color}, Acento ${form.accent_color}
Tipografía: ${form.typography_primary} / ${form.typography_secondary || "N/A"}
Tono: ${form.tone_of_voice}
Logo: ${form.logo_description || "N/A"}
Competidores: ${form.competitors || "N/A"}

ESTRUCTURA DEL MANUAL:

1. IDENTIDAD DE MARCA
   - Misión y visión
   - Propuesta de valor única
   - Personalidad de marca (arquetipos)
   - Valores fundamentales expandidos

2. IDENTIDAD VISUAL
   - Paleta de colores (códigos HEX, RGB, CMYK para cada color)
   - Usos correctos e incorrectos de colores
   - Tipografía (jerarquía: H1, H2, H3, body, captions)
   - Espaciado y márgenes mínimos
   - Tratamiento fotográfico (estilo, filtros, composición)

3. LOGOTIPO
   - Versiones permitidas (horizontal, vertical, isotipo)
   - Área de respeto mínima
   - Tamaños mínimos
   - Aplicaciones sobre fondos claros y oscuros
   - Usos prohibidos

4. VOZ Y TONO
   - Guía de tono por canal (redes sociales, email, web, impreso)
   - Vocabulario de marca (palabras a usar vs evitar)
   - Ejemplos de mensajes por canal
   - Hashtags oficiales

5. APLICACIONES
   - Tarjetas de presentación
   - Papelería corporativa
   - Firma de email
   - Redes sociales (portadas, posts, stories)
   - Presentaciones
   - Sitio web

6. DO'S AND DON'TS
   - Lista de buenas prácticas
   - Lista de errores comunes a evitar`;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
      const { result } = await res.json();

      setSaving(true);
      const { data: saved, error: insertErr } = await supabase
        .from("strategies")
        .insert({
          client_id: form.client_id,
          title:     `Manual de Marca — ${form.brand_name}`,
          content:   result,
          status:    "draft",
          foda: {
            brand_name: form.brand_name, slogan: form.slogan, industry: form.industry,
            target_audience: form.target_audience, brand_values: form.brand_values,
            primary_color: form.primary_color, secondary_color: form.secondary_color,
            accent_color: form.accent_color, typography_primary: form.typography_primary,
            typography_secondary: form.typography_secondary, tone_of_voice: form.tone_of_voice,
            logo_description: form.logo_description, competitors: form.competitors,
          },
        })
        .select("*, clients(name,company)")
        .single();

      if (insertErr) throw insertErr;

      await supabase.from("activity_log").insert({
        client_id: form.client_id,
        action: "Manual de marca generado",
        details: form.brand_name,
      });

      // Generate PDF (best-effort)
      if (saved) {
        const client = clients.find(c => c.id === form.client_id);
        try {
          const pdfRes = await fetch("/api/generate-pdf", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: result, title: `Manual de Marca — ${form.brand_name}`,
              client_name: client?.name ?? "", company: client?.company ?? "",
              step_name: "Manual de Marca", client_id: form.client_id,
              document_type: "brand-manual", document_id: saved.id,
            }),
          });
          if (pdfRes.ok) {
            const { pdf_url } = await pdfRes.json();
            if (pdf_url) (saved as any).pdf_url = pdf_url;
          }
        } catch {}
      }

      await load();
      if (saved) setPreview(saved as BrandManual);
    } catch (e: any) {
      setError(e.message ?? "Error al generar");
    } finally { setGenerating(false); setSaving(false); }
  }

  async function regenerate(manual: BrandManual) {
    const data = manual.foda ?? {};
    setForm({ ...BLANK_FORM, ...data, client_id: manual.client_id, brand_name: data.brand_name ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteManual(id: string) {
    setDeleting(id);
    try {
      const { error: err } = await supabase.from("strategies").delete().eq("id", id);
      if (err) throw err;
      setManuals(prev => prev.filter(m => m.id !== id));
      if (preview?.id === id) setPreview(null);
    } catch (e: any) {
      setError(e.message ?? "Error al eliminar");
    } finally { setDeleting(null); }
  }

  async function copyContent(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const F = ({ label, k, type = "text", placeholder = "" }: any) => (
    <div>
      <label className="text-xs text-[#64748B] mb-1 block">{label}</label>
      {type === "textarea" ? (
        <Textarea value={form[k] ?? ""} onChange={e => set(k, e.target.value)}
          rows={2} placeholder={placeholder}
          className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B] resize-none text-sm" />
      ) : type === "color" ? (
        <div className="flex gap-2 items-center">
          <input type="color" value={form[k] ?? "#000000"} onChange={e => set(k, e.target.value)}
            className="h-9 w-12 rounded cursor-pointer bg-transparent border-0" />
          <Input value={form[k] ?? ""} onChange={e => set(k, e.target.value)}
            className="bg-[#0D0D1F] border-white/[0.08] text-white font-mono text-sm flex-1" />
        </div>
      ) : (
        <Input value={form[k] ?? ""} onChange={e => set(k, e.target.value)}
          placeholder={placeholder}
          className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B] text-sm" />
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <Header title="Manual de Marca" description="Genera manuales de marca completos con IA" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-300 flex-1">{error}</p>
            <button onClick={() => { setError(null); load(); }}
              className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs">
              <RefreshCw className="h-3 w-3" /> Reintentar
            </button>
          </div>
        )}

        {/* Form */}
        <div className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-4 w-4 text-[#00D4AA]" />
            <p className="font-semibold text-white">Datos de marca</p>
          </div>

          <div>
            <label className="text-xs text-[#64748B] mb-1 block">Cliente *</label>
            <Select value={form.client_id} onValueChange={v => set("client_id", v)}>
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

          <div className="grid grid-cols-2 gap-4">
            <F label="Nombre de la marca *" k="brand_name" placeholder="Ej: XENTTECH" />
            <F label="Slogan / Tagline" k="slogan" placeholder="Ej: Innovación sin límites" />
            <F label="Industria / Nicho" k="industry" placeholder="Ej: Marketing Digital" />
            <div>
              <label className="text-xs text-[#64748B] mb-1 block">Tono de comunicación</label>
              <Select value={form.tone_of_voice} onValueChange={v => set("tone_of_voice", v)}>
                <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                  {TONES.map(t => <SelectItem key={t} value={t} className="text-white hover:bg-white/[0.06] capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <F label="Audiencia objetivo" k="target_audience" type="textarea" placeholder="Ej: Empresarios 30-50 años en Latinoamérica..." />
            <F label="Valores de marca" k="brand_values" type="textarea" placeholder="Ej: Innovación, Confianza, Resultados..." />
          </div>

          <div>
            <p className="text-xs text-[#64748B] mb-2 font-semibold uppercase tracking-wider">Paleta de colores</p>
            <div className="grid grid-cols-3 gap-4">
              <F label="Color primario" k="primary_color" type="color" />
              <F label="Color secundario" k="secondary_color" type="color" />
              <F label="Color de acento" k="accent_color" type="color" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <F label="Tipografía principal" k="typography_primary" placeholder="Ej: DM Sans, Montserrat" />
            <F label="Tipografía secundaria" k="typography_secondary" placeholder="Ej: Georgia, Lora" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <F label="Descripción del logo" k="logo_description" type="textarea" placeholder="Describe el logo actual o deseado..." />
            <F label="Competidores principales" k="competitors" type="textarea" placeholder="Ej: Agencia X, Estudio Y..." />
          </div>

          <Button
            onClick={generateManual}
            disabled={generating || saving || !form.client_id || !form.brand_name}
            className="w-full bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 font-bold gap-2 py-3"
          >
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generando Manual de Marca...</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Generar Manual de Marca con IA</>
            )}
          </Button>
        </div>

        {/* Saved manuals */}
        {manuals.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-[#64748B] uppercase tracking-wider font-semibold">Manuales guardados</p>
            {manuals.map(m => {
              const isOpen = expanded[m.id];
              return (
                <div key={m.id} className="rounded-xl border border-[#1A1A35] overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 bg-[#0D0D1F]">
                    <button onClick={() => setExpanded(e => ({ ...e, [m.id]: !isOpen }))}
                      className="flex items-center gap-3 flex-1 text-left">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-[#64748B]" /> : <ChevronRight className="h-4 w-4 text-[#64748B]" />}
                      <div>
                        <p className="font-semibold text-white">{m.title}</p>
                        <p className="text-xs text-[#64748B]">{m.clients?.name} · {new Date(m.created_at).toLocaleDateString("es-MX")}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px]">{m.status}</Badge>
                      {m.pdf_url && (
                        <a href={m.pdf_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-blue-500/10 text-[#64748B] hover:text-blue-400 transition-colors" title="Descargar PDF">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button onClick={() => regenerate(m)} title="Regenerar"
                        className="p-1.5 rounded hover:bg-white/[0.06] text-[#64748B] hover:text-[#00D4AA] transition-colors">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => m.content && copyContent(m.content)}
                        className="p-1.5 rounded hover:bg-white/[0.06] text-[#64748B] hover:text-white transition-colors">
                        {copied ? <Check className="h-3.5 w-3.5 text-[#00D4AA]" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => deleteManual(m.id)} disabled={deleting === m.id}
                        className="p-1.5 rounded hover:bg-red-500/10 text-[#64748B] hover:text-red-400 transition-colors">
                        {deleting === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  {isOpen && m.content && (
                    <div className="px-5 py-4 bg-black/10 border-t border-[#1A1A35]">
                      <pre className="whitespace-pre-wrap text-xs text-[#94A3B8] font-sans leading-relaxed">{m.content}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview modal */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="bg-[#0D0D1F] border-white/[0.08] text-white max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-[#00D4AA] flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> {preview?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <div className="rounded-xl bg-black/20 border border-[#1A1A35] p-5">
              <pre className="text-xs text-[#94A3B8] whitespace-pre-wrap font-sans leading-relaxed">{preview?.content}</pre>
            </div>
          </div>
          <DialogFooter className="mt-4 gap-2">
            {preview?.pdf_url && (
              <a href={preview.pdf_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                <Download className="h-4 w-4" /> Descargar PDF
              </a>
            )}
            <Button variant="ghost" onClick={() => preview?.content && copyContent(preview.content)} className="text-[#64748B] gap-2">
              {copied ? <Check className="h-4 w-4 text-[#00D4AA]" /> : <Copy className="h-4 w-4" />} Copiar
            </Button>
            <Button onClick={() => setPreview(null)} className="bg-[#00D4AA] text-black font-semibold">Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
