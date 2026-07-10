'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Upload, CheckCircle2, XCircle, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Agent  { id: string; name: string }
interface Niche  { id: string; name: string; voice_style: string | null; voice_id: string | null; transition_style: string | null; edit_pace: string | null; color_grade: string | null; text_overlay_style: Record<string, unknown> | null }

interface Props {
  agents:  Agent[]
  agentId: string
  onDone:  () => Promise<void>
}

type Phase = 'drop' | 'uploading' | 'configure' | 'processing' | 'done' | 'error'

// ── Presets por nicho ─────────────────────────────────────────────────────────

const NICHE_PRESETS: Record<string, {
  transition_style: string; edit_pace: string; color_grade: string
  voice_style: string; cta_text?: string
  text_overlay: { position: string; animation: string; color: string }
}> = {
  inmobiliaria:    { transition_style: 'fade',     edit_pace: 'slow',   color_grade: 'warm',       voice_style: 'professional', text_overlay: { position: 'bottom', animation: 'slide_up', color: '#D4A853' } },
  spa_bienestar:   { transition_style: 'dissolve', edit_pace: 'slow',   color_grade: 'warm',       voice_style: 'calm',         text_overlay: { position: 'center', animation: 'fade',     color: '#F5E6D3' } },
  restaurante:     { transition_style: 'zoom',     edit_pace: 'medium', color_grade: 'vibrant',    voice_style: 'friendly',     text_overlay: { position: 'bottom', animation: 'pop',      color: '#FF6B35' } },
  fitness:         { transition_style: 'glitch',   edit_pace: 'fast',   color_grade: 'cool',       voice_style: 'energetic',    text_overlay: { position: 'center', animation: 'punch',    color: '#00F5FF' } },
  datos_curiosos:  { transition_style: 'slide',    edit_pace: 'fast',   color_grade: 'vibrant',    voice_style: 'energetic',    text_overlay: { position: 'top',    animation: 'bounce',   color: '#FFD700' } },
  punto_de_venta:  { transition_style: 'zoom',     edit_pace: 'medium', color_grade: 'cinematic',  voice_style: 'professional', text_overlay: { position: 'bottom', animation: 'slide_up', color: '#FFFFFF' } },
}

const COLOR_GRADES = [
  { value: 'none',        label: 'Sin filtro',      preview: 'bg-gray-500'   },
  { value: 'warm',        label: 'Cálido',          preview: 'bg-orange-400' },
  { value: 'cool',        label: 'Frío',            preview: 'bg-blue-400'   },
  { value: 'vibrant',     label: 'Vibrante',        preview: 'bg-purple-500' },
  { value: 'cinematic',   label: 'Cinematográfico', preview: 'bg-yellow-700' },
  { value: 'dark',        label: 'Oscuro',          preview: 'bg-gray-900'   },
]

const TRANSITIONS = [
  { value: 'cut',     label: 'Corte' },
  { value: 'fade',    label: 'Fade'  },
  { value: 'zoom',    label: 'Zoom'  },
  { value: 'slide',   label: 'Slide' },
  { value: 'glitch',  label: 'Glitch'},
  { value: 'dissolve',label: 'Disolver'},
]

const EDIT_PACES = [
  { value: 'fast',   label: 'Rápido (2s)' },
  { value: 'medium', label: 'Medio (4s)'  },
  { value: 'slow',   label: 'Lento (6s)'  },
]

const VIDEO_FORMATS = [
  { value: '9:16',  label: '9:16 Reels ★' },
  { value: '16:9',  label: '16:9 YouTube'  },
  { value: '1:1',   label: '1:1 Feed'      },
  { value: '4:5',   label: '4:5 Story'     },
  { value: 'original', label: 'Original'   },
]

const VOICE_STYLES = [
  { value: 'professional', label: 'Profesional' },
  { value: 'energetic',    label: 'Energético'  },
  { value: 'calm',         label: 'Relajado'    },
  { value: 'friendly',     label: 'Amigable'    },
]

const PROCESS_STEPS = [
  { key: 'uploading',  label: 'Subiendo video'   },
  { key: 'voiceover',  label: 'Generando voz'    },
  { key: 'composing',  label: 'Componiendo'      },
  { key: 'done',       label: 'Listo'            },
]

const MAX_SIZE = 2 * 1024 * 1024 * 1024 // 2 GB

function CheckBox({ checked, disabled, onClick }: { checked: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={cn(
        'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
        checked && !disabled ? 'border-[#00D4AA] bg-[#00D4AA]' : 'border-[#3A3A5C] bg-transparent',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      {checked && !disabled && <span className="text-black text-[10px] font-bold leading-none">✓</span>}
    </div>
  )
}

export function UploadTab({ agents, agentId: defaultAgentId, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const [phase,      setPhase]      = useState<Phase>('drop')
  const [isDragging, setIsDragging] = useState(false)
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null)
  const [uploadPct,  setUploadPct]  = useState(0)
  const [objectUrl,  setObjectUrl]  = useState<string | null>(null)
  const [clipId,     setClipId]     = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [niches,     setNiches]     = useState<Niche[]>([])

  // Form — identidad
  const [agentId,     setAgentId]     = useState(defaultAgentId)
  const [topic,       setTopic]       = useState('')
  const [duration,    setDuration]    = useState(0)
  const [fileRef2,    setFileRef2]    = useState<File | null>(null)

  // Form — edición visual
  const [nicheId,      setNicheId]      = useState('')
  const [colorGrade,   setColorGrade]   = useState('none')
  const [transition,   setTransition]   = useState('cut')
  const [editPace,     setEditPace]     = useState('medium')
  const [videoFormat,  setVideoFormat]  = useState('9:16')
  const [brandColors,  setBrandColors]  = useState<string[]>(['#00D4AA', '#0D0D1F'])

  // Form — texto
  const [titleText,    setTitleText]    = useState('')
  const [ctaText,      setCtaText]      = useState('')
  const [subtitles,    setSubtitles]    = useState(false)

  // Form — audio
  const [voiceover,    setVoiceover]    = useState(false)
  const [voScript,     setVoScript]     = useState('')
  const [voStyle,      setVoStyle]      = useState('professional')
  const [muteOriginal, setMuteOriginal] = useState(false)

  useEffect(() => {
    if (!defaultAgentId) return
    fetch(`/api/niches?agent_id=${defaultAgentId}`)
      .then(r => r.json())
      .then((data: Niche[]) => setNiches(data ?? []))
      .catch(() => {/* sin nichos — no bloquea */})
  }, [defaultAgentId])

  function applyNichePreset(nicheKey: string) {
    const preset = NICHE_PRESETS[nicheKey]
    if (!preset) return
    setColorGrade(preset.color_grade)
    setTransition(preset.transition_style)
    setEditPace(preset.edit_pace)
    setVoStyle(preset.voice_style)
    if (preset.cta_text) setCtaText(preset.cta_text)
  }

  function reset() {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setPhase('drop'); setErrorMsg(null); setUploadPct(0)
    setObjectUrl(null); setClipId(null); setFileRef2(null)
    setActiveStep(0); setVoiceover(false); setVoScript('')
    setSubtitles(false); setColorGrade('none'); setTransition('cut')
    setEditPace('medium'); setTitleText(''); setCtaText('')
    setNicheId('')
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith('video/')) {
      setErrorMsg('El archivo debe ser un video (MP4, MOV, WEBM, AVI)'); return
    }
    if (file.size > MAX_SIZE) {
      setErrorMsg(`El video supera el límite de 2 GB (${(file.size / 1024 / 1024 / 1024).toFixed(1)} GB)`); return
    }

    const objUrl = URL.createObjectURL(file)
    setObjectUrl(objUrl)
    setFileRef2(file)

    // Duración del video
    const dur = await new Promise<number>(resolve => {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration) }
      v.onerror = () => resolve(0)
      v.src = URL.createObjectURL(file)
    })
    setDuration(Math.round(dur))
    setTopic(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '))
    setPhase('uploading')
    setUploadPct(0)
    setErrorMsg(null)

    try {
      // 1. Obtener signed URL del backend
      const urlRes = await fetch('/api/clips/upload-url', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename:    file.name,
          contentType: file.type,
          fileSize:    file.size,
          agent_id:    agentId || defaultAgentId,
          topic:       topic || file.name,
        }),
      })
      if (!urlRes.ok) {
        const e = await urlRes.json() as { error?: string }
        throw new Error(e.error ?? 'Error al preparar el upload')
      }
      const { signedUrl, clip_id } = await urlRes.json() as {
        signedUrl: string; path: string; clip_id: string; publicUrl: string
      }
      setClipId(clip_id)

      // 2. Upload directo con XHR para progress bar real
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload HTTP ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('Error de red durante el upload'))
        xhr.open('PUT', signedUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

      // 3. Notificar al backend que el upload completó
      await fetch('/api/clips/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id:    agentId || defaultAgentId,
          video_url:   null, // se actualiza al procesar
          topic:       topic || file.name,
          duration_seconds: Math.round(dur),
          clip_id,           // registrar en el clip existente
        }),
      }).catch(() => {/* no bloquea si falla */})

      setUploadPct(100)
      setPhase('configure')

    } catch (e) {
      setErrorMsg((e as Error).message)
      setPhase('error')
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  async function startProcessing() {
    if (!clipId) return
    setPhase('processing')
    setActiveStep(0)
    setErrorMsg(null)

    try {
      setActiveStep(1)

      const procRes = await fetch(`/api/clips/${clipId}/process`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceover:        voiceover,
          voiceover_script: voiceover ? voScript : undefined,
          voice_style:      voStyle,
          subtitles:        subtitles && voiceover,
          duration_seconds: duration,
          color_grade:      colorGrade !== 'none' ? colorGrade : undefined,
          video_format:     videoFormat,
          title_text:       titleText || undefined,
          cta_text:         ctaText || undefined,
          mute_original:    muteOriginal,
          brand_colors:     brandColors,
          niche_key:        nicheId ? niches.find(n => n.id === nicheId)?.name?.toLowerCase().replace(/\s+/g, '_') : undefined,
        }),
      })
      if (!procRes.ok) throw new Error((await procRes.json() as { error?: string }).error ?? 'Error al procesar')

      const procData = await procRes.json() as { status: string }

      if (procData.status === 'ready') {
        setActiveStep(3); setPhase('done')
        await onDone(); return
      }

      setActiveStep(2)

      const poll = async () => {
        const res  = await fetch(`/api/clips/${clipId}/status`)
        if (!res.ok) return
        const data = await res.json() as { status: string }
        if (data.status === 'ready')  { setActiveStep(3); setPhase('done'); await onDone() }
        else if (data.status === 'failed') { setErrorMsg('El proceso falló. Intenta de nuevo.'); setPhase('error') }
        else setTimeout(() => void poll(), 8000)
      }
      setTimeout(() => void poll(), 6000)

    } catch (e) {
      setErrorMsg((e as Error).message)
      setPhase('error')
    }
  }

  // ── RENDER ────────────────────────────────────────────────────────────────────

  // Drop zone
  if (phase === 'drop') {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div
          className={cn(
            'border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-4 py-20 cursor-pointer transition-colors',
            isDragging ? 'border-[#00D4AA] bg-[#00D4AA]/5' : 'border-[#1A1A35] hover:border-[#2A2A45]',
          )}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <div className="w-16 h-16 rounded-full bg-[#1A1A35] flex items-center justify-center">
            <Upload className="h-7 w-7 text-[#00D4AA]" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium">Arrastra tu video aquí</p>
            <p className="text-[#64748B] text-sm mt-1">o haz click para seleccionar</p>
            <p className="text-[#3A3A5C] text-xs mt-2">MP4 · MOV · WEBM · AVI — Máx 2 GB</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
          />
        </div>
      </div>
    )
  }

  // Uploading
  if (phase === 'uploading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <Loader2 className="h-10 w-10 text-[#00D4AA] animate-spin" />
        <div className="w-full max-w-sm space-y-3">
          <p className="text-white text-sm font-medium text-center">
            {uploadPct < 100 ? `Subiendo… ${uploadPct}%` : '✅ Video subido — preparando edición…'}
          </p>
          <div className="h-2 bg-[#1A1A35] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00D4AA] rounded-full transition-all duration-300"
              style={{ width: `${uploadPct}%` }}
            />
          </div>
          <p className="text-[#3A3A5C] text-xs text-center">
            {fileRef2 ? `${(fileRef2.size / 1024 / 1024).toFixed(0)} MB — upload directo a Supabase Storage` : 'Preparando…'}
          </p>
        </div>
      </div>
    )
  }

  // Configure — panel avanzado
  if (phase === 'configure') {
    const nicheOptions = Object.keys(NICHE_PRESETS)

    function Section({ title, children }: { title: string; children: React.ReactNode }) {
      return (
        <div className="border border-[#1A1A35] rounded-xl bg-[#080812]">
          <div className="px-4 py-2.5 border-b border-[#1A1A35]">
            <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">{title}</p>
          </div>
          <div className="p-4 space-y-4">{children}</div>
        </div>
      )
    }

    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* Preview */}
          {objectUrl && (
            <div className="rounded-xl overflow-hidden border border-[#1A1A35] bg-black">
              <video src={objectUrl} controls playsInline preload="metadata"
                className="w-full max-h-56 object-contain" />
            </div>
          )}

          {/* Agente + Título */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#94A3B8]">Agente</label>
              <select value={agentId} onChange={e => setAgentId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[#0D0D1F] border border-[#1A1A35] text-white text-sm focus:outline-none focus:border-[#00D4AA]">
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#94A3B8]">Título del clip</label>
              <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
                placeholder="Ej: Promo verano 2026"
                className="w-full h-9 px-3 rounded-lg bg-[#0D0D1F] border border-[#1A1A35] text-white text-sm placeholder-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]" />
            </div>
          </div>

          {/* IDENTIDAD VISUAL */}
          <Section title="Identidad visual">
            {/* Preset de nicho */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-[#94A3B8]">Preset de nicho (auto-configura todo)</label>
              </div>
              <div className="flex gap-2 flex-wrap">
                {nicheOptions.map(k => (
                  <button key={k} onClick={() => { setNicheId(k); applyNichePreset(k) }}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs border transition-colors capitalize',
                      nicheId === k
                        ? 'border-orange-400 text-orange-300 bg-orange-400/10'
                        : 'border-[#1A1A35] text-[#64748B] hover:border-[#2A2A45] hover:text-white',
                    )}>
                    {k.replace(/_/g, ' ')}
                  </button>
                ))}
                {nicheId && (
                  <button onClick={() => { setNicheId(''); setColorGrade('none'); setTransition('cut'); setEditPace('medium') }}
                    className="px-2 py-1 rounded-full text-[10px] border border-[#1A1A35] text-[#3A3A5C] hover:text-red-400">
                    ✕ quitar
                  </button>
                )}
              </div>
              {niches.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs text-[#64748B]">O selecciona un nicho guardado</label>
                  <select value={nicheId.startsWith('__') ? nicheId : ''} onChange={e => setNicheId(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg bg-[#0D0D1F] border border-[#1A1A35] text-white text-xs focus:outline-none focus:border-[#00D4AA]">
                    <option value="">— Seleccionar nicho —</option>
                    {niches.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Grade de color */}
            <div className="space-y-2">
              <label className="text-xs text-[#94A3B8]">Grade de color</label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_GRADES.map(g => (
                  <button key={g.value} onClick={() => setColorGrade(g.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors',
                      colorGrade === g.value
                        ? 'border-[#00D4AA] text-[#00D4AA] bg-[#00D4AA]/10'
                        : 'border-[#1A1A35] text-[#64748B] hover:border-[#2A2A45]',
                    )}>
                    <div className={cn('w-2 h-2 rounded-full', g.preview)} />
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Colores de marca */}
            <div className="space-y-2">
              <label className="text-xs text-[#94A3B8]">Colores de marca (para overlays)</label>
              <div className="flex gap-2 flex-wrap">
                {brandColors.map((c, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input type="color" value={c}
                      onChange={e => setBrandColors(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                      className="w-7 h-7 rounded cursor-pointer border border-[#1A1A35] p-0.5 bg-[#0D0D1F]" />
                    {brandColors.length > 1 && (
                      <button onClick={() => setBrandColors(prev => prev.filter((_, j) => j !== i))}
                        className="text-[10px] text-[#3A3A5C] hover:text-red-400">✕</button>
                    )}
                  </div>
                ))}
                {brandColors.length < 5 && (
                  <button onClick={() => setBrandColors(prev => [...prev, '#ffffff'])}
                    className="w-7 h-7 rounded border border-dashed border-[#3A3A5C] text-[#3A3A5C] text-xs hover:border-[#00D4AA] hover:text-[#00D4AA] transition-colors flex items-center justify-center">
                    +
                  </button>
                )}
              </div>
            </div>
          </Section>

          {/* EDICIÓN AUTOMÁTICA */}
          <Section title="Edición automática">
            {/* Transición */}
            <div className="space-y-2">
              <label className="text-xs text-[#94A3B8]">Transición</label>
              <div className="flex gap-2 flex-wrap">
                {TRANSITIONS.map(t => (
                  <button key={t.value} onClick={() => setTransition(t.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs border transition-colors',
                      transition === t.value
                        ? 'border-[#00D4AA] text-[#00D4AA] bg-[#00D4AA]/10'
                        : 'border-[#1A1A35] text-[#64748B] hover:border-[#2A2A45]',
                    )}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Velocidad */}
            <div className="space-y-2">
              <label className="text-xs text-[#94A3B8]">Velocidad de cortes</label>
              <div className="flex gap-2">
                {EDIT_PACES.map(p => (
                  <button key={p.value} onClick={() => setEditPace(p.value)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs border transition-colors',
                      editPace === p.value
                        ? 'border-purple-400 text-purple-300 bg-purple-400/10'
                        : 'border-[#1A1A35] text-[#64748B] hover:border-[#2A2A45]',
                    )}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* TEXTO Y OVERLAYS */}
          <Section title="Texto y overlays">
            {/* Título */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#94A3B8]">Título en video (opcional)</label>
              <input type="text" value={titleText} onChange={e => setTitleText(e.target.value)}
                placeholder="Ej: ¡Oferta exclusiva!"
                className="w-full h-9 px-3 rounded-lg bg-[#0D0D1F] border border-[#1A1A35] text-white text-sm placeholder-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]" />
            </div>
            {/* CTA */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#94A3B8]">CTA final — últimos 3s (opcional)</label>
              <input type="text" value={ctaText} onChange={e => setCtaText(e.target.value)}
                placeholder="Ej: Llámanos: 614 227 8557"
                className="w-full h-9 px-3 rounded-lg bg-[#0D0D1F] border border-[#1A1A35] text-white text-sm placeholder-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]" />
            </div>
            {/* Subtítulos */}
            <label className="flex items-center gap-3">
              <CheckBox checked={subtitles && voiceover} disabled={!voiceover}
                onClick={() => voiceover && setSubtitles(v => !v)} />
              <span className={cn('text-sm', voiceover ? 'text-white' : 'text-[#3A3A5C]')}>
                📝 Subtítulos automáticos (requiere guión de voz)
              </span>
            </label>
          </Section>

          {/* AUDIO */}
          <Section title="Audio">
            {/* Voz en off */}
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <CheckBox checked={voiceover} onClick={() => setVoiceover(v => !v)} />
                <span className="text-sm text-white">🎙️ Voz en off (ElevenLabs)</span>
              </label>
              {voiceover && (
                <div className="ml-7 space-y-3">
                  <textarea value={voScript} onChange={e => setVoScript(e.target.value)}
                    placeholder="Escribe el guión para la voz en off…"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-[#0D0D1F] border border-[#1A1A35] text-white text-sm placeholder-[#3A3A5C] resize-none focus:outline-none focus:border-[#00D4AA]" />
                  <div className="flex gap-2 flex-wrap">
                    {VOICE_STYLES.map(s => (
                      <button key={s.value} onClick={() => setVoStyle(s.value)}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-xs border transition-colors',
                          voStyle === s.value
                            ? 'border-[#00D4AA] text-[#00D4AA] bg-[#00D4AA]/10'
                            : 'border-[#1A1A35] text-[#64748B] hover:border-[#2A2A45]',
                        )}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Silenciar original */}
            <label className="flex items-center gap-3">
              <CheckBox checked={muteOriginal} onClick={() => setMuteOriginal(v => !v)} />
              <span className="text-sm text-white">🔇 Silenciar audio original del video</span>
            </label>
          </Section>

          {/* FORMATO FINAL */}
          <Section title="Formato final">
            <div className="flex gap-2 flex-wrap">
              {VIDEO_FORMATS.map(f => (
                <button key={f.value} onClick={() => setVideoFormat(f.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs border transition-colors',
                    videoFormat === f.value
                      ? 'border-orange-400 text-orange-300 bg-orange-400/10 font-medium'
                      : 'border-[#1A1A35] text-[#64748B] hover:border-[#2A2A45]',
                  )}>
                  {f.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Botones */}
          <div className="flex gap-3 pb-4">
            <button onClick={reset}
              className="h-11 px-4 rounded-xl border border-[#1A1A35] text-[#64748B] text-sm hover:text-white hover:border-[#2A2A45] transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => void startProcessing()}
              disabled={!agentId || !clipId}
              className="flex-1 h-11 rounded-xl bg-[#00D4AA] text-black text-sm font-semibold hover:bg-[#00D4AA]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              ⚡ Editar automáticamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Processing
  if (phase === 'processing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
        <div className="text-center space-y-1">
          <p className="text-white font-medium">Editando tu video con IA…</p>
          <p className="text-[#64748B] text-sm">Esto puede tardar entre 30 y 120 segundos</p>
        </div>
        <div className="space-y-3 w-full max-w-xs">
          {PROCESS_STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-3">
              {i < activeStep
                ? <CheckCircle2 className="h-5 w-5 text-[#00D4AA] flex-shrink-0" />
                : i === activeStep
                  ? <Loader2 className="h-5 w-5 text-yellow-400 animate-spin flex-shrink-0" />
                  : <div className="h-5 w-5 rounded-full border border-[#1A1A35] flex-shrink-0" />
              }
              <span className={cn('text-sm',
                i < activeStep ? 'text-[#00D4AA]' : i === activeStep ? 'text-white' : 'text-[#3A3A5C]',
              )}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[#3A3A5C] text-xs text-center max-w-xs">
          Puedes navegar — el clip aparecerá en "Generar con IA" cuando esté listo
        </p>
      </div>
    )
  }

  // Done
  if (phase === 'done') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <CheckCircle2 className="h-16 w-16 text-[#00D4AA]" />
        <div className="text-center space-y-1">
          <p className="text-white font-semibold text-lg">¡Video editado y listo!</p>
          <p className="text-[#64748B] text-sm">Encuéntralo en la pestaña "Generar con IA"</p>
          {nicheId && (
            <p className="text-orange-400 text-xs mt-2">
              Preset aplicado: {nicheId.replace(/_/g, ' ')}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={reset}
            className="h-10 px-6 rounded-xl bg-[#00D4AA] text-black text-sm font-semibold hover:bg-[#00D4AA]/90 transition-colors">
            Subir otro video
          </button>
          <button onClick={onDone}
            className="h-10 px-4 rounded-xl border border-[#1A1A35] text-[#64748B] text-sm hover:text-white transition-colors">
            Ver resultado →
          </button>
        </div>
      </div>
    )
  }

  // Error
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
      <XCircle className="h-16 w-16 text-red-400" />
      <div className="text-center space-y-1">
        <p className="text-white font-semibold">Algo salió mal</p>
        <p className="text-red-400 text-sm max-w-sm">{errorMsg ?? 'Error desconocido'}</p>
      </div>
      <button onClick={reset}
        className="h-10 px-6 rounded-xl border border-[#1A1A35] text-[#64748B] text-sm hover:text-white hover:border-[#2A2A45] transition-colors">
        Intentar de nuevo
      </button>
    </div>
  )
}
