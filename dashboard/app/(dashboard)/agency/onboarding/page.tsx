"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  Loader2, Sparkles, Copy, Eye, RefreshCw, Zap, AlertCircle, CheckCircle2,
  Check, Download, ClipboardList, PenLine, Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ONBOARDING_STEPS, buildPrompt, parseConfig } from "@/lib/onboarding-prompts";
import type { ClientBasic, DiscoveryData } from "@/lib/onboarding-prompts";
import { generateAndDownloadPDF } from "@/lib/generate-pdf-client";

interface Client {
  id: string; name: string; company: string | null;
  onboarding_step: number | null; notes: string | null;
  email?: string | null; phone?: string | null;
  industry?: string | null; plan?: string | null;
  monthly_revenue?: number | null;
  contract_signed?: boolean | null;
  signature_data?: string | null;
}

interface OnbDoc {
  id: string; client_id: string; step_number: number;
  step_name: string; content: string | null;
  status: string; created_at: string; pdf_url?: string | null;
}

const BLANK_DISCOVERY: DiscoveryData = {
  descripcion_negocio: "",
  producto_estrella: "",
  cliente_ideal: "",
  competidores: "",
  diferenciador: "",
  objetivo_principal: "",
  presupuesto_ads: "",
  canales_actuales: "",
  resultados_30_dias: "",
  resultados_90_dias: "",
};

const supabase = createClient();

// AI-generatable steps (exclude step 4 = Discovery Form)
const AI_STEPS = ONBOARDING_STEPS.filter(s => s.number !== 4);

export default function OnboardingPage() {
  const [clients, setClients]           = useState<Client[]>([]);
  const [selectedId, setSelectedId]     = useState("");
  const [docs, setDocs]                 = useState<OnbDoc[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadingDocs, setLoadingDocs]   = useState(false);
  const [generatingStep, setGeneratingStep] = useState<number | null>(null);
  const [genAllProgress, setGenAllProgress] = useState<{ current: number; total: number; stepName: string } | null>(null);
  const [viewDoc, setViewDoc]           = useState<OnbDoc | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [copied, setCopied]             = useState<number | null>(null);

  // Discovery form state
  const [discoveryForm, setDiscoveryForm] = useState<DiscoveryData>({ ...BLANK_DISCOVERY });
  const [savingDiscovery, setSavingDiscovery] = useState(false);
  const [discoveryEditing, setDiscoveryEditing] = useState(false);

  const loadClients = useCallback(async () => {
    setError(null);
    let fromCache = false;
    try {
      const raw = sessionStorage.getItem('xenttech_onboarding_clients');
      if (raw) {
        const { d, ts } = JSON.parse(raw);
        if (Date.now() - ts < 10 * 60_000) {
          setClients(d); if (d.length) setSelectedId((prev: string) => prev || d[0].id);
          setLoading(false); fromCache = true;
        }
      }
    } catch {}
    if (!fromCache) setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("clients")
        .select("id,name,company,onboarding_step,notes,email,phone,industry,plan,monthly_revenue,contract_signed,signature_data")
        .order("name");
      if (err) throw err;
      setClients(data ?? []);
      if (data?.length) setSelectedId((prev: string) => prev || data[0].id);
      try { sessionStorage.setItem('xenttech_onboarding_clients', JSON.stringify({ d: data ?? [], ts: Date.now() })); } catch {}
    } catch (e: any) {
      setError(e.message ?? "Error al cargar clientes");
    } finally { setLoading(false); }
  }, []);

  const loadDocs = useCallback(async (clientId: string) => {
    setLoadingDocs(true);
    try {
      const { data, error: err } = await supabase
        .from("onboarding_documents")
        .select("*").eq("client_id", clientId).order("step_number");
      if (err) throw err;
      setDocs(data ?? []);
      // Pre-fill discovery form if step 4 has saved data
      const disc = (data ?? []).find((d: OnbDoc) => d.step_number === 4);
      if (disc?.content) {
        try { setDiscoveryForm({ ...BLANK_DISCOVERY, ...JSON.parse(disc.content) }); } catch {}
      } else {
        setDiscoveryForm({ ...BLANK_DISCOVERY });
      }
    } catch (e: any) {
      setError(e.message ?? "Error al cargar documentos");
    } finally { setLoadingDocs(false); }
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);
  useEffect(() => { if (selectedId) loadDocs(selectedId); }, [selectedId, loadDocs]);

  const selectedClient = clients.find(c => c.id === selectedId);
  const cfg = selectedClient ? parseConfig(selectedClient.notes) : null;
  const getDoc = (n: number) => docs.find(d => d.step_number === n);
  const completedCount = ONBOARDING_STEPS.filter(s => getDoc(s.number)?.status === "completado").length;
  const discoveryDoc = getDoc(4);

  const FMT_ONBOARDING = "\n\nFORMATO OBLIGATORIO: Escribe en texto corrido profesional. NO uses markdown, hashtags (#), asteriscos (*), backticks, code blocks, viñetas con guion (-), ni emojis. Para titulos usa MAYUSCULAS. Para listas usa letras: a), b), c). Para separar secciones usa una linea en blanco. El documento debe leerse como si lo redacto un profesional, no una inteligencia artificial.";

  function getGenericPrompt(stepNum: number, c: Client): string {
    const name = c.name;
    const co = c.company ? ` (${c.company})` : "";
    const industry = c.industry ?? "marketing digital";
    const prompts: Record<number, string> = {
      1: `Genera un contrato de prestacion de servicios de marketing digital y tecnologia para:\nCliente: ${name}${co}\n\nIncluye: declaraciones, objeto del contrato, alcance de los servicios, obligaciones de la agencia y del cliente, contraprestacion y forma de pago, vigencia, terminacion anticipada, propiedad intelectual, confidencialidad, jurisdiccion en Chihuahua. Seccion FIRMAS al final con campos para nombre, cargo, fecha y firma de ambas partes. Formato legal mexicano, numeracion en mayusculas (PRIMERA, SEGUNDA). Sin markdown.`,
      2: `Genera una factura profesional de servicios de marketing digital para:\nEmisor: XENTTECH\nReceptor: ${name}${co}\n\nIncluye: numero de factura, fecha actual, tabla de conceptos (Concepto, Cantidad, Precio Unitario, Importe), subtotal, IVA 16%, total en MXN, datos bancarios de XENTTECH. Sin markdown.`,
      3: `Genera un documento de bienvenida calido y profesional para:\nCliente: ${name}${co}\n\n1) Bienvenida personalizada de XENTTECH, 2) Presentacion del equipo y roles, 3) Servicios con frecuencias y entregables, 4) Canales de comunicacion (WhatsApp, email, portal xenttech.com), 5) SLA de respuesta, 6) Acceso al portal con token personal, 7) Proceso de onboarding proximos 14 dias, 8) Primeros pasos. Sin markdown.`,
      5: `Genera un documento de setup de estrategia digital para:\nCliente: ${name}${co}\nIndustria: ${industry}\n\n1) Diagnostico presencia digital y benchmarking 3 competidores, 2) Objetivos SMART a 30/60/90 dias con KPIs, 3) Herramientas y stack tecnologico, 4) Cronograma semana a semana (semanas 1-4), 5) Accesos requeridos del cliente, 6) Metricas y formato de reporte mensual. Sin markdown.`,
      6: `Genera la agenda de Kickoff para:\nCliente: ${name}${co}\n\n60 minutos: 1) Apertura 5min, 2) Descubrimiento del negocio con 8 preguntas clave 15min, 3) Presencia digital actual 10min, 4) Definicion de objetivos 10min, 5) Plan de accion 15min, 6) Acuerdos y compromisos 5min. Al final: POST-LLAMADA con acciones del equipo XENTTECH en 24h. Sin markdown.`,
    };
    return (prompts[stepNum] ?? `Genera contenido profesional para el paso ${stepNum} del onboarding de ${name}${co}.`) + FMT_ONBOARDING;
  }

  async function generateStep(stepNum: number) {
    if (!selectedClient || stepNum === 4) return;
    const step = ONBOARDING_STEPS.find(s => s.number === stepNum)!;
    setGeneratingStep(stepNum); setError(null);
    try {
      const clientBasic: ClientBasic = {
        id: selectedClient.id, name: selectedClient.name,
        email: selectedClient.email, phone: selectedClient.phone,
        company: selectedClient.company, industry: selectedClient.industry,
        plan: selectedClient.plan, monthly_revenue: selectedClient.monthly_revenue,
        notes: selectedClient.notes,
      };
      const prompt = cfg
        ? buildPrompt(stepNum, cfg, clientBasic)
        : getGenericPrompt(stepNum, selectedClient);

      const res = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
      const { result } = await res.json();

      const { data: upserted, error: uErr } = await supabase
        .from("onboarding_documents")
        .upsert(
          { client_id: selectedClient.id, step_number: stepNum, step_name: step.name, content: result, status: "completado" },
          { onConflict: "client_id,step_number" }
        )
        .select().single();
      if (uErr) throw uErr;

      setDocs(prev => {
        const without = prev.filter(d => d.step_number !== stepNum);
        return [...without, upserted!].sort((a, b) => a.step_number - b.step_number);
      });

      // Update clients.onboarding_step
      const allDocs = [...docs.filter(d => d.step_number !== stepNum), upserted!];
      const maxStep = ONBOARDING_STEPS
        .filter(s => allDocs.some(d => d.step_number === s.number && d.status === "completado"))
        .reduce((m, s) => Math.max(m, s.number), 0);
      await supabase.from("clients").update({ onboarding_step: maxStep }).eq("id", selectedClient.id);

      await supabase.from("activity_log").insert({
        client_id: selectedClient.id,
        action: `Documento "${step.name}" generado con IA`,
        details: selectedClient.name,
      });

    } catch (e: any) {
      setError(e.message ?? "Error al generar");
    } finally { setGeneratingStep(null); }
  }

  async function saveDiscovery() {
    if (!selectedClient) return;
    setSavingDiscovery(true);
    try {
      const content = JSON.stringify(discoveryForm);
      const { data: upserted, error: uErr } = await supabase
        .from("onboarding_documents")
        .upsert({
          client_id: selectedClient.id, step_number: 4,
          step_name: "Discovery Form", content, status: "completado",
        }, { onConflict: "client_id,step_number" })
        .select().single();
      if (uErr) throw uErr;

      setDocs(prev => {
        const without = prev.filter(d => d.step_number !== 4);
        return [...without, upserted!].sort((a, b) => a.step_number - b.step_number);
      });
      setDiscoveryEditing(false);

      await supabase.from("activity_log").insert({
        client_id: selectedClient.id,
        action: "Discovery Form completado",
        details: selectedClient.name,
      });
    } catch (e: any) {
      setError(e.message ?? "Error al guardar discovery form");
    } finally { setSavingDiscovery(false); }
  }

  async function sendKickoffEmail() {
    if (!selectedClient?.email) return;
    const subject = encodeURIComponent(`Llamada de Kickoff — ${selectedClient.name}`);
    const body = encodeURIComponent(`Hola ${selectedClient.name},\n\nEstamos listos para iniciar nuestra llamada de kickoff. Por favor confirma tu disponibilidad.\n\nEquipo XENTTECH\nhttps://xenttech.com`);
    window.open(`mailto:${selectedClient.email}?subject=${subject}&body=${body}`, "_blank");
  }

  async function generateAll() {
    if (!selectedClient) return;
    const pending = AI_STEPS.filter(s => getDoc(s.number)?.status !== "completado");
    if (!pending.length) return;
    for (let i = 0; i < pending.length; i++) {
      setGenAllProgress({ current: i + 1, total: pending.length, stepName: pending[i].name });
      await generateStep(pending[i].number);
    }
    setGenAllProgress(null);
  }

  async function copyDoc(doc: OnbDoc) {
    if (!doc.content) return;
    await navigator.clipboard.writeText(doc.content);
    setCopied(doc.step_number);
    setTimeout(() => setCopied(null), 2000);
  }

  function DF({ label, k, type = "text", placeholder = "", multi = false }: {
    label: string; k: keyof DiscoveryData; type?: string; placeholder?: string; multi?: boolean;
  }) {
    return (
      <div>
        <label className="text-xs text-[#4A5568] mb-1 block">{label}</label>
        {multi ? (
          <Textarea
            value={discoveryForm[k] ?? ""}
            onChange={e => setDiscoveryForm(f => ({ ...f, [k]: e.target.value }))}
            placeholder={placeholder}
            rows={2}
            className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568] text-sm resize-none"
          />
        ) : (
          <Input
            type={type}
            value={discoveryForm[k] ?? ""}
            onChange={e => setDiscoveryForm(f => ({ ...f, [k]: e.target.value }))}
            placeholder={placeholder}
            className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4A5568] text-sm"
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Onboarding" description="Seguimiento de incorporación de clientes" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-300 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
          </div>
        )}

        {/* Client selector */}
        <div className="rounded-xl bg-space-card border border-white/[0.06] p-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-xs text-[#4A5568] mb-1.5 block">Cliente</label>
              {loading ? (
                <div className="h-10 rounded-lg bg-white/[0.04] animate-pulse" />
              ) : (
                <Select value={selectedId} onValueChange={setSelectedId}>
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
              )}
            </div>
            {!cfg && selectedClient && !loading && (
              <div className="mb-2 flex items-center gap-1.5 text-xs text-yellow-400 shrink-0">
                <AlertCircle className="h-3.5 w-3.5" />
                Sin config — prompts genéricos
              </div>
            )}
          </div>
        </div>

        {selectedClient && (
          <>
            {/* Progress bar */}
            <div className="rounded-xl bg-space-card border border-white/[0.06] p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-[#A0AEC0]">Progreso de onboarding</p>
                <p className="text-sm font-bold text-[#00FF88]">{completedCount}/6</p>
              </div>
              <div className="flex gap-1.5">
                {ONBOARDING_STEPS.map(s => (
                  <div
                    key={s.number}
                    title={`${s.number}. ${s.name}`}
                    className={cn(
                      "flex-1 h-2 rounded-full transition-all duration-500",
                      getDoc(s.number)?.status === "completado" ? "bg-[#00FF88]" : "bg-white/[0.08]"
                    )}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1.5">
                {ONBOARDING_STEPS.map(s => (
                  <span key={s.number}
                    className={cn("text-[9px] font-medium",
                      getDoc(s.number)?.status === "completado" ? "text-[#00FF88]" : "text-[#4A5568]"
                    )}>
                    {s.number}
                  </span>
                ))}
              </div>
            </div>

            {/* Generate all (AI steps only) */}
            <div className="rounded-xl border border-[#00FF88]/20 bg-[#00FF88]/[0.03] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#00FF88]/10">
                    <Zap className="h-4 w-4 text-[#00FF88]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Generar TODOS los pendientes con IA</p>
                    <p className="text-xs text-[#4A5568]">
                      {AI_STEPS.filter(s => getDoc(s.number)?.status === "completado").length === AI_STEPS.length
                        ? "Todos los documentos generados ✓"
                        : `${AI_STEPS.filter(s => getDoc(s.number)?.status !== "completado").length} pendiente${AI_STEPS.filter(s => getDoc(s.number)?.status !== "completado").length !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={generateAll}
                  disabled={
                    AI_STEPS.filter(s => getDoc(s.number)?.status !== "completado").length === 0
                    || !!genAllProgress || generatingStep !== null
                  }
                  className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold gap-2 shrink-0"
                >
                  {genAllProgress
                    ? <><Loader2 className="h-4 w-4 animate-spin" />{genAllProgress.current}/{genAllProgress.total}</>
                    : <><Sparkles className="h-4 w-4" />Generar todos</>}
                </Button>
              </div>
              {genAllProgress && (
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#A0AEC0]">{genAllProgress.stepName}...</span>
                    <span className="text-[#00FF88]">{genAllProgress.current}/{genAllProgress.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-[#00FF88] transition-all duration-300"
                      style={{ width: `${(genAllProgress.current / genAllProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Step cards */}
            {loadingDocs ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#00FF88]" />
              </div>
            ) : (
              <div className="space-y-3">
                {ONBOARDING_STEPS.map(step => {
                  const doc = getDoc(step.number);
                  const isCompleted = doc?.status === "completado";
                  const isGenerating = generatingStep === step.number;
                  const isDiscovery = step.number === 4;
                  const isKickoff = step.number === 6;

                  return (
                    <div key={step.number} className={cn(
                      "rounded-xl border p-4 transition-all",
                      isCompleted ? "border-[#00FF88]/20 bg-[#00FF88]/[0.03]" : "border-white/[0.06] bg-space-card"
                    )}>
                      <div className="flex items-start gap-4">
                        {/* Step number */}
                        <div className={cn(
                          "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold border shrink-0 mt-0.5",
                          isCompleted
                            ? "bg-[#00FF88]/20 text-[#00FF88] border-[#00FF88]/30"
                            : "bg-white/[0.04] text-[#4A5568] border-white/[0.08]"
                        )}>
                          {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step.number}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-base leading-none">{step.icon}</span>
                            <p className="font-semibold text-white text-sm">{step.name}</p>
                            {!step.clientVisible && (
                              <Badge className="text-[10px] border bg-yellow-500/10 text-yellow-400 border-yellow-500/20 shrink-0">
                                interno
                              </Badge>
                            )}
                            {step.number === 1 && selectedClient.contract_signed && (
                              <>
                                <Badge className="text-[10px] border bg-[#00FF88]/10 text-[#00FF88] border-[#00FF88]/20 shrink-0">
                                  <PenLine className="h-2.5 w-2.5 mr-1 inline" />Firmado
                                </Badge>
                                {selectedClient.signature_data && (
                                  <img
                                    src={selectedClient.signature_data}
                                    alt="Firma"
                                    className="h-6 w-auto max-w-[60px] rounded border border-[#00FF88]/20 bg-white/5 object-contain shrink-0"
                                  />
                                )}
                              </>
                            )}
                            {isCompleted && (
                              <Badge className="text-[10px] border bg-[#00FF88]/10 text-[#00FF88] border-[#00FF88]/20 shrink-0">
                                completado
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-[#4A5568]">{step.description}</p>

                          {/* Discovery form preview */}
                          {isDiscovery && isCompleted && !discoveryEditing && (
                            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                              {Object.entries(discoveryForm)
                                .filter(([, v]) => v)
                                .slice(0, 4)
                                .map(([k, v]) => (
                                  <p key={k} className="text-[10px] text-[#A0AEC0] truncate">
                                    <span className="text-[#4A5568]">{k.replace(/_/g, " ")}: </span>{v}
                                  </p>
                                ))}
                            </div>
                          )}

                          {/* Regular doc preview */}
                          {!isDiscovery && doc?.content && (
                            <p className="mt-1.5 text-xs text-[#A0AEC0] leading-relaxed line-clamp-2">
                              {doc.content.slice(0, 160)}{doc.content.length > 160 ? "…" : ""}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          {isDiscovery ? (
                            // Discovery form actions
                            isCompleted && !discoveryEditing ? (
                              <button
                                onClick={() => setDiscoveryEditing(true)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-[#A0AEC0] hover:bg-white/[0.08] hover:text-white transition-colors"
                              >
                                <ClipboardList className="h-3.5 w-3.5" /> Editar
                              </button>
                            ) : (
                              <button
                                onClick={() => setDiscoveryEditing(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                              >
                                <ClipboardList className="h-3.5 w-3.5" /> Completar formulario
                              </button>
                            )
                          ) : isCompleted && doc ? (
                            // Completed AI doc actions
                            <>
                              <button
                                onClick={() => setViewDoc(doc)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-[#A0AEC0] hover:bg-white/[0.08] hover:text-white transition-colors"
                              >
                                <Eye className="h-3.5 w-3.5" /> Ver
                              </button>
                              <button
                                onClick={() => generateAndDownloadPDF(
                                  step.name,
                                  selectedClient.name,
                                  selectedClient.company ?? "",
                                  doc.content ?? "",
                                  `${step.name.toLowerCase().replace(/\s+/g, "-")}-${selectedClient.name.toLowerCase().replace(/\s+/g, "-")}.pdf`,
                                  { signatureData: selectedClient.signature_data, signedAt: undefined }
                                )}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                              >
                                <Download className="h-3.5 w-3.5" /> PDF
                              </button>
                              <button
                                onClick={() => copyDoc(doc)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-[#A0AEC0] hover:bg-white/[0.08] hover:text-white transition-colors"
                              >
                                {copied === step.number
                                  ? <><Check className="h-3.5 w-3.5 text-[#00FF88]" />Copiado</>
                                  : <><Copy className="h-3.5 w-3.5" />Copiar</>}
                              </button>
                              {isKickoff && selectedClient.email && (
                                <button
                                  onClick={sendKickoffEmail}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                                >
                                  <Mail className="h-3.5 w-3.5" /> Email
                                </button>
                              )}
                              <button
                                onClick={() => generateStep(step.number)}
                                disabled={isGenerating || !!genAllProgress}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-[#4A5568] hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-40"
                              >
                                {isGenerating
                                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generando</>
                                  : <><RefreshCw className="h-3.5 w-3.5" />Regenerar</>}
                              </button>
                            </>
                          ) : (
                            // Pending AI doc
                            <button
                              onClick={() => generateStep(step.number)}
                              disabled={isGenerating || !!genAllProgress}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#00FF88]/10 text-[#00FF88] hover:bg-[#00FF88]/20 transition-colors disabled:opacity-40"
                            >
                              {isGenerating
                                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generando...</>
                                : <><Sparkles className="h-3.5 w-3.5" />Generar con IA</>}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Discovery form inline */}
                      {isDiscovery && discoveryEditing && (
                        <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-3">
                          <p className="text-xs font-semibold text-[#A0AEC0] uppercase tracking-wider">
                            Cuestionario de Descubrimiento
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <DF label="Descripción del negocio *" k="descripcion_negocio" multi placeholder="¿A qué se dedica la empresa?" />
                            </div>
                            <DF label="Producto/servicio estrella" k="producto_estrella" placeholder="El producto/servicio más importante" />
                            <DF label="Ticket promedio ($)" k="presupuesto_ads" placeholder="Ej: $5,000 MXN" />
                            <div className="col-span-2">
                              <DF label="Cliente ideal" k="cliente_ideal" multi placeholder="Demografía, intereses, ubicación, comportamiento" />
                            </div>
                            <DF label="Competidores principales" k="competidores" placeholder="Nombres de 3 competidores" />
                            <DF label="Diferenciador / propuesta de valor" k="diferenciador" placeholder="¿Por qué te eligen?" />
                            <DF label="Objetivo principal" k="objetivo_principal" placeholder="Ventas, leads, branding..." />
                            <DF label="Canales actuales" k="canales_actuales" placeholder="Redes sociales, web, WhatsApp..." />
                            <DF label="Resultado esperado a 30 días" k="resultados_30_dias" placeholder="Meta concreta en 30 días" />
                            <DF label="Resultado esperado a 90 días" k="resultados_90_dias" placeholder="Meta concreta en 90 días" />
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button
                              variant="ghost"
                              onClick={() => setDiscoveryEditing(false)}
                              className="text-[#4A5568]"
                            >
                              Cancelar
                            </Button>
                            <Button
                              onClick={saveDiscovery}
                              disabled={savingDiscovery || !discoveryForm.descripcion_negocio}
                              className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold gap-2"
                            >
                              {savingDiscovery ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              Guardar Discovery
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!loading && !clients.length && (
          <p className="text-center text-[#4A5568] py-12">No hay clientes registrados.</p>
        )}
      </div>

      {/* View document modal */}
      <Dialog open={!!viewDoc} onOpenChange={() => setViewDoc(null)}>
        <DialogContent
          className="bg-space-card border-white/[0.08] text-white max-w-2xl flex flex-col"
          style={{ maxHeight: "80vh" }}
        >
          <DialogHeader>
            <DialogTitle className="text-[#00FF88] flex items-center gap-2">
              <span>{viewDoc && ONBOARDING_STEPS.find(s => s.number === viewDoc.step_number)?.icon}</span>
              {viewDoc?.step_name}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 mt-2 pr-1">
            <pre className="text-sm text-[#A0AEC0] whitespace-pre-wrap leading-relaxed font-sans">
              {viewDoc?.content}
            </pre>
          </div>
          <div className="flex justify-end gap-2 mt-4 shrink-0 pt-2 border-t border-white/[0.06]">
            <Button
              variant="ghost"
              onClick={() => viewDoc && copyDoc(viewDoc)}
              className="text-[#A0AEC0] gap-2"
            >
              <Copy className="h-4 w-4" /> Copiar contenido
            </Button>
            <Button onClick={() => setViewDoc(null)} className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90">
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
