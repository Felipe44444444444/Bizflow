'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useCallback, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import {
  ArrowLeft, Plus, Trash2, AlertCircle, CheckCircle, Loader2,
  X, ToggleLeft, ToggleRight, Play, Clock, Send, RefreshCw,
  Zap, MessageSquare, ChevronDown, ChevronUp, Sparkles, Flame, Info,
} from 'lucide-react'
import { RETARGETING_TEMPLATES, DEFAULT_TEMPLATE_KEY, type TemplateKey } from '@/lib/xenttech/retargeting-templates'

// ── Types ────────────────────────────────────────────────────────────────────

interface RetargetingMessage { id: string; text: string; order: number }

interface RetargetingRule {
  id: string
  agent_id: string
  name: string
  is_active: boolean
  delay_minutes: number
  messages: RetargetingMessage[]
  message_strategy: 'random' | 'sequential'
  max_retargeting_per_conversation: number
  min_hours_between_retargeting: number
  apply_to_channels: string[]
  created_at: string
}

interface RetargetingLog {
  id: string
  rule_id: string | null
  conversation_id: string | null
  channel_type: string
  message_sent: string
  sent_at: string
  status: string
  error_message: string | null
}

interface AgentMeta { id: string; name: string }

interface TestPreviewItem {
  conversationId: string
  contactName: string | null
  channelType: string
  timeSilentMinutes: number
  retargetingCount: number
  message: string
}

interface RetargetingDebug {
  totalConversations: number
  activeRuleDelay:    number | null
  nearest: {
    contactName:       string
    channelType:       string
    minutesSilent:     number
    lastRole:          string
    minutesUntilReady: number
  } | null
  reason: string
}

interface FireResult {
  success: boolean
  conversation_id?: string
  recipient_name?: string
  channel?: string
  message_sent?: string
  messenger_response?: Record<string, unknown>
  error?: string
  detail?: string
  meta_error?: string
  action?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CHANNELS = ['facebook', 'instagram', 'whatsapp', 'web']
const CH_EMOJI: Record<string, string> = {
  facebook: '💬', instagram: '📷', whatsapp: '💚', web: '🌐',
}

const TEMPLATE_KEYS = Object.keys(RETARGETING_TEMPLATES) as TemplateKey[]

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m  = Math.floor(ms / 60_000)
  if (m < 1)   return 'hace un momento'
  if (m < 60)  return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24)  return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

function uid(): string {
  return Math.random().toString(36).slice(2)
}

function templateToMessages(key: TemplateKey): RetargetingMessage[] {
  return RETARGETING_TEMPLATES[key].messages.map((text, i) => ({
    id: uid(), text, order: i + 1,
  }))
}

function blankForm(autoTemplate?: TemplateKey): Omit<RetargetingRule, 'id' | 'agent_id' | 'created_at'> {
  const tpl = autoTemplate ?? null
  return {
    name:                              tpl ? RETARGETING_TEMPLATES[tpl].name : 'Seguimiento automático',
    is_active:                         true,
    delay_minutes:                     10,
    messages:                          tpl ? templateToMessages(tpl) : [{ id: uid(), text: '', order: 1 }],
    message_strategy:                  'random',
    max_retargeting_per_conversation:  2,
    min_hours_between_retargeting:     24,
    apply_to_channels:                 ['facebook', 'instagram', 'whatsapp'],
  }
}

function previewMessage(text: string): string {
  return text.replace(/\{nombre\}/g, 'Felipe')
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RetargetingPage() {
  const { id: agentId } = useParams<{ id: string }>()

  const [agent,   setAgent]   = useState<AgentMeta | null>(null)
  const [rules,   setRules]   = useState<RetargetingRule[]>([])
  const [logs,    setLogs]    = useState<RetargetingLog[]>([])
  const [loading, setLoading] = useState(true)
  const [pageErr, setPageErr] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form
  const [showForm,        setShowForm]        = useState(false)
  const [editingId,       setEditingId]       = useState<string | null>(null)
  const [form,            setForm]            = useState(blankForm())
  const [saving,          setSaving]          = useState(false)
  const [selectedTpl,     setSelectedTpl]     = useState<TemplateKey | null>(null)
  const [tplJustApplied,  setTplJustApplied]  = useState(false)

  // Simulator
  const [testing,      setTesting]      = useState(false)
  const [testPreview,  setTestPreview]  = useState<TestPreviewItem[] | null>(null)
  const [testDebug,    setTestDebug]    = useState<RetargetingDebug | null>(null)
  const [sending,      setSending]      = useState(false)
  const [expandedLog,  setExpandedLog]  = useState(false)

  // Test-fire (real send)
  const [firing,       setFiring]       = useState(false)
  const [fireResult,   setFireResult]   = useState<FireResult | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/retargeting`)
    if (!res.ok) { setPageErr('Error al cargar'); setLoading(false); return }
    const json = await res.json()
    setAgent(json.agent)
    setRules(json.rules)
    setLogs(json.logs)
    setLoading(false)
  }, [agentId])

  useEffect(() => { load() }, [load])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function showOk(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 4000)
  }

  async function apiFetch(url: string, opts: RequestInit) {
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
    return json
  }

  function openCreate(withRulesCount: number) {
    setEditingId(null)
    const autoTpl = withRulesCount === 0 ? DEFAULT_TEMPLATE_KEY : null
    setSelectedTpl(autoTpl)
    setTplJustApplied(autoTpl !== null)
    setForm(blankForm(autoTpl ?? undefined))
    setShowForm(true)
    setTestPreview(null)
  }

  function openEdit(rule: RetargetingRule) {
    setEditingId(rule.id)
    setSelectedTpl(null)
    setTplJustApplied(false)
    setForm({
      name:                             rule.name,
      is_active:                        rule.is_active,
      delay_minutes:                    rule.delay_minutes,
      messages:                         rule.messages.length > 0 ? rule.messages : [{ id: uid(), text: '', order: 1 }],
      message_strategy:                 rule.message_strategy,
      max_retargeting_per_conversation: rule.max_retargeting_per_conversation,
      min_hours_between_retargeting:    rule.min_hours_between_retargeting,
      apply_to_channels:                rule.apply_to_channels,
    })
    setShowForm(true)
    setTestPreview(null)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setSelectedTpl(null)
    setTplJustApplied(false)
  }

  function applyTemplate(key: TemplateKey) {
    const tpl = RETARGETING_TEMPLATES[key]
    setSelectedTpl(key)
    setTplJustApplied(true)
    setForm(f => ({
      ...f,
      name: f.name === 'Seguimiento automático' || TEMPLATE_KEYS.some(k => RETARGETING_TEMPLATES[k].name === f.name)
        ? tpl.name
        : f.name,
      messages: templateToMessages(key),
    }))
    setTimeout(() => setTplJustApplied(false), 3000)
  }

  // ── Form field helpers ────────────────────────────────────────────────────

  function setField<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function toggleChannel(ch: string) {
    setForm(f => ({
      ...f,
      apply_to_channels: f.apply_to_channels.includes(ch)
        ? f.apply_to_channels.filter(c => c !== ch)
        : [...f.apply_to_channels, ch],
    }))
  }

  function addMessage() {
    setForm(f => ({
      ...f,
      messages: [...f.messages, { id: uid(), text: '', order: f.messages.length + 1 }],
    }))
  }

  function updateMessage(id: string, text: string) {
    setForm(f => ({ ...f, messages: f.messages.map(m => m.id === id ? { ...m, text } : m) }))
  }

  function removeMessage(id: string) {
    setForm(f => ({ ...f, messages: f.messages.filter(m => m.id !== id) }))
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function saveRule() {
    if (!form.messages.some(m => m.text.trim())) {
      setPageErr('Escribe al menos un mensaje de seguimiento')
      return
    }
    if (!form.apply_to_channels.length) {
      setPageErr('Selecciona al menos un canal')
      return
    }
    setSaving(true); setPageErr(null)
    try {
      const payload = {
        ...form,
        messages: form.messages.filter(m => m.text.trim()),
        delay_minutes: Number(form.delay_minutes),
        max_retargeting_per_conversation: Number(form.max_retargeting_per_conversation),
        min_hours_between_retargeting: Number(form.min_hours_between_retargeting),
      }
      if (editingId) {
        await apiFetch(`/api/agents/${agentId}/retargeting/${editingId}`, {
          method: 'PATCH', body: JSON.stringify(payload),
        })
        showOk('Regla actualizada')
      } else {
        await apiFetch(`/api/agents/${agentId}/retargeting`, {
          method: 'POST', body: JSON.stringify(payload),
        })
        showOk('Regla creada')
      }
      closeForm()
      await load()
    } catch (e) { setPageErr((e as Error).message) }
    finally { setSaving(false) }
  }

  // ── Toggle / delete ───────────────────────────────────────────────────────

  async function toggleActive(rule: RetargetingRule) {
    try {
      await apiFetch(`/api/agents/${agentId}/retargeting/${rule.id}`, {
        method: 'PATCH', body: JSON.stringify({ is_active: !rule.is_active }),
      })
      await load()
    } catch (e) { setPageErr((e as Error).message) }
  }

  async function deleteRule(ruleId: string) {
    if (!confirm('¿Eliminar esta regla y su historial?')) return
    try {
      await apiFetch(`/api/agents/${agentId}/retargeting/${ruleId}`, { method: 'DELETE' })
      showOk('Regla eliminada')
      await load()
    } catch (e) { setPageErr((e as Error).message) }
  }

  // ── Test run ──────────────────────────────────────────────────────────────

  async function runTest() {
    setTesting(true); setTestPreview(null); setTestDebug(null); setPageErr(null)
    try {
      const data = await apiFetch(`/api/agents/${agentId}/retargeting/test`, {
        method: 'POST', body: JSON.stringify({ send: false }),
      })
      setTestPreview(data.preview)
      setTestDebug(data.debug ?? null)
    } catch (e) { setPageErr((e as Error).message) }
    finally { setTesting(false) }
  }

  async function fireLive() {
    setFiring(true); setFireResult(null); setPageErr(null)
    try {
      const res = await fetch(`/api/agents/${agentId}/retargeting/test-fire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      setFireResult(data)
      if (data.success) await load()
    } catch (e) { setFireResult({ success: false, error: (e as Error).message }) }
    finally { setFiring(false) }
  }

  async function sendNow() {
    if (!confirm(`¿Enviar ${testPreview?.length} mensajes de retargeting ahora?`)) return
    setSending(true); setPageErr(null)
    try {
      const data = await apiFetch(`/api/agents/${agentId}/retargeting/test`, {
        method: 'POST', body: JSON.stringify({ send: true }),
      })
      showOk(`Enviado: ${data.report.sent} ok, ${data.report.failed} fallidos`)
      setTestPreview(null)
      await load()
    } catch (e) { setPageErr((e as Error).message) }
    finally { setSending(false) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const previewText = form.messages.find(m => m.text.trim())?.text ?? ''

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#04040F]">
      <Header
        title={agent?.name ? `${agent.name} — Retargeting` : 'Retargeting'}
        description="Mensajes automáticos cuando un lead deja de responder"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">

          {/* Breadcrumb */}
          <div className="flex items-center gap-3">
            <Link href="/agency/agents"
              className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" /> Agentes
            </Link>
            <span className="text-[#1A1A35]">/</span>
            <span className="text-sm text-white font-medium flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-orange-400" />
              {agent?.name ?? '…'} — Retargeting
            </span>
          </div>

          {/* Banners */}
          {pageErr && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/[0.07] px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{pageErr}</span>
              <button onClick={() => setPageErr(null)}><X className="h-4 w-4" /></button>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-xl border border-[#00E67A]/30 bg-[#00E67A]/[0.07] px-4 py-3 text-sm text-[#00E67A]">
              <CheckCircle className="h-4 w-4 shrink-0" /> {success}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-[#00D4AA] animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

              {/* ── LEFT: Rules + form ── */}
              <div className="space-y-4">

                {/* Rules list */}
                {rules.length === 0 && !showForm && (
                  <div className="rounded-xl border border-[#1A1A35] bg-[#080812] p-8 text-center">
                    <Zap className="h-8 w-8 text-[#1A1A35] mx-auto mb-2" />
                    <p className="text-sm text-[#64748B]">Sin reglas de retargeting</p>
                    <p className="text-xs text-[#3A3A5C] mt-1">Crea una regla para hacer seguimiento automático a leads silenciosos</p>
                  </div>
                )}

                {rules.map(rule => (
                  <div key={rule.id} className={cn(
                    'rounded-xl border bg-[#080812] overflow-hidden',
                    rule.is_active ? 'border-orange-500/20' : 'border-[#1A1A35]'
                  )}>
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1A1A35]">
                      <div className={cn('w-2 h-2 rounded-full shrink-0', rule.is_active ? 'bg-orange-400' : 'bg-[#3A3A5C]')} />
                      <span className="font-semibold text-white flex-1 truncate text-sm">{rule.name}</span>
                      <button onClick={() => toggleActive(rule)}
                        className={cn('shrink-0 transition-colors', rule.is_active ? 'text-orange-400 hover:text-orange-300' : 'text-[#3A3A5C] hover:text-[#64748B]')}>
                        {rule.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                      </button>
                      <button onClick={() => openEdit(rule)} className="text-[#64748B] hover:text-white transition-colors text-xs">
                        Editar
                      </button>
                      <button onClick={() => deleteRule(rule.id)} className="text-[#3A3A5C] hover:text-red-400 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      <div className="flex items-center gap-4 text-xs text-[#64748B]">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {rule.delay_minutes} min de silencio
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {rule.messages.length} mensaje{rule.messages.length !== 1 ? 's' : ''}
                        </span>
                        <span>{rule.message_strategy === 'random' ? 'aleatorio' : 'secuencial'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {rule.apply_to_channels.map(ch => (
                          <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded border border-[#1A1A35] text-[#64748B]">
                            {CH_EMOJI[ch]} {ch}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-[#3A3A5C]">
                        Máx {rule.max_retargeting_per_conversation} seguimientos · cooldown {rule.min_hours_between_retargeting}h
                      </div>
                    </div>
                  </div>
                ))}

                {/* New rule button */}
                {!showForm && (
                  <button onClick={() => openCreate(rules.length)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/[0.04] hover:bg-orange-500/[0.08] text-orange-400 font-semibold py-2.5 text-sm transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Nueva regla
                  </button>
                )}

                {/* Rule form */}
                {showForm && (
                  <div className="rounded-xl border border-[#00D4AA]/30 bg-[#080812] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A35]">
                      <p className="text-sm font-semibold text-white">
                        {editingId ? 'Editar regla' : 'Nueva regla'}
                      </p>
                      <button onClick={closeForm} className="text-[#64748B] hover:text-white transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Name */}
                      <div>
                        <label className="text-xs text-[#64748B] mb-1.5 block">Nombre</label>
                        <input
                          value={form.name}
                          onChange={e => setField('name', e.target.value)}
                          className="w-full rounded-xl bg-[#0D0D1F] border border-[#1A1A35] px-3 py-2 text-sm text-white placeholder-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]/50"
                        />
                      </div>

                      {/* Delay */}
                      <div>
                        <label className="text-xs text-[#64748B] mb-1.5 block">
                          Esperar <span className="text-orange-400 font-semibold">{form.delay_minutes} minutos</span> de silencio antes de enviar
                        </label>
                        <input
                          type="range" min={1} max={120} step={1}
                          value={form.delay_minutes}
                          onChange={e => setField('delay_minutes', Number(e.target.value))}
                          className="w-full accent-orange-400"
                        />
                        <div className="flex justify-between text-[10px] text-[#3A3A5C] mt-1">
                          <span>1 min</span><span>30 min</span><span>1 hora</span><span>2 horas</span>
                        </div>
                      </div>

                      {/* Channels */}
                      <div>
                        <label className="text-xs text-[#64748B] mb-2 block">Aplicar en canales</label>
                        <div className="flex gap-2 flex-wrap">
                          {CHANNELS.map(ch => (
                            <button key={ch} onClick={() => toggleChannel(ch)}
                              className={cn(
                                'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                                form.apply_to_channels.includes(ch)
                                  ? 'border-orange-500/40 bg-orange-500/10 text-orange-400'
                                  : 'border-[#1A1A35] text-[#64748B] hover:border-[#2A2A45]'
                              )}>
                              {CH_EMOJI[ch]} {ch}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Strategy */}
                      <div>
                        <label className="text-xs text-[#64748B] mb-2 block">Estrategia de mensajes</label>
                        <div className="flex gap-2">
                          {(['random', 'sequential'] as const).map(s => (
                            <button key={s} onClick={() => setField('message_strategy', s)}
                              className={cn(
                                'flex-1 text-xs py-1.5 rounded-lg border transition-colors',
                                form.message_strategy === s
                                  ? 'border-[#00D4AA]/40 bg-[#00D4AA]/10 text-[#00D4AA]'
                                  : 'border-[#1A1A35] text-[#64748B] hover:border-[#2A2A45]'
                              )}>
                              {s === 'random' ? '🎲 Aleatorio' : '📋 Secuencial'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* ── Template picker ────────────────────────────────── */}
                      <div>
                        <label className="text-xs text-[#64748B] mb-2 flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3 text-[#00D4AA]" />
                          Elige un estilo de mensajes
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {TEMPLATE_KEYS.map(key => {
                            const tpl = RETARGETING_TEMPLATES[key]
                            const active = selectedTpl === key
                            return (
                              <button
                                key={key}
                                onClick={() => applyTemplate(key)}
                                className={cn(
                                  'relative text-left rounded-xl border p-3 transition-all',
                                  active
                                    ? 'border-[#00D4AA]/50 bg-[#00D4AA]/[0.06]'
                                    : 'border-[#1A1A35] bg-[#0D0D1F] hover:border-[#2A2A45]'
                                )}
                              >
                                {active && (
                                  <span className="absolute top-2 right-2 text-[#00D4AA]">
                                    <CheckCircle className="h-3 w-3" />
                                  </span>
                                )}
                                <p className="text-sm mb-0.5">{tpl.icon} <span className={cn('font-semibold text-xs', active ? 'text-[#00D4AA]' : 'text-white')}>{tpl.name}</span></p>
                                <p className="text-[10px] text-[#64748B] leading-snug">{tpl.description}</p>
                                <p className={cn('text-[10px] mt-1.5 font-medium transition-colors', active ? 'text-[#00D4AA]' : 'text-[#3A3A5C]')}>
                                  {active ? '✓ Aplicado' : 'Usar estos →'}
                                </p>
                              </button>
                            )
                          })}
                        </div>

                        {tplJustApplied && (
                          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#00D4AA]">
                            <CheckCircle className="h-3 w-3" />
                            Plantilla aplicada — puedes editar los mensajes si quieres
                          </div>
                        )}
                      </div>

                      {/* Divider */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 border-t border-[#1A1A35]" />
                        <span className="text-[10px] text-[#3A3A5C] whitespace-nowrap">o escribe tus propios mensajes</span>
                        <div className="flex-1 border-t border-[#1A1A35]" />
                      </div>

                      {/* Messages */}
                      <div>
                        <label className="text-xs text-[#64748B] mb-2 block">
                          Mensajes de seguimiento
                          <span className="text-[#3A3A5C] ml-1">(usa {'{nombre}'} para el nombre del contacto)</span>
                        </label>
                        <div className="space-y-2">
                          {form.messages.map((msg, i) => (
                            <div key={msg.id} className="flex gap-2">
                              <span className="text-xs text-[#3A3A5C] w-4 shrink-0 mt-2.5">{i + 1}.</span>
                              <textarea
                                rows={2}
                                placeholder="Hola {nombre}, ¿sigues interesado? Te puedo ayudar con cualquier duda."
                                value={msg.text}
                                onChange={e => updateMessage(msg.id, e.target.value)}
                                className="flex-1 rounded-xl bg-[#0D0D1F] border border-[#1A1A35] px-3 py-2 text-sm text-white placeholder-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]/50 resize-none"
                              />
                              {form.messages.length > 1 && (
                                <button onClick={() => removeMessage(msg.id)}
                                  className="text-[#3A3A5C] hover:text-red-400 transition-colors mt-1 shrink-0">
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button onClick={addMessage}
                            className="flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#00D4AA] transition-colors">
                            <Plus className="h-3 w-3" /> Agregar mensaje
                          </button>
                        </div>
                      </div>

                      {/* Limits row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[#64748B] mb-1.5 block">Máx. seguimientos por conv.</label>
                          <input type="number" min={1} max={10}
                            value={form.max_retargeting_per_conversation}
                            onChange={e => setField('max_retargeting_per_conversation', Number(e.target.value))}
                            className="w-full rounded-xl bg-[#0D0D1F] border border-[#1A1A35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00D4AA]/50"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#64748B] mb-1.5 block">Cooldown entre envíos (h)</label>
                          <input type="number" min={1} max={168}
                            value={form.min_hours_between_retargeting}
                            onChange={e => setField('min_hours_between_retargeting', Number(e.target.value))}
                            className="w-full rounded-xl bg-[#0D0D1F] border border-[#1A1A35] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00D4AA]/50"
                          />
                        </div>
                      </div>

                      {/* Is active */}
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm text-[#64748B]">Activar inmediatamente</span>
                        <button onClick={() => setField('is_active', !form.is_active)}
                          className={cn('transition-colors', form.is_active ? 'text-[#00D4AA]' : 'text-[#3A3A5C]')}>
                          {form.is_active ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                        </button>
                      </div>

                      {/* Save */}
                      <Button onClick={saveRule} disabled={saving}
                        className="w-full bg-[#00D4AA] text-black font-bold h-10 disabled:opacity-40 gap-2">
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {saving ? 'Guardando...' : (editingId ? 'Guardar cambios' : 'Crear regla')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── RIGHT: Preview (when form open) + Simulator + Log ── */}
              <div className="space-y-4">

                {/* Message preview card — visible while form is open */}
                {showForm && (
                  <div className="rounded-xl border border-[#1A1A35] bg-[#080812] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#1A1A35] flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-[#64748B]" />
                      <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Vista previa</p>
                    </div>
                    <div className="p-4">
                      {previewText ? (
                        <div className="space-y-2">
                          <p className="text-[11px] text-[#64748B]">
                            💬 Así recibirá el mensaje <span className="text-white font-semibold">Felipe</span>:
                          </p>
                          <div className="rounded-2xl rounded-tl-sm bg-[#1A1A35] px-4 py-3 max-w-xs">
                            <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">
                              {previewMessage(previewText)}
                            </p>
                          </div>
                          {form.messages.filter(m => m.text.trim()).length > 1 && (
                            <p className="text-[10px] text-[#3A3A5C]">
                              + {form.messages.filter(m => m.text.trim()).length - 1} mensaje{form.messages.filter(m => m.text.trim()).length > 2 ? 's' : ''} más en rotación
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-6">
                          <p className="text-xs text-[#3A3A5C]">Elige una plantilla o escribe un mensaje para ver la vista previa</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Simulator */}
                <div className="rounded-xl border border-[#1A1A35] bg-[#080812] overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#1A1A35] flex items-center gap-2">
                    <Play className="h-3.5 w-3.5 text-[#00D4AA]" />
                    <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Simulador</p>
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="text-xs text-[#64748B]">
                      Detecta conversaciones silenciosas ahora mismo y previsualiza qué mensajes se enviarían.
                    </p>

                    {/* Simulate button */}
                    <Button onClick={runTest} disabled={testing || !rules.some(r => r.is_active)}
                      className="w-full bg-[#0D0D1F] border border-[#1A1A35] hover:border-[#00D4AA]/40 text-[#00D4AA] font-semibold h-9 text-sm gap-2 disabled:opacity-40">
                      {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      {testing ? 'Analizando...' : 'Simular ahora'}
                    </Button>

                    {/* Test-fire button */}
                    <Button onClick={fireLive} disabled={firing || !rules.some(r => r.is_active)}
                      className="w-full bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-400 font-semibold h-9 text-sm gap-2 disabled:opacity-40">
                      {firing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
                      {firing ? 'Enviando...' : '🔥 Enviar prueba real a Messenger'}
                    </Button>

                    {/* Test-fire result */}
                    {fireResult !== null && (
                      <div className={cn(
                        'rounded-xl border p-3 space-y-2',
                        fireResult.success
                          ? 'border-[#00E67A]/30 bg-[#00E67A]/[0.06]'
                          : 'border-red-500/30 bg-red-500/[0.06]'
                      )}>
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn('text-xs font-semibold leading-snug', fireResult.success ? 'text-[#00E67A]' : 'text-red-400')}>
                            {fireResult.success
                              ? '✅ Mensaje enviado'
                              : fireResult.error === 'WINDOW_EXPIRED'
                                ? '⏱ Ventana de 24h expirada'
                                : fireResult.error === 'TOKEN_EXPIRED'
                                  ? '🔑 Token expirado'
                                  : '✗ Error al enviar'}
                          </p>
                          <button onClick={() => setFireResult(null)} className="text-[#3A3A5C] hover:text-[#64748B] shrink-0 mt-0.5">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {fireResult.success ? (
                          <div className="space-y-1 text-[11px] text-[#94A3B8]">
                            <p>
                              <span className="text-white font-medium">{fireResult.recipient_name}</span>
                              {' '}via{' '}
                              <span className="text-white">{CH_EMOJI[fireResult.channel ?? ''] ?? '📱'} {fireResult.channel}</span>
                            </p>
                            <p className="italic">"{fireResult.message_sent}"</p>
                            {(() => {
                              const mid = (fireResult.messenger_response as Record<string, unknown>)?.message_id
                              return mid ? <p className="text-[#3A3A5C]">ID: {String(mid)}</p> : null
                            })()}
                          </div>
                        ) : fireResult.error === 'WINDOW_EXPIRED' ? (
                          <div className="space-y-2 text-[11px]">
                            <p className="text-[#94A3B8] leading-relaxed">
                              Facebook bloquea mensajes a usuarios que no han escrito en las últimas 24 horas.
                            </p>
                            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                              <p className="text-amber-400 font-semibold text-[10px] uppercase tracking-wider mb-1">Solución</p>
                              <p className="text-amber-300 leading-relaxed">
                                Pide al lead que envíe cualquier mensaje por Facebook Messenger → espera 1 minuto → haz click en 🔥 de nuevo.
                              </p>
                            </div>
                            {fireResult.meta_error && (
                              <p className="text-[#3A3A5C] font-mono text-[10px] break-all">{String(fireResult.meta_error)}</p>
                            )}
                          </div>
                        ) : fireResult.error === 'TOKEN_EXPIRED' ? (
                          <div className="space-y-1.5 text-[11px]">
                            <p className="text-[#94A3B8]">El token de acceso de Facebook ha expirado o fue revocado.</p>
                            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                              <p className="text-red-300 leading-relaxed">
                                Ve a <span className="font-semibold text-white">Canales → Facebook → Reconectar</span> para generar un nuevo token.
                              </p>
                            </div>
                            {fireResult.action && (
                              <p className="text-[#64748B]">{fireResult.action}</p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1 text-[11px]">
                            <p className="text-red-300 break-all">{fireResult.error}</p>
                            {fireResult.detail && <p className="text-[#64748B]">{fireResult.detail}</p>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Simulate results */}
                    {testPreview !== null && (
                      <div className="space-y-2 pt-1">
                        {testPreview.length === 0 ? (
                          <div className="space-y-2">
                            <div className="text-center py-3">
                              <p className="text-sm text-[#64748B] font-medium">Sin leads silenciosos ahora</p>
                            </div>

                            {/* Debug panel */}
                            {testDebug && (
                              <div className="rounded-xl border border-[#1A1A35] bg-[#0A0A1A] p-3 space-y-2">
                                <div className="flex items-center gap-1.5 text-[#64748B]">
                                  <Info className="h-3 w-3 shrink-0" />
                                  <p className="text-[10px] font-semibold uppercase tracking-wider">Diagnóstico</p>
                                </div>

                                <p className="text-xs text-[#94A3B8] leading-relaxed">{testDebug.reason}</p>

                                {testDebug.nearest && (
                                  <div className="space-y-1 pt-1 border-t border-[#1A1A35]">
                                    <p className="text-[10px] text-[#3A3A5C] font-semibold uppercase tracking-wider">Conversación más reciente</p>
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="text-white font-medium">{testDebug.nearest.contactName}</span>
                                      <span className="text-[#64748B]">{CH_EMOJI[testDebug.nearest.channelType] ?? '📱'} {testDebug.nearest.channelType}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[11px] text-[#64748B]">
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        Silencio: <span className="text-white ml-0.5">{testDebug.nearest.minutesSilent} min</span>
                                      </span>
                                      <span>Último: <span className={cn(testDebug.nearest.lastRole === 'user' ? 'text-[#00D4AA]' : 'text-orange-400')}>{testDebug.nearest.lastRole === 'user' ? 'usuario' : 'bot'}</span></span>
                                    </div>
                                    {testDebug.activeRuleDelay !== null && testDebug.nearest.minutesUntilReady > 0 && (
                                      <div className="flex items-center gap-2 mt-1">
                                        <div className="flex-1 h-1 rounded-full bg-[#1A1A35] overflow-hidden">
                                          <div
                                            className="h-full bg-orange-400/60 rounded-full transition-all"
                                            style={{ width: `${Math.min(100, (testDebug.nearest.minutesSilent / testDebug.activeRuleDelay) * 100)}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] text-orange-400 shrink-0">
                                          {testDebug.nearest.minutesUntilReady} min más
                                        </span>
                                      </div>
                                    )}
                                    {testDebug.nearest.minutesUntilReady === 0 && testDebug.nearest.lastRole === 'user' && (
                                      <p className="text-[10px] text-[#00D4AA]">
                                        ✓ Cumple el tiempo — usa "🔥 Enviar prueba real" para forzar el envío
                                      </p>
                                    )}
                                  </div>
                                )}

                                {testDebug.totalConversations === 0 && (
                                  <p className="text-[10px] text-[#3A3A5C]">
                                    El agente no tiene conversaciones de redes sociales aún.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-orange-400 font-semibold">
                                {testPreview.length} conversación{testPreview.length !== 1 ? 'es' : ''} encontrada{testPreview.length !== 1 ? 's' : ''}
                              </p>
                              <button onClick={() => setTestPreview(null)} className="text-[#3A3A5C] hover:text-[#64748B]">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {testPreview.map((item, i) => (
                                <div key={i} className="rounded-lg border border-[#1A1A35] bg-[#0D0D1F] p-3 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#1A1A35] text-[#64748B]">
                                      {CH_EMOJI[item.channelType]} {item.channelType}
                                    </span>
                                    <span className="text-xs text-white font-medium">{item.contactName ?? 'Sin nombre'}</span>
                                    <span className="text-[10px] text-[#3A3A5C] ml-auto">
                                      silencio {item.timeSilentMinutes}m · follow-up #{item.retargetingCount + 1}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#94A3B8] italic">"{item.message}"</p>
                                </div>
                              ))}
                            </div>
                            <Button onClick={sendNow} disabled={sending}
                              className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bold h-9 text-sm gap-2 disabled:opacity-40">
                              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                              {sending ? 'Enviando...' : `Enviar ${testPreview.length} mensaje${testPreview.length !== 1 ? 's' : ''} ahora`}
                            </Button>
                          </>
                        )}
                      </div>
                    )}

                    {!rules.some(r => r.is_active) && (
                      <p className="text-[11px] text-[#3A3A5C] text-center">Activa al menos una regla para usar el simulador</p>
                    )}
                  </div>
                </div>

                {/* Activity log */}
                <div className="rounded-xl border border-[#1A1A35] bg-[#080812] overflow-hidden">
                  <button
                    onClick={() => setExpandedLog(p => !p)}
                    className="w-full flex items-center gap-2 px-4 py-3 border-b border-[#1A1A35] hover:bg-white/[0.02] transition-colors">
                    <RefreshCw className="h-3.5 w-3.5 text-[#64748B]" />
                    <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider flex-1 text-left">
                      Historial de envíos {logs.length > 0 ? `(${logs.length})` : ''}
                    </p>
                    {expandedLog
                      ? <ChevronUp className="h-3.5 w-3.5 text-[#3A3A5C]" />
                      : <ChevronDown className="h-3.5 w-3.5 text-[#3A3A5C]" />
                    }
                  </button>
                  {expandedLog && (
                    <div className="divide-y divide-[#1A1A35]">
                      {logs.length === 0 ? (
                        <p className="text-xs text-[#3A3A5C] text-center py-6">Sin envíos registrados todavía</p>
                      ) : (
                        logs.map(log => (
                          <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                            <span className={cn(
                              'mt-0.5 shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-semibold',
                              log.status === 'sent'
                                ? 'border-[#00E67A]/20 bg-[#00E67A]/10 text-[#00E67A]'
                                : 'border-red-500/20 bg-red-500/10 text-red-400'
                            )}>
                              {log.status === 'sent' ? '✓' : '✗'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[10px] text-[#64748B]">{CH_EMOJI[log.channel_type]} {log.channel_type}</span>
                                <span className="text-[10px] text-[#3A3A5C] ml-auto">{timeAgo(log.sent_at)}</span>
                              </div>
                              <p className="text-xs text-[#94A3B8] truncate italic">"{log.message_sent}"</p>
                              {log.error_message && (
                                <p className="text-[10px] text-red-400 mt-0.5">{log.error_message}</p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
