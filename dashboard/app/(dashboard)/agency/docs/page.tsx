"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText, Key, Copy, Check, Loader2, Sparkles, Trash2,
  ShieldCheck, Receipt, Heart, Globe, TrendingUp, Phone, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Client { id: string; name: string; company: string | null; industry: string | null; plan: string | null; }
interface PortalToken { id: string; client_id: string; token: string; label: string | null; is_active: boolean; created_at: string; }

const DOC_TYPES = [
  {
    key: "contrato",
    label: "Contrato",
    step: 1,
    icon: ShieldCheck,
    color: "#00FF88",
    desc: "Contrato de prestación de servicios",
    prompt: (c: Client) => `Genera un CONTRATO DE PRESTACIÓN DE SERVICIOS DE MARKETING DIGITAL completo y profesional para la agencia XENTTECH con el cliente ${c.name}${c.company ? ` (${c.company})` : ""}.

El contrato debe incluir:
1. REUNIDOS (datos de ambas partes con espacios para completar)
2. EXPONEN (antecedentes y objeto del contrato)
3. CLÁUSULAS:
   - Objeto del contrato (servicios de marketing digital: gestión de redes sociales, publicidad pagada, chatbots IA, creación de contenido)
   - Duración (mínimo 3 meses, renovación automática)
   - Honorarios y forma de pago (plan: ${c.plan ?? "a definir"}, pago mensual anticipado)
   - Obligaciones de la agencia
   - Obligaciones del cliente
   - Confidencialidad
   - Propiedad intelectual
   - Terminación anticipada (30 días de preaviso)
   - Limitación de responsabilidad
   - Jurisdicción y ley aplicable
4. Lugar, fecha y firmas

Formato profesional en español. Usar espacios en blanco _______________ para datos a completar.`,
  },
  {
    key: "factura",
    label: "Factura",
    step: 2,
    icon: Receipt,
    color: "#3B82F6",
    desc: "Factura de servicios mensual",
    prompt: (c: Client) => `Genera una FACTURA DE SERVICIOS para XENTTECH Agency al cliente ${c.name}${c.company ? ` (${c.company})` : ""}.

Incluye:
- Número de factura: XENT-[AÑO]-[NRO]
- Fecha de emisión y vencimiento (15 días)
- Datos de XENTTECH Agency (espacios para completar)
- Datos del cliente: ${c.name}${c.company ? `, ${c.company}` : ""}
- Conceptos detallados según plan "${c.plan ?? 'Premium'}" con descripción de servicios:
  * Gestión de redes sociales
  * Publicidad digital (Meta/Google Ads)
  * Chatbot IA (si aplica)
  * Creación de contenido y diseño
- Precio unitario, cantidad, subtotal
- Subtotal, IVA (si aplica), TOTAL
- Datos bancarios para transferencia (espacio para completar)
- Notas de pago

Formato de tabla clara y profesional en español.`,
  },
  {
    key: "welcome",
    label: "Welcome Document",
    step: 4,
    icon: Heart,
    color: "#EC4899",
    desc: "Bienvenida al cliente + acceso al portal",
    prompt: (c: Client) => `Genera un WELCOME DOCUMENT (Documento de Bienvenida) completo y cálido para el cliente ${c.name}${c.company ? ` de ${c.company}` : ""} que acaba de contratar los servicios de XENTTECH Agency.

Incluye:
1. BIENVENIDA PERSONALIZADA — mensaje cálido y profesional de bienvenida
2. SOBRE XENTTECH — quiénes somos, nuestra misión, nuestro equipo
3. TU PLAN "${c.plan ?? 'Premium'}" — qué incluye exactamente su contratación
4. CÓMO TRABAJAMOS JUNTOS:
   - Proceso de onboarding (7 pasos)
   - Canal de comunicación principal (WhatsApp/Email)
   - Tiempo de respuesta garantizado
   - Reuniones de seguimiento (frecuencia)
   - Entregables mensuales
5. TU PORTAL DE CLIENTE — cómo acceder a xenttech.com y qué encontrará ahí
6. PRÓXIMOS PASOS INMEDIATOS (lista de acciones en los próximos 7 días)
7. CONTACTO DEL EQUIPO XENTTECH
8. MENSAJE FINAL motivador

Tono: profesional pero cálido, generando confianza y entusiasmo. Formato con secciones claras.`,
  },
  {
    key: "portal",
    label: "Portal de Cliente",
    step: 5,
    icon: Globe,
    color: "#8B5CF6",
    desc: "Instrucciones y token de acceso al portal",
    prompt: (c: Client) => `Genera una GUÍA DE ACCESO AL PORTAL DE CLIENTE XENTTECH para ${c.name}.

Incluye:
1. QUÉ ES EL PORTAL — descripción del espacio centralizado
2. CÓMO ACCEDER:
   - URL: xenttech.com
   - Tu token personal de acceso: [TOKEN]
   - Pasos para ingresar
3. QUÉ ENCONTRARÁS EN TU PORTAL:
   - Dashboard con progreso del proyecto
   - Documentos (contrato, facturas, briefs)
   - Campañas activas y métricas
   - Estrategia digital
   - Piezas de diseño y Canva
   - Historial de actividad
4. CÓMO INTERPRETAR TU PROGRESO — explicación de los 7 pasos del onboarding
5. TIPS PARA SACAR EL MÁXIMO PROVECHO
6. SOPORTE: si tienes dudas sobre el portal, contáctanos

Nota: reemplaza [TOKEN] con el token real del cliente. Tono instructivo y amigable.`,
  },
  {
    key: "estrategia",
    label: "Setup de Estrategia",
    step: 6,
    icon: TrendingUp,
    color: "#F59E0B",
    desc: "Documento de puesta a punto estratégica",
    prompt: (c: Client) => `Genera un DOCUMENTO DE SETUP DE ESTRATEGIA DIGITAL completo para el cliente ${c.name}${c.company ? ` (${c.company})` : ""} en la industria "${c.industry ?? 'a definir'}".

Este documento es CONFIDENCIAL y define la estrategia que seguiremos. Incluir:

1. RESUMEN EJECUTIVO — contexto del cliente y objetivos principales
2. ANÁLISIS DE SITUACIÓN ACTUAL:
   - Presencia digital actual (espacios para completar)
   - Competencia principal (espacios)
   - Fortalezas y oportunidades identificadas
3. OBJETIVOS A 90 DÍAS (SMART):
   - Objetivo 1: Alcance/Visibilidad
   - Objetivo 2: Leads/Conversiones
   - Objetivo 3: Comunidad/Engagement
4. ESTRATEGIA DE CONTENIDOS:
   - Pilares de contenido (3-4 pilares)
   - Calendario editorial (frecuencia por red social)
   - Formatos prioritarios
   - Tono de comunicación y voz de marca
5. ESTRATEGIA DE PAID MEDIA:
   - Plataformas seleccionadas y por qué
   - Estructura de campañas
   - Audiencias objetivo
   - Budget sugerido y distribución
6. CHATBOT IA (si aplica):
   - Flujos a automatizar
   - Canales de integración
7. KPIs MENSUALES DE SEGUIMIENTO
8. ACCIONES SEMANA 1

Formato: documento estratégico confidencial, profesional, con secciones numeradas.`,
  },
  {
    key: "llamada",
    label: "Llamada de Estrategia",
    step: 7,
    icon: Phone,
    color: "#06B6D4",
    desc: "Agenda y guión para videollamada de estrategia",
    prompt: (c: Client) => `Genera un GUIÓN Y AGENDA para la LLAMADA DE ESTRATEGIA con el cliente ${c.name}${c.company ? ` de ${c.company}` : ""}.

Este documento es para uso interno del equipo XENTTECH. Incluir:

1. PRE-LLAMADA: qué revisar antes (30 min antes):
   - Revisar cuestionario del cliente
   - Preparar capturas/ejemplos de competencia
   - Tener estrategia lista para presentar
   - Abrir Zoom/Google Meet con link

2. AGENDA DE LA LLAMADA (60-75 minutos):
   - [0-5 min] Bienvenida y rompehielo
   - [5-20 min] Conocer al cliente y su negocio en profundidad (preguntas clave)
   - [20-45 min] Presentación de la estrategia diseñada (pantalla compartida)
   - [45-60 min] Revisión del plan de trabajo y cronograma
   - [60-70 min] Dudas y preguntas del cliente
   - [70-75 min] Próximos pasos y cierre

3. PREGUNTAS CLAVE para el cliente ${c.name}:
   - Sobre su negocio, competencia y diferenciador
   - Sobre sus clientes ideales
   - Sobre resultados esperados y KPIs de éxito
   - Sobre accesos y recursos disponibles

4. CÓMO MANEJAR OBJECIONES comunes

5. POST-LLAMADA: acciones inmediatas después de la llamada

Formato: guión práctico y conversacional para el equipo.`,
  },
];

export default function DocsPage() {
  const [clients, setClients]   = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [tokens, setTokens]     = useState<PortalToken[]>([]);
  const [loading, setLoading]   = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [genDoc, setGenDoc]     = useState<{ type: string; content: string } | null>(null);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [copied, setCopied]     = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [genToken, setGenToken] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await api.get("/api/agency/clients");
      setClients(c ?? []);
      if (c?.length) setClientId(c[0].id);
    } finally { setLoading(false); }
  }, []);

  const loadTokens = useCallback(async (cid: string) => {
    if (!cid) return;
    const t = await api.get(`/api/agency/portal-tokens?client_id=${cid}`);
    setTokens(t ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (clientId) loadTokens(clientId); }, [clientId, loadTokens]);

  const selectedClient = clients.find(c => c.id === clientId) ?? null;

  async function generate(docType: typeof DOC_TYPES[0]) {
    if (!selectedClient) return;
    setGenerating(docType.key);
    try {
      const { result } = await api.post("/api/agency/generate", {
        prompt: docType.prompt(selectedClient),
      });
      setGenDoc({ type: docType.key, content: result });
    } finally { setGenerating(null); }
  }

  async function saveDoc() {
    if (!genDoc || !selectedClient) return;
    const docType = DOC_TYPES.find(d => d.key === genDoc.type)!;
    setSaving(true);
    try {
      await api.post("/api/agency/onboarding", {
        client_id:   selectedClient.id,
        step_number: docType.step,
        step_name:   docType.label,
        content:     genDoc.content,
        status:      "completed",
      });
      await api.post("/api/agency/activity", {
        client_id: selectedClient.id,
        action:    `${docType.label} generado`,
        details:   `Documento generado con IA y guardado`,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function createToken() {
    if (!selectedClient) return;
    setGenToken(true);
    try {
      await api.post("/api/agency/portal-tokens", {
        client_id: selectedClient.id,
        label:     `Acceso de ${selectedClient.name}`,
      });
      await loadTokens(selectedClient.id);
    } finally { setGenToken(false); }
  }

  async function revokeToken(id: string) {
    await api.patch(`/api/agency/portal-tokens/${id}/revoke`, {});
    setTokens(prev => prev.map(t => t.id === id ? { ...t, is_active: false } : t));
  }

  async function deleteToken(id: string) {
    await api.del(`/api/agency/portal-tokens/${id}`);
    setTokens(prev => prev.filter(t => t.id !== id));
  }

  const activeTokens = tokens.filter(t => t.is_active);

  return (
    <div className="flex flex-col h-full">
      <Header title="Documentos" description="Generador de documentos para clientes" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Client selector */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-space-card border border-white/[0.06]">
          <FileText className="h-5 w-5 text-[#00FF88] shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-[#4A5568] mb-1">Cliente activo</p>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white w-72">
                <SelectValue placeholder={loading ? "Cargando..." : "Seleccionar cliente"} />
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
          {selectedClient && (
            <div className="text-right">
              <p className="text-xs text-[#4A5568]">Plan</p>
              <p className="text-sm font-semibold text-[#00FF88]">{selectedClient.plan ?? "—"}</p>
            </div>
          )}
        </div>

        {/* 7-step document generators */}
        <div>
          <p className="text-xs text-[#4A5568] uppercase tracking-wider font-semibold mb-4">Documentos de Onboarding — 7 pasos</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DOC_TYPES.map(doc => {
              const Icon = doc.icon;
              const isGen = generating === doc.key;
              return (
                <div key={doc.key} className="rounded-xl bg-space-card border border-white/[0.06] p-5 hover:border-white/[0.1] transition-colors">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-white/[0.04] shrink-0" style={{ color: doc.color }}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ color: doc.color, borderColor: `${doc.color}30`, background: `${doc.color}10` }}>
                          PASO {doc.step}
                        </span>
                      </div>
                      <p className="font-semibold text-white mt-1">{doc.label}</p>
                      <p className="text-xs text-[#4A5568]">{doc.desc}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => generate(doc)}
                    disabled={isGen || !clientId}
                    className="w-full gap-2 text-black font-semibold"
                    style={{ background: isGen ? undefined : doc.color }}
                    variant={isGen ? "outline" : "default"}
                  >
                    {isGen ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Generando...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Generar con IA</>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Portal Token Manager */}
        <div className="rounded-xl bg-space-card border border-[#00FF88]/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-[#00FF88]" />
              <p className="font-semibold text-white">Tokens de Acceso al Portal</p>
              <span className="text-xs text-[#4A5568]">xenttech.com</span>
            </div>
            <Button
              onClick={createToken}
              disabled={genToken || !clientId}
              className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold gap-2 text-xs h-8"
            >
              {genToken ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
              Generar token
            </Button>
          </div>

          {tokens.length === 0 ? (
            <p className="text-xs text-[#4A5568] text-center py-4">
              {clientId ? "Sin tokens generados para este cliente." : "Selecciona un cliente."}
            </p>
          ) : (
            <div className="space-y-2">
              {tokens.map(t => (
                <div key={t.id} className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border text-sm",
                  t.is_active ? "bg-[#00FF88]/5 border-[#00FF88]/20" : "bg-white/[0.02] border-white/[0.04] opacity-50"
                )}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white text-xs truncate">
                        {showTokens[t.id] ? t.token : `${t.token.slice(0, 8)}${"•".repeat(16)}${t.token.slice(-4)}`}
                      </p>
                      <Badge className={t.is_active ? "bg-[#00FF88]/10 text-[#00FF88] border-[#00FF88]/20 text-[9px]" : "bg-gray-500/10 text-gray-400 border-gray-500/20 text-[9px]"}>
                        {t.is_active ? "activo" : "revocado"}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-[#4A5568] mt-0.5">{t.label} · {new Date(t.created_at).toLocaleDateString("es-MX")}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setShowTokens(s => ({ ...s, [t.id]: !s[t.id] }))}
                      className="p-1.5 rounded hover:bg-white/[0.06] text-[#4A5568] hover:text-white transition-colors"
                      title="Mostrar/ocultar token"
                    >
                      {showTokens[t.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    {t.is_active && (
                      <button
                        onClick={() => copyText(t.token, t.id)}
                        className="p-1.5 rounded hover:bg-[#00FF88]/10 text-[#4A5568] hover:text-[#00FF88] transition-colors"
                        title="Copiar token"
                      >
                        {copied === t.id ? <Check className="h-3.5 w-3.5 text-[#00FF88]" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {t.is_active && (
                      <button
                        onClick={() => revokeToken(t.id)}
                        className="p-1.5 rounded hover:bg-yellow-500/10 text-[#4A5568] hover:text-yellow-400 transition-colors"
                        title="Revocar"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteToken(t.id)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-[#4A5568] hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTokens.length > 0 && (
            <div className="rounded-lg bg-black/20 border border-white/[0.04] p-3">
              <p className="text-xs text-[#4A5568] mb-1">Link de acceso al portal:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-[#00FF88] flex-1 truncate">
                  https://xenttech.com — Token: {activeTokens[0].token}
                </code>
                <button
                  onClick={() => copyText(`Token de acceso al portal XENTTECH:\n\nURL: https://xenttech.com\nToken: ${activeTokens[0].token}\n\nIngresa tu token en el portal para ver el progreso de tu proyecto.`, "portal_link")}
                  className="p-1.5 rounded hover:bg-white/[0.06] text-[#4A5568] hover:text-white transition-colors shrink-0"
                >
                  {copied === "portal_link" ? <Check className="h-3.5 w-3.5 text-[#00FF88]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Document preview modal */}
      <Dialog open={!!genDoc} onOpenChange={() => setGenDoc(null)}>
        <DialogContent className="bg-space-card border-white/[0.08] text-white max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-[#00FF88] flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {genDoc ? DOC_TYPES.find(d => d.key === genDoc.type)?.label : ""} — {selectedClient?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <div className="rounded-xl bg-black/20 border border-white/[0.04] p-5">
              <pre className="text-xs text-[#A0AEC0] whitespace-pre-wrap font-sans leading-relaxed">
                {genDoc?.content}
              </pre>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button
              variant="ghost"
              onClick={() => genDoc && copyText(genDoc.content, "modal_doc")}
              className="text-[#4A5568] hover:text-white gap-2"
            >
              {copied === "modal_doc" ? <Check className="h-4 w-4 text-[#00FF88]" /> : <Copy className="h-4 w-4" />}
              Copiar
            </Button>
            <Button
              onClick={saveDoc}
              disabled={saving || saved}
              className="bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              {saved ? "¡Guardado!" : "Guardar en Onboarding"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
