"use client"
import { useState } from "react"
import { Loader2, Sparkles, AlertCircle, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface Agent { id: string; name: string }

interface ScriptResult {
  hook_options: string[]
  script: string
  video_prompt: string
  cta: string
}

interface Props {
  agents: Agent[]
  onClose: () => void
  onDispatched: (clipId: string) => void
}

const TONES = [
  { value: 'professional',  label: 'Profesional'   },
  { value: 'inspirational', label: 'Inspiracional' },
  { value: 'educational',   label: 'Educativo'     },
  { value: 'sales',         label: 'Ventas'        },
]

const DURATIONS = [6, 10, 15]

const TEMPLATES = [
  { emoji: '🏠', label: 'Inmobiliaria', topic: 'Beneficios de invertir en bienes raíces ahora' },
  { emoji: '💆', label: 'Spa',          topic: 'Transforma tu bienestar con nuestros tratamientos'  },
  { emoji: '🍽️', label: 'Restaurante',  topic: 'Descubre nuestro plato estrella de la temporada'    },
  { emoji: '💪', label: 'Fitness',      topic: 'Alcanza tus metas de entrenamiento en 30 días'      },
  { emoji: '🎓', label: 'Educación',    topic: 'Aprende habilidades digitales que transforman vidas' },
  { emoji: '✨', label: 'General',      topic: '' },
]

type Step = 'form' | 'preview' | 'generating'

export function GenerateModal({ agents, onClose, onDispatched }: Props) {
  const [step, setStep]           = useState<Step>('form')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [scriptResult, setScriptResult] = useState<ScriptResult | null>(null)
  const [hookIdx, setHookIdx]     = useState(0)
  const [editScript, setEditScript] = useState('')
  const [editCta, setEditCta]     = useState('')

  // Brand identity
  const [brandColors, setBrandColors]       = useState<string[]>([])
  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)

  const [form, setForm] = useState({
    agent_id:     '',
    topic:        '',
    tone:         'professional',
    duration:     10,
    auto_publish: false,
  })

  function addColor() {
    if (brandColors.length >= 5) return
    setBrandColors(prev => [...prev, '#00D4AA'])
  }
  function updateColor(i: number, val: string) {
    setBrandColors(prev => prev.map((c, idx) => idx === i ? val : c))
  }
  function removeColor(i: number) {
    setBrandColors(prev => prev.filter((_, idx) => idx !== i))
  }
  function removeImage(i: number) {
    setReferenceImages(prev => prev.filter((_, idx) => idx !== i))
  }
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res  = await fetch('/api/clips/upload-reference', { method: 'POST', body: formData })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error subiendo imagen')
      setReferenceImages(prev => [...prev, data.url!])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  async function handleGetScript() {
    if (!form.agent_id || !form.topic.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/clips/script-only', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          agent_id:         form.agent_id,
          topic:            form.topic,
          tone:             form.tone,
          duration_seconds: form.duration,
          brand_colors:     brandColors,
          reference_images: referenceImages,
        }),
      })
      const data = await res.json() as ScriptResult & { error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error generando guión')
      setScriptResult(data)
      setEditScript(data.script)
      setEditCta(data.cta)
      setHookIdx(0)
      setStep('preview')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    if (!scriptResult) return
    setStep('generating')
    setError(null)
    try {
      const res  = await fetch('/api/clips/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          agent_id:         form.agent_id,
          topic:            form.topic,
          tone:             form.tone,
          duration_seconds: form.duration,
          auto_publish:     form.auto_publish,
          hook_selected:    scriptResult.hook_options[hookIdx],
          script:           editScript,
          video_prompt:     scriptResult.video_prompt,
          cta:              editCta,
          brand_colors:     brandColors,
          reference_images: referenceImages,
        }),
      })
      const data = await res.json() as { clip_id?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error al generar')
      onDispatched(data.clip_id!)
    } catch (e) {
      setError((e as Error).message)
      setStep('preview')
    }
  }

  const canSubmitForm = !!form.agent_id && !!form.topic.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-2xl border border-[#1A1A35] bg-[#0D0D1F] shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#1A1A35] flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white flex-1">✨ Generar clip con IA</h2>
            {/* Step indicator */}
            <div className="flex items-center gap-1 text-xs text-[#3A3A5C]">
              {(['form', 'preview', 'generating'] as Step[]).map((s, i) => (
                <span key={s} className="flex items-center gap-1">
                  <span className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                    step === s ? 'bg-[#00D4AA] text-black' :
                    (['form', 'preview', 'generating'].indexOf(step) > i) ? 'bg-[#00D4AA]/30 text-[#00D4AA]' :
                    'bg-[#1A1A35] text-[#3A3A5C]'
                  )}>{i + 1}</span>
                  {i < 2 && <ChevronRight className="h-3 w-3 text-[#1A1A35]" />}
                </span>
              ))}
            </div>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            {step === 'form'       && 'Configura tu clip'}
            {step === 'preview'    && 'Revisa y edita el guión'}
            {step === 'generating' && 'Generando video con Kling…'}
          </p>
        </div>

        {/* ── PASO 1: Formulario ── */}
        {step === 'form' && (
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

            {/* Templates */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-2 block">Industria (template)</label>
              <div className="grid grid-cols-3 gap-2">
                {TEMPLATES.map(t => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => { if (t.topic) setForm(f => ({ ...f, topic: t.topic })) }}
                    className="px-2 py-2 rounded-xl border border-[#1A1A35] text-xs text-[#64748B] hover:border-white/[0.15] hover:text-white transition-colors text-center"
                  >
                    <span className="block text-base">{t.emoji}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-1.5 block">Agente</label>
              <select
                value={form.agent_id}
                onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
                className="w-full h-9 rounded-xl bg-[#080812] border border-[#1A1A35] text-white text-sm px-3 focus:outline-none focus:border-[#00D4AA]/40"
              >
                <option value="">Seleccionar agente</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* Topic */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-1.5 block">¿Sobre qué es el clip?</label>
              <input
                type="text"
                value={form.topic}
                onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                placeholder="Ej: Beneficios de comprar terreno en zona norte"
                className="w-full h-9 rounded-xl bg-[#080812] border border-[#1A1A35] text-white text-sm px-3 focus:outline-none focus:border-[#00D4AA]/40 placeholder-[#3A3A5C]"
              />
            </div>

            {/* Tone */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-2 block">Tono</label>
              <div className="grid grid-cols-2 gap-2">
                {TONES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tone: t.value }))}
                    className={cn(
                      'h-9 rounded-xl border text-xs font-medium transition-colors',
                      form.tone === t.value
                        ? 'border-[#00D4AA]/40 bg-[#00D4AA]/[0.08] text-[#00D4AA]'
                        : 'border-[#1A1A35] text-[#64748B] hover:border-white/[0.12] hover:text-white'
                    )}
                  >{t.label}</button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-2 block">Duración</label>
              <div className="flex gap-2">
                {DURATIONS.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, duration: d }))}
                    className={cn(
                      'flex-1 h-9 rounded-xl border text-xs font-medium transition-colors',
                      form.duration === d
                        ? 'border-[#00D4AA]/40 bg-[#00D4AA]/[0.08] text-[#00D4AA]'
                        : 'border-[#1A1A35] text-[#64748B] hover:border-white/[0.12] hover:text-white'
                    )}
                  >{d}s</button>
                ))}
              </div>
            </div>

            {/* Brand identity (collapsible) */}
            <details className="group rounded-xl border border-[#1A1A35] overflow-hidden">
              <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none text-xs font-medium text-[#64748B] hover:text-white transition-colors list-none">
                <span>🎨 Identidad de marca (opcional)</span>
                <span className="text-[10px] text-[#3A3A5C] group-open:hidden">
                  {brandColors.length > 0 || referenceImages.length > 0
                    ? `${brandColors.length} colores · ${referenceImages.length} imágenes`
                    : 'Agregar colores e imágenes'}
                </span>
              </summary>
              <div className="px-3 pb-3 space-y-4 border-t border-[#1A1A35] pt-3">

                {/* Brand colors */}
                <div>
                  <label className="text-xs font-medium text-[#64748B] mb-1 block">
                    Colores de marca
                    <span className="ml-1 text-[#3A3A5C] font-normal">— máx 5, el prompt usará esta paleta</span>
                  </label>
                  <div className="flex gap-2 flex-wrap items-center">
                    {brandColors.map((color, i) => (
                      <div key={i} className="relative">
                        <input
                          type="color"
                          value={color}
                          onChange={e => updateColor(i, e.target.value)}
                          className="w-9 h-9 rounded-lg cursor-pointer border-0 p-0.5 bg-transparent"
                          title={color}
                        />
                        <button
                          type="button"
                          onClick={() => removeColor(i)}
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center"
                        >×</button>
                      </div>
                    ))}
                    {brandColors.length < 5 && (
                      <button
                        type="button"
                        onClick={addColor}
                        className="w-9 h-9 rounded-lg border border-dashed border-[#3A3A5C] text-[#3A3A5C] hover:border-white/[0.3] hover:text-white transition-colors text-lg leading-none flex items-center justify-center"
                      >+</button>
                    )}
                  </div>
                </div>

                {/* Reference images */}
                <div>
                  <label className="text-xs font-medium text-[#64748B] mb-1 block">
                    Imágenes de referencia
                    <span className="ml-1 text-[#3A3A5C] font-normal">— máx 3, la 1ª se usará como base en Kling</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {referenceImages.map((url, i) => (
                      <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-[#1A1A35]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center"
                        >×</button>
                        {i === 0 && (
                          <span className="absolute bottom-1 left-1 text-[9px] font-bold px-1 py-0.5 rounded bg-[#00D4AA] text-black">base</span>
                        )}
                      </div>
                    ))}
                    {referenceImages.length < 3 && (
                      <label className={cn(
                        'aspect-video rounded-lg border border-dashed border-[#3A3A5C] flex flex-col items-center justify-center cursor-pointer transition-colors',
                        uploadingImage ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/[0.3]'
                      )}>
                        {uploadingImage ? (
                          <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                        ) : (
                          <>
                            <span className="text-xl">📷</span>
                            <span className="text-[10px] text-[#3A3A5C] mt-1">Agregar</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingImage}
                          className="hidden"
                          onChange={handleImageUpload}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </details>

            {/* Auto publish */}
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, auto_publish: !f.auto_publish }))}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-xl border transition-colors',
                form.auto_publish ? 'border-[#00D4AA]/30 bg-[#00D4AA]/[0.04]' : 'border-[#1A1A35]'
              )}
            >
              <div className="text-left">
                <p className={cn('text-xs font-medium', form.auto_publish ? 'text-white' : 'text-[#64748B]')}>
                  Publicar automáticamente
                </p>
                <p className="text-[10px] text-[#3A3A5C]">Publica en Facebook cuando el video esté listo</p>
              </div>
              <div className={cn('w-9 h-5 rounded-full transition-colors flex items-center px-0.5', form.auto_publish ? 'bg-[#00D4AA]' : 'bg-[#1A1A35]')}>
                <div className={cn('w-4 h-4 rounded-full bg-white transition-transform', form.auto_publish ? 'translate-x-4' : 'translate-x-0')} />
              </div>
            </button>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 py-2.5">
                <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── PASO 2: Preview guión ── */}
        {step === 'preview' && scriptResult && (
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

            {/* 3 hook options */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-2 block">Elige el hook de apertura</label>
              <div className="space-y-2">
                {scriptResult.hook_options.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setHookIdx(i)}
                    className={cn(
                      'w-full text-left p-3 rounded-xl border text-sm transition-colors',
                      hookIdx === i
                        ? 'border-[#00D4AA]/40 bg-[#00D4AA]/[0.06] text-[#00D4AA]'
                        : 'border-[#1A1A35] text-[#94A3B8] hover:border-white/[0.15] hover:text-white'
                    )}
                  >
                    <span className="text-[10px] font-bold mr-2 opacity-50">Opción {i + 1}</span>
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Editable script */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-1.5 block">Guión (editable)</label>
              <textarea
                value={editScript}
                onChange={e => setEditScript(e.target.value)}
                rows={4}
                className="w-full rounded-xl bg-[#080812] border border-[#1A1A35] text-white text-sm px-3 py-2 focus:outline-none focus:border-[#00D4AA]/40 resize-none leading-relaxed placeholder-[#3A3A5C]"
              />
            </div>

            {/* CTA */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-1.5 block">CTA (editable)</label>
              <input
                type="text"
                value={editCta}
                onChange={e => setEditCta(e.target.value)}
                className="w-full h-9 rounded-xl bg-[#080812] border border-[#1A1A35] text-white text-sm px-3 focus:outline-none focus:border-[#00D4AA]/40"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 py-2.5">
                <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── PASO 3: Generando ── */}
        {step === 'generating' && (
          <div className="flex-1 px-6 py-10 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[#00D4AA]/10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-[#00D4AA] animate-spin" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Generando tu clip…</p>
              <p className="text-xs text-[#64748B] mt-1">Kling está creando el video (~60-90s)</p>
              <p className="text-xs text-[#3A3A5C] mt-2">Puedes cerrar y seguir trabajando.</p>
            </div>
            <div className="flex flex-col gap-1.5 w-full max-w-[220px] text-left text-xs text-[#64748B]">
              <p>✅ Guión generado</p>
              <p>✅ Solicitud enviada a Kling</p>
              <p className="text-[#3A3A5C]">⏳ Generando video…</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#1A1A35] flex-shrink-0 flex gap-3">
          {step === 'generating' ? (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 rounded-xl bg-[#00D4AA] text-black text-sm font-semibold hover:bg-[#00D4AA]/90 transition-colors"
            >
              Cerrar y seguir en background
            </button>
          ) : step === 'preview' ? (
            <>
              <button
                type="button"
                onClick={() => setStep('form')}
                className="flex-1 h-10 rounded-xl border border-[#1A1A35] text-sm text-[#64748B] hover:text-white transition-colors"
              >
                ← Atrás
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                className="flex-1 h-10 rounded-xl bg-[#00D4AA] text-black text-sm font-semibold hover:bg-[#00D4AA]/90 transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="h-4 w-4" /> Generar video
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 h-10 rounded-xl border border-[#1A1A35] text-sm text-[#64748B] hover:text-white transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGetScript}
                disabled={loading || !canSubmitForm}
                className="flex-1 h-10 rounded-xl bg-[#00D4AA] text-black text-sm font-semibold hover:bg-[#00D4AA]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando guión…</>
                  : <><Sparkles className="h-4 w-4" /> Siguiente →</>
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
