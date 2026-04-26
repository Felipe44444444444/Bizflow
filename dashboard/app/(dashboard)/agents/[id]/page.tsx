"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { api, getAuthHeaders } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Save, Loader2, Upload, Trash2, RefreshCw, FileText, Link2, AlignLeft,
  Brain, Settings, Radio, BarChart3, Copy, Check, Key, Zap,
  MessageSquare, Users, TrendingUp, Bot, Send, Target, Clock,
  Mail, Phone, AlertCircle, CheckCircle2, X,
} from "lucide-react";

function SlackLogo({ className = "h-4 w-4 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  );
}

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "https://api.conectaachat.com";
const WIDGET_SRC = process.env.NEXT_PUBLIC_WIDGET_URL || "https://cdn.conectaachat.com/widget.js";

const DOC_STATUS_COLOR: Record<string, any> = {
  ready: "success", processing: "warning", error: "destructive",
};

function AgentDetailInner() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaultTab = searchParams.get("tab") || "cerebro";
  const supabase = createClient();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [agent, setAgent] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [agentKey, setAgentKey] = useState<any | null>(null);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [stats, setStats] = useState({ conversations: 0, messages: 0, tokens: 0, leads: 0 });
  const [orgId, setOrgId] = useState("");

  // ── Action state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlForm, setUrlForm] = useState({ url: "", name: "" });
  const [textForm, setTextForm] = useState({ name: "", content: "" });
  const [addingUrl, setAddingUrl] = useState(false);
  const [addingText, setAddingText] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // ── Test chat state ───────────────────────────────────────────────────────────
  const [testMessages, setTestMessages]   = useState<any[]>([]);
  const [testInput,    setTestInput]      = useState("");
  const [testLoading,  setTestLoading]    = useState(false);

  // ── Slack state ──────────────────────────────────────────────────────────────
  const [slackStatus, setSlackStatus] = useState<{ connected: boolean; team_name: string | null } | null>(null);
  const [slackConnecting, setSlackConnecting] = useState(false);
  const [slackDisconnecting, setSlackDisconnecting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Leads & retargeting state ─────────────────────────────────────────────────
  const [leads, setLeads]                     = useState<any[]>([]);
  const [leadsLoading, setLeadsLoading]       = useState(false);
  const [followupConfig, setFollowupConfig]   = useState({ hours: "24", message: "Hola {nombre}, vi que tuviste una consulta pendiente. ¿Puedo ayudarte?" });
  const [offerLead, setOfferLead]             = useState<any | null>(null);
  const [offerMessage, setOfferMessage]       = useState("");
  const [sendingFollowup, setSendingFollowup] = useState<string | null>(null);
  const [scanning, setScanning]               = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;


      const { data: m } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();
      if (!m) return;
      setOrgId(m.organization_id);

      const [agentData, docsData, channelsData, keysData] = await Promise.all([
        api.get(`/api/agents/${id}`, m.organization_id),
        api.get(`/api/documents?agent_id=${id}`, m.organization_id),
        api.get(`/api/channels?agent_id=${id}`, m.organization_id),
        api.get("/api/api-keys", m.organization_id),
      ]);

      setAgent(agentData);
      setDocs(docsData || []);
      setChannels(channelsData || []);
      const key = (keysData || []).find((k: any) => k.agent_id === id && k.is_active);
      setAgentKey(key || null);

      // Stats
      const { count: convs } = await supabase
        .from("conversations").select("*", { count: "exact", head: true }).eq("agent_id", id);
      const { count: leads } = await supabase
        .from("leads").select("*", { count: "exact", head: true }).eq("agent_id", id);
      const { data: convIds } = await supabase.from("conversations").select("id").eq("agent_id", id);
      let msgCount = 0, tokenTotal = 0;
      if (convIds && convIds.length > 0) {
        const ids = convIds.map((c: any) => c.id);
        const { count: mc } = await supabase.from("messages").select("*", { count: "exact", head: true }).in("conversation_id", ids);
        const { data: td } = await supabase.from("messages").select("tokens_used").in("conversation_id", ids);
        msgCount = mc ?? 0;
        tokenTotal = (td || []).reduce((s: number, r: any) => s + (r.tokens_used || 0), 0);
      }
      setStats({ conversations: convs ?? 0, messages: msgCount, tokens: tokenTotal, leads: leads ?? 0 });

      // Load Slack status for this agent
      api.get(`/api/integrations/slack/status?agent_id=${id}`, m.organization_id)
        .then((d: any) => setSlackStatus(d))
        .catch(() => setSlackStatus({ connected: false, team_name: null }));

      // Handle Slack OAuth callback query params
      const slackParam = searchParams.get('slack');
      const slackErrParam = searchParams.get('slack_error');
      if (slackParam === 'connected') {
        showToast('¡Slack conectado exitosamente!', true);
        router.replace(`/agents/${id}?tab=canales`);
        api.get(`/api/integrations/slack/status?agent_id=${id}`, m.organization_id)
          .then((d: any) => setSlackStatus(d)).catch(() => {});
      } else if (slackErrParam) {
        showToast(`Error al conectar Slack: ${slackErrParam}`, false);
        router.replace(`/agents/${id}?tab=canales`);
      }
    }
    load();
  }, [id]);

  // ── Toast helper ─────────────────────────────────────────────────────────────
  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Slack OAuth ───────────────────────────────────────────────────────────────
  async function connectSlack() {
    setSlackConnecting(true);
    try {
      const { url } = await api.get(`/api/integrations/slack/connect?agent_id=${id}`, orgId);
      window.location.href = url;
    } catch (e: any) {
      showToast(e.message ?? 'No se pudo iniciar la conexión con Slack', false);
      setSlackConnecting(false);
    }
  }

  async function disconnectSlack() {
    setSlackDisconnecting(true);
    try {
      await api.del(`/api/integrations/slack?agent_id=${id}`, orgId);
      setSlackStatus({ connected: false, team_name: null });
      showToast('Slack desconectado', true);
    } catch (e: any) {
      showToast(e.message ?? 'Error al desconectar', false);
    } finally {
      setSlackDisconnecting(false);
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────────
  async function saveAgent() {
    setSaving(true);
    const updated = await api.put(`/api/agents/${id}`, agent, orgId);
    setAgent(updated);
    setSaving(false);
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("agent_id", id);
    const res = await fetch(`${BACKEND}/api/documents/upload`, {
      method: "POST",
      headers: await getAuthHeaders(orgId),
      body: fd,
    });
    const doc = await res.json();
    setDocs((p) => [doc, ...p]);
    setUploading(false);
    e.target.value = "";
  }

  async function addUrl() {
    setAddingUrl(true);
    const doc = await api.post("/api/documents/url", { ...urlForm, agent_id: id }, orgId);
    setDocs((p) => [doc, ...p]);
    setUrlForm({ url: "", name: "" });
    setAddingUrl(false);
  }

  async function addText() {
    setAddingText(true);
    const doc = await api.post("/api/documents/text", { ...textForm, agent_id: id, type: "faq" }, orgId);
    setDocs((p) => [doc, ...p]);
    setTextForm({ name: "", content: "" });
    setAddingText(false);
  }

  async function deleteDoc(docId: string) {
    await api.del(`/api/documents/${docId}`, orgId);
    setDocs((p) => p.filter((d) => d.id !== docId));
  }

  async function sendTestMessage() {
    const msg = testInput.trim();
    if (!msg || testLoading) return;
    setTestInput("");
    const history = testMessages.map((m) => ({ role: m.role, content: m.content }));
    setTestMessages((p) => [...p, { role: "user", content: msg }]);
    setTestLoading(true);
    try {
      const result = await api.post("/api/messages/preview", { agent_id: id, message: msg, history }, orgId);
      setTestMessages((p) => [...p, { role: "assistant", content: result.message, chunksUsed: result.chunksUsed }]);
    } catch (e: any) {
      setTestMessages((p) => [...p, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setTestLoading(false);
    }
  }

  async function loadLeads() {
    setLeadsLoading(true);
    try {
      const data = await api.get(`/api/retargeting/leads?agent_id=${id}`, orgId);
      setLeads(data || []);
    } finally {
      setLeadsLoading(false);
    }
  }

  async function scanLeads() {
    setScanning(true);
    try {
      const result = await api.post("/api/retargeting/scan", {
        agent_id: id,
        hours_threshold: parseInt(followupConfig.hours) || 24,
      }, orgId);
      await loadLeads();
      alert(`Escaneo completado: ${result.scanned} lead(s) detectado(s).`);
    } finally {
      setScanning(false);
    }
  }

  async function sendFollowup(leadId: string) {
    setSendingFollowup(leadId);
    try {
      await api.post("/api/retargeting/send-followup", { lead_id: leadId, message: followupConfig.message }, orgId);
      setLeads((p) => p.map((l) => l.id === leadId ? { ...l, status: "contacted" } : l));
    } finally {
      setSendingFollowup(null);
    }
  }

  async function sendOffer() {
    if (!offerLead || !offerMessage.trim()) return;
    setSendingFollowup(offerLead.id);
    try {
      await api.post("/api/retargeting/send-followup", { lead_id: offerLead.id, message: offerMessage }, orgId);
      setLeads((p) => p.map((l) => l.id === offerLead.id ? { ...l, status: "contacted" } : l));
      setOfferLead(null);
      setOfferMessage("");
    } finally {
      setSendingFollowup(null);
    }
  }

  async function updateLeadStatus(leadId: string, status: string) {
    await api.patch(`/api/retargeting/leads/${leadId}`, { status }, orgId);
    setLeads((p) => p.map((l) => l.id === leadId ? { ...l, status } : l));
  }

  async function reprocessDoc(docId: string) {
    await api.post(`/api/documents/${docId}/reprocess`, {}, orgId);
    setDocs((p) => p.map((d) => d.id === docId ? { ...d, status: "processing" } : d));
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function activateWidget() {
    setActivating("widget");
    try {
      const ch = await api.post("/api/channels", {
        agent_id: id, type: "web_widget", name: "Web Widget",
      }, orgId);
      setChannels((p) => [ch, ...p]);
      const keyData = await api.post("/api/api-keys", {
        name: `Widget — ${agent?.name ?? "Agente"}`, agent_id: id,
      }, orgId);
      setAgentKey({ ...keyData, key: undefined });
      setNewRawKey(keyData.key);
    } finally {
      setActivating(null);
    }
  }

  async function generateApiKey() {
    setActivating("api");
    try {
      const keyData = await api.post("/api/api-keys", {
        name: `API — ${agent?.name ?? "Agente"}`, agent_id: id,
      }, orgId);
      setAgentKey({ ...keyData, key: undefined });
      setNewRawKey(keyData.key);
    } finally {
      setActivating(null);
    }
  }

  if (!agent) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const widgetChannel = channels.find((c) => c.type === "web_widget" && c.is_active);
  const displayKey = newRawKey ?? (agentKey ? `${agentKey.key_prefix}...` : null);

  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg bg-card ${
          toast.ok ? "border-emerald-500/30 text-emerald-400" : "border-destructive/30 text-destructive"
        }`}>
          {toast.ok
            ? <CheckCircle2 className="h-4 w-4 shrink-0" />
            : <X className="h-4 w-4 shrink-0" />}
          {toast.msg}
        </div>
      )}
      <Header
        title={agent.name}
        description="Configuración del agente"
        action={
          <Button size="sm" onClick={saveAgent} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>
        }
      />

      <div className="p-6">
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="cerebro" className="gap-1.5">
              <Brain className="h-3.5 w-3.5" />Cerebro
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" />Configuración
            </TabsTrigger>
            <TabsTrigger value="canales" className="gap-1.5">
              <Radio className="h-3.5 w-3.5" />Canales
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />Estadísticas
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-1.5" onClick={() => { if (leads.length === 0 && !leadsLoading) loadLeads(); }}>
              <Target className="h-3.5 w-3.5" />Leads
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════ TAB 1 — CEREBRO ═══════════════ */}
          <TabsContent value="cerebro" className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              {/* Upload file */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />Subir archivo
                  </CardTitle>
                  <CardDescription className="text-xs">PDF o TXT, máx 50 MB</CardDescription>
                </CardHeader>
                <CardContent>
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:border-primary/50 transition-colors">
                    {uploading
                      ? <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      : <Upload className="h-6 w-6 text-muted-foreground" />
                    }
                    <span className="text-sm text-muted-foreground">
                      {uploading ? "Procesando..." : "Haz clic para subir"}
                    </span>
                    <input type="file" accept=".pdf,.txt" className="hidden" onChange={uploadFile} disabled={uploading} />
                  </label>
                </CardContent>
              </Card>

              {/* Add URL */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Link2 className="h-4 w-4" />Indexar URL
                  </CardTitle>
                  <CardDescription className="text-xs">Extrae y procesa el contenido de una web</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Nombre del documento"
                    value={urlForm.name}
                    onChange={(e) => setUrlForm({ ...urlForm, name: e.target.value })}
                  />
                  <Input
                    placeholder="https://..."
                    value={urlForm.url}
                    onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })}
                  />
                  <Button
                    size="sm" className="w-full"
                    onClick={addUrl}
                    disabled={!urlForm.url || !urlForm.name || addingUrl}
                  >
                    {addingUrl ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Indexar URL
                  </Button>
                </CardContent>
              </Card>

              {/* Add text/FAQ */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlignLeft className="h-4 w-4" />Texto / FAQ
                  </CardTitle>
                  <CardDescription className="text-xs">Pega contenido o preguntas frecuentes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Nombre del documento"
                    value={textForm.name}
                    onChange={(e) => setTextForm({ ...textForm, name: e.target.value })}
                  />
                  <Textarea
                    className="min-h-[80px] text-xs"
                    placeholder={"Pregunta: ¿Cuál es el horario?\nRespuesta: Lunes a viernes de 9 a 18h."}
                    value={textForm.content}
                    onChange={(e) => setTextForm({ ...textForm, content: e.target.value })}
                  />
                  <Button
                    size="sm" className="w-full"
                    onClick={addText}
                    disabled={!textForm.content || !textForm.name || addingText}
                  >
                    {addingText ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Agregar
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Documents list */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Base de conocimiento — {docs.length} documento{docs.length !== 1 ? "s" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Sin documentos. Agrega archivos, URLs o texto para entrenar al agente.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {docs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-lg p-3 bg-accent/30 border border-border"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{doc.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {doc.type} · {doc.chunk_count ?? 0} chunks
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={DOC_STATUS_COLOR[doc.status] ?? "secondary"}>
                            {doc.status}
                          </Badge>
                          {doc.status === "error" && (
                            <Button variant="ghost" size="icon" onClick={() => reprocessDoc(doc.id)}>
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => deleteDoc(doc.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Test chat */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />Chat de prueba
                </CardTitle>
                <CardDescription className="text-xs">
                  Prueba el agente con su base de conocimiento actual — no consume créditos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-72 overflow-y-auto flex flex-col gap-2.5 p-3 bg-accent/20 rounded-lg border border-border">
                  {testMessages.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center m-auto">Escribe un mensaje para probar el agente…</p>
                  ) : (
                    testMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[82%] rounded-xl px-3 py-2 text-xs ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-card border border-border"
                        }`}>
                          <p className="leading-relaxed">{msg.content}</p>
                          {msg.chunksUsed && msg.chunksUsed.length > 0 && (
                            <details className="mt-1.5">
                              <summary className="cursor-pointer text-[10px] opacity-60 hover:opacity-100">
                                {msg.chunksUsed.length} chunk{msg.chunksUsed.length !== 1 ? "s" : ""} del RAG usados
                              </summary>
                              <div className="mt-1 space-y-1">
                                {msg.chunksUsed.map((c: any, j: number) => (
                                  <div key={j} className="text-[10px] bg-accent/50 rounded p-1.5 leading-relaxed">
                                    <span className="font-medium opacity-70">[{c.similarity}] {c.source}: </span>
                                    {c.content}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {testLoading && (
                    <div className="flex justify-start">
                      <div className="bg-card border border-border rounded-xl px-3 py-2">
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    placeholder="Escribe un mensaje de prueba…"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendTestMessage()}
                    disabled={testLoading}
                  />
                  <Button size="sm" onClick={sendTestMessage} disabled={!testInput.trim() || testLoading}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════ TAB 2 — CONFIGURACIÓN ═══════════════ */}
          <TabsContent value="config" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Información básica</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input
                      value={agent.name}
                      onChange={(e) => setAgent({ ...agent, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Empresa que representa</Label>
                    <Input
                      value={agent.company_name ?? ""}
                      onChange={(e) => setAgent({ ...agent, company_name: e.target.value })}
                      placeholder="Ej: TechCorp, Tienda Online, Clínica Salud"
                    />
                    <p className="text-xs text-muted-foreground">El bot se presentará como «Eres {agent.name || "…"}, asistente de {agent.company_name || "[empresa]"}.»</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Descripción</Label>
                    <Input
                      value={agent.description ?? ""}
                      onChange={(e) => setAgent({ ...agent, description: e.target.value })}
                      placeholder="Breve descripción del agente"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Idioma</Label>
                      <Select value={agent.language} onValueChange={(v) => setAgent({ ...agent, language: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="es">Español</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="pt">Português</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tono</Label>
                      <Select value={agent.tone} onValueChange={(v) => setAgent({ ...agent, tone: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Profesional</SelectItem>
                          <SelectItem value="friendly">Amigable</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div>
                      <Label>Agente activo</Label>
                      <p className="text-xs text-muted-foreground">Responde mensajes entrantes</p>
                    </div>
                    <Switch
                      checked={agent.is_active}
                      onCheckedChange={(v) => setAgent({ ...agent, is_active: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Handoff a humano</Label>
                      <p className="text-xs text-muted-foreground">Permite derivar conversaciones</p>
                    </div>
                    <Switch
                      checked={agent.handoff_enabled}
                      onCheckedChange={(v) => setAgent({ ...agent, handoff_enabled: v })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Prompt y mensajes</CardTitle>
                  <CardDescription className="text-xs">Controla el comportamiento del agente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Instrucciones adicionales</Label>
                    <Textarea
                      className="min-h-[160px] text-xs"
                      placeholder={"Ejemplos:\n- Solo responde preguntas sobre nuestros productos\n- Si te preguntan por precios, dirige al usuario a contactar a ventas\n- No compartas información de competidores"}
                      value={agent.system_prompt ?? ""}
                      onChange={(e) => setAgent({ ...agent, system_prompt: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Se añaden al comportamiento base del bot. La identidad y tono se construyen automáticamente.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Mensaje de bienvenida</Label>
                    <Input
                      placeholder="¡Hola! Soy Sofia, ¿en qué puedo ayudarte hoy?"
                      value={agent.welcome_message ?? ""}
                      onChange={(e) => setAgent({ ...agent, welcome_message: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Primer mensaje que ve el usuario al abrir el chat</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Mensaje de fallback</Label>
                    <Input
                      placeholder="Lo siento, no tengo información sobre eso. ¿Puedo ayudarte en algo más?"
                      value={agent.fallback_message ?? ""}
                      onChange={(e) => setAgent({ ...agent, fallback_message: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Se muestra cuando el agente no puede responder</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveAgent} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar configuración
              </Button>
            </div>
          </TabsContent>

          {/* ═══════════════ TAB 3 — CANALES ═══════════════ */}
          <TabsContent value="canales" className="space-y-4">

            {/* Main channels grid */}
            <div className="grid md:grid-cols-3 gap-4">

              {/* ── Widget Web ── */}
              <Card className={cn(widgetChannel ? "border-primary/40 bg-primary/5" : "")}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>🌐 Widget Web</span>
                    {widgetChannel
                      ? <Badge variant="success">Activo</Badge>
                      : <Badge variant="secondary">Inactivo</Badge>}
                  </CardTitle>
                  <CardDescription className="text-xs">Chat en tu sitio web</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!widgetChannel ? (
                    <Button size="sm" className="w-full" onClick={activateWidget} disabled={activating === "widget"}>
                      {activating === "widget" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      Activar widget
                    </Button>
                  ) : (
                    <>
                      {newRawKey && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-xs text-amber-400">
                          ⚠️ Copia la API key — no la verás de nuevo.
                        </div>
                      )}
                      <div className="relative">
                        <pre className="bg-secondary rounded-lg p-3 text-[10px] font-mono overflow-x-auto text-foreground/80 leading-relaxed">
{`<script
  src="${WIDGET_SRC}"
  data-agent-id="${id}"
  data-api-key="${displayKey}"
  async
></script>`}
                        </pre>
                        <Button
                          variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6"
                          onClick={() => copyText(
                            `<script src="${WIDGET_SRC}" data-agent-id="${id}" data-api-key="${displayKey}" async></script>`,
                            "widget"
                          )}
                        >
                          {copied === "widget" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* ── Slack OAuth ── */}
              <Card className={cn(slackStatus?.connected ? "border-emerald-500/30 bg-emerald-500/5" : "")}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <SlackLogo />
                      Slack
                    </span>
                    {slackStatus?.connected && <Badge variant="success">Conectado</Badge>}
                  </CardTitle>
                  <CardDescription className="text-xs">Responde en canales y DMs de Slack</CardDescription>
                </CardHeader>
                <CardContent>
                  {!slackStatus ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : slackStatus.connected ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        {slackStatus.team_name}
                      </p>
                      <Button
                        variant="ghost" size="sm"
                        className="w-full text-xs text-destructive hover:text-destructive h-7 px-2"
                        onClick={disconnectSlack}
                        disabled={slackDisconnecting}
                      >
                        {slackDisconnecting
                          ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          : <X className="h-3 w-3 mr-1" />}
                        Desconectar
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" className="w-full gap-2" onClick={connectSlack} disabled={slackConnecting}>
                      {slackConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SlackLogo />}
                      Conectar Slack
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* ── WhatsApp (próximo) ── */}
              <Card className="opacity-60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>💬 WhatsApp Business</span>
                    <Badge variant="secondary">Próximo</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">Automatiza tu atención por WhatsApp</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Lanzamiento próximo — únete a la lista de espera en ajustes.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ── API REST ── */}
            <Card className={cn(agentKey ? "border-primary/40 bg-primary/5" : "")}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    ⚡ API REST
                    {agentKey ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Sin API key</Badge>}
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">Integra el agente en tus aplicaciones mediante API</CardDescription>
                </div>
                {!agentKey && (
                  <Button size="sm" onClick={generateApiKey} disabled={activating === "api"}>
                    {activating === "api" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
                    Generar API Key
                  </Button>
                )}
              </CardHeader>
              {agentKey && (
                <CardContent className="space-y-3">
                  {newRawKey && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-400">
                      ⚠️ Copia esta API key ahora — no podrás verla de nuevo.
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Endpoint</Label>
                      <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
                        <code className="text-xs flex-1 truncate">POST {BACKEND}/api/messages/chat</code>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                          onClick={() => copyText(`${BACKEND}/api/messages/chat`, "endpoint")}>
                          {copied === "endpoint" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">API Key</Label>
                      <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
                        <code className="text-xs flex-1 truncate font-mono">{displayKey}</code>
                        {newRawKey && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                            onClick={() => copyText(newRawKey, "apikey")}>
                            {copied === "apikey" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="bg-secondary rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Ejemplo cURL:</p>
                    <pre className="text-[11px] font-mono text-foreground/70 overflow-x-auto leading-relaxed">
{`curl -X POST ${BACKEND}/api/messages/chat \\
  -H "x-api-key: ${displayKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"message":"Hola, ¿me puedes ayudar?"}'`}
                    </pre>
                  </div>
                </CardContent>
              )}
            </Card>
          </TabsContent>

          {/* ═══════════════ TAB 4 — ESTADÍSTICAS ═══════════════ */}
          <TabsContent value="stats" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {([
                { label: "Conversaciones", value: stats.conversations, Icon: MessageSquare, color: "text-blue-400" },
                { label: "Mensajes", value: stats.messages, Icon: Bot, color: "text-purple-400" },
                { label: "Tokens usados", value: stats.tokens > 999 ? `${(stats.tokens / 1000).toFixed(1)}k` : stats.tokens, Icon: TrendingUp, color: "text-amber-400" },
                { label: "Leads captados", value: stats.leads, Icon: Users, color: "text-emerald-400" },
              ] as const).map(({ label, value, Icon, color }) => (
                <Card key={label}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <div className={`p-2 rounded-lg ${color} bg-current/10`}>
                        <Icon className={`h-4 w-4 ${color}`} />
                      </div>
                    </div>
                    <p className="text-3xl font-bold">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {stats.conversations === 0 && (
              <Card>
                <CardContent className="py-16 text-center">
                  <Bot className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm font-medium">Este agente no ha tenido conversaciones aún</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Activa un canal en la pestaña Canales para empezar a recibir mensajes.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          {/* ═══════════════ TAB 5 — LEADS & RETARGETING ═══════════════ */}
          <TabsContent value="leads" className="space-y-4">

            {/* Config + Scan */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4" />Seguimiento automático
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Detecta conversaciones abandonadas y envía recordatorios
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sin respuesta después de (horas)</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={followupConfig.hours}
                      onChange={(e) => setFollowupConfig({ ...followupConfig, hours: e.target.value })}
                    >
                      <option value="1">1 hora</option>
                      <option value="6">6 horas</option>
                      <option value="24">24 horas</option>
                      <option value="48">48 horas</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mensaje de seguimiento</Label>
                    <Textarea
                      className="min-h-[72px] text-xs"
                      placeholder="Hola {nombre}, vi que tuviste una consulta pendiente..."
                      value={followupConfig.message}
                      onChange={(e) => setFollowupConfig({ ...followupConfig, message: e.target.value })}
                    />
                    <p className="text-[10px] text-muted-foreground">Variables: {"{nombre}"}, {"{producto}"}</p>
                  </div>
                  <Button size="sm" className="w-full" onClick={scanLeads} disabled={scanning}>
                    {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />}
                    Escanear conversaciones abandonadas
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-400" />Resumen de leads
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { label: "Nuevos", status: "new", color: "text-blue-400" },
                      { label: "Contactados", status: "contacted", color: "text-amber-400" },
                      { label: "Calificados", status: "qualified", color: "text-emerald-400" },
                      { label: "Perdidos", status: "lost", color: "text-red-400" },
                    ] as const).map(({ label, status, color }) => (
                      <div key={status} className="bg-accent/30 rounded-lg p-3 text-center">
                        <p className={`text-xl font-bold ${color}`}>
                          {leads.filter((l) => l.status === status).length}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Leads table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Prospectos ({leads.length})</CardTitle>
                <Button size="sm" variant="outline" onClick={loadLeads} disabled={leadsLoading}>
                  {leadsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Actualizar
                </Button>
              </CardHeader>
              <CardContent>
                {leadsLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : leads.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <Target className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">Sin leads todavía</p>
                    <p className="text-xs text-muted-foreground">Haz clic en &quot;Escanear&quot; para detectar conversaciones abandonadas</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leads.map((lead) => (
                      <div key={lead.id} className="flex items-center justify-between rounded-lg p-3 bg-accent/30 border border-border">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                            <Users className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{lead.name || "Anónimo"}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {lead.email && <span className="flex items-center gap-0.5"><Mail className="h-2.5 w-2.5" />{lead.email}</span>}
                              {lead.phone && <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{lead.phone}</span>}
                              {!lead.email && !lead.phone && <span>Sin contacto</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            className="h-7 text-xs border border-input rounded-md bg-background px-2"
                            value={lead.status}
                            onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                          >
                            <option value="new">Nuevo</option>
                            <option value="contacted">Contactado</option>
                            <option value="qualified">Calificado</option>
                            <option value="lost">Perdido</option>
                          </select>
                          <Button
                            size="sm" variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => sendFollowup(lead.id)}
                            disabled={sendingFollowup === lead.id}
                          >
                            {sendingFollowup === lead.id
                              ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              : <Send className="h-2.5 w-2.5" />}
                            Recordatorio
                          </Button>
                          <Button
                            size="sm" variant="default"
                            className="h-7 text-xs gap-1"
                            onClick={() => { setOfferLead(lead); setOfferMessage(""); }}
                          >
                            <Zap className="h-2.5 w-2.5" />Oferta
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Send offer modal */}
            {offerLead && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                <Card className="w-full max-w-md">
                  <CardHeader>
                    <CardTitle className="text-sm">Enviar oferta a {offerLead.name || "Anónimo"}</CardTitle>
                    <CardDescription className="text-xs">Escribe un mensaje personalizado con tu oferta</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      className="min-h-[100px] text-sm"
                      placeholder="Hola, quería ofrecerte un 20% de descuento en..."
                      value={offerMessage}
                      onChange={(e) => setOfferMessage(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setOfferLead(null)}>Cancelar</Button>
                      <Button size="sm" onClick={sendOffer} disabled={!offerMessage.trim() || !!sendingFollowup}>
                        {sendingFollowup ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Enviar oferta
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}

export default function AgentDetailPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <AgentDetailInner />
    </Suspense>
  );
}
