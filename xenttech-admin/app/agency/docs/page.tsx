"use client";
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  FileText, Key, Copy, Check, Loader2, Sparkles, Trash2,
  ShieldCheck, Receipt, Heart, TrendingUp,
  Eye, EyeOff, AlertCircle, RefreshCw, Settings, CheckCircle2, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generateAndDownloadPDF } from "@/lib/generate-pdf-client";
// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string; name: string; email: string | null; phone: string | null;
  company: string | null; industry: string | null; plan: string | null;
  monthly_revenue?: number | null; notes: string | null;
  contract_signed?: boolean | null; signature_data?: string | null; signed_at?: string | null;
}
interface PortalToken {
  id: string; client_id: string; token: string; label: string | null;
  is_active: boolean; created_at: string;
}
interface OnbDoc {
  id: string; client_id: string; step_number: number; step_name: string;
  content: string; status: string; created_at: string; pdf_url?: string | null;
}
interface ProjectConfig {
  razon_social: string; rfc: string; domicilio: string; ciudad: string;
  representante_legal: string; telefono_contacto: string; email_contacto: string;
  servicios_seleccionados: string[];
  setup_fee: string; monthly_fee: string; payment_method: string;
  payment_day: string; contract_duration: string; penalty_clause: string;
  fecha_inicio: string;
  agencia_nombre: string; agencia_rfc: string; agencia_domicilio: string;
  agencia_ciudad: string; agencia_representante: string; agencia_email: string;
  agencia_banco: string; agencia_cuenta: string; agencia_clabe: string; agencia_titular: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVICES = [
  "Chatbot AI Multicanal (WhatsApp, Instagram, Facebook, Web)",
  "Gestión de Redes Sociales (Community Management)",
  "Campañas de Meta Ads (Facebook + Instagram Ads)",
  "Campañas de Google Ads (Search + Display)",
  "Diseño Gráfico (Posts, Stories, Banners, Flyers)",
  "Branding y Manual de Marca",
  "Estrategia Digital Integral",
  "Email Marketing y Automatización",
  "SEO y Posicionamiento Web",
  "Desarrollo / Rediseño de Sitio Web",
  "Producción de Contenido (Foto/Video)",
  "Consultoría y Auditoría Digital",
];

const BLANK_CONFIG: ProjectConfig = {
  razon_social: "", rfc: "", domicilio: "", ciudad: "Chihuahua, Chihuahua",
  representante_legal: "", telefono_contacto: "", email_contacto: "",
  servicios_seleccionados: [],
  setup_fee: "", monthly_fee: "", payment_method: "Transferencia bancaria",
  payment_day: "1", contract_duration: "6 meses", penalty_clause: "1 mes de servicio",
  fecha_inicio: new Date().toISOString().split("T")[0],
  agencia_nombre: "XENTTECH", agencia_rfc: "", agencia_domicilio: "",
  agencia_ciudad: "Chihuahua, Chihuahua", agencia_representante: "", agencia_email: "",
  agencia_banco: "", agencia_cuenta: "", agencia_clabe: "", agencia_titular: "",
};

const DOC_TYPES = [
  { key: "contrato",   step: 1, label: "Contrato de Servicios",    icon: ShieldCheck,  color: "#00D4AA" },
  { key: "factura",    step: 2, label: "Factura de Servicios",      icon: Receipt,      color: "#3B82F6" },
  { key: "welcome",    step: 3, label: "Welcome Document",          icon: Heart,        color: "#EC4899" },
  { key: "estrategia", step: 5, label: "Setup de Estrategia",       icon: TrendingUp,   color: "#F59E0B" },
  { key: "kickoff",    step: 6, label: "Kickoff & Activación",      icon: CheckCircle2, color: "#10B981" },
];

// ─── Generic prompts (used when client has no ProjectConfig) ──────────────────

const FMT = "\n\nFORMATO OBLIGATORIO: Escribe en texto corrido profesional. NO uses markdown, hashtags (#), asteriscos (*), backticks, code blocks, viñetas con guion (-), ni emojis. Para titulos usa MAYUSCULAS. Para listas usa letras: a), b), c). Para separar secciones usa una linea en blanco. El documento debe leerse como si lo redacto un profesional, no una inteligencia artificial.\n\nPROHIBIDO: corchetes [], campos sin llenar, texto placeholder como \"[especificar]\", \"[banco]\", \"[nombre]\" o similares. Si falta un dato, omite esa linea. Usa UNICAMENTE los datos proporcionados, completos y sin modificar.";

function getGenericPromptDocs(step: number, c: Client): string {
  const name = c.name;
  const co = c.company ? ` (${c.company})` : "";
  const industry = c.industry ?? "marketing digital";
  const prompts: Record<number, string> = {
    1: `Genera un contrato de prestacion de servicios de marketing digital y tecnologia para:\nCliente: ${name}${co}\n\nIncluye: declaraciones, objeto del contrato, alcance de los servicios, obligaciones de la agencia y del cliente, contraprestacion y forma de pago, vigencia, terminacion anticipada, propiedad intelectual, confidencialidad, jurisdiccion en Chihuahua, Chihuahua. Seccion de FIRMAS al final con campos para nombre, cargo, fecha y firma de ambas partes. Formato legal mexicano profesional, numeracion en mayusculas (PRIMERA, SEGUNDA). Sin markdown ni asteriscos.`,
    2: `Genera una factura profesional de servicios de marketing digital para:\nEmisor: XENTTECH\nReceptor: ${name}${co}\n\nIncluye: numero de factura, fecha actual, servicios de marketing digital prestados, desglose de conceptos en tabla (Concepto, Cantidad, Precio Unitario, Importe), subtotal, IVA 16%, total en MXN, datos bancarios de XENTTECH para transferencia. Sin markdown ni asteriscos.`,
    3: `Genera un documento de bienvenida calido y profesional para:\nCliente: ${name}${co}\n\nEstructura: 1) Bienvenida personalizada de XENTTECH, 2) Presentacion del equipo y roles, 3) Servicios contratados con frecuencias y entregables, 4) Canales de comunicacion (WhatsApp, email, portal xenttech.com), 5) SLA de respuesta, 6) Acceso al portal con token personal, 7) Proceso de onboarding proximos 14 dias, 8) Primeros pasos. Sin markdown ni asteriscos.`,
    5: `Genera un documento de setup de estrategia digital para:\nCliente: ${name}${co}\nIndustria: ${industry}\n\nEstructura: 1) Diagnostico de presencia digital y benchmarking 3 competidores, 2) Objetivos SMART a 30/60/90 dias con KPIs especificos, 3) Herramientas y stack tecnologico propuesto, 4) Cronograma semana a semana (semanas 1-4), 5) Accesos requeridos del cliente, 6) Metricas y formato de reporte mensual. Sin markdown ni asteriscos.`,
    6: `Genera la agenda completa para la Llamada de Kickoff con:\nCliente: ${name}${co}\n\nEstructura (60 minutos): 1) Apertura y presentacion del equipo (5min), 2) Descubrimiento del negocio con 8 preguntas clave (15min), 3) Presencia digital actual (10min), 4) Definicion de objetivos (10min), 5) Plan de accion propuesto (15min), 6) Acuerdos y compromisos: accesos/materiales + fechas de entregables (5min). Al final: seccion POST-LLAMADA con acciones inmediatas del equipo XENTTECH en las siguientes 24h. Sin markdown ni asteriscos.`,
  };
  return (prompts[step] ?? `Genera contenido profesional para el documento de onboarding paso ${step} del cliente ${name}${co}. Se especifico y accionable.`) + FMT;
}

// ─── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(step: number, cfg: ProjectConfig, client: Client): string {
  const svcs = cfg.servicios_seleccionados.join(", ") || "servicios de marketing digital";
  const now = new Date();
  const mes = now.toLocaleDateString("es-MX", { month: "long", year: "numeric" });

  if (step === 1) return `Genera un Contrato de Prestación de Servicios Profesionales de Marketing Digital y Tecnología, conforme a la legislación mexicana vigente (Código Civil Federal, Código de Comercio, LFPDPPP).

DATOS DEL CLIENTE:
- Razón Social: ${cfg.razon_social}
- RFC: ${cfg.rfc}
- Domicilio: ${cfg.domicilio}
- Ciudad: ${cfg.ciudad}
- Representante Legal: ${cfg.representante_legal}
- Email: ${cfg.email_contacto}
- Teléfono: ${cfg.telefono_contacto}

DATOS DE LA AGENCIA:
- Razón Social: ${cfg.agencia_nombre}
- RFC: ${cfg.agencia_rfc}
- Domicilio: ${cfg.agencia_domicilio}
- Ciudad: ${cfg.agencia_ciudad}
- Representante Legal: ${cfg.agencia_representante}
- Email: ${cfg.agencia_email}

SERVICIOS CONTRATADOS: ${svcs}

CONDICIONES ECONÓMICAS:
- Fee de implementación: $${cfg.setup_fee} MXN (pago único)
- Mensualidad: $${cfg.monthly_fee} MXN + IVA
- Método de pago: ${cfg.payment_method}
- Día de pago: ${cfg.payment_day} de cada mes
- Duración del contrato: ${cfg.contract_duration}
- Penalización por cancelación anticipada: ${cfg.penalty_clause}

ESTRUCTURA OBLIGATORIA:
DECLARACIONES (del Cliente, de la Agencia, conjunta)
CLÁUSULAS: PRIMERA. Objeto del contrato — SEGUNDA. Alcance de los servicios (con qué incluye y qué NO incluye cada servicio) — TERCERA. Obligaciones de la agencia (SLA 24-48h, reportes mensuales) — CUARTA. Obligaciones del cliente — QUINTA. Contraprestación y forma de pago (con interés moratorio TIIE+6pts) — SEXTA. Vigencia y duración — SÉPTIMA. Terminación anticipada — OCTAVA. Propiedad intelectual — NOVENA. Confidencialidad y LFPDPPP — DÉCIMA. Limitación de responsabilidad — DÉCIMA PRIMERA. Caso fortuito y fuerza mayor — DÉCIMA SEGUNDA. Jurisdicción (Chihuahua) — DÉCIMA TERCERA. Notificaciones — DÉCIMA CUARTA. Totalidad del acuerdo
FIRMAS (espacio para ambas partes con nombre, cargo, fecha)

FORMATO: texto corrido profesional, sin markdown, numeración legal en mayúsculas (PRIMERA, SEGUNDA…), lenguaje jurídico mexicano, fecha actual.`;

  if (step === 2) return `Genera una factura profesional de servicios para:

EMISOR: ${cfg.agencia_nombre} · RFC: ${cfg.agencia_rfc} · ${cfg.agencia_domicilio}
RECEPTOR: ${cfg.razon_social} · RFC: ${cfg.rfc} · ${cfg.domicilio}

- Número de factura: XENT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-001
- Fecha de emisión: ${now.toLocaleDateString("es-MX")}
- Fecha de inicio de servicios: ${cfg.fecha_inicio ? new Date(cfg.fecha_inicio).toLocaleDateString("es-MX") : now.toLocaleDateString("es-MX")}
- Fecha de vencimiento: día ${cfg.payment_day} del mes actual
- Método de pago: ${cfg.payment_method}

SERVICIOS A FACTURAR:
Fee de implementación: $${cfg.setup_fee} MXN (si aplica)
Mensualidad de ${mes}: $${cfg.monthly_fee} MXN
Incluye: ${svcs}

DATOS BANCARIOS PARA TRANSFERENCIA:
Banco: ${cfg.agencia_banco}
Número de cuenta: ${cfg.agencia_cuenta}
CLABE interbancaria: ${cfg.agencia_clabe}
Titular: ${cfg.agencia_titular || cfg.agencia_representante}

ESTRUCTURA: desglose en tabla con columnas Concepto | Cantidad | Precio Unitario | Importe, subtotal, IVA 16%, TOTAL en MXN, datos bancarios completos para transferencia, nota de referencia del contrato. NO uses corchetes ni placeholders. Formato profesional con alineación de columnas usando espacios.${FMT}`;

  if (step === 3) return `Genera un documento de bienvenida profesional y cálido para:

Cliente: ${cfg.razon_social}${client.company ? ` (${client.company})` : ""}
Contacto: ${cfg.representante_legal}
Servicios contratados: ${svcs}
Mensualidad: $${cfg.monthly_fee} MXN/mes

ESTRUCTURA:
1. Mensaje de bienvenida personalizado de XENTTECH a ${cfg.representante_legal}
2. Nuestro equipo: presentación breve del equipo XENTTECH y roles
3. Servicios que recibirás: lista detallada con frecuencias y entregables por servicio
4. Canales de comunicación: WhatsApp business, email ${cfg.agencia_email}, portal de cliente (xenttech.com)
5. SLA de respuesta por canal y prioridad
6. Tu portal de cliente: cómo acceder a xenttech.com con tu token personal, qué encontrarás (documentos, campañas, estrategia, diseños, actividad)
7. Proceso de onboarding: timeline de los próximos 14 días paso a paso
8. Primeros pasos: accesos e información que necesitamos del cliente para arrancar
9. Contacto directo del equipo XENTTECH

Tono: profesional pero cercano, que el cliente sienta que está en las mejores manos.`;

  if (step === 5) return `Genera un documento de Setup de Estrategia Digital para:

Cliente: ${cfg.razon_social}${client.company ? ` (${client.company})` : ""}
Industria: ${client.industry ?? "por definir"}
Servicios contratados: ${svcs}
Presupuesto mensual: $${cfg.monthly_fee} MXN

ESTRUCTURA:
1. DIAGNOSTICO INICIAL: analisis de presencia digital, benchmarking 3 competidores, oportunidades inmediatas
2. OBJETIVOS SMART a 30/60/90 dias con KPIs por servicio contratado
3. HERRAMIENTAS Y STACK TECNOLOGICO
4. CRONOGRAMA semana a semana (semanas 1-4)
5. ACCESOS REQUERIDOS DEL CLIENTE por servicio contratado
6. METRICAS Y FORMATO DE REPORTE mensual

${FMT}`;

  if (step === 6) return `Genera la agenda completa para la Llamada de Kickoff con:

Cliente: ${cfg.razon_social}${client.company ? ` (${client.company})` : ""}
Contacto: ${cfg.representante_legal}
Servicios: ${svcs}

ESTRUCTURA (60 minutos total):
1. APERTURA (5 min): bienvenida, presentacion del equipo, objetivo de la sesion
2. DESCUBRIMIENTO DEL NEGOCIO (15 min): 8 preguntas sobre producto, cliente ideal, diferenciador, ticket promedio, proceso de venta
3. PRESENCIA DIGITAL ACTUAL (10 min): revision de redes sociales, web, campanas previas
4. DEFINICION DE OBJETIVOS (10 min): resultados a 30 y 90 dias, metrica principal
5. PLAN DE ACCION (15 min): estrategia propuesta, timeline, primeros pasos
6. ACUERDOS Y COMPROMISOS (5 min): accesos/materiales requeridos, fechas, proxima reunion

DURACION: 60 minutos — Videollamada
POST-LLAMADA: acciones del equipo XENTTECH en las siguientes 24 horas.${FMT}`;

  return `Genera contenido profesional para el documento de onboarding paso ${step} del cliente ${cfg.razon_social}.${FMT}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const supabase = createClient();

export default function DocsPage() {

  const [clients, setClients]       = useState<Client[]>([]);
  const [clientId, setClientId]     = useState("");
  const [tokens, setTokens]         = useState<PortalToken[]>([]);
  const [docs, setDocs]             = useState<Record<number, OnbDoc>>({});
  const [loading, setLoading]       = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Config
  const [config, setConfig]         = useState<ProjectConfig | null>(null);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [configForm, setConfigForm] = useState<ProjectConfig>({ ...BLANK_CONFIG });
  const [savingConfig, setSavingConfig] = useState(false);

  // Generation
  const [generating, setGenerating] = useState<number | null>(null);
  const [genError, setGenError]     = useState<string | null>(null);

  // Preview modal
  const [preview, setPreview]       = useState<{ label: string; content: string } | null>(null);
  const [copied, setCopied]         = useState<string | null>(null);

  // Token management
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [genToken, setGenToken]     = useState(false);
  const [deletingToken, setDeletingToken] = useState<string | null>(null);

  // ── Load clients list ───────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setError(null);
    let fromCache = false;
    try {
      const raw = sessionStorage.getItem('xenttech_docs_clients');
      if (raw) {
        const { d, ts } = JSON.parse(raw);
        if (Date.now() - ts < 10 * 60_000) {
          setClients(d); if (d.length) setClientId((prev: string) => prev || d[0].id);
          setLoading(false); fromCache = true;
        }
      }
    } catch {}
    if (!fromCache) setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("clients")
        .select("id,name,email,phone,company,industry,plan,monthly_revenue,notes,contract_signed,signature_data,signed_at")
        .order("name");
      if (err) throw err;
      setClients(data ?? []);
      if (data?.length) setClientId((prev: string) => prev || data[0].id);
      try { sessionStorage.setItem('xenttech_docs_clients', JSON.stringify({ d: data ?? [], ts: Date.now() })); } catch {}
    } catch { setError("Error de conexión. Verifica tu red y reintenta."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── When client changes ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId) return;
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    // Parse project config from notes
    let cfg: ProjectConfig | null = null;
    if (client.notes) {
      try {
        const parsed = JSON.parse(client.notes);
        if (parsed?.razon_social) cfg = parsed as ProjectConfig;
      } catch { /* not JSON */ }
    }
    setConfig(cfg);
    setShowConfigForm(!cfg);

    // Pre-fill config form with client data
    setConfigForm(prev => ({
      ...BLANK_CONFIG,
      ...prev,
      razon_social: client.name,
      telefono_contacto: client.phone ?? "",
      email_contacto: client.email ?? "",
      monthly_fee: client.monthly_revenue ? String(client.monthly_revenue) : "",
      ...(cfg ?? {}),
    }));

    // Load existing docs and tokens
    loadClientDocs(clientId);
    loadTokens(clientId);
  }, [clientId, clients]);

  async function loadClientDocs(cid: string) {
    setLoadingDocs(true);
    try {
      const { data } = await supabase
        .from("onboarding_documents")
        .select("*")
        .eq("client_id", cid);
      const map: Record<number, OnbDoc> = {};
      for (const d of data ?? []) map[d.step_number] = d;
      setDocs(map);
    } finally { setLoadingDocs(false); }
  }

  async function loadTokens(cid: string) {
    if (!cid) return;
    const { data } = await supabase
      .from("portal_tokens")
      .select("*")
      .eq("client_id", cid)
      .order("created_at", { ascending: false });
    setTokens(data ?? []);
  }

  // ── Save project config ─────────────────────────────────────────────────────
  async function saveConfig() {
    if (!clientId) return;
    setSavingConfig(true);
    try {
      const { error: err } = await supabase
        .from("clients")
        .update({ notes: JSON.stringify(configForm) })
        .eq("id", clientId);
      if (err) throw new Error(err.message);
      setConfig(configForm);
      setShowConfigForm(false);
    } catch (e: any) {
      alert("Error al guardar configuración: " + e.message);
    } finally { setSavingConfig(false); }
  }

  // ── Generate document ───────────────────────────────────────────────────────
  async function generate(docType: typeof DOC_TYPES[0]) {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    setGenerating(docType.step);
    setGenError(null);
    try {
      const prompt = config
        ? buildPrompt(docType.step, config, client)
        : getGenericPromptDocs(docType.step, client);

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al generar");

      const content: string = data.result;

      // Upsert into onboarding_documents
      const { data: upserted, error: dbErr } = await supabase
        .from("onboarding_documents")
        .upsert({
          client_id:   clientId,
          step_number: docType.step,
          step_name:   docType.label,
          content,
          status:      "completado",
          updated_at:  new Date().toISOString(),
        }, { onConflict: "client_id,step_number" })
        .select("id")
        .single();

      if (dbErr) throw new Error(dbErr.message);

      setDocs(prev => ({
        ...prev,
        [docType.step]: {
          id: upserted?.id ?? prev[docType.step]?.id ?? "",
          client_id: clientId,
          step_number: docType.step,
          step_name: docType.label,
          content,
          status: "completado",
          created_at: new Date().toISOString(),
        },
      }));

      // Update clients.onboarding_step to highest completado step
      const { data: allStepDocs } = await supabase
        .from("onboarding_documents")
        .select("step_number,status")
        .eq("client_id", clientId);
      const maxStep = (allStepDocs ?? [])
        .filter((d: { step_number: number; status: string }) => d.status === "completado")
        .reduce((m: number, d: { step_number: number }) => Math.max(m, d.step_number), 0);
      if (maxStep > 0) {
        await supabase.from("clients").update({ onboarding_step: maxStep }).eq("id", clientId);
      }

      // Log activity
      await supabase.from("activity_log").insert({
        client_id: clientId,
        action: `${docType.label} generado`,
        details: `Documento generado con IA`,
      });
    } catch (e: any) {
      setGenError(e.message ?? "Error desconocido al generar");
    } finally { setGenerating(null); }
  }

  // ── Token management ────────────────────────────────────────────────────────
  async function createToken() {
    if (!clientId) return;
    setGenToken(true);
    try {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let token = "XT-";
      for (let i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * chars.length)];
      const { error: err } = await supabase
        .from("portal_tokens")
        .insert({ client_id: clientId, token, is_active: true, label: `Acceso portal` });
      if (err) throw new Error(err.message);
      await loadTokens(clientId);
    } catch (e: any) {
      alert("Error al crear token: " + e.message);
    } finally { setGenToken(false); }
  }

  async function revokeToken(id: string) {
    await supabase.from("portal_tokens").update({ is_active: false }).eq("id", id);
    setTokens(prev => prev.map(t => t.id === id ? { ...t, is_active: false } : t));
  }

  async function deleteToken(id: string) {
    setDeletingToken(id);
    try {
      await supabase.from("portal_tokens").delete().eq("id", id);
      setTokens(prev => prev.filter(t => t.id !== id));
    } finally { setDeletingToken(null); }
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const selectedClient = clients.find(c => c.id === clientId) ?? null;
  const activeTokens   = tokens.filter(t => t.is_active);

  // ── Config form field helper ────────────────────────────────────────────────
  function CF({ label, k, type = "text", placeholder = "" }: { label: string; k: keyof ProjectConfig; type?: string; placeholder?: string }) {
    return (
      <div>
        <label className="text-xs text-[#64748B] mb-1 block">{label}</label>
        <Input
          type={type}
          value={(configForm[k] as string) ?? ""}
          onChange={e => setConfigForm(f => ({ ...f, [k]: e.target.value }))}
          placeholder={placeholder}
          className="bg-[#0D0D1F] border-white/[0.08] text-white placeholder:text-[#64748B] text-sm"
        />
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <Header title="Documentos" description="Generador de documentos para clientes" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Error banner */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => load()} className="gap-1.5 text-red-400 hover:bg-red-500/10 shrink-0">
              <RefreshCw className="h-3.5 w-3.5" /> Reintentar
            </Button>
          </div>
        )}

        {/* Client selector */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-[#0D0D1F] border border-[#1A1A35]">
          <FileText className="h-5 w-5 text-[#00D4AA] shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-[#64748B] mb-1">Cliente activo</p>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white w-72">
                <SelectValue placeholder={loading ? "Cargando..." : "Seleccionar cliente"} />
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
          {selectedClient && (
            <div className="text-right">
              <p className="text-xs text-[#64748B]">Plan</p>
              <p className="text-sm font-semibold text-[#00D4AA]">{selectedClient.plan ?? "—"}</p>
            </div>
          )}
        </div>

        {/* ── Project config ─────────────────────────────────────────────────── */}
        {clientId && (
          <>
            {/* Config saved banner */}
            {config && !showConfigForm && (
              <div className="flex items-center justify-between rounded-xl border border-[#00D4AA]/20 bg-[#00D4AA]/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#00D4AA]" />
                  <p className="text-sm text-[#00D4AA] font-medium">Configuración de proyecto cargada</p>
                  <span className="text-xs text-[#64748B]">— {config.razon_social}</span>
                </div>
                <button
                  onClick={() => setShowConfigForm(true)}
                  className="text-xs text-[#64748B] hover:text-white flex items-center gap-1 transition-colors"
                >
                  <Settings className="h-3.5 w-3.5" /> Editar configuración
                </button>
              </div>
            )}

            {/* Config form */}
            {showConfigForm && (
              <div className="rounded-xl bg-[#0D0D1F] border border-[#00D4AA]/20 p-6 space-y-6">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-[#00D4AA]" />
                  <p className="font-semibold text-white">Configuración del proyecto</p>
                  <span className="text-xs text-[#64748B]">Requerida para generar documentos</span>
                </div>

                {/* Client data */}
                <div>
                  <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Datos del cliente</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><CF label="Razón social / Nombre completo *" k="razon_social" /></div>
                    <CF label="RFC (12 o 13 caracteres)" k="rfc" placeholder="XENT0101010AA" />
                    <CF label="Ciudad y estado" k="ciudad" />
                    <div className="col-span-2"><CF label="Domicilio fiscal completo" k="domicilio" /></div>
                    <CF label="Representante legal" k="representante_legal" />
                    <CF label="Teléfono de contacto" k="telefono_contacto" />
                    <div className="col-span-2"><CF label="Email de contacto" k="email_contacto" type="email" /></div>
                  </div>
                </div>

                {/* Services */}
                <div>
                  <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Servicios contratados *</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {SERVICES.map(svc => {
                      const checked = configForm.servicios_seleccionados.includes(svc);
                      return (
                        <label key={svc} className={cn(
                          "flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors text-sm",
                          checked ? "border-[#00D4AA]/30 bg-[#00D4AA]/5 text-white" : "border-[#1A1A35] text-[#94A3B8] hover:border-white/[0.12]"
                        )}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setConfigForm(f => ({
                              ...f,
                              servicios_seleccionados: checked
                                ? f.servicios_seleccionados.filter(s => s !== svc)
                                : [...f.servicios_seleccionados, svc],
                            }))}
                            className="mt-0.5 accent-[#00D4AA] shrink-0"
                          />
                          {svc}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Economic conditions */}
                <div>
                  <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Condiciones económicas</p>
                  <div className="grid grid-cols-2 gap-3">
                    <CF label="Fee de setup/implementación (MXN)" k="setup_fee" type="number" placeholder="5000" />
                    <CF label="Mensualidad (MXN)" k="monthly_fee" type="number" placeholder="8000" />
                    <div>
                      <label className="text-xs text-[#64748B] mb-1 block">Método de pago</label>
                      <Select value={configForm.payment_method} onValueChange={v => setConfigForm(f => ({ ...f, payment_method: v }))}>
                        <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                          {["Transferencia bancaria", "Tarjeta", "Efectivo", "PayPal"].map(m => (
                            <SelectItem key={m} value={m} className="text-white hover:bg-white/[0.06]">{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-[#64748B] mb-1 block">Día de pago mensual</label>
                      <Select value={configForm.payment_day} onValueChange={v => setConfigForm(f => ({ ...f, payment_day: v }))}>
                        <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0D0D1F] border-white/[0.08] max-h-48 overflow-y-auto">
                          {Array.from({ length: 28 }, (_, i) => String(i + 1)).map(d => (
                            <SelectItem key={d} value={d} className="text-white hover:bg-white/[0.06]">{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-[#64748B] mb-1 block">Duración del contrato</label>
                      <Select value={configForm.contract_duration} onValueChange={v => setConfigForm(f => ({ ...f, contract_duration: v }))}>
                        <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                          {["1 mes", "3 meses", "6 meses", "12 meses", "Indefinido"].map(d => (
                            <SelectItem key={d} value={d} className="text-white hover:bg-white/[0.06]">{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-[#64748B] mb-1 block">Penalización por cancelación</label>
                      <Select value={configForm.penalty_clause} onValueChange={v => setConfigForm(f => ({ ...f, penalty_clause: v }))}>
                        <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                          {["Sin penalización", "1 mes de servicio", "2 meses de servicio", "50% del restante"].map(p => (
                            <SelectItem key={p} value={p} className="text-white hover:bg-white/[0.06]">{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Date */}
                <div>
                  <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Fecha de inicio</p>
                  <div className="grid grid-cols-2 gap-3">
                    <CF label="Fecha de inicio del contrato" k="fecha_inicio" type="date" />
                  </div>
                </div>

                {/* Agency data */}
                <div>
                  <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Datos de la agencia</p>
                  <div className="grid grid-cols-2 gap-3">
                    <CF label="Nombre de la agencia" k="agencia_nombre" />
                    <CF label="RFC de la agencia" k="agencia_rfc" placeholder="XENT010101AAA" />
                    <div className="col-span-2"><CF label="Domicilio de la agencia" k="agencia_domicilio" /></div>
                    <CF label="Ciudad" k="agencia_ciudad" />
                    <CF label="Representante de la agencia" k="agencia_representante" />
                    <div className="col-span-2"><CF label="Email de la agencia" k="agencia_email" type="email" /></div>
                  </div>
                </div>

                {/* Bank data */}
                <div>
                  <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Datos bancarios de la agencia (para facturas)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <CF label="Banco" k="agencia_banco" placeholder="BBVA" />
                    <CF label="Titular de la cuenta" k="agencia_titular" />
                    <CF label="Número de cuenta" k="agencia_cuenta" />
                    <CF label="CLABE interbancaria (18 dígitos)" k="agencia_clabe" placeholder="012345678901234567" />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  {config && (
                    <Button variant="ghost" onClick={() => setShowConfigForm(false)} className="text-[#64748B]">
                      Cancelar
                    </Button>
                  )}
                  <Button
                    onClick={saveConfig}
                    disabled={savingConfig || !configForm.razon_social || configForm.servicios_seleccionados.length === 0}
                    className="bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 font-semibold gap-2"
                  >
                    {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Guardar configuración
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Generation error ───────────────────────────────────────────────── */}
        {genError && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-400 flex-1">{genError}</p>
            <button onClick={() => setGenError(null)} className="text-red-400 hover:text-red-300 text-xs underline shrink-0">Cerrar</button>
          </div>
        )}

        {/* ── Document cards ─────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs text-[#64748B] uppercase tracking-wider font-semibold mb-4">
            Documentos de Onboarding — 5 documentos
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DOC_TYPES.map(doc => {
              const Icon       = doc.icon;
              const isGen      = generating === doc.step;
              const existing   = docs[doc.step];
              const isDone     = !!existing;
              const isLoading  = loadingDocs;
              const isDisabled = !clientId;

              return (
                <div
                  key={doc.key}
                  className={cn(
                    "rounded-xl border p-5 transition-colors",
                    isDone
                      ? "bg-[#00D4AA]/[0.03] border-[#00D4AA]/20"
                      : "bg-[#0D0D1F] border-[#1A1A35] hover:border-white/[0.1]"
                  )}
                >
                  <div className="flex items-start gap-3 mb-4">
                    <div className={cn(
                      "p-2 rounded-lg shrink-0",
                      isDone ? "bg-[#00D4AA]/10" : "bg-[#0D0D1F]"
                    )} style={{ color: isDone ? "#00D4AA" : doc.color }}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                          style={{ color: doc.color, borderColor: `${doc.color}30`, background: `${doc.color}10` }}
                        >
                          PASO {doc.step}
                        </span>
                        {isLoading ? null : isDone ? (
                          <Badge className="text-[9px] bg-[#00D4AA]/10 text-[#00D4AA] border-[#00D4AA]/20">Generado</Badge>
                        ) : (
                          <Badge className="text-[9px] bg-[#0D0D1F] text-[#64748B] border-[#1A1A35]">Pendiente</Badge>
                        )}
                      </div>
                      <p className="font-semibold text-white text-sm">{doc.label}</p>
                    </div>
                  </div>

                  {!config && clientId ? (
                    <p className="text-xs text-yellow-500/60 mb-2 flex items-center gap-1 flex-wrap">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      Prompts genéricos — configura el proyecto ↑ para personalizar
                    </p>
                  ) : null}

                  {isDone ? (
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        onClick={() => setPreview({ label: doc.label, content: existing.content })}
                        className="gap-1.5 bg-[#00D4AA]/10 text-[#00D4AA] hover:bg-[#00D4AA]/20 border border-[#00D4AA]/20 text-xs h-8"
                        variant="ghost"
                      >
                        <Eye className="h-3.5 w-3.5" /> Ver documento
                      </Button>
                      <button
                        onClick={() => generateAndDownloadPDF(
                          doc.label,
                          selectedClient?.name ?? "",
                          selectedClient?.company ?? "",
                          existing.content,
                          `${doc.key}-${selectedClient?.name?.toLowerCase().replace(/\s+/g, "-") ?? "cliente"}.pdf`,
                          { signatureData: selectedClient?.signature_data, signedAt: selectedClient?.signed_at }
                        )}
                        className="flex items-center gap-1.5 text-xs px-2.5 h-8 rounded-lg border border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" /> PDF
                      </button>
                      <button
                        onClick={() => copyText(existing.content, `doc-${doc.step}`)}
                        className={cn(
                          "flex items-center gap-1.5 text-xs px-2.5 h-8 rounded-lg border transition-colors",
                          copied === `doc-${doc.step}`
                            ? "text-[#00D4AA] border-[#00D4AA]/30 bg-[#00D4AA]/5"
                            : "text-[#64748B] border-[#1A1A35] hover:text-white"
                        )}
                      >
                        {copied === `doc-${doc.step}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        Copiar
                      </button>
                      <button
                        onClick={() => generate(doc)}
                        disabled={isGen}
                        className="flex items-center gap-1.5 text-xs px-2.5 h-8 rounded-lg border border-[#1A1A35] text-[#64748B] hover:text-white hover:border-white/[0.12] transition-colors disabled:opacity-40"
                      >
                        {isGen ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Regenerar
                      </button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => generate(doc)}
                      disabled={isGen || isDisabled}
                      className="w-full gap-2 text-black font-semibold text-sm"
                      style={{ background: (isGen || isDisabled) ? undefined : doc.color }}
                      variant={(isGen || isDisabled) ? "outline" : "default"}
                    >
                      {isGen ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Generando...</>
                      ) : (
                        <><Sparkles className="h-4 w-4" /> Generar con IA</>
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Portal Token Manager ────────────────────────────────────────────── */}
        <div className="rounded-xl bg-[#0D0D1F] border border-[#00D4AA]/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-[#00D4AA]" />
              <p className="font-semibold text-white">Tokens de Acceso al Portal</p>
              <span className="text-xs text-[#64748B]">xenttech.com</span>
            </div>
            <Button
              onClick={createToken}
              disabled={genToken || !clientId}
              className="bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 font-semibold gap-2 text-xs h-8"
            >
              {genToken ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
              Generar token
            </Button>
          </div>

          {tokens.length === 0 ? (
            <p className="text-xs text-[#64748B] text-center py-4">
              {clientId ? "Sin tokens generados para este cliente." : "Selecciona un cliente."}
            </p>
          ) : (
            <div className="space-y-2">
              {tokens.map(t => (
                <div key={t.id} className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border text-sm",
                  t.is_active ? "bg-[#00D4AA]/5 border-[#00D4AA]/20" : "bg-[#080812] border-[#1A1A35] opacity-50"
                )}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white text-xs font-mono truncate">
                        {showTokens[t.id] ? t.token : `${t.token.slice(0, 5)}••••••••••`}
                      </p>
                      <Badge className={t.is_active
                        ? "bg-[#00D4AA]/10 text-[#00D4AA] border-[#00D4AA]/20 text-[9px]"
                        : "bg-gray-500/10 text-gray-400 border-gray-500/20 text-[9px]"}>
                        {t.is_active ? "activo" : "revocado"}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-[#64748B] mt-0.5">
                      {t.label ?? "Portal Access"} · {new Date(t.created_at).toLocaleDateString("es-MX")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setShowTokens(s => ({ ...s, [t.id]: !s[t.id] }))}
                      className="p-1.5 rounded hover:bg-white/[0.06] text-[#64748B] hover:text-white transition-colors"
                    >
                      {showTokens[t.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    {t.is_active && (
                      <button
                        onClick={() => copyText(t.token, t.id)}
                        className="p-1.5 rounded hover:bg-[#00D4AA]/10 text-[#64748B] hover:text-[#00D4AA] transition-colors"
                      >
                        {copied === t.id ? <Check className="h-3.5 w-3.5 text-[#00D4AA]" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {t.is_active && (
                      <button
                        onClick={() => revokeToken(t.id)}
                        className="p-1.5 rounded hover:bg-yellow-500/10 text-[#64748B] hover:text-yellow-400 transition-colors"
                        title="Revocar"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteToken(t.id)}
                      disabled={deletingToken === t.id}
                      className="p-1.5 rounded hover:bg-red-500/10 text-[#64748B] hover:text-red-400 transition-colors"
                    >
                      {deletingToken === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTokens.length > 0 && (
            <div className="rounded-lg bg-black/20 border border-[#1A1A35] p-3">
              <p className="text-xs text-[#64748B] mb-1">Link de acceso al portal:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-[#00D4AA] flex-1 truncate font-mono">
                  xenttech.com — Token: {activeTokens[0].token}
                </code>
                <button
                  onClick={() => copyText(
                    `Token de acceso al portal XENTTECH:\n\nURL: https://xenttech.com\nToken: ${activeTokens[0].token}\n\nIngresa tu token en el portal para ver el progreso de tu proyecto.`,
                    "portal_link"
                  )}
                  className="p-1.5 rounded hover:bg-white/[0.06] text-[#64748B] hover:text-white transition-colors shrink-0"
                >
                  {copied === "portal_link" ? <Check className="h-3.5 w-3.5 text-[#00D4AA]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Document preview modal ─────────────────────────────────────────────── */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="bg-[#0D0D1F] border-white/[0.08] text-white max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-[#00D4AA] flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {preview?.label} — {selectedClient?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <div className="rounded-xl bg-black/20 border border-[#1A1A35] p-5">
              <pre className="text-xs text-[#94A3B8] whitespace-pre-wrap font-sans leading-relaxed">
                {preview?.content}
              </pre>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button
              variant="ghost"
              onClick={() => preview && copyText(preview.content, "modal_doc")}
              className="text-[#64748B] hover:text-white gap-2"
            >
              {copied === "modal_doc" ? <Check className="h-4 w-4 text-[#00D4AA]" /> : <Copy className="h-4 w-4" />}
              Copiar
            </Button>
            <Button onClick={() => setPreview(null)} className="bg-[#00D4AA] text-black font-semibold">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
