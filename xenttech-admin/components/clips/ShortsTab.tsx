"use client"
import { useEffect, useState } from "react"
import { Loader2, Plus, Trash2, Play, CheckSquare, Square, Sparkles, Download, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AiClip } from "./ClipCard"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Niche {
  id:               string
  agent_id:         string | null
  name:             string
  voice_id:         string | null
  voice_style:      string | null
  music_style:      string | null
  subtitle_style:   { color?: string; size?: number; position?: string } | null
  intro_template:   string | null
  outro_template:   string | null
  created_at:       string
}

interface AiShort {
  id:                string
  agent_id:          string | null
  niche_id:          string | null
  source_clips:      string[]
  script:            string | null
  hook:              string | null
  cta:               string | null
  subtitles_vtt_url: string | null
  voiceover_url:     string | null
  final_video_url:   string | null
  thumbnail_url:     string | null
  status:            'pending' | 'scripting' | 'voiceover' | 'merging' | 'composing' | 'ready' | 'published' | 'failed'
  duration_seconds:  number | null
  published_to:      string[]
  error_message:     string | null
  created_at:        string
  _phase?:           string
}

interface Props {
  readyClips: AiClip[]
  agents:     { id: string; name: string }[]
  agentId:    string
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending:   { label: 'Pendiente',   color: 'text-[#64748B]'    },
  scripting: { label: 'Guionando…',  color: 'text-purple-400'   },
  voiceover: { label: 'Generando voz…', color: 'text-blue-400'  },
  merging:   { label: 'Uniendo clips…', color: 'text-yellow-400'},
  composing: { label: 'Componiendo…',color: 'text-yellow-400'   },
  ready:     { label: 'Listo',       color: 'text-[#00D4AA]'    },
  published: { label: 'Publicado',   color: 'text-blue-400'     },
  failed:    { label: 'Error',       color: 'text-red-400'      },
} as const

const VOICE_STYLES = ['professional', 'energetic', 'calm', 'friendly', 'comico']
const DURATIONS    = [15, 30, 60]

// ── NicheModal ────────────────────────────────────────────────────────────────

const NICHE_QUICK_PRESETS: Record<string, { voice_style: string; intro_template: string; outro_template: string }> = {
  Inmobiliaria:   { voice_style: 'professional', intro_template: 'Descubre tu próximo hogar con nosotros…', outro_template: 'Agenda tu visita hoy — llámanos ahora.' },
  'Spa / Bienestar': { voice_style: 'calm',      intro_template: 'Un momento para ti…',                    outro_template: 'Reserva tu cita y regálate bienestar.'    },
  Restaurante:    { voice_style: 'friendly',     intro_template: 'Una experiencia gastronómica única…',     outro_template: 'Haz tu reservación hoy.'                  },
  Fitness:        { voice_style: 'energetic',    intro_template: '¿Listo para transformar tu vida?',        outro_template: 'Únete hoy y consigue tu primera clase gratis.' },
  'Datos Curiosos':{ voice_style: 'energetic',   intro_template: '¿Sabías que…?',                          outro_template: 'Síguenos para más datos increíbles.'       },
  'Punto de Venta':{ voice_style: 'professional',intro_template: 'Oferta exclusiva por tiempo limitado…',  outro_template: 'Visítanos o llámanos hoy mismo.'           },
}

function NicheModal({
  agentId, onSave, onClose,
}: { agentId: string; onSave: (n: Niche) => void; onClose: () => void }) {
  const [name,         setName]         = useState('')
  const [voiceId,      setVoiceId]      = useState('')
  const [voiceStyle,   setVoiceStyle]   = useState('professional')
  const [introTmpl,    setIntroTmpl]    = useState('')
  const [outroTmpl,    setOutroTmpl]    = useState('')
  const [saving,       setSaving]       = useState(false)
  const [err,          setErr]          = useState<string | null>(null)

  function applyPreset(key: string) {
    const p = NICHE_QUICK_PRESETS[key]
    if (!p) return
    setName(key)
    setVoiceStyle(p.voice_style)
    setIntroTmpl(p.intro_template)
    setOutroTmpl(p.outro_template)
  }

  async function save() {
    if (!name.trim()) { setErr('El nombre es requerido'); return }
    setSaving(true)
    setErr(null)
    try {
      const res  = await fetch('/api/niches', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id:       agentId,
          name:           name.trim(),
          voice_id:       voiceId.trim() || null,
          voice_style:    voiceStyle,
          intro_template: introTmpl.trim() || null,
          outro_template: outroTmpl.trim() || null,
        }),
      })
      const data = await res.json() as Niche & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
      onSave(data)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-[#1A1A35] bg-[#0D0D1F] p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Nuevo nicho</h3>
          <button onClick={onClose} className="text-[#64748B] hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        {err && <p className="text-xs text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">{err}</p>}

        <div className="space-y-3">
          {/* Presets rápidos */}
          <div>
            <label className="text-[10px] text-[#64748B] uppercase tracking-wider block mb-1.5">Cargar preset</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(NICHE_QUICK_PRESETS).map(k => (
                <button key={k} onClick={() => applyPreset(k)}
                  className="px-2 py-0.5 rounded-full text-[10px] border border-orange-500/30 text-orange-300 bg-orange-500/[0.06] hover:bg-orange-500/15 transition-colors">
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-[#64748B] uppercase tracking-wider block mb-1">Nombre *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Inmobiliaria, Spa, Datos curiosos…"
              className="w-full h-9 px-3 rounded-lg bg-[#080812] border border-[#1A1A35] text-white text-xs focus:outline-none focus:border-[#00D4AA]/40 placeholder-[#3A3A5C]" />
          </div>
          <div>
            <label className="text-[10px] text-[#64748B] uppercase tracking-wider block mb-1">ElevenLabs Voice ID</label>
            <input value={voiceId} onChange={e => setVoiceId(e.target.value)} placeholder="pNInz6obpgDQGcFmaJgB"
              className="w-full h-9 px-3 rounded-lg bg-[#080812] border border-[#1A1A35] text-white text-xs focus:outline-none focus:border-[#00D4AA]/40 placeholder-[#3A3A5C] font-mono" />
            <p className="text-[9px] text-[#3A3A5C] mt-0.5">Déjalo vacío para usar la voz por defecto</p>
          </div>
          <div>
            <label className="text-[10px] text-[#64748B] uppercase tracking-wider block mb-1">Estilo de voz</label>
            <div className="flex gap-1.5 flex-wrap">
              {VOICE_STYLES.map(s => (
                <button key={s} onClick={() => setVoiceStyle(s)}
                  className={cn('px-2.5 py-1 rounded-md text-[10px] font-medium border transition-colors capitalize',
                    voiceStyle === s
                      ? 'border-[#00D4AA]/40 bg-[#00D4AA]/10 text-[#00D4AA]'
                      : 'border-[#1A1A35] text-[#64748B] hover:text-white')}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[#64748B] uppercase tracking-wider block mb-1">Intro del nicho</label>
            <input value={introTmpl} onChange={e => setIntroTmpl(e.target.value)} placeholder="En Praderas del Real…"
              className="w-full h-9 px-3 rounded-lg bg-[#080812] border border-[#1A1A35] text-white text-xs focus:outline-none focus:border-[#00D4AA]/40 placeholder-[#3A3A5C]" />
          </div>
          <div>
            <label className="text-[10px] text-[#64748B] uppercase tracking-wider block mb-1">CTA del nicho</label>
            <input value={outroTmpl} onChange={e => setOutroTmpl(e.target.value)} placeholder="Llama al 614-227-8557"
              className="w-full h-9 px-3 rounded-lg bg-[#080812] border border-[#1A1A35] text-white text-xs focus:outline-none focus:border-[#00D4AA]/40 placeholder-[#3A3A5C]" />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-9 rounded-xl border border-white/[0.08] text-xs text-[#94A3B8] hover:text-white transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="flex-1 h-9 rounded-xl bg-[#00D4AA] text-black text-xs font-semibold hover:bg-[#00D4AA]/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Guardar nicho
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ShortCard ─────────────────────────────────────────────────────────────────

function ShortCard({ short, onDelete, onPublish, onPublishTikTok }: { short: AiShort; onDelete: () => void; onPublish: () => void; onPublishTikTok: () => void }) {
  const cfg = STATUS_CFG[short.status] ?? STATUS_CFG.pending
  const composing = ['scripting', 'voiceover', 'merging', 'composing'].includes(short.status)

  return (
    <div className={cn(
      'rounded-xl border bg-[#0D0D1F] overflow-hidden',
      short.status === 'failed'   ? 'border-red-500/20'   :
      short.status === 'ready'    ? 'border-[#00D4AA]/20' :
      composing                   ? 'border-yellow-500/20 animate-pulse' :
      'border-[#1A1A35]',
    )}>
      {/* Thumbnail / video con subtítulos integrados */}
      <div className="relative bg-black">
        {short.final_video_url ? (
          <video
            src={short.final_video_url}
            className="w-full aspect-[9/16] object-cover max-h-48"
            controls playsInline preload="metadata"
            onError={e => console.error('SHORT_VIDEO_ERROR', short.final_video_url, e)}
          >
            {short.subtitles_vtt_url && (
              <track
                kind="subtitles"
                src={short.subtitles_vtt_url}
                srcLang="es"
                label="Español"
                default
              />
            )}
          </video>
        ) : (
          <div className="w-full aspect-[9/16] max-h-48 flex items-center justify-center bg-[#080812]">
            {composing
              ? <Loader2 className="h-6 w-6 text-yellow-400 animate-spin" />
              : <Sparkles className="h-6 w-6 text-[#1A1A35]" />}
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-bold', cfg.color)}>{cfg.label}</span>
          {short.duration_seconds && <span className="text-[10px] text-[#3A3A5C] ml-auto">{short.duration_seconds}s</span>}
        </div>

        {short.hook && <p className="text-xs font-medium text-white line-clamp-2">{short.hook}</p>}
        {short.error_message && <p className="text-[10px] text-red-400 line-clamp-2">{short.error_message}</p>}

        {(short.subtitles_vtt_url || (short as AiShort & { subtitles_srt_url?: string | null }).subtitles_srt_url) && (
          <div className="flex gap-2">
            {short.subtitles_vtt_url && (
              <a href={short.subtitles_vtt_url} download={`short-${short.id}.vtt`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-[#64748B] hover:text-[#00D4AA] transition-colors">
                <Download className="h-3 w-3" /> VTT
              </a>
            )}
            {(short as AiShort & { subtitles_srt_url?: string | null }).subtitles_srt_url && (
              <a href={(short as AiShort & { subtitles_srt_url?: string | null }).subtitles_srt_url!}
                download={`short-${short.id}.srt`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-[#64748B] hover:text-[#00D4AA] transition-colors">
                <Download className="h-3 w-3" /> SRT
              </a>
            )}
          </div>
        )}

        <div className="flex gap-1.5 pt-1">
          {short.status === 'ready' && (
            <>
              <button onClick={onPublish}
                className="flex-1 h-7 text-[10px] font-semibold rounded-lg bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 transition-colors">
                📤 Meta
              </button>
              <button onClick={onPublishTikTok}
                className="flex-1 h-7 text-[10px] font-semibold rounded-lg bg-black border border-white/10 text-white hover:bg-white/10 transition-colors">
                🎵 TikTok
              </button>
            </>
          )}
          {short.final_video_url && (
            <a href={short.final_video_url} download={`short-${short.id}.mp4`} target="_blank" rel="noopener noreferrer"
              className="flex-1 h-7 text-[10px] font-semibold rounded-lg border border-white/[0.08] text-[#94A3B8] hover:text-white flex items-center justify-center transition-colors">
              <Download className="h-3 w-3 mr-1" /> Descargar
            </a>
          )}
          <button onClick={onDelete}
            className="h-7 w-7 rounded-lg border border-white/[0.06] text-[#3A3A5C] hover:text-red-400 hover:border-red-500/20 flex items-center justify-center transition-colors">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ShortsTab({ readyClips, agents, agentId }: Props) {
  const [niches,          setNiches]          = useState<Niche[]>([])
  const [shorts,          setShorts]          = useState<AiShort[]>([])
  const [selectedClips,   setSelectedClips]   = useState<Set<string>>(new Set())
  const [nicheId,         setNicheId]         = useState('')
  const [duration,        setDuration]        = useState(30)
  const [generating,      setGenerating]      = useState(false)
  const [showNicheModal,  setShowNicheModal]  = useState(false)
  const [publishing,         setPublishing]         = useState<string | null>(null)
  const [publishingTikTok,   setPublishingTikTok]   = useState<string | null>(null)
  const [voiceProvider,      setVoiceProvider]      = useState<'elevenlabs' | 'google' | 'none' | null>(null)
  const [error,              setError]              = useState<string | null>(null)
  const [shortScript,      setShortScript]      = useState('')
  const [generatingScript, setGeneratingScript] = useState(false)

  async function loadNiches() {
    const res  = await fetch(`/api/niches?agent_id=${agentId}`)
    const data = await res.json() as Niche[]
    setNiches(data)
    if (data.length > 0 && !nicheId) setNicheId(data[0].id)
  }

  async function loadShorts() {
    const { createClient } = await import('@supabase/supabase-js')
    // Use the browser client pattern but we need service access — fetch via API instead
    const res  = await fetch(`/api/shorts?agent_id=${agentId}`)
    if (!res.ok) return
    const data = await res.json() as AiShort[]
    setShorts(data)
  }

  useEffect(() => {
    void loadNiches()
    void loadShorts()
    fetch('/api/shorts/voice-config')
      .then(r => r.json())
      .then((d: { provider: 'elevenlabs' | 'google' | 'none' }) => setVoiceProvider(d.provider))
      .catch(() => setVoiceProvider('none'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  // Poll composing shorts
  useEffect(() => {
    const composing = shorts.filter(s => s.status === 'composing' || s.status === 'merging')
    if (!composing.length) return

    async function checkAll() {
      await Promise.all(composing.map(async short => {
        try {
          const res  = await fetch(`/api/shorts/${short.id}/status`)
          if (!res.ok) return
          const data = await res.json() as AiShort
          setShorts(prev => prev.map(s => s.id === short.id ? { ...s, ...data } : s))
        } catch { /* retry next tick */ }
      }))
    }

    void checkAll()
    const interval = setInterval(() => void checkAll(), 10_000)
    return () => clearInterval(interval)
  }, [shorts])

  // Clear script when selection or niche changes so user regenerates with new context
  const selectedClipsKey = [...selectedClips].sort().join(',')
  useEffect(() => {
    if (shortScript) setShortScript('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClipsKey, nicheId])

  function toggleClip(id: string) {
    setSelectedClips(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 5) next.add(id)
      return next
    })
  }

  async function handleGenerateScript() {
    setGeneratingScript(true)
    try {
      const clipIds     = [...selectedClips]
      const clipsContext = readyClips
        .filter(c => clipIds.includes(c.id))
        .map(c => c.topic ?? c.hook ?? c.script?.slice(0, 100))
        .filter(Boolean)
        .join(', ')

      const res = await fetch('/api/shorts/generate-script', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id:      agentId,
          niche_id:      nicheId,
          clip_ids:      clipIds,
          duration,
          clips_context: clipsContext,
        }),
      })
      const data = await res.json() as { script?: string; error?: string }
      if (data.script) setShortScript(data.script)
      if (data.error)  setError(data.error)
    } catch (err) {
      console.error('Error generando script:', err)
    } finally {
      setGeneratingScript(false)
    }
  }

  async function generate() {
    if (!selectedClips.size) { setError('Selecciona al menos 1 clip'); return }
    if (!nicheId) { setError('Selecciona o crea un nicho'); return }
    if (!agentId) { setError('No hay agente seleccionado'); return }

    setGenerating(true)
    setError(null)

    try {
      const res  = await fetch('/api/shorts/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id:        agentId,
          niche_id:        nicheId,
          source_clip_ids: [...selectedClips],
          duration,
          ...(shortScript.trim() ? { custom_script: shortScript.trim() } : {}),
        }),
      })
      const data = await res.json() as { short_id?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al generar')

      // Add pending short to list
      setShorts(prev => [{
        id:                data.short_id!,
        agent_id:          agentId,
        niche_id:          nicheId,
        source_clips:      [],
        script:            null,
        hook:              null,
        cta:               null,
        subtitles_vtt_url: null,
        voiceover_url:     null,
        final_video_url:   null,
        thumbnail_url:     null,
        status:            'composing',
        duration_seconds:  duration,
        published_to:      [],
        error_message:     null,
        created_at:        new Date().toISOString(),
      }, ...prev])

      setSelectedClips(new Set())
      setShortScript('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function handlePublish(shortId: string) {
    setPublishing(shortId)
    try {
      const res  = await fetch(`/api/shorts/${shortId}/publish`, { method: 'POST' })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al publicar')
      setShorts(prev => prev.map(s => s.id === shortId ? { ...s, status: 'published' as const } : s))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPublishing(null)
    }
  }

  async function handlePublishTikTok(shortId: string) {
    setPublishingTikTok(shortId)
    try {
      const res  = await fetch(`/api/shorts/${shortId}/publish-tiktok`, { method: 'POST' })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al publicar en TikTok')
      setShorts(prev => prev.map(s => s.id === shortId ? { ...s, status: 'published' as const } : s))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPublishingTikTok(null)
    }
  }

  async function handleDelete(shortId: string) {
    const { createClient } = await import('@supabase/supabase-js')
    // Direct delete via browser client — needs anon client with RLS policy
    await fetch(`/api/shorts/${shortId}`, { method: 'DELETE' }).catch(() => null)
    setShorts(prev => prev.filter(s => s.id !== shortId))
  }

  const selectedDuration = readyClips
    .filter(c => selectedClips.has(c.id))
    .reduce((s, c) => s + (c.duration_seconds ?? 0), 0)

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-20">

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
          <p className="text-sm text-red-300 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 text-xs">✕</button>
        </div>
      )}

      {/* ── PASO 1: Seleccionar clips fuente ── */}
      <section className="rounded-xl border border-[#1A1A35] bg-[#0D0D1F] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
            1. Clips fuente
          </p>
          <span className="text-[10px] text-[#64748B]">
            {selectedClips.size}/5 seleccionados
            {selectedDuration > 0 && ` · ~${selectedDuration}s total`}
          </span>
        </div>

        {readyClips.length === 0 ? (
          <p className="text-xs text-[#3A3A5C] text-center py-4">
            Sin clips listos todavía — genera algunos en la pestaña ✨ Generar con IA
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {readyClips.map(clip => {
              const selected = selectedClips.has(clip.id)
              return (
                <div
                  key={clip.id}
                  onClick={() => toggleClip(clip.id)}
                  className={cn(
                    'relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all',
                    selected ? 'border-[#00D4AA]' : 'border-transparent hover:border-white/20',
                  )}
                >
                  <video
                    src={clip.video_url ?? undefined}
                    className="w-full aspect-[9/16] object-cover bg-[#080812]"
                    muted playsInline preload="metadata"
                  />
                  <div className={cn(
                    'absolute inset-0 flex items-start justify-end p-1 transition-colors',
                    selected ? 'bg-[#00D4AA]/20' : 'bg-transparent',
                  )}>
                    {selected
                      ? <CheckSquare className="h-4 w-4 text-[#00D4AA] drop-shadow-lg" />
                      : <Square className="h-4 w-4 text-white/40" />}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-3">
                    <p className="text-[9px] text-white line-clamp-1">{clip.hook ?? clip.topic}</p>
                    <p className="text-[8px] text-[#64748B]">{clip.duration_seconds}s</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── PASO 2: Configuración ── */}
      <section className="rounded-xl border border-[#1A1A35] bg-[#0D0D1F] p-4 space-y-4">
        <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">2. Configuración</p>

        {/* Nicho */}
        <div>
          <label className="text-[10px] text-[#64748B] uppercase tracking-wider block mb-1.5">Nicho / estilo</label>
          <div className="flex gap-2">
            <select
              value={nicheId}
              onChange={e => setNicheId(e.target.value)}
              className="flex-1 h-9 px-3 rounded-lg bg-[#080812] border border-[#1A1A35] text-white text-xs focus:outline-none focus:border-[#00D4AA]/40"
            >
              <option value="">— Seleccionar nicho —</option>
              {niches.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <button
              onClick={() => setShowNicheModal(true)}
              className="h-9 px-3 rounded-lg border border-[#1A1A35] text-[#64748B] hover:text-white hover:border-white/20 text-xs flex items-center gap-1 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Nuevo
            </button>
          </div>
          {nicheId && (() => {
            const n = niches.find(x => x.id === nicheId)
            if (!n) return null
            const subStyle = n.subtitle_style
            const subColor = subStyle?.color ?? '#FFFFFF'
            const subSize  = subStyle?.size  ?? 24
            const VOICE_TONE: Record<string, string> = {
              professional: '🎙️ Profesional', energetic: '⚡ Energético',
              calm: '🧘 Tranquilo', friendly: '😊 Amigable', comico: '😂 Cómico',
            }
            const MUSIC_LABEL: Record<string, string> = {
              upbeat: '🎵 Upbeat', chill: '🎵 Chill', dramatic: '🎵 Dramático',
              none: '', electronic: '🎵 Electrónico',
            }
            return (
              <div className="mt-2 rounded-lg bg-[#080812] border border-[#1A1A35] p-3 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] text-[#64748B]">{VOICE_TONE[n.voice_style ?? 'professional'] ?? n.voice_style}</span>
                  {n.music_style && <span className="text-[10px] text-[#64748B]">{MUSIC_LABEL[n.music_style] ?? n.music_style}</span>}
                  {n.voice_id
                    ? <span className="text-[10px] text-[#3A3A5C] font-mono">ID: {n.voice_id.slice(0, 8)}…</span>
                    : <span className="text-[10px] text-yellow-500/60">Voz por defecto</span>}
                </div>
                {/* Subtitle style preview */}
                <div className="relative h-9 rounded-md bg-black/60 overflow-hidden flex items-end justify-center pb-1">
                  <span
                    className="font-bold leading-none"
                    style={{ color: subColor, fontSize: Math.min(subSize * 0.5, 14), textShadow: '1px 1px 3px rgba(0,0,0,0.9)' }}
                  >
                    {n.intro_template?.slice(0, 30) ?? 'Vista previa del subtítulo'}
                  </span>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Script / Voz en off */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-[#64748B] uppercase tracking-wider">Script / Voz en off</label>
            <button
              onClick={handleGenerateScript}
              disabled={generatingScript || selectedClips.size === 0}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-600/80 hover:bg-purple-500 disabled:opacity-40 rounded-lg text-[10px] font-medium text-white transition-colors"
            >
              {generatingScript ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Generando…</>
              ) : (
                <><Sparkles className="h-3 w-3" /> ✨ Generar con IA</>
              )}
            </button>
          </div>
          <textarea
            value={shortScript}
            onChange={e => setShortScript(e.target.value)}
            placeholder="El script se generará automáticamente según el nicho y los clips seleccionados. También puedes escribirlo tú."
            rows={5}
            className="w-full bg-[#080812] border border-[#1A1A35] rounded-xl px-3 py-2.5 text-white text-xs resize-none focus:outline-none focus:border-[#00D4AA]/40 placeholder:text-[#3A3A5C] leading-relaxed"
          />
          {shortScript && (
            <div className="flex items-center justify-between mt-1">
              <p className="text-[9px] text-[#3A3A5C]">
                {shortScript.length} chars · ~{Math.ceil(shortScript.split(' ').filter(Boolean).length / 2.5)}s de lectura
              </p>
              <button
                onClick={() => setShortScript('')}
                className="text-[9px] text-[#3A3A5C] hover:text-[#64748B] transition-colors"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>

        {/* Duración */}
        <div>
          <label className="text-[10px] text-[#64748B] uppercase tracking-wider block mb-1.5">Duración del Short</label>
          <div className="flex gap-2">
            {DURATIONS.map(d => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={cn(
                  'flex-1 h-9 rounded-lg text-xs font-semibold border transition-colors',
                  duration === d
                    ? 'border-[#00D4AA]/40 bg-[#00D4AA]/10 text-[#00D4AA]'
                    : 'border-[#1A1A35] text-[#64748B] hover:text-white',
                )}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── PASO 3: Generar ── */}
      <button
        onClick={generate}
        disabled={generating || !selectedClips.size || !nicheId}
        className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-[#00D4AA] text-white text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
      >
        {generating
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando script y voz…</>
          : <><Sparkles className="h-4 w-4" /> 🎬 Generar Short automático</>}
      </button>

      {voiceProvider !== null && (
        <div className="flex justify-center -mt-3">
          {voiceProvider === 'elevenlabs' && (
            <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-[#00D4AA]/10 border border-[#00D4AA]/20 text-[#00D4AA]">
              🎙️ ElevenLabs · Voz premium activa
            </span>
          )}
          {voiceProvider === 'google' && (
            <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">
              🎙️ Google TTS · Voz gratuita activa
            </span>
          )}
          {voiceProvider === 'none' && (
            <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
              ⚠️ Sin voz configurada — agrega ELEVENLABS_API_KEY o GOOGLE_TTS_API_KEY
            </span>
          )}
        </div>
      )}

      {/* ── Shorts generados ── */}
      {shorts.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">Shorts generados</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {shorts.map(short => (
              <ShortCard
                key={short.id}
                short={short}
                onDelete={() => handleDelete(short.id)}
                onPublish={() => { if (publishing) return; void handlePublish(short.id) }}
                onPublishTikTok={() => { if (publishingTikTok) return; void handlePublishTikTok(short.id) }}
              />
            ))}
          </div>
          {publishing && (
            <p className="text-xs text-[#64748B] flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Publicando…
            </p>
          )}
        </section>
      )}

      {showNicheModal && (
        <NicheModal
          agentId={agentId}
          onSave={n => { setNiches(prev => [n, ...prev]); setNicheId(n.id); setShowNicheModal(false) }}
          onClose={() => setShowNicheModal(false)}
        />
      )}
    </div>
  )
}
