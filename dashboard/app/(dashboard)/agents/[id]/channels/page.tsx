"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import {
  Copy, Check, Loader2, ExternalLink, CheckCircle2, XCircle,
  Zap, Key, Unplug,
} from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "https://api.conectaachat.com";
const WIDGET_SRC = process.env.NEXT_PUBLIC_WIDGET_URL || "https://cdn.conectaachat.com/widget.min.js";

type ChannelType = "web_widget" | "instagram" | "facebook" | "whatsapp" | "slack" | "api";

const CHANNEL_META: Record<ChannelType, { emoji: string; label: string; desc: string }> = {
  web_widget: { emoji: "🌐", label: "Web Widget",          desc: "Chat embebido en tu sitio web" },
  instagram:  { emoji: "📸", label: "Instagram DM",        desc: "Mensajes directos de Instagram Business" },
  facebook:   { emoji: "👍", label: "Facebook Messenger",  desc: "Messenger de tus páginas de Facebook" },
  whatsapp:   { emoji: "💬", label: "WhatsApp Business",   desc: "API de WhatsApp Business" },
  slack:      { emoji: "💼", label: "Slack",               desc: "Bot en tu workspace de Slack" },
  api:        { emoji: "⚡", label: "API REST",             desc: "Integración directa via REST API" },
};

const ORDER: ChannelType[] = ["web_widget", "instagram", "facebook", "whatsapp", "slack", "api"];

function genVerifyToken() {
  return "vt_" + Math.random().toString(36).slice(2, 18);
}

export default function ChannelsPage() {
  const { id: agentId } = useParams<{ id: string }>();
  const supabase = createClient();

  const [channels, setChannels] = useState<any[]>([]);
  const [apiKeys, setApiKeys]   = useState<any[]>([]);
  const [agent, setAgent]       = useState<any>(null);
  const [orgId, setOrgId]       = useState("");
  const [loading, setLoading]   = useState(true);

  // Modal
  const [activeType,        setActiveType]        = useState<ChannelType | null>(null);
  const [step,              setStep]              = useState(1);
  const [saving,            setSaving]            = useState(false);
  const [verifyResult,      setVerifyResult]      = useState<{ verified: boolean; detail: string } | null>(null);
  const [copied,            setCopied]            = useState<string | null>(null);
  const [rawKey,            setRawKey]            = useState<string | null>(null);
  const [currentChannelId,  setCurrentChannelId]  = useState<string | null>(null);

  const [metaForm,      setMetaForm]      = useState({ pageId: "", accessToken: "", igUserId: "", verifyToken: genVerifyToken() });
  const [oauthPages,    setOauthPages]    = useState<any[]>([]);
  const [metaConnecting, setMetaConnecting] = useState(false);
  const igPopupRef = useRef<Window | null>(null);
  const [waForm,    setWaForm]    = useState({ phoneNumberId: "", accessToken: "", businessAccountId: "" });
  const [slackForm, setSlackForm] = useState({ botToken: "", signingSecret: "" });

  // IG manual setup
  const [igManualOpen,   setIgManualOpen]   = useState(false);
  const [igManualForm,   setIgManualForm]   = useState({ igAccountId: "", igUsername: "" });
  const [igManualSaving, setIgManualSaving] = useState(false);
  const [igManualResult, setIgManualResult] = useState<{ ok: boolean; detail: string } | null>(null);

  // IG integration status (source of truth for connected state)
  const [igIntegration, setIgIntegration]   = useState<{ connected: boolean; ig_username: string | null; page_name: string | null } | null>(null);
  // Ref so stale-closure handlers (useEffect with []) always see the latest value
  const igIntegrationRef = useRef<typeof igIntegration>(null);
  useEffect(() => { igIntegrationRef.current = igIntegration; }, [igIntegration]);

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data: m } = await supabase
          .from("organization_members").select("organization_id")
          .eq("user_id", session.user.id).limit(1).single();
        if (!m) return;
        setOrgId(m.organization_id);
        const [a, ch, keys, igInt] = await Promise.all([
          api.get(`/api/agents/${agentId}`, m.organization_id),
          api.get(`/api/channels?agent_id=${agentId}`, m.organization_id),
          api.get("/api/api-keys", m.organization_id),
          api.get(`/api/integrations/instagram/status?agent_id=${agentId}`, m.organization_id).catch(() => null),
        ]);
        setAgent(a);
        setChannels(ch || []);
        setApiKeys(keys || []);
        setIgIntegration(igInt);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentId]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function openModal(type: ChannelType) {
    const existing = channels.find((c) => c.type === type && c.is_active);
    setActiveType(type);
    setSaving(false);
    setVerifyResult(null);
    setRawKey(null);
    setOauthPages([]);
    setMetaConnecting(false);
    setCurrentChannelId(existing?.id ?? null);
    setMetaForm({ pageId: "", accessToken: "", igUserId: "", verifyToken: genVerifyToken(), ...existing?.config ? {
      pageId: existing.config.page_id || "",
      accessToken: existing.config.access_token || "",
      igUserId: existing.config.ig_user_id || "",
      verifyToken: existing.config.verify_token || genVerifyToken(),
    } : {} });
    setWaForm({ phoneNumberId: existing?.config?.phone_number_id || "", accessToken: existing?.config?.access_token || "", businessAccountId: existing?.config?.business_account_id || "" });
    setSlackForm({ botToken: existing?.config?.bot_token || "", signingSecret: existing?.config?.signing_secret || "" });
    // Jump to config step if already connected
    setStep(existing && (type === "web_widget" || type === "api") ? 2 : 1);
  }

  async function ensureChannel(type: ChannelType): Promise<string> {
    if (currentChannelId) return currentChannelId;
    const names: Record<ChannelType, string> = {
      web_widget: "Web Widget", instagram: "Instagram DM", facebook: "Facebook Messenger",
      whatsapp: "WhatsApp Business", slack: "Slack", api: "API REST",
    };
    const ch = await api.post("/api/channels", { agent_id: agentId, type, name: names[type] }, orgId);
    setCurrentChannelId(ch.id);
    setChannels((p) => [ch, ...p.filter((c) => c.id !== ch.id)]);
    return ch.id;
  }

  async function activateWidget() {
    setSaving(true);
    try {
      await ensureChannel("web_widget");
      const keyData = await api.post("/api/api-keys", { name: `Widget — ${agent?.name || "Agente"}`, agent_id: agentId }, orgId);
      setApiKeys((p) => [keyData, ...p]);
      setRawKey(keyData.key);
      setStep(2);
    } finally { setSaving(false); }
  }

  async function generateApiKey() {
    setSaving(true);
    try {
      await ensureChannel("api");
      const keyData = await api.post("/api/api-keys", { name: `API — ${agent?.name || "Agente"}`, agent_id: agentId }, orgId);
      setApiKeys((p) => [keyData, ...p]);
      setRawKey(keyData.key);
      setStep(2);
    } finally { setSaving(false); }
  }

  async function connectMeta() {
    setSaving(true); setVerifyResult(null);
    try {
      const chId = await ensureChannel(activeType as ChannelType);
      const res = await api.post(`/api/channels/${chId}/meta/connect`, {
        pageId: metaForm.pageId, pageAccessToken: metaForm.accessToken,
        igUserId: metaForm.igUserId || undefined, verifyToken: metaForm.verifyToken,
      }, orgId);
      setChannels((p) => p.map((c) => c.id === chId ? res.channel : c));
      setVerifyResult({ verified: true, detail: "Canal conectado correctamente" });
    } catch (e: any) {
      setVerifyResult({ verified: false, detail: e.message });
    } finally { setSaving(false); }
  }



  // Fetch OAuth URL and open Meta popup (Facebook)
  async function startMetaOAuth() {
    setMetaConnecting(true); setVerifyResult(null);
    try {
      const result = await api.get(`/api/channels/meta/auth-url?agentId=${agentId}`, orgId);
      window.open(result.url, "meta_oauth", "width=600,height=700,scrollbars=yes,resizable=yes");
    } catch (e: any) {
      setVerifyResult({ verified: false, detail: e.message });
      setMetaConnecting(false);
    }
  }

  // Open Instagram Business Login popup (direct OAuth — no Facebook Page required)
  async function startInstagramOAuth() {
    // If already connected via instagram_integrations, don't re-trigger OAuth
    if (igIntegrationRef.current?.connected) return;
    setMetaConnecting(true); setVerifyResult(null);
    try {
      const result = await api.get(`/api/integrations/instagram/connect?agent_id=${agentId}`, orgId);
      igPopupRef.current = window.open(result.url, "instagram_oauth", "width=600,height=700,scrollbars=yes,resizable=yes");
    } catch (e: any) {
      setVerifyResult({ verified: false, detail: e.message });
      setMetaConnecting(false);
    }
  }

  // Listen for postMessage from the Meta OAuth popup
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "instagram_connected") {
        igPopupRef.current?.close();
        igPopupRef.current = null;
        setMetaConnecting(false);
        // Reload channels to pick up the newly saved instagram channel
        api.get(`/api/channels?agent_id=${agentId}`, orgId)
          .then((data: any) => { if (data?.channels) setChannels(data.channels); })
          .catch(() => {});
        setVerifyResult({ verified: true, detail: `@${e.data.ig_username || e.data.ig_account_id} conectado exitosamente` });
        setTimeout(() => setActiveType(null), 1800);
      } else if (e.data?.type === "instagram_error") {
        // Don't show the error if Instagram is already connected via a manual/existing integration
        if (!igIntegrationRef.current?.connected) {
          setVerifyResult({ verified: false, detail: e.data.error || "Error en OAuth de Instagram" });
        }
        setMetaConnecting(false);
      } else if (e.data?.type === "meta_connected") {
        const { savedChannels, noInstagram } = e.data;
        setMetaConnecting(false);

        if (savedChannels?.length > 0) {
          setChannels((prev: any[]) => {
            const updated = [...prev];
            for (const saved of savedChannels) {
              const idx = updated.findIndex((c: any) => c.id === saved.channel.id);
              if (idx >= 0) updated[idx] = saved.channel;
              else updated.push(saved.channel);
            }

            // Determine success message with up-to-date channel list + integration ref
            const hasActiveIG = updated.some((c: any) => c.type === "instagram" && c.is_active)
              || !!igIntegrationRef.current?.connected;
            const types = savedChannels
              .map((c: any) => c.type === "facebook" ? "Facebook" : "Instagram")
              .join(" y ");
            const detail = (noInstagram && !hasActiveIG)
              ? `Facebook conectado. Instagram no está vinculado a esta página — ve a Configuración de Instagram → Cuenta → Cambiar a cuenta profesional → Empresa.`
              : `${types} conectado exitosamente`;
            setTimeout(() => setVerifyResult({ verified: true, detail }), 0);

            return updated;
          });

          // Close modal after short delay so the user sees the success banner
          setTimeout(() => setActiveType(null), 1800);
        } else {
          setVerifyResult({ verified: false, detail: "No se guardó ningún canal. Intenta de nuevo." });
        }
      } else if (e.data?.type === "meta_error") {
        setVerifyResult({ verified: false, detail: e.data.error || "Error en OAuth de Meta" });
        setMetaConnecting(false);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function saveWhatsApp() {
    setSaving(true); setVerifyResult(null);
    try {
      const chId = await ensureChannel("whatsapp");
      const updated = await api.put(`/api/channels/${chId}`, {
        config: { phone_number_id: waForm.phoneNumberId, access_token: waForm.accessToken, business_account_id: waForm.businessAccountId },
        is_active: true,
      }, orgId);
      setChannels((p) => p.map((c) => c.id === chId ? updated : c));
      setVerifyResult({ verified: true, detail: "Configuración guardada. ¡Canal activo!" });
    } catch (e: any) {
      setVerifyResult({ verified: false, detail: e.message });
    } finally { setSaving(false); }
  }

  async function connectSlack() {
    setSaving(true); setVerifyResult(null);
    try {
      const chId = await ensureChannel("slack");
      const res = await api.post(`/api/channels/${chId}/slack/connect`, {
        botToken: slackForm.botToken, signingSecret: slackForm.signingSecret,
      }, orgId);
      setChannels((p) => p.map((c) => c.id === chId ? res.channel : c));
      setVerifyResult({ verified: true, detail: `Conectado a: ${res.channel?.config?.team_name || "Workspace"}` });
    } catch (e: any) {
      setVerifyResult({ verified: false, detail: e.message });
    } finally { setSaving(false); }
  }

  async function disconnectChannel(type: ChannelType) {
    const ch = channels.find((c) => c.type === type && c.is_active);
    if (!ch) return;
    await api.post(`/api/channels/${ch.id}/disconnect`, {}, orgId);
    setChannels((p) => p.map((c) => c.id === ch.id ? { ...c, is_active: false } : c));
  }

  async function disconnectInstagramCard() {
    try {
      await api.del(`/api/integrations/instagram?agent_id=${agentId}`, orgId);
      setIgIntegration({ connected: false, ig_username: null, page_name: null });
      setChannels((p) => p.map((c) => c.type === "instagram" ? { ...c, is_active: false } : c));
    } catch (e: any) {
      console.error("[Instagram disconnect]", e.message);
    }
  }

  async function saveIgManual() {
    setIgManualSaving(true); setIgManualResult(null);
    try {
      const res = await api.post("/api/integrations/instagram/manual-setup", {
        agent_id:          agentId,
        organization_id:   orgId,
        ig_account_id:     igManualForm.igAccountId,
        ig_username:       igManualForm.igUsername || undefined,
        use_facebook_token: true,
      }, orgId);
      const detail = res.warning
        ? `Guardado con advertencia: ${res.warning}`
        : `@${res.integration?.ig_username || igManualForm.igAccountId} conectado exitosamente`;
      setIgManualResult({ ok: true, detail });
      const [refreshed, igInt] = await Promise.all([
        api.get(`/api/channels?agent_id=${agentId}`, orgId),
        api.get(`/api/integrations/instagram/status?agent_id=${agentId}`, orgId).catch(() => null),
      ]);
      if (refreshed) setChannels(Array.isArray(refreshed) ? refreshed : refreshed.channels ?? refreshed);
      setIgIntegration(igInt);
      setTimeout(() => { setIgManualOpen(false); setIgManualResult(null); }, 2200);
    } catch (e: any) {
      setIgManualResult({ ok: false, detail: e.message });
    } finally {
      setIgManualSaving(false);
    }
  }

  // ── Display values ────────────────────────────────────────────────────────────
  const agentApiKey = apiKeys.find((k) => k.agent_id === agentId && k.is_active);
  const displayKey  = rawKey ?? (agentApiKey ? `${agentApiKey.key_prefix}...` : "cc_...");

  const embedCode = `<script src="${WIDGET_SRC}"></script>\n<script>\n  ConectachatWidget.init({\n    apiKey: '${displayKey}',\n    agentName: '${(agent?.name || "Asistente").replace(/'/g, "\\'")}'\n  });\n</script>`;

  const curlExample = `curl -X POST ${BACKEND}/api/messages/chat \\
  -H "x-api-key: ${rawKey || "cc_TU_API_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hola, ¿me puedes ayudar?", "visitorId": "user123"}'`;

  // ── Step progress bar ─────────────────────────────────────────────────────────
  function Steps({ total, current }: { total: number; current: number }) {
    return (
      <div className="flex gap-1.5 mb-4">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`flex-1 h-1 rounded-full transition-colors ${current > i ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
    );
  }

  // ── Verify result banner ──────────────────────────────────────────────────────
  function VerifyBanner() {
    if (!verifyResult) return null;
    return (
      <div className={`flex items-center gap-2 rounded-lg p-3 text-xs mt-2 ${
        verifyResult.verified ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
        {verifyResult.verified ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
        {verifyResult.detail}
      </div>
    );
  }

  // ── Code block with copy ──────────────────────────────────────────────────────
  function CodeBlock({ code, copyKey }: { code: string; copyKey: string }) {
    return (
      <div className="relative">
        <pre className="bg-secondary text-foreground/80 rounded-lg p-4 text-[11px] font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">{code}</pre>
        <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => copyText(code, copyKey)}>
          {copied === copyKey ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    );
  }

  function InlineCode({ text, copyKey }: { text: string; copyKey: string }) {
    return (
      <div className="flex items-center gap-2 bg-secondary rounded px-3 py-2">
        <code className="text-xs flex-1 font-mono truncate">{text}</code>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyText(text, copyKey)}>
          {copied === copyKey ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
    );
  }

  // ── Modal content ─────────────────────────────────────────────────────────────
  function ModalContent() {
    switch (activeType) {

      // ── Web Widget ───────────────────────────────────────────────────────────
      case "web_widget":
        return step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-3 text-sm">
              {[
                { n: 1, title: "Activar el widget", desc: "Se genera una API key única para tu agente" },
                { n: 2, title: "Copiar el código",  desc: "Pégalo antes del </body> de tu sitio web" },
                { n: 3, title: "Listo",             desc: "El widget aparece en la esquina inferior derecha" },
              ].map(({ n, title, desc }) => (
                <div key={n} className="flex gap-3">
                  <div className="shrink-0 h-6 w-6 rounded-full bg-primary/20 text-primary text-[11px] flex items-center justify-center font-bold">{n}</div>
                  <div>
                    <p className="font-medium text-sm">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={activateWidget} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              Activar Web Widget
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {rawKey && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <p className="text-xs text-amber-400 font-medium">⚠️ Guarda esta API key ahora — no podrás verla de nuevo</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Pega este código antes de &lt;/body&gt;</Label>
              <CodeBlock code={embedCode} copyKey="embed" />
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-muted-foreground">
              El widget aparecerá como un botón de chat flotante en tu sitio. Compatible con cualquier plataforma web.
            </div>
          </div>
        );

      // ── Instagram / Facebook ─────────────────────────────────────────────────
      case "instagram":
      case "facebook": {
        const isIG = activeType === "instagram";
        const webhookUrl = `${BACKEND}/api/webhooks/meta`;
        const totalSteps = 4;
        return (
          <div className="space-y-4">
            <Steps total={totalSteps} current={step} />

            {step === 1 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Paso 1 — Crear app en Meta for Developers</h3>
                <ol className="space-y-2 text-xs text-muted-foreground">
                  <li>1. Ve a{" "}
                    <a href="https://developers.facebook.com/apps" target="_blank" className="text-primary underline inline-flex items-center gap-1">
                      developers.facebook.com/apps <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>2. Crea una app de tipo <strong>Business</strong></li>
                  <li>3. Agrega el producto: <strong>{isIG ? "Instagram Messaging" : "Messenger"}</strong></li>
                  <li>4. {isIG ? "Vincula tu cuenta de Instagram Business" : "Vincula tu Página de Facebook"}</li>
                </ol>
                <Button className="w-full" onClick={() => setStep(2)}>Siguiente →</Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Paso 2 — Configurar webhook</h3>
                <p className="text-xs text-muted-foreground">En la sección Webhooks de tu app Meta ingresa:</p>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">URL del webhook</Label>
                  <InlineCode text={webhookUrl} copyKey="meta-webhook" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Verify Token (cópialo en Meta)</Label>
                  <InlineCode text={metaForm.verifyToken} copyKey="meta-verify-token" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Suscríbete a los campos: <code>messages</code>, <code>messaging_postbacks</code>
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>← Atrás</Button>
                  <Button className="flex-1" onClick={() => setStep(3)}>Siguiente →</Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Paso 3 — Autorizar con Meta</h3>
                <p className="text-xs text-muted-foreground">
                  Haz clic para iniciar sesión en Meta y seleccionar tu{" "}
                  {isIG ? "cuenta de Instagram Business" : "página de Facebook"}.
                  Se abrirá una ventana de autorización y el canal se guardará automáticamente.
                </p>
                <Button className="w-full" onClick={isIG ? startInstagramOAuth : startMetaOAuth} disabled={metaConnecting}>
                  {metaConnecting
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Conectando, espera...</>
                    : <><ExternalLink className="h-4 w-4 mr-2" />{isIG ? "Conectar con Instagram" : "Conectar con Meta"}</>
                  }
                </Button>
                <VerifyBanner />
                <Button variant="outline" className="w-full" onClick={() => setStep(2)}>← Atrás</Button>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Paso 4 — Seleccionar página</h3>
                {oauthPages.length > 1 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Selecciona qué página conectar:</p>
                    {oauthPages.map((page) => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => setMetaForm((prev) => ({
                          ...prev,
                          pageId:      page.id,
                          accessToken: page.access_token,
                          igUserId:    page.instagram_user_id || "",
                        }))}
                        className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                          metaForm.pageId === page.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <p className="font-medium">{page.name}</p>
                        {page.instagram_user_id
                          ? <p className="text-xs text-emerald-500 mt-0.5">Instagram Business vinculado ✓</p>
                          : <p className="text-xs text-muted-foreground mt-0.5">Sin Instagram Business</p>
                        }
                      </button>
                    ))}
                  </div>
                ) : oauthPages.length === 1 ? (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
                    <p className="font-medium">{oauthPages[0].name}</p>
                    {oauthPages[0].instagram_user_id
                      ? <p className="text-xs text-emerald-500 mt-0.5">Instagram Business vinculado ✓</p>
                      : <p className="text-xs text-muted-foreground mt-0.5">Sin Instagram Business</p>
                    }
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No se encontraron páginas de Facebook.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Se suscribirá el webhook de Meta a tu {isIG ? "cuenta de Instagram" : "página de Facebook"}.
                </p>
                <VerifyBanner />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setStep(3); setOauthPages([]); }}>← Atrás</Button>
                  <Button className="flex-1" onClick={connectMeta} disabled={saving || !metaForm.pageId}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Conectar
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      }

      // ── WhatsApp ─────────────────────────────────────────────────────────────
      case "whatsapp": {
        const webhookUrl = `${BACKEND}/api/webhooks/whatsapp`;
        return (
          <div className="space-y-4">
            <Steps total={3} current={step} />

            {step === 1 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Paso 1 — Acceso a la API</h3>
                <p className="text-xs text-muted-foreground">Necesitas acceso a la WhatsApp Business API:</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: "Meta Business", url: "https://business.facebook.com" },
                    { name: "360Dialog",     url: "https://www.360dialog.com" },
                    { name: "Twilio",        url: "https://www.twilio.com/whatsapp" },
                  ].map((p) => (
                    <a key={p.name} href={p.url} target="_blank" rel="noreferrer"
                      className="flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs text-center hover:border-primary/40 transition-colors">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      {p.name}
                    </a>
                  ))}
                </div>
                <Button className="w-full" onClick={() => setStep(2)}>Tengo acceso →</Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Paso 2 — Webhook y credenciales</h3>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">URL del webhook (pégala en tu proveedor)</Label>
                  <InlineCode text={webhookUrl} copyKey="wa-webhook" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Phone Number ID</Label>
                  <Input placeholder="1234567890123456" value={waForm.phoneNumberId}
                    onChange={(e) => setWaForm((p) => ({ ...p, phoneNumberId: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Access Token</Label>
                  <Input type="password" placeholder="EAAB..." value={waForm.accessToken}
                    onChange={(e) => setWaForm((p) => ({ ...p, accessToken: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Business Account ID <span className="text-muted-foreground">(opcional)</span></Label>
                  <Input placeholder="1234567890123456" value={waForm.businessAccountId}
                    onChange={(e) => setWaForm((p) => ({ ...p, businessAccountId: e.target.value }))} />
                </div>
                <VerifyBanner />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>← Atrás</Button>
                  <Button className="flex-1" onClick={saveWhatsApp}
                    disabled={saving || !waForm.phoneNumberId || !waForm.accessToken}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Guardar y activar
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      }

      // ── Slack ────────────────────────────────────────────────────────────────
      case "slack": {
        const eventUrl = `${BACKEND}/api/webhooks/slack`;
        return (
          <div className="space-y-4">
            <Steps total={4} current={step} />

            {step === 1 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Paso 1 — Crear Slack App</h3>
                <ol className="space-y-1.5 text-xs text-muted-foreground">
                  <li>1. Ve a{" "}
                    <a href="https://api.slack.com/apps" target="_blank" className="text-primary underline inline-flex items-center gap-1">
                      api.slack.com/apps <ExternalLink className="h-3 w-3" />
                    </a>{" "}→ <strong>Create New App</strong> → &quot;From scratch&quot;
                  </li>
                  <li>2. Nombra la app y selecciona tu workspace</li>
                  <li>3. En <strong>OAuth & Permissions</strong> agrega los scopes: <code>chat:write</code>, <code>channels:history</code>, <code>app_mentions:read</code>, <code>im:history</code></li>
                </ol>
                <Button className="w-full" onClick={() => setStep(2)}>Siguiente →</Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Paso 2 — Event Subscriptions</h3>
                <p className="text-xs text-muted-foreground">Activa <strong>Event Subscriptions</strong> y pega la URL:</p>
                <InlineCode text={eventUrl} copyKey="slack-event" />
                <p className="text-xs text-muted-foreground">
                  Suscríbete a: <code>message.im</code>, <code>app_mention</code>
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>← Atrás</Button>
                  <Button className="flex-1" onClick={() => setStep(3)}>Siguiente →</Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Paso 3 — Instalar en workspace</h3>
                <p className="text-xs text-muted-foreground">
                  Ve a <strong>Install App</strong> → &quot;Install to Workspace&quot; y acepta los permisos.
                  Esto generará tu Bot Token.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>← Atrás</Button>
                  <Button className="flex-1" onClick={() => setStep(4)}>Siguiente →</Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Paso 4 — Credenciales</h3>
                <div className="space-y-2">
                  <Label className="text-xs">Bot Token (xoxb-...)</Label>
                  <Input type="password" placeholder="xoxb-123..." value={slackForm.botToken}
                    onChange={(e) => setSlackForm((p) => ({ ...p, botToken: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Signing Secret</Label>
                  <Input type="password" placeholder="abc123..." value={slackForm.signingSecret}
                    onChange={(e) => setSlackForm((p) => ({ ...p, signingSecret: e.target.value }))} />
                </div>
                <VerifyBanner />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>← Atrás</Button>
                  <Button className="flex-1" onClick={connectSlack}
                    disabled={saving || !slackForm.botToken || !slackForm.signingSecret}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Verificar y conectar
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      }

      // ── API REST ─────────────────────────────────────────────────────────────
      case "api":
        return step === 1 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Genera una API key para integrar el agente en cualquier aplicación via REST.
            </p>
            <Button className="w-full" onClick={generateApiKey} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
              Generar API Key
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {rawKey && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <p className="text-xs text-amber-400 font-medium mb-2">⚠️ Copia esta key ahora — no podrás verla de nuevo</p>
                <InlineCode text={rawKey} copyKey="raw-key" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Endpoint</Label>
              <InlineCode text={`POST ${BACKEND}/api/messages/chat`} copyKey="api-endpoint" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Headers</Label>
              <CodeBlock copyKey="api-headers" code={`{
  "x-api-key": "${rawKey || "cc_TU_API_KEY"}",
  "Content-Type": "application/json"
}`} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Body</Label>
              <CodeBlock copyKey="api-body" code={`{
  "message": "Hola, ¿me puedes ayudar?",
  "visitorId": "user123"
}`} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ejemplo cURL</Label>
              <CodeBlock code={curlExample} copyKey="curl" />
            </div>
            <div className="bg-secondary rounded-lg p-3 space-y-1">
              <Label className="text-xs text-muted-foreground">Respuesta</Label>
              <pre className="text-[11px] font-mono text-foreground/70">{`{
  "message": "Claro, te ayudo con gusto...",
  "conversationId": "uuid...",
  "handoffRequested": false
}`}</pre>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      <Header
        title="Canales de integración"
        description={agent ? `Conecta "${agent.name}" a tus plataformas de mensajería` : "Conecta el agente a tus plataformas"}
      />

      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ORDER.map((type) => {
              const meta      = CHANNEL_META[type];
              const channel   = channels.find((c) => c.type === type && c.is_active);
              const fbChannel = channels.find((c) => c.type === "facebook" && c.is_active);
              // Instagram: also consider instagram_integrations as source of truth
              const isConnected = type === "instagram"
                ? (!!channel || !!igIntegration?.connected)
                : !!channel;
              const igUsername = type === "instagram" && igIntegration?.ig_username
                ? igIntegration.ig_username : null;
              return (
                <Card key={type} className={`transition-all ${isConnected ? "border-primary/40 bg-primary/5" : ""}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="text-xl">{meta.emoji}</span>
                        {meta.label}
                      </span>
                      <Badge variant={isConnected ? "success" : "secondary"} className="text-[10px]">
                        {isConnected ? "Conectado" : "No conectado"}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {type === "instagram" && isConnected && igUsername
                        ? `@${igUsername}`
                        : meta.desc}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button
                        size="sm" className="flex-1"
                        variant={isConnected ? "outline" : "default"}
                        disabled={metaConnecting && type === "instagram" && !isConnected}
                        onClick={() => type === "instagram" && !isConnected ? startInstagramOAuth() : openModal(type)}
                      >
                        {metaConnecting && type === "instagram" && !isConnected
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Conectando...</>
                          : isConnected ? "Ver configuración" : "Conectar"
                        }
                      </Button>
                      {isConnected && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                          onClick={() => type === "instagram" ? disconnectInstagramCard() : disconnectChannel(type)}
                          title="Desconectar">
                          <Unplug className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {type === "instagram" && fbChannel && !isConnected && (
                      <button
                        type="button"
                        onClick={() => { setIgManualForm({ igAccountId: "", igUsername: "" }); setIgManualResult(null); setIgManualOpen(true); }}
                        className="mt-2 w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors text-center underline underline-offset-2"
                      >
                        Setup manual (admin)
                      </button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={activeType !== null} onOpenChange={(open) => !open && setActiveType(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {activeType && <span className="text-lg">{CHANNEL_META[activeType]?.emoji}</span>}
              {activeType && CHANNEL_META[activeType]?.label}
            </DialogTitle>
          </DialogHeader>
          <ModalContent />
        </DialogContent>
      </Dialog>

      {/* ── Instagram manual setup dialog ────────────────────────────────────── */}
      <Dialog open={igManualOpen} onOpenChange={(open) => { setIgManualOpen(open); if (!open) setIgManualResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="text-lg">📸</span>
              Setup manual de Instagram DM
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Usa el token de la Facebook Page ya conectada. Necesitas el ID numérico de la cuenta de Instagram Business (encuéntralo en Meta Business Suite → Configuración → Cuentas de Instagram).
            </p>
            <div className="space-y-2">
              <Label className="text-xs">IG Account ID <span className="text-destructive">*</span></Label>
              <Input
                placeholder="17841234567890"
                value={igManualForm.igAccountId}
                onChange={(e) => setIgManualForm((p) => ({ ...p, igAccountId: e.target.value.trim() }))}
              />
              <p className="text-[11px] text-muted-foreground">ID numérico de la cuenta de Instagram Business</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Username <span className="text-muted-foreground">(opcional — se detecta automáticamente)</span></Label>
              <Input
                placeholder="mi_empresa"
                value={igManualForm.igUsername}
                onChange={(e) => setIgManualForm((p) => ({ ...p, igUsername: e.target.value.replace(/^@/, "") }))}
              />
            </div>
            {igManualResult && (
              <div className={`flex items-start gap-2 rounded-lg p-3 text-xs border ${
                igManualResult.ok
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border-destructive/20"
              }`}>
                {igManualResult.ok
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                }
                {igManualResult.detail}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setIgManualOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={saveIgManual}
                disabled={igManualSaving || !igManualForm.igAccountId}
              >
                {igManualSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
