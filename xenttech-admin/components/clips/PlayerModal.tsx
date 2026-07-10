"use client"
import { X, Download, Trash2 } from "lucide-react"
import type { AiClip } from "./ClipCard"

interface Props {
  clip: AiClip
  onClose: () => void
  onPublish: () => void
  onDelete: () => void
}

export function PlayerModal({ clip, onClose, onPublish, onDelete }: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl mx-4 rounded-2xl border border-[#1A1A35] bg-[#0D0D1F] overflow-hidden flex flex-col md:flex-row"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Video */}
        <div className="flex-shrink-0 bg-black flex items-center justify-center" style={{ minWidth: 200 }}>
          {clip.video_url ? (
            <video
              src={clip.video_url}
              controls
              autoPlay
              playsInline
              preload="auto"
              className="h-full max-h-[80vh] aspect-[9/16] object-contain"
              onError={(e) => console.error('PLAYER_VIDEO_ERROR:', clip.video_url, e)}
            />
          ) : (
            <div className="w-48 aspect-[9/16] flex items-center justify-center text-[#3A3A5C]">
              Sin video
            </div>
          )}
        </div>

        {/* Info panel */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {/* Status + tone */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border border-[#1A1A35] text-[#94A3B8] capitalize">
              {clip.status}
            </span>
            <span className="text-xs text-[#64748B] capitalize">{clip.tone}</span>
            <span className="text-xs text-[#64748B]">{clip.duration_seconds}s</span>
          </div>

          {/* Topic */}
          <div>
            <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1">Tema</p>
            <p className="text-sm text-white">{clip.topic}</p>
          </div>

          {/* Hook */}
          {clip.hook && (
            <div>
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1">Hook</p>
              <p className="text-sm font-semibold text-[#00D4AA]">{clip.hook}</p>
            </div>
          )}

          {/* Script */}
          {clip.script && (
            <div>
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1">Guión</p>
              <p className="text-sm text-[#94A3B8] leading-relaxed">{clip.script}</p>
            </div>
          )}

          {/* CTA */}
          {clip.cta && (
            <div>
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1">CTA</p>
              <p className="text-sm text-white">{clip.cta}</p>
            </div>
          )}

          {/* Metrics */}
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <p className="font-bold text-white">{clip.views ?? 0}</p>
              <p className="text-[10px] text-[#64748B]">Views</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-white">{clip.likes ?? 0}</p>
              <p className="text-[10px] text-[#64748B]">Likes</p>
            </div>
          </div>

          {/* Brand colors */}
          {clip.brand_colors?.length > 0 && (
            <div>
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1.5">Colores de marca</p>
              <div className="flex gap-2">
                {clip.brand_colors.map((color, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div style={{ backgroundColor: color }} className="w-5 h-5 rounded-md" />
                    <span className="text-[10px] text-[#64748B]">{color}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reference images */}
          {clip.reference_images?.length > 0 && (
            <div>
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1.5">Imágenes de referencia</p>
              <div className="flex gap-2">
                {clip.reference_images.map((url, i) => (
                  <div key={i} className="relative w-20 aspect-video rounded-lg overflow-hidden border border-[#1A1A35]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    {i === 0 && (
                      <span className="absolute bottom-0.5 left-0.5 text-[8px] font-bold px-1 rounded bg-[#00D4AA] text-black">base</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent */}
          {clip.agent_name && (
            <p className="text-xs text-[#64748B]">Agente: {clip.agent_name}</p>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            {clip.status === 'ready' && !clip.auto_publish && (
              <button
                onClick={onPublish}
                className="h-9 rounded-xl bg-[#00D4AA] text-black text-sm font-semibold hover:bg-[#00D4AA]/90 transition-colors"
              >
                📤 Publicar en Facebook
              </button>
            )}
            {clip.video_url && (
              <a
                href={clip.video_url}
                download={`clip-${clip.id}.mp4`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 rounded-xl border border-white/[0.08] text-sm text-[#94A3B8] hover:text-white flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="h-4 w-4" /> Descargar
              </a>
            )}
            <button
              onClick={onDelete}
              className="h-9 rounded-xl border border-red-500/20 text-sm text-red-400 hover:bg-red-500/10 flex items-center justify-center gap-2 transition-colors"
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
