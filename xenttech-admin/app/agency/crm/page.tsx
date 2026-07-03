"use client"
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from "react"
import { Header } from "@/components/layout/header"
import { cn } from "@/lib/utils"
import {
  Loader2, X, Flame, RefreshCw, ChevronDown, MessageSquare,
  Phone, User, CheckCircle2, XCircle, TrendingUp, Clock,
  Users, Zap,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConvMsg {
  role: string
  content: string
  timestamp?: string
  retargeting?: boolean
}

interface CRMRow {
  conversationId: string
  agentId: string
  agentName: string | null
  contactId: string | null
  contactName: string | null
  contactPhone: string | null
  channelType: string
  lastActivity: string
  createdAt: string
  retargetingCount: number
  lastRetargetingAt: string | null
  lastRetargetingMessage: string | null
  leadId: string | null
  leadStatus: string | null
  leadNombre: string | null
  leadTelefono: string | null
  messages: ConvMsg[]
}

interface Agent { id: string; name: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_RETARGETING = 3

const CH_EMOJI: Record<string, string> = {
  facebook: '📘', instagram: '📷', whatsapp: '💚', web: '🌐',
}

const LEAD_STATUSES: Record<string, { label: string; cls: string; dot: string }> = {
  nuevo:      { label: 'Sin contactar',       cls: 'bg-[#1A1A35] text-[#64748B] border-[#1A1A35]',         dot: 'bg-[#3A3A5C]' },
  contactado: { label: 'Contactado',          cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',       dot: 'bg-blue-400' },
  calificado: { label: 'Calificado',          cls: 'bg-[#00D4AA]/10 text-[#00D4AA] border-[#00D4AA]/20',   dot: 'bg-[#00D4AA]' },
  convertido: { label: '✓ Convertido',        cls: 'bg-[#00E67A]/10 text-[#00E67A] border-[#00E67A]/20',   dot: 'bg-[#00E67A]' },
  agotado:          { label: '⚰ Agotado (3/3)',      cls: 'bg-red-500/10 text-red-400 border-red-500/20',          dot: 'bg-red-400' },
  perdido:          { label: '✗ Perdido',            cls: 'bg-red-900/20 text-red-600 border-red-900/20',          dot: 'bg-red-700' },
  window_expired:   { label: 'Ventana 24h vencida',  cls: 'bg-[#1A1A35] text-[#3A3A5C] border-[#1A1A35]',         dot: 'bg-[#3A3A5C]' },
  failed_permanent: { label: '✗ Error de envío',     cls: 'bg-red-900/30 text-red-500 border-red-900/30',          dot: 'bg-red-600' },
}

function statusInfo(s: string | null) {
  return LEAD_STATUSES[s ?? ''] ?? { label: 'Sin lead', cls: 'bg-[#0D0D1F] text-[#3A3A5C] border-[#1A1A35]', dot: 'bg-[#1A1A35]' }
}

// ── Relative time (recalculated live) ─────────────────────────────────────────

function timeAgo(iso: string, _now: number): string {
  const diff = (_now - new Date(iso).getTime()) / 1000
  if (diff < 60)    return `${Math.round(diff)}s`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ${Math.round(diff % 60)}s`
  if (diff < 86400) {
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${Math.round(diff / 86400)}d`
}

// ── Retargeting progress dots ─────────────────────────────────────────────────

function RetargetingDots({ count, max = MAX_RETARGETING }: { count: number; max?: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'w-2 h-2 rounded-full transition-colors',
            i < count
              ? count >= max ? 'bg-red-400' : 'bg-orange-400'
              : 'bg-[#1A1A35]'
          )}
        />
      ))}
      <span className={cn(
        'ml-1 text-[10px] font-bold',
        count >= max ? 'text-red-400' : count > 0 ? 'text-orange-400' : 'text-[#3A3A5C]'
      )}>
        {count}/{max}
      </span>
    </div>
  )
}

// ── Cierre status badge ───────────────────────────────────────────────────────

function cierreStatus(row: CRMRow) {
  const hasName  = !!(row.leadNombre ?? row.contactName)
  const hasPhone = !!(row.leadTelefono ?? row.contactPhone)

  if (hasName && hasPhone) {
    return { icon: '🔥', label: 'Listo',      cls: 'text-orange-400 border-orange-400/30 bg-orange-400/10' }
  }
  if (hasName || hasPhone) {
    return { icon: '⏳', label: 'En proceso', cls: 'text-blue-400 border-blue-500/30 bg-blue-500/10' }
  }
  return { icon: '🤖', label: 'Bot activo',  cls: 'text-[#3A3A5C] border-[#1A1A35] bg-[#080812]' }
}

// ── Status dropdown ───────────────────────────────────────────────────────────

function StatusDropdown({
  leadId,
  current,
  onChange,
}: {
  leadId: string | null
  current: string | null
  onChange: (status: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const info = statusInfo(current)

  if (!leadId) {
    return (
      <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-semibold border', statusInfo(null).cls)}>
        Sin lead
      </span>
    )
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors',
          info.cls, 'hover:opacity-80'
        )}
      >
        {info.label}
        <ChevronDown className="h-2.5 w-2.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute z-20 left-0 top-full mt-1 w-40 rounded-xl bg-[#0D0D1F] border border-[#1A1A35] py-1 shadow-xl">
          {Object.entries(LEAD_STATUSES).map(([val, { label, cls }]) => (
            <button
              key={val}
              onClick={() => { onChange(val); setOpen(false) }}
              className={cn(
                'w-full text-left px-3 py-1.5 text-[11px] font-medium hover:bg-white/[0.04] transition-colors',
                val === current ? 'text-white' : 'text-[#64748B]'
              )}
            >
              <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] border', cls)}>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Conversation modal ────────────────────────────────────────────────────────

function ConvModal({ row, onClose }: { row: CRMRow; onClose: () => void }) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [row.messages])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const msgs = row.messages ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-[#080812] border border-[#1A1A35] flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-[#1A1A35] shrink-0">
          <div className="w-10 h-10 rounded-full bg-[#00D4AA]/10 flex items-center justify-center text-lg shrink-0">
            {CH_EMOJI[row.channelType] ?? '💬'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white truncate">{row.leadNombre ?? row.contactName ?? 'Sin nombre'}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-[#64748B] capitalize">{row.channelType}</span>
              {row.contactPhone && (
                <span className="text-xs text-[#64748B] font-mono">{row.contactPhone}</span>
              )}
              {row.agentName && (
                <span className="text-xs text-[#3A3A5C]">· {row.agentName}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-white transition-colors shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Lead info bar */}
        {(row.leadNombre || row.leadTelefono) && (
          <div className="px-5 py-3 border-b border-[#1A1A35] bg-[#00D4AA]/[0.04] flex items-center gap-4 flex-wrap shrink-0">
            {row.leadNombre && (
              <span className="flex items-center gap-1.5 text-xs text-[#00D4AA]">
                <User className="h-3 w-3" /> {row.leadNombre}
              </span>
            )}
            {row.leadTelefono && (
              <a
                href={`https://wa.me/${row.leadTelefono.replace(/\D/g, '')}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[#00D4AA] hover:underline"
              >
                <Phone className="h-3 w-3" /> {row.leadTelefono}
              </a>
            )}
            <span className={cn('ml-auto px-2 py-0.5 rounded-md text-[10px] font-semibold border', statusInfo(row.leadStatus).cls)}>
              {statusInfo(row.leadStatus).label}
            </span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {msgs.length === 0 ? (
            <p className="text-center text-[#3A3A5C] text-sm py-8">Sin mensajes registrados</p>
          ) : (
            msgs.map((msg, i) => (
              <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-[#00D4AA]/10 text-[#00D4AA] rounded-br-sm'
                    : msg.retargeting
                      ? 'bg-orange-500/10 text-orange-300 border border-orange-500/20 rounded-bl-sm'
                      : 'bg-white/[0.06] text-[#94A3B8] rounded-bl-sm'
                )}>
                  {msg.retargeting && (
                    <span className="text-[9px] font-bold text-orange-400 uppercase tracking-wider block mb-1">
                      ⚡ Retargeting IA
                    </span>
                  )}
                  {msg.content}
                  {msg.timestamp && (
                    <span className="block text-[9px] opacity-40 mt-1">
                      {new Date(msg.timestamp).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        {/* Retargeting summary */}
        {row.retargetingCount > 0 && (
          <div className="px-5 py-3 border-t border-[#1A1A35] bg-orange-500/[0.03] shrink-0">
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider">
                Retargeting — {row.retargetingCount}/{MAX_RETARGETING} enviado{row.retargetingCount !== 1 ? 's' : ''}
              </p>
              <RetargetingDots count={row.retargetingCount} />
            </div>
            {row.lastRetargetingAt && (
              <p className="text-[11px] text-[#64748B] mt-1">
                Último: {new Date(row.lastRetargetingAt).toLocaleString('es-MX')}
              </p>
            )}
            {row.lastRetargetingMessage && (
              <p className="text-[11px] text-[#94A3B8] mt-1 italic line-clamp-2">
                "{row.lastRetargetingMessage}"
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CRMPage() {
  const [rows,    setRows]    = useState<CRMRow[]>([])
  const [agents,  setAgents]  = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState<CRMRow | null>(null)
  const [firing,  setFiring]  = useState<string | null>(null)
  const [fireMsg, setFireMsg] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [now,     setNow]     = useState(Date.now())

  const [agentId,  setAgentId]  = useState('')
  const [status,   setStatus]   = useState('')
  const [channel,  setChannel]  = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  // Update live timestamps every 30s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (agentId)  qs.set('agentId',  agentId)
      if (status)   qs.set('status',   status)
      if (channel)  qs.set('channel',  channel)
      if (dateFrom) qs.set('dateFrom', dateFrom)
      if (dateTo)   qs.set('dateTo',   dateTo)
      qs.set('limit', '200')

      const res  = await fetch(`/api/crm/leads?${qs}`)
      const json = await res.json()
      setRows(json.data ?? [])
    } catch (e) {
      console.error('CRM load error', e)
    } finally {
      setLoading(false)
    }
  }, [agentId, status, channel, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/crm/agents')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAgents(data) })
      .catch(() => null)
  }, [])

  async function updateStatus(leadId: string, newStatus: string) {
    await fetch(`/api/crm/leads/${leadId}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: newStatus }),
    })
    setRows(prev => prev.map(r => r.leadId === leadId ? { ...r, leadStatus: newStatus } : r))
    if (modal?.leadId === leadId) setModal(m => m ? { ...m, leadStatus: newStatus } : m)
  }

  async function fireRetarget(conversationId: string) {
    setFiring(conversationId)
    setFireMsg(prev => { const n = { ...prev }; delete n[conversationId]; return n })
    try {
      const res  = await fetch(`/api/crm/${conversationId}/retarget`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setFireMsg(prev => ({ ...prev, [conversationId]: { ok: true, text: `Enviado: "${(data.message_sent as string)?.slice(0, 60)}…"` } }))
        await load()
      } else {
        setFireMsg(prev => ({ ...prev, [conversationId]: { ok: false, text: (data.error as string) ?? 'Error' } }))
      }
    } catch (e) {
      setFireMsg(prev => ({ ...prev, [conversationId]: { ok: false, text: (e as Error).message } }))
    } finally {
      setFiring(null)
    }
  }

  // ── KPI computation ──────────────────────────────────────────────────────────

  const today       = new Date().toDateString()
  const weekAgo     = Date.now() - 7 * 86400_000
  const totalActivos = rows.filter(r => !['perdido', 'agotado'].includes(r.leadStatus ?? '')).length
  const contactadosHoy = rows.filter(r =>
    r.retargetingCount > 0 &&
    r.lastRetargetingAt &&
    new Date(r.lastRetargetingAt).toDateString() === today
  ).length
  const contactados  = rows.filter(r => (r.retargetingCount ?? 0) > 0).length
  const convertidos  = rows.filter(r => r.leadStatus === 'convertido').length
  const tasaResp     = contactados > 0 ? Math.round((convertidos / contactados) * 100) : 0
  const perdidosSem  = rows.filter(r =>
    r.leadStatus === 'perdido' && new Date(r.lastActivity).getTime() > weekAgo
  ).length

  const inputCls  = "h-8 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-xs px-3 focus:outline-none focus:border-[#00D4AA]/40 placeholder-[#3A3A5C]"
  const selectCls = inputCls + " cursor-pointer"

  return (
    <div className="flex flex-col h-full">
      <Header
        title="CRM"
        description="Leads activos, seguimientos y conversaciones"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* ── KPI cards ── */}
        {!loading && rows.length > 0 && (
          <div className="grid grid-cols-4 gap-4">
            <KpiCard label="Leads activos"      value={totalActivos}   icon={Users}       color="text-[#00D4AA]" />
            <KpiCard label="Contactados hoy"     value={contactadosHoy} icon={Zap}         color="text-orange-400" sub="seguimiento enviado hoy" />
            <KpiCard label="Tasa de conversión"  value={`${tasaResp}%`} icon={TrendingUp}  color="text-blue-400"  sub={`${convertidos} convertidos / ${contactados} contactados`} />
            <KpiCard label="Perdidos esta semana" value={perdidosSem}   icon={XCircle}     color="text-red-400" />
          </div>
        )}

        {/* ── Filters ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <select value={agentId} onChange={e => setAgentId(e.target.value)} className={selectCls} style={{ width: 160 }}>
            <option value="">Todos los agentes</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          <select value={status} onChange={e => setStatus(e.target.value)} className={selectCls} style={{ width: 160 }}>
            <option value="">Todos los estados</option>
            {Object.entries(LEAD_STATUSES).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>

          <select value={channel} onChange={e => setChannel(e.target.value)} className={selectCls} style={{ width: 140 }}>
            <option value="">Todos los canales</option>
            {['facebook', 'instagram', 'whatsapp', 'web'].map(c => (
              <option key={c} value={c}>{CH_EMOJI[c]} {c}</option>
            ))}
          </select>

          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} style={{ width: 140 }} />
          <span className="text-[#3A3A5C] text-xs">—</span>
          <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className={inputCls} style={{ width: 140 }} />

          {(agentId || status || channel || dateFrom || dateTo) && (
            <button
              onClick={() => { setAgentId(''); setStatus(''); setChannel(''); setDateFrom(''); setDateTo('') }}
              className="text-xs text-[#64748B] hover:text-white h-8 px-2 rounded-lg border border-white/[0.06] hover:border-white/10 transition-colors"
            >
              Limpiar
            </button>
          )}

          <button onClick={load} className="ml-auto flex items-center gap-1.5 text-xs text-[#64748B] hover:text-white h-8 px-3 rounded-lg border border-white/[0.06] hover:border-white/10 transition-colors">
            <RefreshCw className="h-3 w-3" /> Actualizar
          </button>
        </div>

        {/* ── Status quick-filter pills ── */}
        {!loading && rows.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {Object.entries(LEAD_STATUSES).map(([val, { label, cls }]) => {
              const count = rows.filter(r => r.leadStatus === val).length
              if (!count) return null
              return (
                <button key={val} onClick={() => setStatus(status === val ? '' : val)}
                  className={cn(
                    'flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all',
                    cls, status === val ? 'ring-1 ring-white/20' : 'opacity-60 hover:opacity-100'
                  )}
                >
                  {count} {label}
                </button>
              )
            })}
            <span className="text-[11px] text-[#3A3A5C] ml-auto">{rows.length} conversaciones</span>
          </div>
        )}

        {/* ── Table ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 text-[#64748B] animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20">
            <MessageSquare className="h-12 w-12 text-[#64748B] mx-auto mb-3" />
            <p className="text-[#64748B]">Sin conversaciones para los filtros seleccionados</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#1A1A35] overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[2fr_80px_1fr_1fr_100px_1fr_90px_2fr_200px] gap-0 bg-[#080812] border-b border-[#1A1A35]">
              {['Lead', 'Canal', 'Agente', 'Sin respuesta', 'Seguim.', 'Estado', 'Cierre', 'Último mensaje IA', 'Acciones'].map(h => (
                <div key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#3A3A5C]">
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {rows.map(row => {
              const fm       = fireMsg[row.conversationId]
              const canFire  = row.retargetingCount < MAX_RETARGETING
              const displayName = row.leadNombre ?? row.contactName ?? 'Sin nombre'

              return (
                <div key={row.conversationId} className="group">
                  <div className="grid grid-cols-[2fr_80px_1fr_1fr_100px_1fr_90px_2fr_200px] gap-0 border-b border-[#1A1A35] hover:bg-[#0D0D1F]/60 transition-colors">

                    {/* Lead */}
                    <div className="px-3 py-3 flex items-center gap-2 min-w-0">
                      <div className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                        row.leadStatus === 'convertido' ? 'bg-[#00E67A]/10 text-[#00E67A]'
                          : row.leadStatus === 'perdido' || row.leadStatus === 'agotado' ? 'bg-red-500/10 text-red-400'
                          : 'bg-[#00D4AA]/10 text-[#00D4AA]'
                      )}>
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white truncate">{displayName}</p>
                        {(row.leadTelefono ?? row.contactPhone) && (
                          <p className="text-[10px] text-[#3A3A5C] font-mono truncate">
                            {row.leadTelefono ?? row.contactPhone}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Canal */}
                    <div className="px-3 py-3 flex items-center">
                      <span className="text-lg" title={row.channelType}>
                        {CH_EMOJI[row.channelType] ?? '📡'}
                      </span>
                    </div>

                    {/* Agente */}
                    <div className="px-3 py-3 flex items-center">
                      <span className="text-xs text-[#64748B] truncate">{row.agentName ?? '—'}</span>
                    </div>

                    {/* Sin respuesta (live) */}
                    <div className="px-3 py-3 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-[#3A3A5C] shrink-0" />
                      <span className={cn(
                        'text-xs font-mono',
                        now - new Date(row.lastActivity).getTime() > 3_600_000
                          ? 'text-orange-400'
                          : 'text-[#64748B]'
                      )}>
                        {timeAgo(row.lastActivity, now)}
                      </span>
                    </div>

                    {/* Seguimientos */}
                    <div className="px-3 py-3 flex items-center">
                      <RetargetingDots count={row.retargetingCount} />
                    </div>

                    {/* Estado */}
                    <div className="px-3 py-3 flex items-center">
                      <StatusDropdown
                        leadId={row.leadId}
                        current={row.leadStatus}
                        onChange={ns => updateStatus(row.leadId!, ns)}
                      />
                    </div>

                    {/* Cierre */}
                    {(() => {
                      const c = cierreStatus(row)
                      return (
                        <div className="px-3 py-3 flex items-center">
                          <span className={cn(
                            'flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border whitespace-nowrap',
                            c.cls
                          )}>
                            {c.icon} {c.label}
                          </span>
                        </div>
                      )
                    })()}

                    {/* Último mensaje IA */}
                    <div className="px-3 py-3 flex items-center min-w-0">
                      {row.lastRetargetingMessage ? (
                        <p className="text-[11px] text-[#64748B] line-clamp-2 italic">
                          "{row.lastRetargetingMessage}"
                        </p>
                      ) : (
                        <span className="text-[10px] text-[#3A3A5C]">Sin envíos</span>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="px-3 py-3 flex items-center gap-1">
                      {/* Contactar por WhatsApp */}
                      {(row.leadTelefono ?? row.contactPhone) ? (
                        <a
                          href={`https://wa.me/${(row.leadTelefono ?? row.contactPhone ?? '').replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Contactar por WhatsApp ahora"
                          className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#00D4AA]/20 text-[#00D4AA] bg-[#00D4AA]/[0.05] hover:bg-[#00D4AA]/15 transition-colors"
                        >
                          <Phone className="h-3 w-3" />
                        </a>
                      ) : (
                        <span
                          title="Sin teléfono capturado"
                          className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#1A1A35] text-[#1A1A35]"
                        >
                          <Phone className="h-3 w-3" />
                        </span>
                      )}

                      {/* Ver conversación */}
                      <button
                        onClick={() => setModal(row)}
                        title="Ver conversación"
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#1A1A35] text-[#64748B] hover:text-white hover:border-white/[0.12] bg-[#0D0D1F] transition-colors"
                      >
                        <MessageSquare className="h-3 w-3" />
                      </button>

                      {/* Forzar retargeting */}
                      <button
                        onClick={() => fireRetarget(row.conversationId)}
                        disabled={firing === row.conversationId || !canFire}
                        title={canFire ? 'Enviar retargeting IA ahora' : 'Máximo 3 seguimientos'}
                        className={cn(
                          'flex items-center justify-center w-7 h-7 rounded-lg border transition-colors',
                          !canFire
                            ? 'border-[#1A1A35] text-[#1A1A35] cursor-not-allowed'
                            : 'border-orange-500/20 text-orange-400 bg-orange-500/[0.05] hover:bg-orange-500/15'
                        )}
                      >
                        {firing === row.conversationId
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Flame className="h-3 w-3" />}
                      </button>

                      {/* Marcar convertido */}
                      <button
                        onClick={() => row.leadId && updateStatus(row.leadId, 'convertido')}
                        disabled={!row.leadId || row.leadStatus === 'convertido'}
                        title="Marcar como convertido"
                        className={cn(
                          'flex items-center justify-center w-7 h-7 rounded-lg border transition-colors',
                          !row.leadId || row.leadStatus === 'convertido'
                            ? 'border-[#1A1A35] text-[#1A1A35] cursor-not-allowed'
                            : 'border-[#00E67A]/20 text-[#00E67A] bg-[#00E67A]/[0.05] hover:bg-[#00E67A]/15'
                        )}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                      </button>

                      {/* Marcar perdido */}
                      <button
                        onClick={() => row.leadId && updateStatus(row.leadId, 'perdido')}
                        disabled={!row.leadId || row.leadStatus === 'perdido'}
                        title="Marcar como perdido"
                        className={cn(
                          'flex items-center justify-center w-7 h-7 rounded-lg border transition-colors',
                          !row.leadId || row.leadStatus === 'perdido'
                            ? 'border-[#1A1A35] text-[#1A1A35] cursor-not-allowed'
                            : 'border-red-500/20 text-red-400 bg-red-500/[0.05] hover:bg-red-500/15'
                        )}
                      >
                        <XCircle className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Fire result inline */}
                  {fm && (
                    <div className={cn(
                      'px-4 py-2 text-[11px] border-b border-[#1A1A35]',
                      fm.ok ? 'text-[#00E67A] bg-[#00E67A]/[0.04]' : 'text-red-400 bg-red-500/[0.04]'
                    )}>
                      {fm.ok ? '✓ ' : '✗ '}{fm.text}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && <ConvModal row={modal} onClose={() => setModal(null)} />}
    </div>
  )
}
