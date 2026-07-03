"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Bot, ArrowLeft, Settings, MessageSquare, Wifi, Copy, Check, AlertCircle } from "lucide-react";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Client { id: string; name: string; company: string | null }

interface XenttechAgent {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  model: string | null;
  temperature: number | null;
  status: string | null;
  created_at: string;
}

interface XenttechChannel {
  id: string;
  agent_id: string;
  client_id: string | null;
  channel_type: string;
  channel_name: string | null;
  page_id: string | null;
  page_name: string | null;
  page_access_token: string | null;
  instagram_account_id: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_verify_token: string | null;
  slack_bot_token: string | null;
  slack_team_id: string | null;
  webhook_secret: string | null;
  is_connected: boolean;
  connected_at: string | null;
}

interface XenttechConversation {
  id: string;
  agent_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  channel_type: string | null;
  messages: Array<{ role: string; content: string; timestamp?: string }> | null;
  lead_captured: boolean | null;
  status: string | null;
  updated_at: string | null;
}

interface AgentForm {
  client_id: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  temperature: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MODELS = [
  { value: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5 (rápido, económico)' },
  { value: 'claude-sonnet-4-20250514',   label: 'Claude Sonnet 4 (potente)' },
];

const CH_LABEL: Record<string, string> = {
  facebook:  'Facebook Messenger',
  slack:     'Slack',
  instagram: 'Instagram',
  whatsapp:  'WhatsApp Business',
  web:       'Widget Web',
};

const CH_EMOJI: Record<string, string> = {
  facebook:  '📘',
  slack:     '💬',
  instagram: '📷',
  whatsapp:  '💚',
  web:       '🌐',
};

const supabase = createClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls  = "w-full rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm px-3 py-2 focus:outline-none focus:border-[#00FF88]/40 placeholder-[#4A5568]";
const areaCls   = inputCls + " resize-none leading-relaxed";

// ── Main component ────────────────────────────────────────────────────────────

function AgentsContent() {
  const searchParams = useSearchParams();

  // View state
  const [view, setView]             = useState<'list' | 'channels' | 'conversations'>('list');
  const [selectedAgent, setSelected] = useState<XenttechAgent | null>(null);

  // Data
  const [agents,       setAgents]       = useState<XenttechAgent[]>([]);
  const [channels,     setChannels]     = useState<Record<string, XenttechChannel[]>>({});
  const [convCounts,   setConvCounts]   = useState<Record<string, number>>({});
  const [conversations, setConvs]       = useState<XenttechConversation[]>([]);
  const [expandedConv,  setExpandedConv] = useState<string | null>(null);
  const [clients,      setClients]      = useState<Client[]>([]);
  const [filterClient, setFilterClient] = useState('all');
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [successMsg,   setSuccessMsg]   = useState<string | null>(null);

  // Agent modal
  const [showModal,     setShowModal]    = useState(false);
  const [editingAgent,  setEditingAgent] = useState<XenttechAgent | null>(null);
  const [form, setForm] = useState<AgentForm>({
    client_id: '', name: '', description: '', system_prompt: '',
    model: 'claude-haiku-4-5-20251001', temperature: 0.7,
  });

  // Instagram setup
  const [showIG,        setShowIG]        = useState(false);
  const [igAccountId,   setIgAccountId]   = useState('');
  const [igPageId,      setIgPageId]      = useState('');
  const [igPageToken,   setIgPageToken]   = useState('');
  const [igVerifyToken, setIgVerifyToken] = useState('xenttech_ig_verify_2026');

  // WhatsApp setup
  const [showWA,        setShowWA]        = useState(false);
  const [waPhoneId,     setWaPhoneId]     = useState('');
  const [waWabaId,      setWaWabaId]      = useState('');
  const [waToken,       setWaToken]       = useState('');
  const [waVerifyToken, setWaVerifyToken] = useState('xenttech_wa_verify_2026');

  // Widget copy
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadAgents = useCallback(async () => {
    setError(null);
    const cacheKey = `xenttech_agents_${filterClient}`;

    // Show cached data immediately (no spinner on tab-switch)
    let fromCache = false;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const { d, ts } = JSON.parse(raw) as { d: { agents: XenttechAgent[]; channels: Record<string, XenttechChannel[]>; convCounts: Record<string, number> }; ts: number };
        if (Date.now() - ts < 5 * 60_000) {
          setAgents(d.agents); setChannels(d.channels); setConvCounts(d.convCounts);
          setLoading(false);
          fromCache = true;
        }
      }
    } catch {}

    if (!fromCache) setLoading(true);

    try {
      let q = supabase.from('xenttech_agents').select('*').order('created_at', { ascending: false });
      if (filterClient && filterClient !== 'all') q = q.eq('client_id', filterClient);
      const { data, error: err } = await q;
      if (err) throw err;
      const list = data ?? [];
      setAgents(list);

      let grouped: Record<string, XenttechChannel[]> = {};
      let counts: Record<string, number> = {};

      if (list.length) {
        const ids = list.map(a => a.id);

        const { data: chData } = await supabase.from('xenttech_channels').select('*').in('agent_id', ids);
        for (const ch of chData ?? []) {
          if (!grouped[ch.agent_id]) grouped[ch.agent_id] = [];
          grouped[ch.agent_id].push(ch);
        }
        setChannels(grouped);

        const { data: cvData } = await supabase
          .from('xenttech_conversations').select('agent_id').in('agent_id', ids);
        for (const c of cvData ?? []) counts[c.agent_id] = (counts[c.agent_id] || 0) + 1;
        setConvCounts(counts);
      }

      try { sessionStorage.setItem(cacheKey, JSON.stringify({ d: { agents: list, channels: grouped, convCounts: counts }, ts: Date.now() })); } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterClient]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('xenttech_clients_list');
      if (raw) { const { d, ts } = JSON.parse(raw); if (Date.now() - ts < 10 * 60_000) { setClients(d); return; } }
    } catch {}
    supabase.from('clients').select('id,name,company').order('name')
      .then(({ data }) => {
        setClients(data ?? []);
        try { sessionStorage.setItem('xenttech_clients_list', JSON.stringify({ d: data ?? [], ts: Date.now() })); } catch {}
      });
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  useEffect(() => {
    const connected = searchParams.get('connected');
    if (connected) {
      setSuccessMsg(`${CH_LABEL[connected] ?? connected} conectado correctamente`);
      setTimeout(() => setSuccessMsg(null), 5000);
    }
  }, [searchParams]);

  // ── Channel helpers ───────────────────────────────────────────────────────

  async function reloadAgentChannels(agentId: string) {
    const { data } = await supabase.from('xenttech_channels').select('*').eq('agent_id', agentId);
    setChannels(prev => ({ ...prev, [agentId]: data ?? [] }));
  }

  function openChannels(agent: XenttechAgent) {
    setSelected(agent);
    reloadAgentChannels(agent.id);
    setShowIG(false);
    setShowWA(false);
    setView('channels');
  }

  function openConversations(agent: XenttechAgent) {
    setSelected(agent);
    setExpandedConv(null);
    setView('conversations');
    setLoading(true);
    supabase.from('xenttech_conversations')
      .select('*').eq('agent_id', agent.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => { setConvs(data ?? []); setLoading(false); });
  }

  function connectFacebook(agentId: string) {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    if (!appId) { setError('NEXT_PUBLIC_META_APP_ID no configurado en Vercel'); return; }
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/xenttech-oauth/callback`);
    const state = encodeURIComponent(JSON.stringify({ agent_id: agentId, channel: 'facebook' }));
    window.location.href = `https://www.facebook.com/v22.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=pages_messaging,pages_show_list,pages_read_engagement&state=${state}&response_type=code`;
  }

  function connectSlack(agentId: string) {
    const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID;
    if (!clientId) { setError('NEXT_PUBLIC_SLACK_CLIENT_ID no configurado en Vercel'); return; }
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/xenttech-oauth/callback`);
    const state = encodeURIComponent(JSON.stringify({ agent_id: agentId, channel: 'slack' }));
    window.location.href = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=chat:write,channels:read,groups:read,im:read,im:write,mpim:read&state=${state}`;
  }

  async function disconnectChannel(channelId: string, agentId: string) {
    await supabase.from('xenttech_channels').update({ is_connected: false }).eq('id', channelId);
    await reloadAgentChannels(agentId);
  }

  async function saveIGChannel() {
    if (!selectedAgent) return;
    setSaving(true);
    const { error: err } = await supabase.from('xenttech_channels').upsert({
      agent_id: selectedAgent.id, client_id: selectedAgent.client_id,
      channel_type: 'instagram', channel_name: 'Instagram',
      instagram_account_id: igAccountId, page_id: igPageId,
      page_access_token: igPageToken, webhook_secret: igVerifyToken,
      is_connected: true, connected_at: new Date().toISOString(),
    }, { onConflict: 'agent_id,channel_type' });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowIG(false);
    await reloadAgentChannels(selectedAgent.id);
  }

  async function saveWAChannel() {
    if (!selectedAgent) return;
    setSaving(true);
    const { error: err } = await supabase.from('xenttech_channels').upsert({
      agent_id: selectedAgent.id, client_id: selectedAgent.client_id,
      channel_type: 'whatsapp', channel_name: 'WhatsApp Business',
      whatsapp_phone_number_id: waPhoneId, whatsapp_business_account_id: waWabaId,
      page_access_token: waToken, whatsapp_verify_token: waVerifyToken,
      is_connected: true, connected_at: new Date().toISOString(),
    }, { onConflict: 'agent_id,channel_type' });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowWA(false);
    await reloadAgentChannels(selectedAgent.id);
  }

  // ── Agent CRUD ────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingAgent(null);
    setForm({ client_id: '', name: '', description: '', system_prompt: '', model: 'claude-haiku-4-5-20251001', temperature: 0.7 });
    setError(null);
    setShowModal(true);
  }

  function openEdit(agent: XenttechAgent) {
    setEditingAgent(agent);
    setForm({
      client_id:     agent.client_id,
      name:          agent.name,
      description:   agent.description ?? '',
      system_prompt: agent.system_prompt ?? '',
      model:         agent.model ?? 'claude-haiku-4-5-20251001',
      temperature:   agent.temperature ?? 0.7,
    });
    setError(null);
    setShowModal(true);
  }

  async function saveAgent() {
    if (!form.client_id || !form.name.trim()) { setError('Cliente y nombre son obligatorios'); return; }
    setSaving(true);
    setError(null);
    try {
      if (editingAgent) {
        const { error: err } = await supabase.from('xenttech_agents')
          .update({ ...form, updated_at: new Date().toISOString() }).eq('id', editingAgent.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('xenttech_agents')
          .insert({ ...form, status: 'active' });
        if (err) throw err;
      }
      setShowModal(false);
      await loadAgents();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAgent(id: string) {
    if (!confirm('¿Eliminar este agente y todos sus canales?')) return;
    await supabase.from('xenttech_channels').delete().eq('agent_id', id);
    await supabase.from('xenttech_agents').delete().eq('id', id);
    setShowModal(false);
    await loadAgents();
  }

  async function copyWidget(agentId: string) {
    const code = `<script src="https://app.conectaachat.com/widget.js" data-agent="${agentId}"></script>`;
    await navigator.clipboard.writeText(code);
    setCopiedId(agentId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const clientMap       = Object.fromEntries(clients.map(c => [c.id, c]));
  const agentChannels   = selectedAgent ? (channels[selectedAgent.id] ?? []) : [];
  const getChannel      = (type: string) => agentChannels.find(c => c.channel_type === type);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <Header
        title={
          view === 'list' ? 'Agentes XENTTECH'
          : view === 'channels' ? `Canales — ${selectedAgent?.name}`
          : `Conversaciones — ${selectedAgent?.name}`
        }
        description={view === 'list' ? 'Chatbots por cliente, conectados a cualquier canal' : undefined}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Banners */}
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-300 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 text-xs">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="rounded-xl border border-[#00FF88]/20 bg-[#00FF88]/[0.05] px-4 py-3 text-sm text-[#00FF88]">
            ✓ {successMsg}
          </div>
        )}

        {/* ════════════════ LIST VIEW ════════════════ */}
        {view === 'list' && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={filterClient} onValueChange={setFilterClient}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white w-56">
                  <SelectValue placeholder="Todos los clientes" />
                </SelectTrigger>
                <SelectContent className="bg-space-card border-white/[0.08]">
                  <SelectItem value="all" className="text-white hover:bg-white/[0.06]">Todos los clientes</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-white hover:bg-white/[0.06]">
                      {c.name}{c.company ? ` — ${c.company}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={openCreate} className="ml-auto bg-[#00FF88] text-black hover:bg-[#00FF88]/90 font-semibold gap-2">
                <Plus className="h-4 w-4" /> Nuevo agente
              </Button>
            </div>

            {loading ? (
              <PageSkeleton rows={4} cols={2} cardHeight={160} />
            ) : agents.length === 0 ? (
              <div className="text-center py-20">
                <Bot className="h-12 w-12 text-[#4A5568] mx-auto mb-3" />
                <p className="text-[#4A5568] mb-4">No hay agentes todavía</p>
                <Button onClick={openCreate} className="bg-[#00FF88] text-black font-semibold gap-2">
                  <Plus className="h-4 w-4" /> Crear primer agente
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {agents.map(agent => {
                  const chs      = channels[agent.id] ?? [];
                  const client   = clientMap[agent.client_id];
                  const convCnt  = convCounts[agent.id] ?? 0;
                  return (
                    <div key={agent.id} className="rounded-xl bg-space-card border border-white/[0.06] p-5 space-y-4">
                      {/* Header row */}
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#00FF88]/10 border border-[#00FF88]/20 flex items-center justify-center shrink-0">
                          <Bot className="h-5 w-5 text-[#00FF88]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white truncate">{agent.name}</p>
                          <p className="text-xs text-[#4A5568]">
                            {client ? client.name : 'Sin cliente'} · {agent.model?.includes('haiku') ? 'Haiku' : 'Sonnet'}
                          </p>
                        </div>
                        <span className={cn(
                          "shrink-0 px-3 py-1 rounded-full text-xs font-semibold",
                          agent.status === 'active'
                            ? "bg-[#00E67A]/[0.12] text-[#00E67A]"
                            : "bg-yellow-500/[0.12] text-yellow-400"
                        )}>
                          {agent.status ?? 'draft'}
                        </span>
                      </div>

                      {agent.description && (
                        <p className="text-xs text-[#A0AEC0] leading-relaxed line-clamp-2">{agent.description}</p>
                      )}

                      {/* Channel chips */}
                      {chs.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {chs.map(ch => (
                            <span key={ch.id} className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-semibold border",
                              ch.is_connected
                                ? "bg-[#00E67A]/[0.08] text-[#00E67A] border-[#00E67A]/[0.15]"
                                : "bg-white/[0.04] text-[#4A5568] border-white/[0.06]"
                            )}>
                              {CH_EMOJI[ch.channel_type] ?? '📡'} {ch.channel_type} {ch.is_connected ? '✓' : '○'}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap items-center">
                        <Button size="sm" onClick={() => openEdit(agent)}
                          className="bg-white/[0.06] hover:bg-white/10 text-white text-xs h-7 gap-1.5">
                          <Settings className="h-3 w-3" /> Configurar
                        </Button>
                        <Button size="sm" onClick={() => openChannels(agent)}
                          className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/20 text-xs h-7 gap-1.5">
                          <Wifi className="h-3 w-3" /> Canales
                        </Button>
                        <Button size="sm" onClick={() => openConversations(agent)}
                          className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/20 text-xs h-7 gap-1.5">
                          <MessageSquare className="h-3 w-3" /> Chats ({convCnt})
                        </Button>
                        <button onClick={() => copyWidget(agent.id)}
                          className="ml-auto flex items-center gap-1.5 text-xs px-2.5 h-7 rounded-lg border border-white/[0.06] text-[#4A5568] hover:text-white hover:border-white/[0.15] transition-colors">
                          {copiedId === agent.id
                            ? <Check className="h-3 w-3 text-[#00FF88]" />
                            : <Copy className="h-3 w-3" />}
                          Widget
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ════════════════ CHANNELS VIEW ════════════════ */}
        {view === 'channels' && selectedAgent && (
          <>
            <button onClick={() => { setView('list'); setShowIG(false); setShowWA(false); }}
              className="flex items-center gap-2 text-sm text-[#4A5568] hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" /> Volver a agentes
            </button>

            <div className="space-y-4">

              {/* ── Facebook Messenger ── */}
              {(() => {
                const ch = getChannel('facebook');
                return (
                  <div className="rounded-xl bg-space-card border border-white/[0.06] p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{ background: '#1877F2' }}>📘</div>
                      <div className="flex-1">
                        <p className="font-semibold text-white">Facebook Messenger</p>
                        <p className="text-xs text-[#4A5568]">Conecta automáticamente via OAuth</p>
                      </div>
                      {ch?.is_connected && (
                        <span className="text-xs text-[#00E67A] font-semibold">● {ch.page_name ?? 'Conectado'}</span>
                      )}
                    </div>
                    {ch?.is_connected ? (
                      <Button size="sm" onClick={() => disconnectChannel(ch.id, selectedAgent.id)}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs h-7">
                        Desconectar
                      </Button>
                    ) : (
                      <Button onClick={() => connectFacebook(selectedAgent.id)}
                        className="font-semibold" style={{ background: '#1877F2', color: 'white' }}>
                        Conectar con Facebook
                      </Button>
                    )}
                  </div>
                );
              })()}

              {/* ── Slack ── */}
              {(() => {
                const ch = getChannel('slack');
                return (
                  <div className="rounded-xl bg-space-card border border-white/[0.06] p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{ background: '#4A154B' }}>💬</div>
                      <div className="flex-1">
                        <p className="font-semibold text-white">Slack</p>
                        <p className="text-xs text-[#4A5568]">Conecta automáticamente via OAuth</p>
                      </div>
                      {ch?.is_connected && (
                        <span className="text-xs text-[#00E67A] font-semibold">● {ch.channel_name ?? 'Conectado'}</span>
                      )}
                    </div>
                    {ch?.is_connected ? (
                      <Button size="sm" onClick={() => disconnectChannel(ch.id, selectedAgent.id)}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs h-7">
                        Desconectar
                      </Button>
                    ) : (
                      <Button onClick={() => connectSlack(selectedAgent.id)}
                        className="font-semibold" style={{ background: '#4A154B', color: 'white' }}>
                        Conectar con Slack
                      </Button>
                    )}
                  </div>
                );
              })()}

              {/* ── Instagram ── */}
              {(() => {
                const ch = getChannel('instagram');
                return (
                  <div className="rounded-xl bg-space-card border border-white/[0.06] p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
                        style={{ background: 'linear-gradient(135deg,#833AB4,#FD1D1D,#F77737)' }}>📷</div>
                      <div className="flex-1">
                        <p className="font-semibold text-white">Instagram</p>
                        <p className="text-xs text-[#4A5568]">Configuración manual desde Meta Developers</p>
                      </div>
                      {ch?.is_connected && (
                        <span className="text-xs text-[#00E67A] font-semibold">● {ch.instagram_account_id}</span>
                      )}
                    </div>

                    {ch?.is_connected ? (
                      <Button size="sm" onClick={() => disconnectChannel(ch.id, selectedAgent.id)}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs h-7">
                        Desconectar
                      </Button>
                    ) : (
                      <>
                        <p className="text-xs text-[#A0AEC0]">
                          Requiere Meta App con permisos instagram_manage_messages + cuenta Instagram Business vinculada a una Facebook Page.
                        </p>
                        <Button size="sm" onClick={() => { setShowIG(true); setShowWA(false); }}
                          className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/20 text-xs h-8">
                          Configurar manualmente
                        </Button>
                      </>
                    )}

                    {showIG && !ch?.is_connected && (
                      <div className="space-y-3 pt-3 border-t border-white/[0.06]">
                        <p className="text-sm font-semibold text-white">Configurar Instagram</p>
                        <ol className="text-xs text-[#A0AEC0] space-y-1 list-decimal list-inside">
                          <li>Permisos necesarios: instagram_manage_messages, pages_messaging</li>
                          <li>Cuenta Instagram Business vinculada a una Facebook Page</li>
                          <li>Genera un Page Access Token con esos permisos</li>
                          <li>Configura el webhook: instagram → messages, messaging_postbacks</li>
                        </ol>
                        <div className="grid gap-3">
                          {[
                            { label: 'Instagram Account ID', value: igAccountId, set: setIgAccountId, ph: '1784147452844877' },
                            { label: 'Facebook Page ID', value: igPageId, set: setIgPageId, ph: '774799492384500' },
                            { label: 'Page Access Token', value: igPageToken, set: setIgPageToken, ph: 'EAAWfiI8...', pw: true },
                            { label: 'Webhook Verify Token', value: igVerifyToken, set: setIgVerifyToken, ph: '' },
                          ].map(f => (
                            <div key={f.label}>
                              <label className="text-xs text-[#4A5568] mb-1 block">{f.label}</label>
                              <input value={f.value} onChange={e => f.set(e.target.value)}
                                className={inputCls} placeholder={f.ph} type={f.pw ? 'password' : 'text'} />
                            </div>
                          ))}
                        </div>
                        <div className="rounded-lg bg-blue-500/[0.06] border border-blue-500/20 p-3">
                          <p className="text-xs text-blue-400 mb-1">Webhook URL para configurar en Meta:</p>
                          <code className="text-xs text-[#A0AEC0] break-all">
                            https://app.conectaachat.com/api/xenttech-webhook/instagram
                          </code>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={saveIGChannel} disabled={saving}
                            className="bg-[#00FF88] text-black font-semibold gap-2 text-xs h-8">
                            {saving && <Loader2 className="h-3 w-3 animate-spin" />} Guardar y conectar
                          </Button>
                          <Button size="sm" onClick={() => setShowIG(false)}
                            className="bg-white/[0.04] text-[#4A5568] hover:text-white text-xs h-8">
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── WhatsApp ── */}
              {(() => {
                const ch = getChannel('whatsapp');
                return (
                  <div className="rounded-xl bg-space-card border border-white/[0.06] p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{ background: '#25D366' }}>💚</div>
                      <div className="flex-1">
                        <p className="font-semibold text-white">WhatsApp Business</p>
                        <p className="text-xs text-[#4A5568]">Configuración manual desde Meta Developers</p>
                      </div>
                      {ch?.is_connected && (
                        <span className="text-xs text-[#00E67A] font-semibold">● {ch.whatsapp_phone_number_id}</span>
                      )}
                    </div>

                    {ch?.is_connected ? (
                      <Button size="sm" onClick={() => disconnectChannel(ch.id, selectedAgent.id)}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs h-7">
                        Desconectar
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => { setShowWA(true); setShowIG(false); }}
                        className="bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] border border-[#25D366]/30 text-xs h-8 font-semibold">
                        Configurar manualmente
                      </Button>
                    )}

                    {showWA && !ch?.is_connected && (
                      <div className="space-y-3 pt-3 border-t border-white/[0.06]">
                        <p className="text-sm font-semibold text-white">Configurar WhatsApp Business</p>
                        <div className="grid gap-3">
                          {[
                            { label: 'WhatsApp Phone Number ID', value: waPhoneId, set: setWaPhoneId, ph: '123456789012345' },
                            { label: 'WhatsApp Business Account ID', value: waWabaId, set: setWaWabaId, ph: '987654321098765' },
                            { label: 'System User Access Token', value: waToken, set: setWaToken, ph: 'EAAWfiI8...', pw: true },
                            { label: 'Webhook Verify Token', value: waVerifyToken, set: setWaVerifyToken, ph: '' },
                          ].map(f => (
                            <div key={f.label}>
                              <label className="text-xs text-[#4A5568] mb-1 block">{f.label}</label>
                              <input value={f.value} onChange={e => f.set(e.target.value)}
                                className={inputCls} placeholder={f.ph} type={f.pw ? 'password' : 'text'} />
                            </div>
                          ))}
                        </div>
                        <div className="rounded-lg bg-blue-500/[0.06] border border-blue-500/20 p-3">
                          <p className="text-xs text-blue-400 mb-1">Webhook URL para configurar en Meta:</p>
                          <code className="text-xs text-[#A0AEC0] break-all">
                            https://app.conectaachat.com/api/xenttech-webhook/whatsapp
                          </code>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={saveWAChannel} disabled={saving}
                            className="bg-[#00FF88] text-black font-semibold gap-2 text-xs h-8">
                            {saving && <Loader2 className="h-3 w-3 animate-spin" />} Guardar y conectar
                          </Button>
                          <Button size="sm" onClick={() => setShowWA(false)}
                            className="bg-white/[0.04] text-[#4A5568] hover:text-white text-xs h-8">
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Web Widget ── */}
              <div className="rounded-xl bg-space-card border border-white/[0.06] p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 text-xl">🌐</div>
                  <div>
                    <p className="font-semibold text-white">Widget Web</p>
                    <p className="text-xs text-[#4A5568]">Código embed para el sitio del cliente</p>
                  </div>
                </div>
                <div className="rounded-lg bg-black/40 border border-white/[0.04] p-3 font-mono text-[11px] text-[#00FF88] break-all">
                  {`<script src="https://app.conectaachat.com/widget.js" data-agent="${selectedAgent.id}"></script>`}
                </div>
                <button onClick={() => copyWidget(selectedAgent.id)}
                  className="flex items-center gap-2 text-xs px-3 h-7 rounded-lg border border-white/[0.08] text-[#A0AEC0] bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
                  {copiedId === selectedAgent.id
                    ? <Check className="h-3 w-3 text-[#00FF88]" />
                    : <Copy className="h-3 w-3" />}
                  Copiar código
                </button>
              </div>
            </div>
          </>
        )}

        {/* ════════════════ CONVERSATIONS VIEW ════════════════ */}
        {view === 'conversations' && selectedAgent && (
          <>
            <button onClick={() => { setView('list'); setExpandedConv(null); }}
              className="flex items-center gap-2 text-sm text-[#4A5568] hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" /> Volver a agentes
            </button>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 text-[#4A5568] animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-20">
                <MessageSquare className="h-12 w-12 text-[#4A5568] mx-auto mb-3" />
                <p className="text-[#4A5568]">Sin conversaciones todavía</p>
              </div>
            ) : (
              <div className="space-y-3">
                {conversations.map(conv => {
                  const msgs     = conv.messages ?? [];
                  const lastMsg  = msgs[msgs.length - 1];
                  const expanded = expandedConv === conv.id;
                  return (
                    <div key={conv.id} className="rounded-xl bg-space-card border border-white/[0.06] overflow-hidden">
                      <button onClick={() => setExpandedConv(expanded ? null : conv.id)}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors">
                        <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-sm shrink-0">
                          {CH_EMOJI[conv.channel_type ?? ''] ?? '💬'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-white truncate">
                              {conv.contact_name ?? conv.contact_phone ?? 'Desconocido'}
                            </span>
                            {conv.lead_captured && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#00FF88]/10 text-[#00FF88]">
                                LEAD
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#4A5568] truncate">
                            {lastMsg ? lastMsg.content.slice(0, 90) : 'Sin mensajes'}
                          </p>
                        </div>
                        <div className="text-right text-[10px] text-[#4A5568] shrink-0">
                          <p>{conv.updated_at ? new Date(conv.updated_at).toLocaleDateString('es') : ''}</p>
                          <p>{msgs.length} msgs</p>
                        </div>
                      </button>

                      {expanded && msgs.length > 0 && (
                        <div className="border-t border-white/[0.06] p-4 space-y-3 max-h-72 overflow-y-auto">
                          {msgs.map((msg, mi) => (
                            <div key={mi} className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                              <div className={cn(
                                "max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                                msg.role === 'user'
                                  ? "bg-[#00FF88]/10 text-[#00FF88]"
                                  : "bg-white/[0.06] text-[#A0AEC0]"
                              )}>
                                {msg.content}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>

      {/* ════════════════ CREATE / EDIT MODAL ════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-lg rounded-2xl bg-space-card border border-white/[0.08] p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editingAgent ? 'Editar agente' : 'Nuevo agente'}</h2>
              <button onClick={() => setShowModal(false)} className="text-[#4A5568] hover:text-white text-xl leading-none">✕</button>
            </div>

            {error && <p className="text-xs text-red-400 bg-red-500/[0.05] border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Cliente *</label>
                <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                  className={inputCls}>
                  <option value="">Seleccionar cliente...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Nombre *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls} placeholder="Asistente de Melva" />
              </div>

              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Descripción</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className={inputCls} placeholder="¿Para qué sirve este agente?" />
              </div>

              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Instrucciones del sistema</label>
                <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                  rows={5} className={areaCls}
                  placeholder="Eres un asistente de ventas de Melva Beauty. Respondes en español, eres amable y conciso. Cuando alguien pregunta por precios, los compartes directamente." />
              </div>

              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">Modelo de IA</label>
                <select value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  className={inputCls}>
                  {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-[#4A5568] mb-1 block">
                  Temperatura: <span className="text-white font-medium">{form.temperature}</span>
                  <span className="ml-2 text-[#4A5568]">({form.temperature < 0.4 ? 'preciso' : form.temperature > 0.7 ? 'creativo' : 'balanceado'})</span>
                </label>
                <input type="range" min={0} max={1} step={0.1} value={form.temperature}
                  onChange={e => setForm(f => ({ ...f, temperature: parseFloat(e.target.value) }))}
                  className="w-full accent-[#00FF88]" />
                <div className="flex justify-between text-[10px] text-[#4A5568] mt-0.5">
                  <span>0 — Determinístico</span><span>1 — Creativo</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button onClick={saveAgent} disabled={saving} className="bg-[#00FF88] text-black font-semibold gap-2 flex-1 h-10">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingAgent ? 'Guardar cambios' : 'Crear agente'}
              </Button>
              {editingAgent && (
                <Button onClick={() => deleteAgent(editingAgent.id)}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 h-10 px-4">
                  Eliminar
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 text-[#4A5568] animate-spin" />
      </div>
    }>
      <AgentsContent />
    </Suspense>
  );
}
