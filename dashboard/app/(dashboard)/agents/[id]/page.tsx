"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const BACKEND    = process.env.NEXT_PUBLIC_API_URL  || "https://api.conectaachat.com";
const WIDGET_SRC = process.env.NEXT_PUBLIC_WIDGET_URL || "https://cdn.conectaachat.com/widget.js";
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL    || "https://app.conectaachat.com";

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

  // ── Facebook state ────────────────────────────────────────────────────────────
  const [fbStatus, setFbStatus] = useState<{ connected: boolean; page_name: string | null; available_pages: { id: string; name: string }[] } | null>(null);
  const [fbConnecting, setFbConnecting] = useState(false);
  const [fbDisconnecting, setFbDisconnecting] = useState(false);

  // ── Instagram state ───────────────────────────────────────────────────────────
  const [igStatus, setIgStatus] = useState<{ connected: boolean; ig_username: string | null; page_name: string | null } | null>(null);
  const [igConnecting, setIgConnecting] = useState(false);
  const [igDisconnecting, setIgDisconnecting] = useState(false);

  // ── Multi-page picker ─────────────────────────────────────────────────────────
  const [fbPages, setFbPages] = useState<{ id: string; name: string }[]>([]);
  const [fbPageSwitching, setFbPageSwitching] = useState(false);

  // ── WhatsApp state ────────────────────────────────────────────────────────────
  const [waStatus, setWaStatus] = useState<{ connected: boolean; display_phone: string | null } | null>(null);
  const [waConnecting, setWaConnecting] = useState(false);
  const [waDisconnecting, setWaDisconnecting] = useState(false);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

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

      // Load integration statuses in parallel
      Promise.all([
        api.get(`/api/integrations/slack/status?agent_id=${id}`, m.organization_id),
        api.get(`/api/integrations/facebook/status?agent_id=${id}`, m.organization_id),
        api.get(`/api/integrations/instagram/status?agent_id=${id}`, m.organization_id),
        api.get(`/api/integrations/whatsapp/status?agent_id=${id}`, m.organization_id),
      ]).then(([slk, fb, ig, wa]: any[]) => {
        setSlackStatus(slk);
        setFbStatus(fb);
        if (fb?.available_pages?.length > 1) setFbPages(fb.available_pages);
        setIgStatus(ig);
        setWaStatus(wa);
      }).catch(() => {
        setSlackStatus({ connected: false, team_name: null });
        setFbStatus({ connected: false, page_name: null, available_pages: [] });
        setIgStatus({ connected: false, ig_username: null, page_name: null });
        setWaStatus({ connected: false, display_phone: null });
      });

      // Handle OAuth callback params
      const slackParam   = searchParams.get('slack');
      const slackErr     = searchParams.get('slack_error');
      const fbParam      = searchParams.get('fb');
      const fbErr        = searchParams.get('fb_error');
      const igParam      = searchParams.get('ig');
      const igErr        = searchParams.get('ig_error');
      const waParam      = searchParams.get('wa');
      const waErr        = searchParams.get('wa_error');

      if (slackParam === 'connected') {
        showToast('¡Slack conectado exitosamente!', true);
        router.replace(`/agents/${id}?tab=canales`);
        api.get(`/api/integrations/slack/status?agent_id=${id}`, m.organization_id)
          .then((d: any) => setSlackStatus(d)).catch(() => {});
      } else if (slackErr) {
        showToast(`Error al conectar Slack: ${slackErr}`, false);
        router.replace(`/agents/${id}?tab=canales`);
      } else if (fbParam === 'connected') {
        showToast('¡Facebook conectado exitosamente!', true);
        router.replace(`/agents/${id}?tab=canales`);
        api.get(`/api/integrations/facebook/status?agent_id=${id}`, m.organization_id)
          .then((d: any) => { setFbStatus(d); if (d?.available_pages?.length > 1) setFbPages(d.available_pages); }).catch(() => {});
        const fbPagesParam = searchParams.get('fb_pages');
        if (fbPagesParam) { try { setFbPages(JSON.parse(fbPagesParam)); } catch {} }
      } else if (fbErr) {
        showToast(`Error al conectar Facebook: ${fbErr}`, false);
        router.replace(`/agents/${id}?tab=canales`);
      } else if (igParam === 'connected') {
        showToast('¡Instagram conectado exitosamente!', true);
        router.replace(`/agents/${id}?tab=canales`);
        api.get(`/api/integrations/facebook/status?agent_id=${id}`, m.organization_id)
          .then((d: any) => setFbStatus(d)).catch(() => {});
      } else if (igErr) {
        showToast(`Error al conectar Instagram: ${igErr}`, false);
        router.replace(`/agents/${id}?tab=canales`);
      } else if (waParam === 'connected') {
        showToast('¡WhatsApp conectado exitosamente!', true);
        router.replace(`/agents/${id}?tab=canales`);
        api.get(`/api/integrations/whatsapp/status?agent_id=${id}`, m.organization_id)
          .then((d: any) => setWaStatus(d)).catch(() => {});
      } else if (waErr) {
        showToast(`Error al conectar WhatsApp: ${waErr}`, false);
        router.replace(`/agents/${id}?tab=canales`);
      }

      const urlErrorParam = searchParams.get('error');
      if (urlErrorParam) {
        setUrlError(urlErrorParam);
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

  // ── Facebook OAuth ────────────────────────────────────────────────────────────
  async function connectFacebook() {
    setFbConnecting(true);
    try {
      const { url } = await api.get(`/api/integrations/facebook/connect?agent_id=${id}`, orgId);
      window.location.href = url;
    } catch (e: any) {
      showToast(e.message ?? 'No se pudo iniciar la conexión con Facebook', false);
      setFbConnecting(false);
    }
  }

  async function disconnectFacebook() {
    setFbDisconnecting(true);
    try {
      await api.del(`/api/integrations/facebook?agent_id=${id}`, orgId);
      setFbStatus({ connected: false, page_name: null, available_pages: [] });
      showToast('Facebook desconectado', true);
    } catch (e: any) {
      showToast(e.message ?? 'Error al desconectar', false);
    } finally {
      setFbDisconnecting(false);
    }
  }

  // ── Instagram OAuth ───────────────────────────────────────────────────────────
  async function connectInstagram() {
    setIgConnecting(true);
    try {
      const result = await api.post('/api/integrations/instagram/connect-via-facebook', { agent_id: id }, orgId);
      if (result.success) {
        showToast(`Instagram @${result.ig_username} conectado`, true);
        setIgStatus({ connected: true, ig_username: result.ig_username, page_name: null });
        setIgConnecting(false);
        return;
      }
    } catch (e: any) {
      const msg: string = e.message ?? '';
      if (!msg.includes('No hay una página de Facebook')) {
        showToast(msg || 'Error al conectar Instagram', false);
        setIgConnecting(false);
        return;
      }
    }
    try {
      const { url } = await api.get(`/api/integrations/instagram/connect?agent_id=${id}`, orgId);
      window.location.href = url;
    } catch (e: any) {
      showToast(e.message ?? 'No se pudo iniciar la conexión con Instagram', false);
      setIgConnecting(false);
    }
  }

  async function disconnectInstagram() {
    setIgDisconnecting(true);
    try {
      await api.del(`/api/integrations/instagram?agent_id=${id}`, orgId);
      setIgStatus({ connected: false, ig_username: null, page_name: null });
      showToast('Instagram desconectado', true);
    } catch (e: any) {
      showToast(e.message ?? 'Error al desconectar', false);
    } finally {
      setIgDisconnecting(false);
    }
  }

  async function switchFbPage(pageId: string) {
    setFbPageSwitching(true);
    try {
      const d = await api.post(`/api/integrations/facebook/select-page`, { agent_id: id, page_id: pageId }, orgId);
      setFbStatus((prev: any) => ({ ...prev, page_name: d.page_name }));
      setFbPages([]);
      showToast(`Página cambiada a ${d.page_name}`, true);
    } catch (e: any) {
      showToast(e.message ?? 'Error al cambiar página', false);
    } finally {
      setFbPageSwitching(false);
    }
  }

  // ── WhatsApp OAuth ────────────────────────────────────────────────────────────
  async function connectWhatsApp() {
    setWaConnecting(true);
    try {
      const { url } = await api.get(`/api/integrations/whatsapp/connect?agent_id=${id}`, orgId);
      window.location.href = url;
    } catch (e: any) {
      showToast(e.message ?? 'No se pudo iniciar la conexión con WhatsApp', false);
      setWaConnecting(false);
    }
  }

  async function disconnectWhatsApp() {
    setWaDisconnecting(true);
    try {
      await api.del(`/api/integrations/whatsapp?agent_id=${id}`, orgId);
      setWaStatus({ connected: false, display_phone: null });
      showToast('WhatsApp desconectado', true);
    } catch (e: any) {
      showToast(e.message ?? 'Error al desconectar', false);
    } finally {
      setWaDisconnecting(false);
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
      <Loader2 className="h-6 w-6 animate-spin text-neon-cyan" />
    </div>
  );

  const widgetChannel = channels.find((c) => c.type === "web_widget" && c.is_active);
  const displayKey = newRawKey ?? (agentKey ? `${agentKey.key_prefix}...` : null);

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm animate-slide-in-up",
          toast.ok
            ? "bg-neon-green/10 border-neon-green/20 text-neon-green"
            : "bg-neon-red/10 border-neon-red/20 text-neon-red"
        )} style={{ boxShadow: toast.ok ? "0 0 20px rgba(0,255,136,0.12)" : "0 0 20px rgba(255,56,96,0.12)" }}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      <Header
        title={agent.name}
        description="Configuración del agente"
        action={
          <Button
            size="sm"
            className="bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan/50 font-semibold"
            onClick={saveAgent}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>
        }
      />

      <div className="p-6">
        {urlError && (
          <div className="mb-4 p-4 bg-neon-red/5 border border-neon-red/20 rounded-xl">
            <p className="text-sm font-semibold text-neon-red mb-1">Error al conectar Instagram</p>
            <p className="text-sm text-[#A0AEC0]">{urlError}</p>
            <a href="https://help.instagram.com/502981923235522" target="_blank" rel="noopener noreferrer"
              className="text-xs text-neon-cyan hover:underline mt-2 inline-block">
              Ver guía de Instagram Business →
            </a>
          </div>
        )}

        <Tabs defaultValue={defaultTab}>
          <TabsList className="bg-space-el rounded-xl p-1 border border-neon-cyan/[0.08] mb-6 flex-wrap h-auto gap-0.5">
            <TabsTrigger value="cerebro" className="data-[state=active]:bg-space-card data-[state=active]:text-neon-cyan data-[state=active]:shadow-sm rounded-lg text-[#4A5568] hover:text-[#A0AEC0] gap-1.5">
              <Brain className="h-3.5 w-3.5" />Cerebro
            </TabsTrigger>
            <TabsTrigger value="config" className="data-[state=active]:bg-space-card data-[state=active]:text-neon-cyan data-[state=active]:shadow-sm rounded-lg text-[#4A5568] hover:text-[#A0AEC0] gap-1.5">
              <Settings className="h-3.5 w-3.5" />Configuración
            </TabsTrigger>
            <TabsTrigger value="canales" className="data-[state=active]:bg-space-card data-[state=active]:text-neon-cyan data-[state=active]:shadow-sm rounded-lg text-[#4A5568] hover:text-[#A0AEC0] gap-1.5">
              <Radio className="h-3.5 w-3.5" />Canales
            </TabsTrigger>
            <TabsTrigger value="stats" className="data-[state=active]:bg-space-card data-[state=active]:text-neon-cyan data-[state=active]:shadow-sm rounded-lg text-[#4A5568] hover:text-[#A0AEC0] gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />Estadísticas
            </TabsTrigger>
            <TabsTrigger value="leads" className="data-[state=active]:bg-space-card data-[state=active]:text-neon-cyan data-[state=active]:shadow-sm rounded-lg text-[#4A5568] hover:text-[#A0AEC0] gap-1.5"
              onClick={() => { if (leads.length === 0 && !leadsLoading) loadLeads(); }}>
              <Target className="h-3.5 w-3.5" />Leads
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════ TAB 1 — CEREBRO ═══════════════ */}
          <TabsContent value="cerebro" className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">

              {/* Upload file */}
              <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
                <div className="p-5 border-b border-neon-cyan/[0.06]">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <FileText className="h-4 w-4 text-neon-cyan" />Subir archivo
                  </h3>
                  <p className="text-xs text-[#4A5568] mt-0.5">PDF o TXT, máx 50 MB</p>
                </div>
                <div className="p-5">
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-neon-cyan/15 rounded-xl p-6 cursor-pointer hover:border-neon-cyan/30 hover:bg-neon-cyan/[0.03] transition-all">
                    {uploading
                      ? <Loader2 className="h-6 w-6 animate-spin text-neon-cyan" />
                      : <Upload className="h-6 w-6 text-[#4A5568]" />
                    }
                    <span className="text-sm text-[#4A5568]">
                      {uploading ? "Procesando..." : "Haz clic para subir"}
                    </span>
                    <input type="file" accept=".pdf,.txt" className="hidden" onChange={uploadFile} disabled={uploading} />
                  </label>
                </div>
              </div>

              {/* Add URL */}
              <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
                <div className="p-5 border-b border-neon-cyan/[0.06]">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-neon-cyan" />Indexar URL
                  </h3>
                  <p className="text-xs text-[#4A5568] mt-0.5">Extrae y procesa el contenido de una web</p>
                </div>
                <div className="p-5 space-y-3">
                  <Input placeholder="Nombre del documento" value={urlForm.name}
                    onChange={(e) => setUrlForm({ ...urlForm, name: e.target.value })}
                    className="bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] h-9 focus:border-neon-cyan/40" />
                  <Input placeholder="https://..." value={urlForm.url}
                    onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })}
                    className="bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] h-9 focus:border-neon-cyan/40" />
                  <Button size="sm" className="w-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20"
                    onClick={addUrl} disabled={!urlForm.url || !urlForm.name || addingUrl}>
                    {addingUrl ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Indexar URL
                  </Button>
                </div>
              </div>

              {/* Add text/FAQ */}
              <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
                <div className="p-5 border-b border-neon-cyan/[0.06]">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <AlignLeft className="h-4 w-4 text-neon-cyan" />Texto / FAQ
                  </h3>
                  <p className="text-xs text-[#4A5568] mt-0.5">Pega contenido o preguntas frecuentes</p>
                </div>
                <div className="p-5 space-y-3">
                  <Input placeholder="Nombre del documento" value={textForm.name}
                    onChange={(e) => setTextForm({ ...textForm, name: e.target.value })}
                    className="bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] h-9 focus:border-neon-cyan/40" />
                  <Textarea className="min-h-[80px] text-xs bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] focus:border-neon-cyan/40"
                    placeholder={"Pregunta: ¿Cuál es el horario?\nRespuesta: Lunes a viernes de 9 a 18h."}
                    value={textForm.content}
                    onChange={(e) => setTextForm({ ...textForm, content: e.target.value })} />
                  <Button size="sm" className="w-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20"
                    onClick={addText} disabled={!textForm.content || !textForm.name || addingText}>
                    {addingText ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Agregar
                  </Button>
                </div>
              </div>
            </div>

            {/* Documents list */}
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
              <div className="p-5 border-b border-neon-cyan/[0.06]">
                <h3 className="text-sm font-semibold text-white">
                  Base de conocimiento — {docs.length} documento{docs.length !== 1 ? "s" : ""}
                </h3>
              </div>
              <div className="p-5">
                {docs.length === 0 ? (
                  <p className="text-sm text-[#4A5568] text-center py-8">
                    Sin documentos. Agrega archivos, URLs o texto para entrenar al agente.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {docs.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between rounded-xl p-3 bg-space-el border border-neon-cyan/[0.06]">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4 text-neon-cyan" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{doc.name}</p>
                            <p className="text-xs text-[#4A5568] capitalize">{doc.type} · {doc.chunk_count ?? 0} chunks</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", {
                            "bg-neon-green/10 text-neon-green border-neon-green/20": doc.status === "ready",
                            "bg-neon-yellow/10 text-neon-yellow border-neon-yellow/20": doc.status === "processing",
                            "bg-neon-red/10 text-neon-red border-neon-red/20": doc.status === "error",
                          })}>
                            {doc.status}
                          </span>
                          {doc.status === "error" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-neon-yellow/10 hover:text-neon-yellow" onClick={() => reprocessDoc(doc.id)}>
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-neon-red/10 hover:text-neon-red" onClick={() => deleteDoc(doc.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Test chat */}
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
              <div className="p-5 border-b border-neon-cyan/[0.06]">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-neon-cyan" />Chat de prueba
                </h3>
                <p className="text-xs text-[#4A5568] mt-0.5">
                  Prueba el agente con su base de conocimiento actual — no consume créditos
                </p>
              </div>
              <div className="p-5 space-y-3">
                <div className="h-72 overflow-y-auto flex flex-col gap-2.5 p-3 bg-space rounded-xl border border-neon-cyan/[0.06]">
                  {testMessages.length === 0 ? (
                    <p className="text-xs text-[#4A5568] text-center m-auto">Escribe un mensaje para probar el agente…</p>
                  ) : (
                    testMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={cn("max-w-[82%] rounded-xl px-3 py-2 text-xs", {
                          "bg-neon-cyan/15 border border-neon-cyan/20 text-white": msg.role === "user",
                          "bg-space-el border border-neon-cyan/[0.06] text-[#A0AEC0]": msg.role !== "user",
                        })}>
                          <p className="leading-relaxed">{msg.content}</p>
                          {msg.chunksUsed && msg.chunksUsed.length > 0 && (
                            <details className="mt-1.5">
                              <summary className="cursor-pointer text-[10px] opacity-60 hover:opacity-100">
                                {msg.chunksUsed.length} chunk{msg.chunksUsed.length !== 1 ? "s" : ""} del RAG usados
                              </summary>
                              <div className="mt-1 space-y-1">
                                {msg.chunksUsed.map((c: any, j: number) => (
                                  <div key={j} className="text-[10px] bg-space/50 rounded p-1.5 leading-relaxed">
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
                      <div className="bg-space-el border border-neon-cyan/[0.06] rounded-xl px-3 py-2">
                        <Loader2 className="h-3 w-3 animate-spin text-neon-cyan" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 h-9 rounded-xl border border-neon-cyan/15 bg-space-el px-3 text-xs text-white placeholder-[#4A5568] focus:border-neon-cyan/40 outline-none transition-colors"
                    placeholder="Escribe un mensaje de prueba…"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendTestMessage()}
                    disabled={testLoading}
                  />
                  <Button size="sm" className="bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 px-3"
                    onClick={sendTestMessage} disabled={!testInput.trim() || testLoading}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ═══════════════ TAB 2 — CONFIGURACIÓN ═══════════════ */}
          <TabsContent value="config" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">

              {/* Identity */}
              <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
                <div className="p-5 border-b border-neon-cyan/[0.06]">
                  <h3 className="text-sm font-semibold text-white">Información básica</h3>
                </div>
                <div className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#A0AEC0]">Nombre</Label>
                    <Input value={agent.name} onChange={(e) => setAgent({ ...agent, name: e.target.value })}
                      className="bg-space-el border-neon-cyan/15 text-white h-9 focus:border-neon-cyan/40" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#A0AEC0]">Empresa que representa</Label>
                    <Input value={agent.company_name ?? ""} onChange={(e) => setAgent({ ...agent, company_name: e.target.value })}
                      placeholder="Ej: TechCorp, Tienda Online, Clínica Salud"
                      className="bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] h-9 focus:border-neon-cyan/40" />
                    <p className="text-xs text-[#4A5568]">El bot se presentará como «Eres {agent.name || "…"}, asistente de {agent.company_name || "[empresa]"}.»</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#A0AEC0]">Descripción</Label>
                    <Input value={agent.description ?? ""} onChange={(e) => setAgent({ ...agent, description: e.target.value })}
                      placeholder="Breve descripción del agente"
                      className="bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] h-9 focus:border-neon-cyan/40" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-[#A0AEC0]">Idioma</Label>
                      <Select value={agent.language} onValueChange={(v) => setAgent({ ...agent, language: v })}>
                        <SelectTrigger className="bg-space-el border-neon-cyan/15 text-white h-9 focus:border-neon-cyan/40"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-space-card border-neon-cyan/15">
                          <SelectItem value="es">Español</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="pt">Português</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-[#A0AEC0]">Tono</Label>
                      <Select value={agent.tone} onValueChange={(v) => setAgent({ ...agent, tone: v })}>
                        <SelectTrigger className="bg-space-el border-neon-cyan/15 text-white h-9 focus:border-neon-cyan/40"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-space-card border-neon-cyan/15">
                          <SelectItem value="professional">Profesional</SelectItem>
                          <SelectItem value="friendly">Amigable</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-neon-cyan/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white">Agente activo</p>
                        <p className="text-xs text-[#4A5568]">Responde mensajes entrantes</p>
                      </div>
                      <Switch checked={agent.is_active} onCheckedChange={(v) => setAgent({ ...agent, is_active: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white">Handoff a humano</p>
                        <p className="text-xs text-[#4A5568]">Permite derivar conversaciones</p>
                      </div>
                      <Switch checked={agent.handoff_enabled} onCheckedChange={(v) => setAgent({ ...agent, handoff_enabled: v })} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Prompt & messages */}
              <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
                <div className="p-5 border-b border-neon-cyan/[0.06]">
                  <h3 className="text-sm font-semibold text-white">Prompt y mensajes</h3>
                  <p className="text-xs text-[#4A5568] mt-0.5">Controla el comportamiento del agente</p>
                </div>
                <div className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#A0AEC0]">Instrucciones adicionales</Label>
                    <Textarea className="min-h-[160px] text-xs bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] focus:border-neon-cyan/40"
                      placeholder={"Ejemplos:\n- Solo responde preguntas sobre nuestros productos\n- Si te preguntan por precios, dirige al usuario a contactar a ventas\n- No compartas información de competidores"}
                      value={agent.system_prompt ?? ""}
                      onChange={(e) => setAgent({ ...agent, system_prompt: e.target.value })} />
                    <p className="text-xs text-[#4A5568]">Se añaden al comportamiento base del bot. La identidad y tono se construyen automáticamente.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#A0AEC0]">Mensaje de bienvenida</Label>
                    <Input placeholder="¡Hola! Soy Sofia, ¿en qué puedo ayudarte hoy?"
                      value={agent.welcome_message ?? ""}
                      onChange={(e) => setAgent({ ...agent, welcome_message: e.target.value })}
                      className="bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] h-9 focus:border-neon-cyan/40" />
                    <p className="text-xs text-[#4A5568]">Primer mensaje que ve el usuario al abrir el chat</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#A0AEC0]">Mensaje de fallback</Label>
                    <Input placeholder="Lo siento, no tengo información sobre eso. ¿Puedo ayudarte en algo más?"
                      value={agent.fallback_message ?? ""}
                      onChange={(e) => setAgent({ ...agent, fallback_message: e.target.value })}
                      className="bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] h-9 focus:border-neon-cyan/40" />
                    <p className="text-xs text-[#4A5568]">Se muestra cuando el agente no puede responder</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Slack share */}
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
              <div className="p-5 border-b border-neon-cyan/[0.06]">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <SlackLogo className="h-3.5 w-3.5 text-[#E01E5A]" />
                  Compartir en Slack
                </h3>
                <p className="text-xs text-[#4A5568] mt-0.5">Comparte este link para que tus clientes instalen el bot en su workspace de Slack</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=ffffff&color=000000&data=${encodeURIComponent(`${APP_URL}/install/slack/${id}`)}`}
                    alt="QR instalación Slack" width={180} height={180}
                    className="rounded-xl border border-neon-cyan/[0.08]"
                  />
                </div>
                <div className="flex items-center gap-2 bg-space-el rounded-xl px-3 py-2 border border-neon-cyan/[0.06]">
                  <code className="text-[10px] flex-1 truncate text-[#4A5568]">{APP_URL}/install/slack/{id}</code>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 hover:bg-neon-cyan/10 hover:text-neon-cyan"
                    onClick={() => { navigator.clipboard.writeText(`${APP_URL}/install/slack/${id}`); showToast("Link copiado", true); }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-[#4A5568]">Texto para enviar a clientes:</p>
                  <div className="relative bg-space-el rounded-xl p-3 border border-neon-cyan/[0.06]">
                    <p className="text-xs text-[#A0AEC0] leading-relaxed pr-8 whitespace-pre-wrap">{`Instala nuestro asistente de IA en tu Slack y recibe atención inmediata:\n${APP_URL}/install/slack/${id}`}</p>
                    <Button variant="ghost" size="icon" className="absolute top-1.5 right-1.5 h-6 w-6 hover:bg-neon-cyan/10 hover:text-neon-cyan"
                      onClick={() => { navigator.clipboard.writeText(`Instala nuestro asistente de IA en tu Slack y recibe atención inmediata:\n${APP_URL}/install/slack/${id}`); showToast("Texto copiado", true); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button className="bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan/50 font-semibold"
                onClick={saveAgent} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar configuración
              </Button>
            </div>
          </TabsContent>

          {/* ═══════════════ TAB 3 — CANALES ═══════════════ */}
          <TabsContent value="canales" className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">

              {/* Widget Web */}
              <div className={cn("rounded-xl border bg-space-card", widgetChannel ? "border-neon-cyan/30" : "border-neon-cyan/[0.08]")}>
                <div className="p-4 border-b border-neon-cyan/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center text-sm">🌐</div>
                    <span className="text-sm font-semibold text-white">Widget Web</span>
                  </div>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium",
                    widgetChannel ? "bg-neon-green/10 text-neon-green border-neon-green/20" : "bg-space-el text-[#4A5568] border-neon-cyan/[0.08]")}>
                    {widgetChannel ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-[#4A5568]">Chat en tu sitio web</p>
                  {!widgetChannel ? (
                    <Button size="sm" className="w-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20"
                      onClick={activateWidget} disabled={activating === "widget"}>
                      {activating === "widget" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      Activar widget
                    </Button>
                  ) : (
                    <>
                      {newRawKey && (
                        <div className="bg-neon-yellow/5 border border-neon-yellow/20 rounded-xl p-2 text-xs text-neon-yellow">
                          ⚠️ Copia la API key — no la verás de nuevo.
                        </div>
                      )}
                      <div className="relative">
                        <pre className="bg-space-el rounded-xl p-3 text-[10px] font-mono overflow-x-auto text-[#A0AEC0] leading-relaxed border border-neon-cyan/[0.06]">
{`<script
  src="${WIDGET_SRC}"
  data-agent-id="${id}"
  data-api-key="${displayKey}"
  async
></script>`}
                        </pre>
                        <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 hover:bg-neon-cyan/10 hover:text-neon-cyan"
                          onClick={() => copyText(`<script src="${WIDGET_SRC}" data-agent-id="${id}" data-api-key="${displayKey}" async></script>`, "widget")}>
                          {copied === "widget" ? <Check className="h-3 w-3 text-neon-green" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Slack */}
              <div className={cn("rounded-xl border bg-space-card", slackStatus?.connected ? "border-[#611f69]/40" : "border-neon-cyan/[0.08]")}>
                <div className="p-4 border-b border-neon-cyan/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-[#611f69]/20 border border-[#611f69]/30 flex items-center justify-center">
                      <SlackLogo className="h-3.5 w-3.5 text-[#E01E5A]" />
                    </div>
                    <span className="text-sm font-semibold text-white">Slack</span>
                  </div>
                  {slackStatus?.connected && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-neon-green/10 text-neon-green border-neon-green/20 font-medium">Conectado</span>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-[#4A5568]">Responde en canales y DMs de Slack</p>
                  {!slackStatus ? (
                    <Loader2 className="h-4 w-4 animate-spin text-neon-cyan" />
                  ) : slackStatus.connected ? (
                    <div className="space-y-2">
                      <p className="text-xs text-[#A0AEC0] flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-neon-green shrink-0" />{slackStatus.team_name}
                      </p>
                      <Button variant="ghost" size="sm" className="w-full text-xs text-neon-red hover:bg-neon-red/10 h-7 px-2"
                        onClick={disconnectSlack} disabled={slackDisconnecting}>
                        {slackDisconnecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />}
                        Desconectar
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" className="w-full gap-2 bg-[#611f69]/20 border border-[#611f69]/30 text-white hover:bg-[#611f69]/30"
                      onClick={connectSlack} disabled={slackConnecting}>
                      {slackConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SlackLogo className="h-4 w-4 text-[#E01E5A]" />}
                      Conectar Slack
                    </Button>
                  )}
                  <div className="pt-2 border-t border-neon-cyan/[0.06]">
                    <p className="text-[10px] text-[#4A5568] mb-1.5">Link para instalar en otros workspaces:</p>
                    <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs h-7 border-neon-cyan/[0.08] bg-space-el text-[#A0AEC0] hover:border-neon-cyan/25 hover:text-white"
                      onClick={() => { navigator.clipboard.writeText(`${APP_URL}/install/slack/${id}`); showToast("¡Link copiado! Compártelo con tus clientes", true); }}>
                      <Copy className="h-3 w-3" />Copiar link de instalación
                    </Button>
                  </div>
                </div>
              </div>

              {/* Facebook */}
              <div className={cn("rounded-xl border bg-space-card", fbStatus?.connected ? "border-[#1877F2]/30" : "border-neon-cyan/[0.08]")}>
                <div className="p-4 border-b border-neon-cyan/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-[#1877F2]/10 border border-[#1877F2]/25 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#1877F2]" fill="currentColor">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-white">Facebook</span>
                  </div>
                  {fbStatus?.connected && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-neon-green/10 text-neon-green border-neon-green/20 font-medium">Conectado</span>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-[#4A5568]">Responde mensajes de tu página de Facebook</p>
                  {!fbStatus ? (
                    <Loader2 className="h-4 w-4 animate-spin text-neon-cyan" />
                  ) : fbStatus.connected ? (
                    <div className="space-y-2">
                      <p className="text-xs text-[#A0AEC0] flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-neon-green shrink-0" />{fbStatus.page_name}
                      </p>
                      <Button variant="ghost" size="sm" className="w-full text-xs text-neon-red hover:bg-neon-red/10 h-7 px-2"
                        onClick={disconnectFacebook} disabled={fbDisconnecting}>
                        {fbDisconnecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />}
                        Desconectar
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" className="w-full gap-2 bg-[#1877F2]/15 border border-[#1877F2]/30 text-[#1877F2] hover:bg-[#1877F2]/25"
                      onClick={connectFacebook} disabled={fbConnecting}>
                      {fbConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                      )}
                      Conectar Facebook
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2 — Instagram · WhatsApp */}
            <div className="grid md:grid-cols-2 gap-4">

              {/* Instagram */}
              <div className={cn("rounded-xl border bg-space-card", igStatus?.connected ? "border-[#dc2743]/25" : "border-neon-cyan/[0.08]")}>
                <div className="p-4 border-b border-neon-cyan/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#f09433]/20 to-[#bc1888]/20 border border-[#dc2743]/25 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="url(#igGrad)">
                        <defs>
                          <linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#f09433"/>
                            <stop offset="25%" stopColor="#e6683c"/>
                            <stop offset="50%" stopColor="#dc2743"/>
                            <stop offset="75%" stopColor="#cc2366"/>
                            <stop offset="100%" stopColor="#bc1888"/>
                          </linearGradient>
                        </defs>
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-white">Instagram DM</span>
                  </div>
                  {igStatus?.connected && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-neon-green/10 text-neon-green border-neon-green/20 font-medium">Conectado</span>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-[#4A5568]">Responde mensajes directos de Instagram</p>
                  {!igStatus ? (
                    <Loader2 className="h-4 w-4 animate-spin text-neon-cyan" />
                  ) : igStatus.connected ? (
                    <div className="space-y-2">
                      <p className="text-xs text-[#A0AEC0] flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-neon-green shrink-0" />
                        {igStatus.ig_username ? `@${igStatus.ig_username}` : igStatus.page_name}
                      </p>
                      <Button variant="ghost" size="sm" className="w-full text-xs text-neon-red hover:bg-neon-red/10 h-7 px-2"
                        onClick={disconnectInstagram} disabled={igDisconnecting}>
                        {igDisconnecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />}
                        Desconectar Instagram
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="p-3 bg-neon-yellow/5 border border-neon-yellow/15 rounded-xl text-xs">
                        <p className="font-semibold text-neon-yellow mb-1">Requisitos previos:</p>
                        <ol className="list-decimal list-inside space-y-1 text-[#A0AEC0]">
                          <li>Debes tener una <strong className="text-white">Página de Facebook</strong> (no perfil personal)</li>
                          <li>Tu cuenta de Instagram debe ser <strong className="text-white">Business o Creator</strong></li>
                          <li>La cuenta de Instagram debe estar <strong className="text-white">vinculada a tu Página de Facebook</strong></li>
                        </ol>
                        <a href="https://www.facebook.com/help/1148909221857370" target="_blank" rel="noopener noreferrer"
                          className="text-neon-cyan hover:underline mt-2 inline-block">
                          Cómo vincular Instagram a tu Página de Facebook →
                        </a>
                      </div>
                      <Button size="sm"
                        className="w-full gap-2 bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] text-white hover:opacity-90"
                        onClick={connectInstagram} disabled={igConnecting}>
                        {igConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                          </svg>
                        )}
                        Conectar Instagram
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* WhatsApp */}
              <div className={cn("rounded-xl border bg-space-card", waStatus?.connected ? "border-[#25D366]/25" : "border-neon-cyan/[0.08]")}>
                <div className="p-4 border-b border-neon-cyan/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-[#25D366]/10 border border-[#25D366]/25 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#25D366]" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-white">WhatsApp Business</span>
                  </div>
                  {waStatus?.connected && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-neon-green/10 text-neon-green border-neon-green/20 font-medium">Conectado</span>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-[#4A5568]">Automatiza tu atención por WhatsApp</p>
                  {!waStatus ? (
                    <Loader2 className="h-4 w-4 animate-spin text-neon-cyan" />
                  ) : waStatus.connected ? (
                    <div className="space-y-2">
                      <p className="text-xs text-[#A0AEC0] flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-neon-green shrink-0" />{waStatus.display_phone}
                      </p>
                      <Button variant="ghost" size="sm" className="w-full text-xs text-neon-red hover:bg-neon-red/10 h-7 px-2"
                        onClick={disconnectWhatsApp} disabled={waDisconnecting}>
                        {waDisconnecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />}
                        Desconectar
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" className="w-full gap-2 bg-[#25D366]/15 border border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/25"
                      onClick={connectWhatsApp} disabled={waConnecting}>
                      {waConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      )}
                      Conectar WhatsApp
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* FB page picker */}
            {fbPages.length > 1 && (
              <div className="rounded-xl border border-[#1877F2]/25 bg-[#1877F2]/5">
                <div className="p-4 border-b border-[#1877F2]/15 flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#1877F2]" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-white">Tienes {fbPages.length} páginas — selecciona cuál usar</p>
                    <p className="text-xs text-[#4A5568]">Actualmente usando: <strong className="text-[#A0AEC0]">{fbStatus?.page_name}</strong></p>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {fbPages.map((page) => (
                    <Button key={page.id}
                      size="sm"
                      className={cn("w-full justify-start gap-2 text-xs",
                        fbStatus?.page_name === page.name
                          ? "bg-[#1877F2]/20 border border-[#1877F2]/30 text-white"
                          : "border border-neon-cyan/[0.08] bg-space-el text-[#A0AEC0] hover:border-neon-cyan/20 hover:text-white"
                      )}
                      onClick={() => switchFbPage(page.id)}
                      disabled={fbPageSwitching || fbStatus?.page_name === page.name}>
                      {fbPageSwitching ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {page.name}
                      {fbStatus?.page_name === page.name && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-neon-green/10 text-neon-green border border-neon-green/20">Activa</span>
                      )}
                    </Button>
                  ))}
                  <Button variant="ghost" size="sm" className="w-full text-xs text-[#4A5568] h-7" onClick={() => setFbPages([])}>
                    Cerrar
                  </Button>
                </div>
              </div>
            )}

            {/* API REST */}
            <div className={cn("rounded-xl border bg-space-card", agentKey ? "border-neon-yellow/20" : "border-neon-cyan/[0.08]")}>
              <div className="p-4 border-b border-neon-cyan/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", agentKey ? "bg-neon-yellow/10 border border-neon-yellow/20" : "bg-space-el border border-neon-cyan/[0.08]")}>
                    <Key className={cn("h-3.5 w-3.5", agentKey ? "text-neon-yellow" : "text-[#4A5568]")} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">⚡ API REST</p>
                    <p className="text-xs text-[#4A5568]">Integra el agente en tus aplicaciones mediante API</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium",
                    agentKey ? "bg-neon-green/10 text-neon-green border-neon-green/20" : "bg-space-el text-[#4A5568] border-neon-cyan/[0.08]")}>
                    {agentKey ? "Activo" : "Sin API key"}
                  </span>
                  {!agentKey && (
                    <Button size="sm" className="h-7 text-xs bg-neon-yellow/10 border border-neon-yellow/30 text-neon-yellow hover:bg-neon-yellow/20"
                      onClick={generateApiKey} disabled={activating === "api"}>
                      {activating === "api" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
                      Generar API Key
                    </Button>
                  )}
                </div>
              </div>
              {agentKey && (
                <div className="p-4 space-y-3">
                  {newRawKey && (
                    <div className="bg-neon-yellow/5 border border-neon-yellow/15 rounded-xl p-3 text-xs text-neon-yellow">
                      ⚠️ Copia esta API key ahora — no podrás verla de nuevo.
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-[#4A5568]">Endpoint</p>
                      <div className="flex items-center gap-2 bg-space-el rounded-xl px-3 py-2 border border-neon-cyan/[0.06]">
                        <code className="text-xs flex-1 truncate text-[#A0AEC0]">POST {BACKEND}/api/messages/chat</code>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 hover:bg-neon-cyan/10 hover:text-neon-cyan"
                          onClick={() => copyText(`${BACKEND}/api/messages/chat`, "endpoint")}>
                          {copied === "endpoint" ? <Check className="h-3 w-3 text-neon-green" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-[#4A5568]">API Key</p>
                      <div className="flex items-center gap-2 bg-space-el rounded-xl px-3 py-2 border border-neon-cyan/[0.06]">
                        <code className="text-xs flex-1 truncate font-mono text-[#A0AEC0]">{displayKey}</code>
                        {newRawKey && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 hover:bg-neon-cyan/10 hover:text-neon-cyan"
                            onClick={() => copyText(newRawKey, "apikey")}>
                            {copied === "apikey" ? <Check className="h-3 w-3 text-neon-green" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="bg-space-el rounded-xl p-3 border border-neon-cyan/[0.06]">
                    <p className="text-xs font-medium text-[#4A5568] mb-2">Ejemplo cURL:</p>
                    <pre className="text-[11px] font-mono text-[#A0AEC0] overflow-x-auto leading-relaxed">
{`curl -X POST ${BACKEND}/api/messages/chat \\
  -H "x-api-key: ${displayKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"message":"Hola, ¿me puedes ayudar?"}'`}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ═══════════════ TAB 4 — ESTADÍSTICAS ═══════════════ */}
          <TabsContent value="stats" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {([
                { label: "Conversaciones", value: stats.conversations, Icon: MessageSquare, color: "text-neon-cyan", bg: "bg-neon-cyan/10 border-neon-cyan/20" },
                { label: "Mensajes", value: stats.messages, Icon: Bot, color: "text-neon-purple", bg: "bg-neon-purple/10 border-neon-purple/20" },
                { label: "Tokens usados", value: stats.tokens > 999 ? `${(stats.tokens / 1000).toFixed(1)}k` : stats.tokens, Icon: TrendingUp, color: "text-neon-yellow", bg: "bg-neon-yellow/10 border-neon-yellow/20" },
                { label: "Leads captados", value: stats.leads, Icon: Users, color: "text-neon-green", bg: "bg-neon-green/10 border-neon-green/20" },
              ] as const).map(({ label, value, Icon, color, bg }) => (
                <div key={label} className="rounded-xl border border-neon-cyan/[0.08] bg-space-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-[#4A5568]">{label}</p>
                    <div className={cn("p-2 rounded-xl border", bg)}>
                      <Icon className={cn("h-4 w-4", color)} />
                    </div>
                  </div>
                  <p className={cn("font-display text-3xl font-bold", color)}>{value}</p>
                </div>
              ))}
            </div>

            {stats.conversations === 0 && (
              <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card py-16 text-center">
                <Bot className="h-12 w-12 text-[#4A5568]/30 mx-auto mb-4" />
                <p className="text-[#A0AEC0] text-sm font-medium">Este agente no ha tenido conversaciones aún</p>
                <p className="text-[#4A5568] text-xs mt-1">Activa un canal en la pestaña Canales para empezar a recibir mensajes.</p>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════ TAB 5 — LEADS & RETARGETING ═══════════════ */}
          <TabsContent value="leads" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">

              {/* Config */}
              <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
                <div className="p-5 border-b border-neon-cyan/[0.06]">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Clock className="h-4 w-4 text-neon-cyan" />Seguimiento automático
                  </h3>
                  <p className="text-xs text-[#4A5568] mt-0.5">Detecta conversaciones abandonadas y envía recordatorios</p>
                </div>
                <div className="p-5 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#A0AEC0]">Sin respuesta después de (horas)</Label>
                    <select
                      className="w-full h-9 rounded-xl border border-neon-cyan/15 bg-space-el px-3 text-sm text-white outline-none focus:border-neon-cyan/40"
                      value={followupConfig.hours}
                      onChange={(e) => setFollowupConfig({ ...followupConfig, hours: e.target.value })}>
                      <option value="1">1 hora</option>
                      <option value="6">6 horas</option>
                      <option value="24">24 horas</option>
                      <option value="48">48 horas</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#A0AEC0]">Mensaje de seguimiento</Label>
                    <Textarea className="min-h-[72px] text-xs bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] focus:border-neon-cyan/40"
                      placeholder="Hola {nombre}, vi que tuviste una consulta pendiente..."
                      value={followupConfig.message}
                      onChange={(e) => setFollowupConfig({ ...followupConfig, message: e.target.value })} />
                    <p className="text-[10px] text-[#4A5568]">Variables: {"{nombre}"}, {"{producto}"}</p>
                  </div>
                  <Button size="sm" className="w-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20"
                    onClick={scanLeads} disabled={scanning}>
                    {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />}
                    Escanear conversaciones abandonadas
                  </Button>
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
                <div className="p-5 border-b border-neon-cyan/[0.06]">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-neon-yellow" />Resumen de leads
                  </h3>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { label: "Nuevos", status: "new", color: "text-neon-cyan" },
                      { label: "Contactados", status: "contacted", color: "text-neon-yellow" },
                      { label: "Calificados", status: "qualified", color: "text-neon-green" },
                      { label: "Perdidos", status: "lost", color: "text-neon-red" },
                    ] as const).map(({ label, status, color }) => (
                      <div key={status} className="bg-space-el border border-neon-cyan/[0.06] rounded-xl p-3 text-center">
                        <p className={cn("font-display text-2xl font-bold", color)}>
                          {leads.filter((l) => l.status === status).length}
                        </p>
                        <p className="text-[10px] text-[#4A5568] uppercase tracking-wide">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Leads table */}
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
              <div className="p-5 border-b border-neon-cyan/[0.06] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Prospectos ({leads.length})</h3>
                <Button size="sm" variant="outline"
                  className="border-neon-cyan/[0.08] bg-space-el text-[#A0AEC0] hover:border-neon-cyan/25 hover:text-white h-7 text-xs"
                  onClick={loadLeads} disabled={leadsLoading}>
                  {leadsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Actualizar
                </Button>
              </div>
              <div className="p-5">
                {leadsLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-neon-cyan" /></div>
                ) : leads.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <Target className="h-10 w-10 text-[#4A5568]/30 mx-auto" />
                    <p className="text-sm text-[#A0AEC0]">Sin leads todavía</p>
                    <p className="text-xs text-[#4A5568]">Haz clic en &quot;Escanear&quot; para detectar conversaciones abandonadas</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leads.map((lead) => (
                      <div key={lead.id} className="flex items-center justify-between rounded-xl p-3 bg-space-el border border-neon-cyan/[0.06]">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center shrink-0">
                            <Users className="h-3.5 w-3.5 text-neon-cyan" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{lead.name || "Anónimo"}</p>
                            <div className="flex items-center gap-2 text-xs text-[#4A5568]">
                              {lead.email && <span className="flex items-center gap-0.5"><Mail className="h-2.5 w-2.5" />{lead.email}</span>}
                              {lead.phone && <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{lead.phone}</span>}
                              {!lead.email && !lead.phone && <span>Sin contacto</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            className="h-7 text-xs border border-neon-cyan/15 rounded-lg bg-space-card text-[#A0AEC0] px-2 outline-none"
                            value={lead.status}
                            onChange={(e) => updateLeadStatus(lead.id, e.target.value)}>
                            <option value="new">Nuevo</option>
                            <option value="contacted">Contactado</option>
                            <option value="qualified">Calificado</option>
                            <option value="lost">Perdido</option>
                          </select>
                          <Button size="sm" variant="outline"
                            className="h-7 text-xs gap-1 border-neon-cyan/[0.08] bg-space-el text-[#A0AEC0] hover:border-neon-cyan/25"
                            onClick={() => sendFollowup(lead.id)} disabled={sendingFollowup === lead.id}>
                            {sendingFollowup === lead.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Send className="h-2.5 w-2.5" />}
                            Recordatorio
                          </Button>
                          <Button size="sm"
                            className="h-7 text-xs gap-1 bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20"
                            onClick={() => { setOfferLead(lead); setOfferMessage(""); }}>
                            <Zap className="h-2.5 w-2.5" />Oferta
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Offer modal */}
            {offerLead && (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="w-full max-w-md rounded-2xl border border-neon-cyan/15 bg-space-card p-6 space-y-4 animate-scale-in"
                  style={{ boxShadow: "0 0 60px rgba(0,245,255,0.08), 0 24px 48px rgba(0,0,0,0.6)" }}>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Enviar oferta a {offerLead.name || "Anónimo"}</h3>
                    <p className="text-xs text-[#4A5568] mt-0.5">Escribe un mensaje personalizado con tu oferta</p>
                  </div>
                  <Textarea className="min-h-[100px] text-sm bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] focus:border-neon-cyan/40"
                    placeholder="Hola, quería ofrecerte un 20% de descuento en..."
                    value={offerMessage}
                    onChange={(e) => setOfferMessage(e.target.value)} />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm"
                      className="border-neon-cyan/[0.08] bg-space-el text-[#A0AEC0] hover:border-neon-cyan/20"
                      onClick={() => setOfferLead(null)}>Cancelar</Button>
                    <Button size="sm"
                      className="bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 font-semibold"
                      onClick={sendOffer} disabled={!offerMessage.trim() || !!sendingFollowup}>
                      {sendingFollowup ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Enviar oferta
                    </Button>
                  </div>
                </div>
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
        <Loader2 className="h-6 w-6 animate-spin text-neon-cyan" />
      </div>
    }>
      <AgentDetailInner />
    </Suspense>
  );
}
