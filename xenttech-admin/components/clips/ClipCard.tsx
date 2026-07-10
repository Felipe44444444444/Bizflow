"use client"
import { Film, Trash2, Play } from "lucide-react"
import { cn } from "@/lib/utils"

export interface AiClip {
  id: string
  agent_id: string | null
  agent_name?: string | null
  topic: string
  script: string | null
  hook: string | null
  cta: string | null
  video_prompt: string | null
  generation_task_id: string | null
  video_url: string | null
  status: 'generating' | 'ready' | 'published' | 'failed' | 'pending' | 'uploaded'
  tone: string
  duration_seconds: number
  auto_publish: boolean
  error_message: string | null
  views: number
  likes: number
  scheduled_at: string | null
  published_to: string[]
  brand_colors: string[]
  reference_images: string[]
  created_at: string
}

interface Props {
  clip: AiClip
  onDelete: () => void
  onPublish: () => void
  onRetry: () => void
  onOpen: () => void
}

const STATUS = {
  generating: { label: 'Generando',  color: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/[0.06]' },
  ready:      { label: 'Listo',      color: 'text-[#00D4AA] border-[#00D4AA]/20 bg-[#00D4AA]/[0.06]'   },
  published:  { label: 'Publicado',  color: 'text-blue-400 border-blue-500/20 bg-blue-500/[0.06]'       },
  failed:     { label: 'Error',      color: 'text-red-400 border-red-500/20 bg-red-500/[0.06]'          },
  pending:    { label: 'Pendiente',  color: 'text-[#64748B] border-white/[0.06] bg-white/[0.02]'        },
  uploaded:   { label: 'Subido',    color: 'text-orange-400 border-orange-500/20 bg-orange-500/[0.06]'   },
}

export function ClipCard({ clip, onDelete, onPublish, onRetry, onOpen }: Props) {
  const cfg = STATUS[clip.status] ?? STATUS.pending

  // Shimmer skeleton while generating
  if (clip.status === 'generating') {
    return (
      <div className="rounded-xl border border-yellow-500/20 bg-[#0D0D1F] overflow-hidden animate-pulse">
        <div className="w-full aspect-[9/16] max-h-48 bg-[#1A1A35] flex items-center justify-center">
          <div className="text-2xl animate-spin">⏳</div>
        </div>
        <div className="p-3 space-y-2">
          <div className="h-3 bg-[#1A1A35] rounded w-20" />
          <div className="h-3 bg-[#1A1A35] rounded w-full" />
          <div className="h-3 bg-[#1A1A35] rounded w-2/3" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      "rounded-xl border bg-[#0D0D1F] overflow-hidden group",
      clip.status === 'failed' ? 'border-red-500/20 bg-red-500/[0.02]' : 'border-[#1A1A35]'
    )}>
      {/* Thumbnail / video */}
      <div className="relative cursor-pointer" onClick={clip.video_url ? onOpen : undefined}>
        {clip.video_url ? (
          <>
            <video
              src={clip.video_url}
              className="w-full aspect-[9/16] object-cover bg-black max-h-48"
              muted
              playsInline
              preload="metadata"
              onError={(e) => console.error('VIDEO_ERROR:', clip.video_url, e)}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Play className="h-5 w-5 text-white fill-white ml-0.5" />
              </div>
            </div>
          </>
        ) : (
          <div className="w-full aspect-[9/16] max-h-48 flex items-center justify-center bg-[#080812]">
            <Film className="h-8 w-8 text-[#1A1A35]" />
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', cfg.color)}>
            {cfg.label}
          </span>
          <span className="text-[10px] text-[#3A3A5C] capitalize">{clip.tone}</span>
          <span className="text-[10px] text-[#3A3A5C] ml-auto">{clip.duration_seconds}s</span>
        </div>

        {/* Hook / topic */}
        <p className="text-xs font-medium text-white line-clamp-2">{clip.hook ?? clip.topic}</p>

        {/* Brand color dots */}
        {clip.brand_colors?.length > 0 && (
          <div className="flex gap-1">
            {clip.brand_colors.map((color, i) => (
              <div key={i} style={{ backgroundColor: color }} className="w-3 h-3 rounded-full" title={color} />
            ))}
          </div>
        )}

        {/* Agent */}
        {clip.agent_name && (
          <p className="text-[10px] text-[#64748B]">Agente: {clip.agent_name}</p>
        )}

        {/* Metrics for ready/published */}
        {(clip.status === 'ready' || clip.status === 'published') && (
          <div className="flex gap-3 text-[10px] text-[#64748B]">
            <span>👁 {clip.views ?? 0}</span>
            <span>❤️ {clip.likes ?? 0}</span>
            {clip.published_to?.length > 0 && (
              <span className="text-blue-400">📤 {clip.published_to.join(', ')}</span>
            )}
          </div>
        )}

        {/* Error */}
        {clip.error_message && (
          <p className="text-[10px] text-red-400 line-clamp-2">{clip.error_message}</p>
        )}

        {/* Actions */}
        <div className="flex gap-1.5 pt-1">
          {clip.status === 'ready' && !clip.auto_publish && (
            <button
              onClick={onPublish}
              className="flex-1 h-7 text-[10px] font-semibold rounded-lg bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 transition-colors"
            >
              📤 Publicar
            </button>
          )}
          {clip.status === 'failed' && (
            <button
              onClick={onRetry}
              className="flex-1 h-7 text-[10px] font-semibold rounded-lg border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition-colors"
            >
              🔄 Reintentar
            </button>
          )}
          {clip.video_url && (
            <button
              onClick={onOpen}
              className="flex-1 h-7 text-[10px] font-semibold rounded-lg border border-white/[0.08] text-[#94A3B8] hover:text-white flex items-center justify-center transition-colors"
            >
              ▶ Ver
            </button>
          )}
          <button
            onClick={onDelete}
            className="h-7 w-7 rounded-lg border border-white/[0.06] text-[#3A3A5C] hover:text-red-400 hover:border-red-500/20 flex items-center justify-center transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
