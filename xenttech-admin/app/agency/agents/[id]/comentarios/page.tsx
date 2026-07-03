"use client"
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { Header } from "@/components/layout/header"
import { Loader2, MessageSquare, ToggleLeft, ToggleRight, CheckCircle2, AlertTriangle } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommentRule {
  id: string
  agent_id: string
  channel_id: string | null
  is_active: boolean
  reply_to_ads: boolean
  reply_to_organic: boolean
}

interface CommentLog {
  id: string
  post_id: string | null
  comment_id: string
  commenter_name: string | null
  comment_text: string | null
  reply_text: string | null
  status: string
  error_message: string | null
  created_at: string
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        'flex items-center justify-between w-full p-4 rounded-xl border transition-all text-left',
        checked
          ? 'border-[#00D4AA]/30 bg-[#00D4AA]/[0.04]'
          : 'border-[#1A1A35] bg-[#080812]',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/[0.12] cursor-pointer'
      )}
    >
      <div>
        <p className={cn('text-sm font-semibold', checked ? 'text-white' : 'text-[#64748B]')}>{label}</p>
        {description && <p className="text-xs text-[#3A3A5C] mt-0.5">{description}</p>}
      </div>
      {checked
        ? <ToggleRight className="h-6 w-6 text-[#00D4AA] shrink-0" />
        : <ToggleLeft  className="h-6 w-6 text-[#3A3A5C]  shrink-0" />}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ComentariosPage() {
  const { id: agentId } = useParams<{ id: string }>()

  const [rule,    setRule]    = useState<CommentRule | null>(null)
  const [logs,    setLogs]    = useState<CommentLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/agents/${agentId}/comment-rules`)
      const json = await res.json()
      setRule(json.rule ?? null)
      setLogs(json.logs ?? [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => { load() }, [load])

  async function patch(updates: Partial<CommentRule>) {
    setSaving(true)
    setMsg(null)
    try {
      const current = rule ?? { is_active: false, reply_to_ads: true, reply_to_organic: true, channel_id: null }
      const res  = await fetch(`/api/agents/${agentId}/comment-rules`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...current, ...updates }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error')
      setRule(json.rule)
      setMsg({ ok: true, text: 'Guardado ✓' })
      await load()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Comentarios IA" description="Respuesta automática de comentarios" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-[#64748B] animate-spin" />
        </div>
      </div>
    )
  }

  const isActive         = rule?.is_active         ?? false
  const replyToAds       = rule?.reply_to_ads       ?? true
  const replyToOrganic   = rule?.reply_to_organic   ?? true

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Comentarios IA"
        description="El agente responde automáticamente a comentarios de Facebook/Instagram"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Beta warning ── */}
        <div className="flex items-start gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/[0.06] px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-400 leading-relaxed">
            <span className="font-bold">Función en modo prueba</span> — Meta está revisando los permisos.
            Por ahora solo funciona si tu cuenta de Facebook tiene acceso de tester en la app.
            Una vez aprobado, funcionará para todos los clientes automáticamente.
          </p>
        </div>

        {/* ── Status card ── */}
        <div className={cn(
          'rounded-xl border p-5 flex items-center gap-4',
          isActive
            ? 'border-[#00D4AA]/30 bg-[#00D4AA]/[0.04]'
            : 'border-[#1A1A35] bg-[#0D0D1F]'
        )}>
          <div className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0',
            isActive ? 'bg-[#00D4AA]/10' : 'bg-[#1A1A35]'
          )}>
            💬
          </div>
          <div className="flex-1">
            <p className={cn('font-bold', isActive ? 'text-[#00D4AA]' : 'text-[#64748B]')}>
              {isActive ? 'Respuesta automática ACTIVA' : 'Respuesta automática INACTIVA'}
            </p>
            <p className="text-xs text-[#3A3A5C] mt-0.5">
              {isActive
                ? 'El agente responde comentarios usando su personalidad configurada'
                : 'Activa la respuesta para que el agente conteste comentarios automáticamente'}
            </p>
          </div>
          <div className={cn(
            'text-xs font-bold px-3 py-1 rounded-full border',
            isActive
              ? 'text-[#00D4AA] border-[#00D4AA]/30 bg-[#00D4AA]/10'
              : 'text-[#3A3A5C] border-[#1A1A35] bg-[#080812]'
          )}>
            {isActive ? '● Activo' : '○ Inactivo'}
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[#3A3A5C] uppercase tracking-wider">Configuración</p>

          <Toggle
            checked={isActive}
            onChange={v => patch({ is_active: v })}
            label="Activar respuesta automática"
            description="El agente analizará y responderá cada nuevo comentario"
            disabled={saving}
          />

          <Toggle
            checked={replyToAds}
            onChange={v => patch({ reply_to_ads: v })}
            label="Responder comentarios en anuncios"
            description="Comentarios en publicaciones promocionadas de Meta Ads"
            disabled={saving || !isActive}
          />

          <Toggle
            checked={replyToOrganic}
            onChange={v => patch({ reply_to_organic: v })}
            label="Responder comentarios en posts orgánicos"
            description="Comentarios en publicaciones normales de tu página"
            disabled={saving || !isActive}
          />
        </div>

        {/* Save feedback */}
        {msg && (
          <div className={cn(
            'flex items-center gap-2 text-sm px-4 py-3 rounded-xl border',
            msg.ok
              ? 'text-[#00D4AA] border-[#00D4AA]/20 bg-[#00D4AA]/[0.04]'
              : 'text-red-400 border-red-500/20 bg-red-500/[0.04]'
          )}>
            {msg.ok && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {msg.text}
          </div>
        )}

        {/* ── Info box ── */}
        <div className="rounded-xl border border-blue-500/15 bg-blue-500/[0.03] p-4 space-y-1.5">
          <p className="text-xs font-semibold text-blue-400">¿Cómo funciona?</p>
          <ul className="text-xs text-[#64748B] space-y-1">
            <li>• Cuando alguien comenta en tu página, el agente lo detecta vía webhook</li>
            <li>• Genera una respuesta corta (1-2 oraciones) usando la personalidad del agente</li>
            <li>• Si el comentario parece una consulta, invita al usuario a escribir por DM</li>
            <li>• Nunca responde dos veces al mismo comentario</li>
          </ul>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <p className="text-[11px] text-[#3A3A5C]">Requiere Facebook conectado.</p>
            <a
              href="../"
              className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 border border-blue-500/20 bg-blue-500/[0.06] px-2 h-5 rounded transition-colors"
            >
              Ir a Canales →
            </a>
            <a
              href="https://developers.facebook.com/apps/1582783749449013/webhooks/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-[#64748B] hover:text-white border border-white/[0.06] px-2 h-5 rounded transition-colors"
            >
              Meta Webhooks →
            </a>
            <a
              href="https://vercel.com/felipe44444444444s-projects/xenttech-admin/logs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-[#64748B] hover:text-white border border-white/[0.06] px-2 h-5 rounded transition-colors"
            >
              Vercel Logs →
            </a>
          </div>
        </div>

        {/* ── Recent comments ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#3A3A5C] uppercase tracking-wider">
              Últimos comentarios respondidos
            </p>
            <span className="text-[11px] text-[#3A3A5C]">{logs.length} registros</span>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-xl border border-[#1A1A35] p-8 text-center">
              <MessageSquare className="h-8 w-8 text-[#1A1A35] mx-auto mb-2" />
              <p className="text-sm text-[#3A3A5C]">Sin comentarios respondidos todavía</p>
              <p className="text-xs text-[#1A1A35] mt-1">
                Activa la función y aparecerán aquí
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#1A1A35] overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr_1fr_100px] bg-[#080812] border-b border-[#1A1A35]">
                {['Comentario', 'Respuesta IA', 'Usuario', 'Fecha'].map(h => (
                  <div key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#3A3A5C]">
                    {h}
                  </div>
                ))}
              </div>
              {logs.map(log => (
                <div key={log.id} className="grid grid-cols-[1fr_1fr_1fr_100px] border-b border-[#1A1A35] hover:bg-[#0D0D1F]/40 transition-colors">
                  <div className="px-3 py-3">
                    <p className="text-xs text-[#94A3B8] line-clamp-2">
                      {log.comment_text ?? '—'}
                    </p>
                    {log.post_id && (
                      <p className="text-[10px] text-[#3A3A5C] font-mono mt-0.5">
                        Post: {log.post_id.slice(-12)}
                      </p>
                    )}
                  </div>
                  <div className="px-3 py-3">
                    <p className={cn(
                      'text-xs line-clamp-2',
                      log.status === 'sent' ? 'text-[#00D4AA]' : 'text-red-400'
                    )}>
                      {log.reply_text ?? log.error_message ?? '—'}
                    </p>
                  </div>
                  <div className="px-3 py-3 flex items-center">
                    <span className="text-xs text-[#64748B]">{log.commenter_name ?? 'Anónimo'}</span>
                  </div>
                  <div className="px-3 py-3 flex items-center">
                    <span className="text-[11px] text-[#3A3A5C]">
                      {new Date(log.created_at).toLocaleString('es-MX', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
