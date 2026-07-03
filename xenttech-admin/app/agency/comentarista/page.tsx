"use client"
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { cn } from "@/lib/utils"
import {
  Loader2, MessageSquare, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, MessageCircle, Users, BarChart2,
  Settings, SkipForward,
} from "lucide-react"

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Tone = 'professional' | 'friendly' | 'direct' | 'sales'

interface CommentLog {
  id: string
  agent_id: string | null
  agent_name: string | null
  post_id: string | null
  comment_id: string
  commenter_name: string | null
  comment_text: string | null
  reply_text: string | null
  status: string
  error_message: string | null
  created_at: string
}

interface Metrics {
  todayCount: number
  activePosts: number
  activeAgents: number
  total: number
}

interface Agent {
  id: string
  name: string
  system_prompt?: string | null
}

interface ConnectedChannel {
  id: string
  agent_id: string
  page_name: string | null
  page_id: string | null
}

interface CommentRule {
  id: string
  agent_id: string
  is_active: boolean
  tone: Tone
  custom_instruction: string | null
  reply_to_ads: boolean
  reply_to_organic: boolean
  ignore_negative: boolean
}

interface FbPage {
  id: string
  name: string
  access_token: string
  category?: string
}

interface ApiResponse {
  logs: CommentLog[]
  agents: Agent[]
  metrics: Metrics
  connectedChannels: ConnectedChannel[]
  rules: CommentRule[]
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: number | string; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('h-3.5 w-3.5', color)} />
        <p className="text-[11px] text-[#64748B] uppercase tracking-wide">{label}</p>
      </div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
      {sub && <p className="text-[10px] text-[#3A3A5C] mt-0.5">{sub}</p>}
    </div>
  )
}

function Toggle({ checked, onChange, label, description, disabled }: {
  checked: boolean; onChange: (v: boolean) => void
  label: string; description?: string; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        'flex items-center justify-between w-full p-3.5 rounded-xl border transition-all text-left',
        checked ? 'border-[#00D4AA]/30 bg-[#00D4AA]/[0.04]' : 'border-[#1A1A35] bg-[#080812]',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/[0.12] cursor-pointer'
      )}
    >
      <div>
        <p className={cn('text-sm font-medium', checked ? 'text-white' : 'text-[#64748B]')}>{label}</p>
        {description && <p className="text-xs text-[#3A3A5C] mt-0.5">{description}</p>}
      </div>
      <div className={cn(
        'w-10 h-5.5 rounded-full transition-colors shrink-0 relative',
        checked ? 'bg-[#00D4AA]' : 'bg-[#1A1A35]'
      )} style={{ height: 22, width: 40 }}>
        <div className={cn(
          'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5'
        )} />
      </div>
    </button>
  )
}

const TONES: Array<{ value: Tone; label: string; description: string }> = [
  { value: 'professional', label: '🤝 Profesional',      description: 'Cordial y formal' },
  { value: 'friendly',     label: '😊 Amigable',         description: 'Cercano, como conocido' },
  { value: 'direct',       label: '⚡ Directo',           description: 'Conciso, máx. 1 oración' },
  { value: 'sales',        label: '🎯 Orientado a ventas', description: 'Invita a contactar por DM' },
]

// ── Page picker modal ──────────────────────────────────────────────────────────

function PagePickerModal({ pages, agentId, onConnect, onClose }: {
  pages: FbPage[]
  agentId: string
  onConnect: (page: FbPage, agentId: string) => Promise<void>
  onClose: () => void
}) {
  const [selected, setSelected] = useState<FbPage | null>(pages[0] ?? null)
  const [connecting, setConnecting] = useState(false)

  async function confirm() {
    if (!selected) return
    setConnecting(true)
    await onConnect(selected, agentId)
    setConnecting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-2xl border border-[#1A1A35] bg-[#0D0D1F] shadow-2xl flex flex-col" style={{ maxHeight: '80vh' }}>

        {/* Header fijo */}
        <div className="px-6 pt-6 pb-4 flex-shrink-0">
          <h2 className="text-base font-bold text-white mb-1">Selecciona tu página de Facebook</h2>
          <p className="text-xs text-[#64748B]">El bot responderá comentarios desde esta página</p>
        </div>

        {/* Lista con scroll */}
        <div className="overflow-y-auto flex-1 px-6 space-y-2">
          {pages.map(page => (
            <button
              key={page.id}
              type="button"
              onClick={() => setSelected(page)}
              className={cn(
                'w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all',
                selected?.id === page.id
                  ? 'border-[#00D4AA]/40 bg-[#00D4AA]/[0.06]'
                  : 'border-[#1A1A35] hover:border-white/[0.12]'
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                selected?.id === page.id ? 'bg-[#00D4AA]/10' : 'bg-[#1A1A35]'
              )}>
                <FacebookIcon className={cn('h-4 w-4', selected?.id === page.id ? 'text-[#00D4AA]' : 'text-[#3A3A5C]')} />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{page.name}</p>
                {page.category && <p className="text-[11px] text-[#3A3A5C]">{page.category}</p>}
              </div>
              {selected?.id === page.id && (
                <CheckCircle2 className="h-4 w-4 text-[#00D4AA] ml-auto shrink-0" />
              )}
            </button>
          ))}
        </div>

        {/* Botones fijos abajo */}
        <div className="px-6 py-4 border-t border-[#1A1A35] flex-shrink-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-[#1A1A35] text-sm text-[#64748B] hover:text-white hover:border-white/10 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!selected || connecting}
            className="flex-1 h-10 rounded-xl bg-[#00D4AA] text-black text-sm font-semibold hover:bg-[#00D4AA]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Conectar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Personalization panel ──────────────────────────────────────────────────────

function ConfigPanel({
  agents,
  connectedChannels,
  rules,
  onSaved,
  onReconnect,
}: {
  agents: Agent[]
  connectedChannels: ConnectedChannel[]
  rules: CommentRule[]
  onSaved: () => void
  onReconnect: (agentId: string) => void
}) {
  const firstChannel = connectedChannels[0]
  const [agentId, setAgentId] = useState(firstChannel?.agent_id ?? agents[0]?.id ?? '')
  const rule = rules.find(r => r.agent_id === agentId) ?? null

  const [tone,              setTone]              = useState<Tone>(rule?.tone ?? 'professional')
  const [customInstruction, setCustomInstruction] = useState(rule?.custom_instruction ?? '')
  const [replyToAds,        setReplyToAds]        = useState(rule?.reply_to_ads       ?? true)
  const [ignoreNegative,    setIgnoreNegative]    = useState(rule?.ignore_negative    ?? false)
  const [isActive,          setIsActive]          = useState(rule?.is_active          ?? false)
  const [saving,     setSaving]     = useState(false)
  const [toggling,   setToggling]   = useState(false)
  const [msg,        setMsg]        = useState<{ ok: boolean; text: string } | null>(null)

  // Sync form when switching agents
  useEffect(() => {
    const r = rules.find(r => r.agent_id === agentId) ?? null
    setTone(r?.tone ?? 'professional')
    setCustomInstruction(r?.custom_instruction ?? '')
    setReplyToAds(r?.reply_to_ads ?? true)
    setIgnoreNegative(r?.ignore_negative ?? false)
    setIsActive(r?.is_active ?? false)
    setMsg(null)
  }, [agentId, rules])

  const channel = connectedChannels.find(c => c.agent_id === agentId) ?? firstChannel

  async function patch(fields: Record<string, unknown>) {
    const res = await fetch(`/api/agents/${agentId}/comment-rules`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_active:          isActive,
        tone,
        custom_instruction: customInstruction.trim() || null,
        reply_to_ads:       replyToAds,
        reply_to_organic:   true,
        ignore_negative:    ignoreNegative,
        ...fields,
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`)
    return json
  }

  async function toggleActive() {
    if (!agentId) { setMsg({ ok: false, text: 'Selecciona un agente primero' }); return }
    setToggling(true)
    setMsg(null)
    const next = !isActive
    try {
      await patch({ is_active: next })
      setIsActive(next)
      onSaved()
    } catch (e) {
      console.error('toggleActive error:', e)
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setToggling(false)
    }
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      await patch({ is_active: isActive })
      setMsg({ ok: true, text: 'Configuración guardada ✓' })
      onSaved()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Status toggle — click to activate/deactivate instantly */}
      <button
        type="button"
        onClick={toggleActive}
        disabled={toggling}
        className={cn(
          'w-full flex items-center gap-3 rounded-xl border px-4 py-3 transition-all text-left',
          isActive
            ? 'border-[#00D4AA]/30 bg-[#00D4AA]/[0.04] hover:bg-[#00D4AA]/[0.07]'
            : 'border-[#1A1A35] bg-[#0D0D1F] hover:border-white/[0.12]',
          toggling ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        )}
      >
        {toggling
          ? <Loader2 className="h-3.5 w-3.5 text-[#64748B] animate-spin shrink-0" />
          : <div className={cn('w-2 h-2 rounded-full shrink-0', isActive ? 'bg-[#00D4AA] animate-pulse' : 'bg-[#3A3A5C]')} />}
        <span className={cn('text-sm font-medium flex-1', isActive ? 'text-[#00D4AA]' : 'text-[#64748B]')}>
          {isActive ? 'Comentarista activo — clic para desactivar' : 'Comentarista inactivo — clic para activar'}
        </span>
        {channel?.page_name && (
          <span className="text-xs text-[#3A3A5C]">{channel.page_name}</span>
        )}
      </button>

      {/* Agent selector */}
      <div className="rounded-xl border border-[#1A1A35] bg-[#0D0D1F] p-4 space-y-3">
        <p className="text-xs font-semibold text-[#3A3A5C] uppercase tracking-wider flex items-center gap-2">
          <Settings className="h-3 w-3" /> Configuración
        </p>

        <div>
          <label className="text-xs text-[#64748B] mb-1.5 block">Agente que responderá</label>
          <select
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            className="w-full h-9 rounded-lg bg-[#080812] border border-white/[0.08] text-white text-sm px-3 focus:outline-none focus:border-[#00D4AA]/40 cursor-pointer"
          >
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* Tone selector */}
        <div>
          <label className="text-xs text-[#64748B] mb-2 block">Tono de respuesta</label>
          <div className="grid grid-cols-2 gap-2">
            {TONES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                className={cn(
                  'flex flex-col items-start p-3 rounded-xl border text-left transition-all',
                  tone === t.value
                    ? 'border-[#00D4AA]/40 bg-[#00D4AA]/[0.06]'
                    : 'border-[#1A1A35] hover:border-white/[0.12]'
                )}
              >
                <span className="text-xs font-semibold text-white">{t.label}</span>
                <span className="text-[10px] text-[#3A3A5C] mt-0.5">{t.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom instruction */}
        <div>
          <label className="text-xs text-[#64748B] mb-1.5 block">Instrucción adicional</label>
          <textarea
            value={customInstruction}
            onChange={e => setCustomInstruction(e.target.value)}
            rows={3}
            placeholder="Ej: Siempre menciona que tenemos financiamiento disponible. No revelar precios en comentarios públicos."
            className="w-full rounded-lg bg-[#080812] border border-white/[0.08] text-white text-xs px-3 py-2.5 placeholder:text-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]/40 resize-none"
          />
        </div>

        {/* Toggles */}
        <div className="space-y-2">
          <Toggle
            checked={replyToAds}
            onChange={setReplyToAds}
            label="Responder en anuncios"
            description="Incluye comentarios en publicaciones promocionadas"
          />
          <Toggle
            checked={ignoreNegative}
            onChange={setIgnoreNegative}
            label="Ignorar comentarios negativos"
            description="El bot no responde quejas ni críticas"
          />
        </div>
      </div>

      {/* Save feedback */}
      {msg && (
        <div className={cn(
          'flex items-center gap-2 text-sm px-4 py-3 rounded-xl border',
          msg.ok
            ? 'text-[#00D4AA] border-[#00D4AA]/20 bg-[#00D4AA]/[0.04]'
            : 'text-red-400 border-red-500/20 bg-red-500/[0.04]'
        )}>
          {msg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || toggling}
          className="flex-1 h-10 rounded-xl bg-[#00D4AA] text-black text-sm font-semibold hover:bg-[#00D4AA]/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Guardar configuración
        </button>
      </div>

      {/* Reconnect link */}
      <button
        type="button"
        onClick={() => onReconnect(agentId)}
        className="w-full text-xs text-[#3A3A5C] hover:text-[#64748B] transition-colors py-1 flex items-center justify-center gap-1.5"
      >
        <FacebookIcon className="h-3 w-3" />
        Reconectar Facebook con nuevos permisos
      </button>
    </div>
  )
}

// ── Log table ──────────────────────────────────────────────────────────────────

function LogTable({ logs }: { logs: CommentLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl border border-[#1A1A35]">
        <MessageSquare className="h-10 w-10 text-[#1A1A35] mx-auto mb-3" />
        <p className="text-[#64748B] text-sm">Sin comentarios respondidos todavía</p>
        <p className="text-[#3A3A5C] text-xs mt-1">Activa el comentarista y comenta en la página de Facebook</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#1A1A35] overflow-hidden">
      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_100px_100px] bg-[#080812] border-b border-[#1A1A35]">
        {['Agente', 'Comentario', 'Respuesta IA', 'Usuario', 'Post', 'Fecha'].map(h => (
          <div key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#3A3A5C]">
            {h}
          </div>
        ))}
      </div>
      {logs.map(log => (
        <div key={log.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_100px_100px] border-b border-[#1A1A35] hover:bg-[#0D0D1F]/60 transition-colors">
          <div className="px-3 py-3 flex items-center">
            <span className="text-xs text-[#64748B] truncate">{log.agent_name ?? '—'}</span>
          </div>
          <div className="px-3 py-3">
            <p className="text-xs text-[#94A3B8] line-clamp-2">{log.comment_text ?? '—'}</p>
            {log.commenter_name && (
              <p className="text-[10px] text-[#3A3A5C] mt-0.5">@{log.commenter_name}</p>
            )}
          </div>
          <div className="px-3 py-3">
            {log.status === 'skipped' ? (
              <div className="flex items-center gap-1">
                <SkipForward className="h-3 w-3 text-[#3A3A5C] shrink-0" />
                <p className="text-[11px] text-[#3A3A5C]">Ignorado</p>
              </div>
            ) : log.status === 'sent' ? (
              <p className="text-xs text-[#00D4AA] line-clamp-2">{log.reply_text ?? '—'}</p>
            ) : (
              <div className="flex items-start gap-1">
                <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-400 line-clamp-2">{log.error_message ?? 'Error'}</p>
              </div>
            )}
          </div>
          <div className="px-3 py-3 flex items-center">
            <span className="text-xs text-[#64748B]">{log.commenter_name ?? 'Anónimo'}</span>
          </div>
          <div className="px-3 py-3 flex items-center">
            {log.post_id
              ? <span className="text-[10px] text-[#3A3A5C] font-mono">…{log.post_id.slice(-10)}</span>
              : <span className="text-[10px] text-[#1A1A35]">—</span>}
          </div>
          <div className="px-3 py-3 flex items-center gap-1.5">
            {log.status === 'sent'
              ? <CheckCircle2 className="h-3 w-3 text-[#00D4AA] shrink-0" />
              : log.status === 'skipped'
              ? <SkipForward  className="h-3 w-3 text-[#3A3A5C]   shrink-0" />
              : <XCircle      className="h-3 w-3 text-red-400      shrink-0" />}
            <span className="text-[11px] text-[#3A3A5C]">
              {new Date(log.created_at).toLocaleString('es-MX', {
                day: '2-digit', month: 'short',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ComentaristaPage() {
  const [data,    setData]    = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [agentFilter, setAgentFilter] = useState('')

  // Page picker state (populated from OAuth callback ?fb_pages= param)
  const [fbPages,    setFbPages]    = useState<FbPage[]>([])
  const [fbAgentId,  setFbAgentId]  = useState('')
  const [showPicker, setShowPicker] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs  = agentFilter ? `?agentId=${agentFilter}` : ''
      const res = await fetch(`/api/comentarista${qs}`)
      const json: ApiResponse = await res.json()
      setData(json)
    } catch (e) {
      console.error('Comentarista load error', e)
    } finally {
      setLoading(false)
    }
  }, [agentFilter])

  useEffect(() => { load() }, [load])

  // Parse ?fb_pages= query param after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const raw    = params.get('fb_pages')
    const aId    = params.get('agent_id')
    if (raw && aId) {
      try {
        const pages: FbPage[] = JSON.parse(atob(raw))
        setFbPages(pages)
        setFbAgentId(aId)
        setShowPicker(true)
        // Clean URL
        window.history.replaceState({}, '', '/agency/comentarista')
      } catch { /* ignore parse errors */ }
    }
  }, [])

  async function connectPage(page: FbPage, agentId: string) {
    const res = await fetch('/api/comentarista/connect', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageId:          page.id,
        pageName:        page.name,
        pageAccessToken: page.access_token,
        agentId,
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      alert((json as Record<string, string>).error ?? 'Error al conectar')
      return
    }
    setShowPicker(false)
    await load()
  }

  function startOAuth(agentId: string) {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    if (!appId) { alert('NEXT_PUBLIC_META_APP_ID no configurado'); return }

    const callbackUri = `${window.location.origin}/api/xenttech-oauth/callback`
    const state       = JSON.stringify({ agent_id: agentId, channel: 'facebook', source: 'comentarista' })
    const scopes      = [
      'pages_messaging',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_engagement',
      'pages_read_user_content',
      'pages_manage_metadata',
    ].join(',')

    const url = `https://www.facebook.com/v22.0/dialog/oauth`
      + `?client_id=${encodeURIComponent(appId)}`
      + `&redirect_uri=${encodeURIComponent(callbackUri)}`
      + `&scope=${encodeURIComponent(scopes)}`
      + `&state=${encodeURIComponent(state)}`
      + `&response_type=code`

    window.location.href = url
  }

  const hasChannel = (data?.connectedChannels?.length ?? 0) > 0

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Comentarista IA"
        description="El bot responde automáticamente los comentarios de tu página de Facebook"
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-[#64748B] animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Beta warning */}
          <div className="flex items-start gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/[0.06] px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-400 leading-relaxed">
              <span className="font-bold">Función en modo prueba</span> — Meta está revisando los permisos.
              Por ahora solo funciona con cuentas que tengan acceso de tester en la app de Meta.
              Una vez aprobado, funcionará para todos automáticamente.
            </p>
          </div>

          {/* Quick links bar */}
          <div className="flex flex-wrap gap-2">
            <a
              href="https://vercel.com/felipe44444444444s-projects/xenttech-admin/logs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg border border-white/[0.06] bg-[#0D0D1F] text-[#64748B] hover:text-white hover:border-white/10 transition-colors"
            >
              ▲ Logs de Vercel →
            </a>
            <a
              href="https://supabase.com/dashboard/project/oxlhmndvpogpdjutfxzr/editor"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg border border-white/[0.06] bg-[#0D0D1F] text-[#64748B] hover:text-white hover:border-white/10 transition-colors"
            >
              🗄 Ver comentarios en DB →
            </a>
            <a
              href="https://developers.facebook.com/apps/1582783749449013/webhooks/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg border border-white/[0.06] bg-[#0D0D1F] text-[#64748B] hover:text-white hover:border-white/10 transition-colors"
            >
              📡 Webhooks en Meta →
            </a>
            <a
              href="https://developers.facebook.com/apps/1582783749449013/roles/test-users/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg border border-white/[0.06] bg-[#0D0D1F] text-[#64748B] hover:text-white hover:border-white/10 transition-colors"
            >
              👤 Testers en Meta →
            </a>
          </div>

          {!hasChannel ? (
            /* ── Connect flow ── */
            <div className="flex-1 flex items-center justify-center py-16">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-5">
                  <MessageSquare className="h-8 w-8 text-blue-400" />
                </div>
                <h2 className="text-lg font-bold text-white mb-2">Conecta tu página de Facebook</h2>
                <p className="text-sm text-[#64748B] mb-6 leading-relaxed">
                  El bot responderá automáticamente todos los comentarios usando la personalidad de tu agente
                </p>

                {(data?.agents?.length ?? 0) > 1 && (
                  <div className="mb-4">
                    <label className="text-xs text-[#64748B] mb-1.5 block text-left">Selecciona el agente</label>
                    <select
                      id="connect-agent"
                      defaultValue={data?.agents[0]?.id}
                      className="w-full h-9 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-sm px-3 focus:outline-none focus:border-[#00D4AA]/40"
                    >
                      {data?.agents.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const sel = document.getElementById('connect-agent') as HTMLSelectElement | null
                    const aId = sel?.value ?? data?.agents[0]?.id ?? ''
                    startOAuth(aId)
                  }}
                  className="inline-flex items-center gap-2.5 bg-[#1877F2] hover:bg-[#1877F2]/90 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
                >
                  <FacebookIcon className="h-4 w-4" />
                  Conectar con Facebook
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ── KPI cards ── */}
              {data?.metrics && (
                <div className="grid grid-cols-4 gap-4">
                  <KpiCard label="Respondidos hoy"    value={data.metrics.todayCount}   icon={MessageCircle} color="text-[#00D4AA]" sub="comentarios con respuesta IA" />
                  <KpiCard label="Total en historial" value={data.metrics.total}         icon={BarChart2}     color="text-blue-400"  sub="últimos 100 registros" />
                  <KpiCard label="Posts monitoreados" value={data.metrics.activePosts}   icon={MessageSquare} color="text-purple-400" sub="últimos 7 días" />
                  <KpiCard label="Agentes activos"    value={data.metrics.activeAgents}  icon={Users}         color="text-orange-400" sub="con comentarista encendido" />
                </div>
              )}

              <div className="grid grid-cols-[350px_1fr] gap-5 items-start">
                {/* Left: config */}
                <ConfigPanel
                  agents={data?.agents ?? []}
                  connectedChannels={data?.connectedChannels ?? []}
                  rules={data?.rules ?? []}
                  onSaved={load}
                  onReconnect={startOAuth}
                />

                {/* Right: logs */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-[#3A3A5C] uppercase tracking-wider flex-1">
                      Historial de comentarios
                    </p>
                    <select
                      value={agentFilter}
                      onChange={e => setAgentFilter(e.target.value)}
                      className="h-7 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-xs px-2 focus:outline-none focus:border-[#00D4AA]/40"
                    >
                      <option value="">Todos los agentes</option>
                      {data?.agents.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={load}
                      className="flex items-center gap-1.5 text-xs text-[#64748B] hover:text-white h-7 px-2 rounded-lg border border-white/[0.06] hover:border-white/10 transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  </div>
                  <LogTable logs={data?.logs ?? []} />
                </div>
              </div>
            </>
          )}

        </div>
      )}

      {/* Page picker modal */}
      {showPicker && fbPages.length > 0 && (
        <PagePickerModal
          pages={fbPages}
          agentId={fbAgentId}
          onConnect={connectPage}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
