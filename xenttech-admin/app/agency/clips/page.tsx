"use client";
export const dynamic = 'force-dynamic';
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Sparkles, Download, AlertCircle, RefreshCw, Film, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface Client { id: string; name: string; company: string | null }
interface Segment { start: number; end: number; text: string }
interface Moment {
  title: string;
  start_seconds: number;
  end_seconds: number;
  duration: number;
  subtitle_preview: string;
  score: number;
  reason: string;
}
interface TranscriptData { transcript: string; segments: Segment[]; duration: number }

interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  primaryColor: string;
  outlineColor: string;
  outlineWidth: number;
  position: 'bottom' | 'center' | 'top';
  background: 'none' | 'box' | 'highlight';
  allCaps: boolean;
  wordsPerLine: number;
}

interface FormatPreset { label: string; width: number; height: number; crop: string | null }

type Step = 'idle' | 'uploading' | 'uploaded' | 'extracting_audio' | 'transcribing' | 'transcribed' | 'analyzing' | 'done';

interface AiClip {
  id: string
  agent_id: string | null
  agent_name?: string | null
  topic: string
  script: string | null
  video_prompt: string | null
  generation_task_id: string | null
  video_url: string | null
  status: 'generating' | 'ready' | 'published' | 'failed' | 'pending'
  tone: string
  duration_seconds: number
  auto_publish: boolean
  error_message: string | null
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { key: 'uploading',        label: 'Subir video'       },
  { key: 'extracting_audio', label: 'Extraer audio'     },
  { key: 'transcribing',     label: 'Transcribir'       },
  { key: 'analyzing',        label: 'Detectar momentos' },
  { key: 'done',             label: 'Generar clips'     },
] as const;

const FORMAT_PRESETS: Record<string, FormatPreset> = {
  short:        { label: 'Short / Reel (9:16)',       width: 1080, height: 1920, crop: 'ih*9/16:ih' },
  ad_square:    { label: 'Anuncio Cuadrado (1:1)',     width: 1080, height: 1080, crop: 'min(iw\\,ih):min(iw\\,ih)' },
  ad_landscape: { label: 'Anuncio Horizontal (16:9)', width: 1920, height: 1080, crop: 'iw:iw*9/16' },
  original:     { label: 'Formato Original',           width: 0,    height: 0,    crop: null },
};

const SUBTITLE_COLORS = ['#FFFFFF', '#FFFF00', '#00D4AA', '#00BFFF', '#FF6B6B'];

const DEFAULT_STYLE: SubtitleStyle = {
  fontFamily:   'Arial Bold',
  fontSize:     22,
  primaryColor: '#FFFFFF',
  outlineColor: '#000000',
  outlineWidth: 2,
  position:     'bottom',
  background:   'none',
  allCaps:      false,
  wordsPerLine: 7,
};

const TONES = [
  { value: 'professional',  label: 'Profesional'   },
  { value: 'inspirational', label: 'Inspiracional' },
  { value: 'educational',   label: 'Educativo'     },
  { value: 'sales',         label: 'Ventas'        },
]

const DURATIONS = [6, 10, 15]

const supabase = createClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSec(s: number) {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatSRTTime(s: number) {
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms  = Math.floor((s % 1) * 1000);
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')},${ms.toString().padStart(3,'0')}`;
}

function generateSRT(text: string, durationSec: number, style: SubtitleStyle): string {
  const raw    = style.allCaps ? text.toUpperCase() : text;
  const words  = raw.split(' ').filter(Boolean);
  const size   = style.wordsPerLine;
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(' '));
  if (!chunks.length) chunks.push(raw);
  const tpc = durationSec / chunks.length;
  return chunks.map((chunk, i) => {
    const s = i * tpc;
    const e = Math.min((i + 1) * tpc, durationSec);
    return `${i + 1}\n${formatSRTTime(s)} --> ${formatSRTTime(e)}\n${chunk}\n`;
  }).join('\n');
}

function buildDrawTextFilters(text: string, durationSec: number, style: SubtitleStyle): string {
  const raw    = style.allCaps ? text.toUpperCase() : text;
  const words  = raw.split(' ').filter(Boolean);
  const size   = style.wordsPerLine || 4;
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(' '));
  if (!chunks.length) chunks.push(raw);

  const tpc  = durationSec / chunks.length;
  const yPos = style.position === 'top' ? '60' : style.position === 'center' ? '(h-text_h)/2' : 'h-80-text_h';

  return chunks.map((chunk, i) => {
    const start = (i * tpc).toFixed(2);
    const end   = Math.min((i + 1) * tpc, durationSec).toFixed(2);
    const escaped = chunk
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '’')
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
    return `drawtext=text='${escaped}':fontsize=${style.fontSize}:fontcolor=${style.primaryColor}:borderw=${style.outlineWidth}:bordercolor=${style.outlineColor}:x=(w-text_w)/2:y=${yPos}:enable='between(t\\,${start}\\,${end})'`;
  }).join(',');
}

function downloadSRTFile(moment: Moment, style: SubtitleStyle, index: number) {
  const srt  = generateSRT(moment.subtitle_preview, moment.duration, style);
  const blob = new Blob([srt], { type: 'text/plain' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `clip-${index + 1}-subtitulos.srt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration); };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

// ── AI Clip Card ──────────────────────────────────────────────────────────────

function AiClipCard({ clip, onDelete, onPublish, onRetry }: {
  clip: AiClip
  onDelete: () => void
  onPublish: () => void
  onRetry: () => void
}) {
  const statusConfig = {
    generating: { label: 'Generando',  color: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/[0.06]', dot: '🔄' },
    ready:      { label: 'Listo',      color: 'text-[#00D4AA] border-[#00D4AA]/20 bg-[#00D4AA]/[0.06]',   dot: '✅' },
    published:  { label: 'Publicado',  color: 'text-blue-400 border-blue-500/20 bg-blue-500/[0.06]',       dot: '📤' },
    failed:     { label: 'Error',      color: 'text-red-400 border-red-500/20 bg-red-500/[0.06]',          dot: '❌' },
    pending:    { label: 'Pendiente',  color: 'text-[#64748B] border-white/[0.06] bg-white/[0.02]',        dot: '⏳' },
  }
  const cfg = statusConfig[clip.status] ?? statusConfig.pending

  return (
    <div className="rounded-xl border border-[#1A1A35] bg-[#0D0D1F] overflow-hidden">
      {/* Thumbnail / video */}
      {clip.video_url ? (
        <video
          src={clip.video_url}
          controls
          className="w-full aspect-[9/16] object-cover bg-black max-h-48"
        />
      ) : (
        <div className={cn(
          'w-full aspect-[9/16] max-h-48 flex items-center justify-center bg-[#080812]',
          clip.status === 'generating' && 'animate-pulse'
        )}>
          {clip.status === 'generating'
            ? <Loader2 className="h-8 w-8 text-[#3A3A5C] animate-spin" />
            : <Film className="h-8 w-8 text-[#1A1A35]" />
          }
        </div>
      )}

      <div className="p-3 space-y-2">
        {/* Status + tone */}
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', cfg.color)}>
            {cfg.dot} {cfg.label}
          </span>
          <span className="text-[10px] text-[#3A3A5C] capitalize">{clip.tone}</span>
          <span className="text-[10px] text-[#3A3A5C] ml-auto">{clip.duration_seconds}s</span>
        </div>

        {/* Topic */}
        <p className="text-xs font-medium text-white line-clamp-2">{clip.topic}</p>

        {/* Agent */}
        {clip.agent_name && (
          <p className="text-[10px] text-[#64748B]">Agente: {clip.agent_name}</p>
        )}

        {/* Error */}
        {clip.error_message && (
          <p className="text-[10px] text-red-400">{clip.error_message}</p>
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
            <a
              href={clip.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-7 text-[10px] font-semibold rounded-lg border border-white/[0.08] text-[#94A3B8] hover:text-white flex items-center justify-center transition-colors"
            >
              ▶ Preview
            </a>
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

// ── Main component ────────────────────────────────────────────────────────────

export default function ClipsPage() {
  return (
    <Suspense>
      <ClipsPageInner />
    </Suspense>
  )
}

function ClipsPageInner() {
  const [clients, setClients]   = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [step, setStep]         = useState<Step>('idle');
  const [error, setError]       = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  // Video
  const [videoFile, setVideoFile]     = useState<File | null>(null);
  const [videoObjectUrl, setVideoObjectUrl] = useState("");
  const [videoDuration, setVideoDuration]   = useState(0);
  const [videoUrl, setVideoUrl]       = useState("");
  const [clipRecordId, setClipRecordId] = useState<string | null>(null);
  const [isDragging, setIsDragging]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Transcript
  const [transcriptData, setTranscriptData] = useState<TranscriptData | null>(null);

  // Moments + selection
  const [moments, setMoments]             = useState<Moment[]>([]);
  const [selectedMoments, setSelectedMoments] = useState<Set<number>>(new Set());

  // Output options
  const [outputFormat, setOutputFormat]   = useState("short");
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_STYLE);
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [clipSubtitles, setClipSubtitles] = useState<Record<number, string>>({});

  // ffmpeg
  const [ffmpegReady, setFfmpegReady]     = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [cuttingIdx, setCuttingIdx]       = useState<number | null>(null);
  const [clipUrls, setClipUrls]           = useState<Record<number, string>>({});
  const ffmpegRef = useRef<unknown>(null);

  // ── Load clients ─────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.from("clients").select("id,name,company").order("name")
      .then(({ data }) => setClients(data ?? []));
  }, []);

  // Revoke object URL on unmount
  useEffect(() => () => { if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl); }, [videoObjectUrl]);

  // ── Load ffmpeg.wasm ─────────────────────────────────────────────────────

  async function loadFFmpeg(): Promise<boolean> {
    if (ffmpegRef.current) return true;
    setFfmpegLoading(true);
    try {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const ff = new FFmpeg();
      const baseURL  = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      const coreURL  = `${baseURL}/ffmpeg-core.js`;
      const wasmURL  = `${baseURL}/ffmpeg-core.wasm`;
      try {
        const { toBlobURL } = await import('@ffmpeg/util');
        await ff.load({
          coreURL: await toBlobURL(coreURL, 'text/javascript'),
          wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
        });
      } catch {
        await ff.load({ coreURL, wasmURL });
      }
      ffmpegRef.current = ff;
      setFfmpegReady(true);
      return true;
    } catch (e: unknown) {
      console.error('ffmpeg.wasm load failed:', e);
      return false;
    } finally {
      setFfmpegLoading(false);
    }
  }

  // ── Extract audio client-side ────────────────────────────────────────────

  async function extractAudio(file: File): Promise<Blob> {
    const ok = await loadFFmpeg();
    if (!ok) throw new Error('ffmpeg.wasm no pudo cargar');
    const ff = ffmpegRef.current as {
      on: (event: string, cb: (data: { progress: number }) => void) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeFile: (n: string, d: any) => Promise<void>;
      exec: (args: string[]) => Promise<void>;
      readFile: (n: string) => Promise<Uint8Array>;
      deleteFile: (n: string) => Promise<void>;
    };
    ff.on('progress', ({ progress: p }) => {
      setProgress(`Extrayendo audio: ${Math.round(p * 100)}%`);
    });
    const videoData = new Uint8Array(await file.arrayBuffer());
    await ff.writeFile('input.mp4', videoData);
    await ff.exec(['-i', 'input.mp4', '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', '-f', 'mp3', 'audio.mp3']);
    const audioData = await ff.readFile('audio.mp3');
    await ff.deleteFile('input.mp4');
    await ff.deleteFile('audio.mp3');
    return new Blob([audioData as unknown as BlobPart], { type: 'audio/mpeg' });
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('video/')) void handleFileSelect(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleFileSelect(file: File) {
    if (!clientId) { setError("Selecciona un cliente primero."); return; }

    if (file.size > 150 * 1024 * 1024) {
      setError(`Video demasiado grande (${Math.round(file.size / 1024 / 1024)} MB). Máximo 150 MB.`);
      return;
    }

    const dur = await getVideoDuration(file);
    if (dur > 300) {
      setError(`Video demasiado largo (${Math.round(dur / 60)} min). Máximo 5 minutos para clips automáticos.`);
      return;
    }

    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    const objUrl = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoObjectUrl(objUrl);
    setVideoDuration(dur);
    setStep('uploaded');
    setError(null);
    setMoments([]);
    setSelectedMoments(new Set());
    setClipUrls({});
    setTranscriptData(null);
    setClipRecordId(null);
    setVideoUrl("");
  }

  // ── Transcribe ───────────────────────────────────────────────────────────

  async function transcribeVideo() {
    if (!videoFile || !clientId) return;
    setStep('extracting_audio');
    setError(null);
    setProgress('Extrayendo audio del video...');

    let uploadBlob: Blob;
    let isAudio = true;
    let tempFileName: string;

    try {
      const audioBlob = await extractAudio(videoFile);

      if (audioBlob.size > 25 * 1024 * 1024) {
        setError('Audio extraído demasiado grande. Usa un video más corto.');
        setStep('uploaded');
        return;
      }

      const audioSizeMB = (audioBlob.size / 1024 / 1024).toFixed(1);
      setProgress(`Audio extraído (${audioSizeMB} MB). Subiendo para transcribir...`);
      uploadBlob    = audioBlob;
      tempFileName  = `${clientId}/audio/${Date.now()}-audio.mp3`;

    } catch {
      if (videoFile.size > 25 * 1024 * 1024) {
        setError('Comprime el video a menos de 25 MB o usa Chrome para habilitar procesamiento avanzado.');
        setStep('uploaded');
        return;
      }
      setProgress('Enviando video directamente a Whisper...');
      uploadBlob   = videoFile;
      isAudio      = false;
      tempFileName = `${clientId}/videos/${Date.now()}-${videoFile.name.replace(/\s+/g, '-')}`;
    }

    try {
      setStep('transcribing');
      setProgress('Transcribiendo con Whisper AI...');

      let transcriptResult: { transcript?: string; segments?: Segment[]; duration?: number; error?: string } | null = null;

      const contentType = isAudio ? 'audio/mpeg' : videoFile.type;
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(tempFileName, uploadBlob, { contentType, upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('client-documents').getPublicUrl(tempFileName);
        const res = await fetch('/api/process-video', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'transcribe', video_url: urlData.publicUrl, is_audio: isAudio }),
        });
        transcriptResult = await res.json();
        await supabase.storage.from('client-documents').remove([tempFileName]);
      } else {
        setProgress('Enviando audio directo a Whisper...');
        const fd = new FormData();
        fd.append('file', uploadBlob, isAudio ? 'audio.mp3' : videoFile.name);
        const res = await fetch('/api/process-video', { method: 'POST', body: fd });
        transcriptResult = await res.json();
      }

      const data = transcriptResult ?? {};
      if (data.error) { setError(data.error); setStep('uploaded'); return; }

      const td: TranscriptData = {
        transcript: data.transcript ?? '',
        segments:   data.segments   ?? [],
        duration:   data.duration   ?? 0,
      };
      setTranscriptData(td);

      const { data: rec } = await supabase.from('video_clips').insert({
        client_id: clientId, original_filename: videoFile.name, status: 'transcribed',
        transcript: td.transcript, segments: td.segments, duration_seconds: Math.round(td.duration),
      }).select('id').single();
      if (rec) setClipRecordId(rec.id);

      setStep('transcribed');

    } catch (e: unknown) { setError((e as Error).message); setStep('uploaded'); }
  }

  // ── Find moments ──────────────────────────────────────────────────────────

  async function findMoments() {
    if (!transcriptData) return;
    setStep('analyzing');
    setError(null);
    try {
      const segText = transcriptData.segments.length
        ? transcriptData.segments.map(s => `[${fmtSec(s.start)}-${fmtSec(s.end)}] ${s.text}`).join('\n')
        : transcriptData.transcript;
      const res  = await fetch('/api/process-video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'find_moments', transcript: segText }),
      });
      const data = await res.json() as { moments?: Moment[]; error?: string };
      if (data.error) { setError(data.error); setStep('transcribed'); return; }
      const mts = data.moments ?? [];
      setMoments(mts);
      setSelectedMoments(new Set(mts.map((_, i) => i)));
      setClipSubtitles(Object.fromEntries(mts.map((m, i) => [i, m.subtitle_preview])));
      if (clipRecordId) await supabase.from('video_clips').update({ clips: mts, status: 'analyzed' }).eq('id', clipRecordId);
      setStep('done');
    } catch (e: unknown) { setError((e as Error).message); setStep('transcribed'); }
  }

  // ── Cut clips ─────────────────────────────────────────────────────────────

  async function cutClip(moment: Moment, index: number) {
    if (!videoFile) { setError('Archivo de video no disponible.'); return; }
    setCuttingIdx(index);
    setError(null);
    const ok = await loadFFmpeg();
    if (!ok) { setError('ffmpeg.wasm no cargó. Descarga el SRT y usa CapCut.'); setCuttingIdx(null); return; }
    try {
      const ff = ffmpegRef.current as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        writeFile: (n: string, d: any) => Promise<void>;
        exec: (args: string[]) => Promise<void>;
        readFile: (n: string) => Promise<Uint8Array>;
        deleteFile: (n: string) => Promise<void>;
      };
      const { fetchFile } = await import('@ffmpeg/util');
      await ff.writeFile('input.mp4', await fetchFile(videoFile));

      const fmt     = FORMAT_PRESETS[outputFormat];
      const vfParts: string[] = [];
      if (fmt.crop)  vfParts.push(`crop=${fmt.crop}`);
      if (fmt.width) vfParts.push(`scale=${fmt.width}:${fmt.height}`);

      if (burnSubtitles) {
        const subText = clipSubtitles[index] ?? moment.subtitle_preview;
        const textFilter = buildDrawTextFilters(subText, moment.duration, subtitleStyle);
        if (textFilter) vfParts.push(textFilter);
      }

      const out  = `clip_${index}.mp4`;
      const args = [
        '-ss', String(moment.start_seconds),
        '-i', 'input.mp4',
        '-t', String(moment.duration),
      ];
      if (vfParts.length) args.push('-vf', vfParts.join(','));
      args.push('-c:v', 'libx264', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-preset', 'ultrafast', '-y', out);

      await ff.exec(args);

      const data = await ff.readFile(out);
      setClipUrls(prev => ({ ...prev, [index]: URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: 'video/mp4' })) }));
      await ff.deleteFile('input.mp4');
      await ff.deleteFile(out);
    } catch (e: unknown) {
      console.error('ffmpeg error:', e);
      setError('Error al cortar. Usa el botón "Solo SRT" y CapCut.');
    } finally { setCuttingIdx(null); }
  }

  async function generateSelectedClips() {
    const indices = Array.from(selectedMoments).sort((a, b) => a - b);
    for (const i of indices) {
      if (!clipUrls[i]) await cutClip(moments[i], i);
    }
  }

  function toggleMoment(i: number) {
    setSelectedMoments(prev => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }

  function toggleAllMoments() {
    setSelectedMoments(prev =>
      prev.size === moments.length ? new Set() : new Set(moments.map((_, i) => i))
    );
  }

  function resetAll() {
    setStep('idle'); setVideoFile(null); setMoments([]); setSelectedMoments(new Set());
    setClipUrls({}); setTranscriptData(null); setVideoUrl(''); setClipRecordId(null);
    setError(null); setVideoDuration(0); setProgress(''); setClipSubtitles({});
    if (videoObjectUrl) { URL.revokeObjectURL(videoObjectUrl); setVideoObjectUrl(""); }
  }

  // ── AI Generation state ───────────────────────────────────────────────────

  const router       = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab]         = useState<'extract' | 'generate'>(
    (searchParams.get('tab') as 'extract' | 'generate') ?? 'extract'
  )
  const [agents, setAgents]               = useState<{ id: string; name: string }[]>([])
  const [aiClips, setAiClips]             = useState<AiClip[]>([])
  const [showGenModal, setShowGenModal]   = useState(false)
  const [genDispatched, setGenDispatched] = useState(false)
  const [generating, setGenerating]       = useState(false)
  const [genError, setGenError]           = useState<string | null>(null)
  const [publishing, setPublishing]       = useState<string | null>(null)
  const [genForm, setGenForm]             = useState({
    agent_id:     '',
    topic:        '',
    tone:         'professional',
    duration:     10,
    auto_publish: false,
  })
  const [toasts, setToasts]               = useState<Array<{ id: string; message: string; type: 'success' | 'error' }>>([])

  function addToast(message: string, type: 'success' | 'error') {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }

  function handleTabChange(tab: 'extract' | 'generate') {
    setActiveTab(tab)
    router.replace(`?tab=${tab}`, { scroll: false })
  }

  async function loadAiClips() {
    const [agentRes, clipRes] = await Promise.all([
      supabase.from('xenttech_agents').select('id, name').order('name'),
      supabase.from('xenttech_clips_ai').select('*').order('created_at', { ascending: false }).limit(50),
    ])
    const agentMap = new Map((agentRes.data ?? []).map(a => [a.id, a.name]))
    setAgents(agentRes.data ?? [])
    setAiClips((clipRes.data ?? []).map(c => ({ ...c, agent_name: agentMap.get(c.agent_id) ?? null })))
  }

  useEffect(() => { void loadAiClips() }, [])

  // Poll generating clips every 5s — fires toast when status changes
  useEffect(() => {
    const generatingClips = aiClips.filter(c => c.status === 'generating')
    if (!generatingClips.length) return
    const interval = setInterval(async () => {
      await Promise.all(
        generatingClips.map(async clip => {
          const res  = await fetch(`/api/clips/${clip.id}/status`)
          if (!res.ok) return
          const data = await res.json() as AiClip
          if (data.status !== clip.status) {
            if (data.status === 'ready')  addToast(`✅ Clip "${clip.topic}" listo para publicar`, 'success')
            if (data.status === 'failed') addToast(`❌ Error en "${clip.topic}": ${data.error_message ?? 'falló la generación'}`, 'error')
          }
          setAiClips(prev => prev.map(c => c.id === clip.id ? { ...c, ...data } : c))
        })
      )
    }, 5_000)
    return () => clearInterval(interval)
  }, [aiClips])

  async function handleGenerate() {
    if (!genForm.agent_id || !genForm.topic.trim()) return
    setGenerating(true)
    setGenError(null)
    try {
      const res  = await fetch('/api/clips/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(genForm),
      })
      const data = await res.json() as { clip_id?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error al generar')
      setGenDispatched(true)
      await loadAiClips()
    } catch (e) {
      setGenError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  function closeGenModal() {
    setShowGenModal(false)
    setGenDispatched(false)
    setGenError(null)
    if (genDispatched) setGenForm({ agent_id: '', topic: '', tone: 'professional', duration: 10, auto_publish: false })
  }

  async function handlePublish(clipId: string) {
    setPublishing(clipId)
    try {
      const res = await fetch(`/api/clips/${clipId}/publish`, { method: 'POST' })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error al publicar')
      await loadAiClips()
    } catch (e) {
      console.error('publish error:', e)
    } finally {
      setPublishing(null)
    }
  }

  async function handleDeleteAiClip(clipId: string) {
    await supabase.from('xenttech_clips_ai').delete().eq('id', clipId)
    setAiClips(prev => prev.filter(c => c.id !== clipId))
  }

  async function handleRetry(clipId: string) {
    setAiClips(prev => prev.map(c => c.id === clipId ? { ...c, status: 'generating', error_message: null } : c))
    const res = await fetch(`/api/clips/${clipId}/retry`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      addToast(`❌ No se pudo reintentar: ${data.error ?? 'error desconocido'}`, 'error')
      await loadAiClips()
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const stepIndex = ['uploading', 'extracting_audio', 'transcribing', 'analyzing', 'done'].indexOf(step);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <Header title="Video Clips" description="Extrae clips virales de videos o genera contenido nuevo con IA" />

      {/* ── Tab switcher ── */}
      <div className="flex border-b border-[#1A1A35] px-6 shrink-0">
        <button
          onClick={() => handleTabChange('extract')}
          className={cn(
            'py-3 px-4 text-sm font-medium border-b-2 transition-colors -mb-px',
            activeTab === 'extract'
              ? 'border-[#00D4AA] text-[#00D4AA]'
              : 'border-transparent text-[#64748B] hover:text-white'
          )}
        >
          ✂️ Extraer clips virales
        </button>
        <button
          onClick={() => handleTabChange('generate')}
          className={cn(
            'py-3 px-4 text-sm font-medium border-b-2 transition-colors -mb-px',
            activeTab === 'generate'
              ? 'border-[#00D4AA] text-[#00D4AA]'
              : 'border-transparent text-[#64748B] hover:text-white'
          )}
        >
          ✨ Generar con IA
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1 — EXTRAER CLIPS VIRALES (código original sin cambios)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'extract' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-300 flex-1">{error}</p>
              <button onClick={() => setError(null)} className="text-red-400 text-xs">✕</button>
            </div>
          )}

          {/* Client selector */}
          <div className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-4">
            <label className="text-xs text-[#64748B] mb-1.5 block">Cliente</label>
            <Select value={clientId} onValueChange={v => { setClientId(v); resetAll(); }}>
              <SelectTrigger className="bg-[#0D0D1F] border-white/[0.08] text-white max-w-xs">
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent className="bg-[#0D0D1F] border-white/[0.08]">
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-white hover:bg-white/[0.06]">
                    {c.name}{c.company ? ` — ${c.company}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Progress steps */}
          {step !== 'idle' && (
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => {
                const done = i < stepIndex, active = i === stepIndex;
                return (
                  <div key={s.key} className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={cn("flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                      done ? "bg-[#00D4AA] text-black" : active ? "bg-blue-500 text-white" : "bg-white/[0.06] text-[#64748B]")}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span className={cn("text-xs truncate", done ? "text-[#00D4AA]" : active ? "text-blue-400" : "text-[#64748B]")}>
                      {s.label}
                    </span>
                    {i < STEPS.length - 1 && <div className={cn("h-px flex-1 mx-1", done ? "bg-[#00D4AA]/30" : "bg-white/[0.06]")} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Upload drop zone */}
          {clientId && step === 'idle' && (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors",
                isDragging ? "border-[#00D4AA]/60 bg-[#00D4AA]/[0.05]" : "border-white/[0.12] hover:border-white/[0.25] bg-[#080812]"
              )}
            >
              <Film className="h-10 w-10 text-[#64748B] mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Arrastra tu video aquí</p>
              <p className="text-xs text-[#64748B]">MP4, MOV, WebM · máx 150 MB · máx 5 minutos</p>
              <input ref={fileRef} type="file" accept="video/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleFileSelect(f); }} />
            </div>
          )}

          {/* Video info + preview */}
          {videoFile && step !== 'idle' && (
            <div className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-4 space-y-4">
              {videoObjectUrl && (
                <video src={videoObjectUrl} controls
                  className="w-full max-w-lg rounded-xl border border-white/[0.08]" />
              )}
              <div className="flex items-center gap-3">
                <Film className="h-7 w-7 text-purple-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">{videoFile.name}</p>
                  <p className="text-xs text-[#64748B]">
                    {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                    {videoDuration > 0 ? ` · ${fmtSec(videoDuration)}` : ''}
                  </p>
                </div>
              </div>

              {step === 'uploaded' && (
                <Button onClick={transcribeVideo} className="bg-[#00D4AA] text-black hover:bg-[#00D4AA]/90 font-semibold gap-2 w-full">
                  <Sparkles className="h-4 w-4" /> Extraer audio y transcribir
                </Button>
              )}
              {step === 'extracting_audio' && (
                <p className="flex items-center gap-2 text-yellow-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> {progress || 'Extrayendo audio del video...'}
                </p>
              )}
              {step === 'transcribing' && (
                <p className="flex items-center gap-2 text-blue-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> {progress || 'Transcribiendo… puede tardar 1-2 minutos'}
                </p>
              )}
              {step === 'transcribed' && transcriptData && (
                <div className="space-y-3">
                  <div className="rounded-lg bg-white/[0.03] border border-[#1A1A35] p-3">
                    <p className="text-xs text-[#64748B] mb-1">
                      Transcripción — {fmtSec(transcriptData.duration)} · {transcriptData.segments.length} segmentos
                    </p>
                    <p className="text-xs text-[#94A3B8] leading-relaxed line-clamp-3">
                      {transcriptData.transcript.slice(0, 300)}…
                    </p>
                  </div>
                  <Button onClick={findMoments} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold gap-2 w-full">
                    <Sparkles className="h-4 w-4" /> Detectar mejores momentos con Claude
                  </Button>
                </div>
              )}
              {step === 'analyzing' && (
                <p className="flex items-center gap-2 text-purple-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Claude analizando la transcripción…
                </p>
              )}
            </div>
          )}

          {/* Options (shown when moments detected) */}
          {moments.length > 0 && (
            <>
              {/* Format selector */}
              <div className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-4 space-y-3">
                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">Formato de salida</p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(FORMAT_PRESETS).map(([key, preset]) => (
                    <button key={key} onClick={() => setOutputFormat(key)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-semibold border transition-colors",
                        outputFormat === key
                          ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                          : "border-[#1A1A35] text-[#64748B] hover:text-white hover:border-white/[0.15]"
                      )}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subtitle style panel */}
              <div className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">Estilo de subtítulos</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setBurnSubtitles(true)}
                      className={cn("px-2.5 py-1 rounded-md text-xs font-semibold transition-colors",
                        burnSubtitles ? "bg-[#00D4AA] text-black" : "border border-white/[0.08] text-[#64748B] hover:text-white")}>
                      Con subtítulos
                    </button>
                    <button onClick={() => setBurnSubtitles(false)}
                      className={cn("px-2.5 py-1 rounded-md text-xs font-semibold transition-colors",
                        !burnSubtitles ? "bg-white/10 text-white" : "border border-white/[0.08] text-[#64748B] hover:text-white")}>
                      Sin subtítulos
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-[#64748B] mb-1 block">Fuente</label>
                    <select value={subtitleStyle.fontFamily}
                      onChange={e => setSubtitleStyle(s => ({ ...s, fontFamily: e.target.value }))}
                      className="w-full h-8 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-xs px-2 focus:outline-none">
                      <option value="Arial Bold">Arial Bold</option>
                      <option value="Helvetica">Helvetica</option>
                      <option value="Impact">Impact</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[#64748B] mb-1 block">Tamaño</label>
                    <select value={subtitleStyle.fontSize}
                      onChange={e => setSubtitleStyle(s => ({ ...s, fontSize: parseInt(e.target.value) }))}
                      className="w-full h-8 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-xs px-2 focus:outline-none">
                      <option value={16}>Pequeño (16)</option>
                      <option value={22}>Mediano (22)</option>
                      <option value={28}>Grande (28)</option>
                      <option value={36}>Extra grande (36)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[#64748B] mb-1 block">Posición</label>
                    <select value={subtitleStyle.position}
                      onChange={e => setSubtitleStyle(s => ({ ...s, position: e.target.value as SubtitleStyle['position'] }))}
                      className="w-full h-8 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-xs px-2 focus:outline-none">
                      <option value="bottom">Abajo</option>
                      <option value="center">Centro</option>
                      <option value="top">Arriba</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[#64748B] mb-1 block">Fondo</label>
                    <select value={subtitleStyle.background}
                      onChange={e => setSubtitleStyle(s => ({ ...s, background: e.target.value as SubtitleStyle['background'] }))}
                      className="w-full h-8 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-xs px-2 focus:outline-none">
                      <option value="none">Sin fondo (outline)</option>
                      <option value="box">Caja negra</option>
                      <option value="highlight">Highlight</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[#64748B] mb-1 block">Capitalización</label>
                    <select value={subtitleStyle.allCaps ? 'yes' : 'no'}
                      onChange={e => setSubtitleStyle(s => ({ ...s, allCaps: e.target.value === 'yes' }))}
                      className="w-full h-8 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-xs px-2 focus:outline-none">
                      <option value="no">Normal</option>
                      <option value="yes">MAYÚSCULAS</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[#64748B] mb-1 block">Palabras/línea</label>
                    <select value={subtitleStyle.wordsPerLine}
                      onChange={e => setSubtitleStyle(s => ({ ...s, wordsPerLine: parseInt(e.target.value) }))}
                      className="w-full h-8 rounded-lg bg-[#0D0D1F] border border-white/[0.08] text-white text-xs px-2 focus:outline-none">
                      <option value={3}>3 (karaoke)</option>
                      <option value={5}>5 (compacto)</option>
                      <option value={7}>7 (estándar)</option>
                      <option value={10}>10 (largo)</option>
                    </select>
                  </div>
                </div>

                {/* Color picker */}
                <div>
                  <label className="text-xs text-[#64748B] mb-2 block">Color del texto</label>
                  <div className="flex gap-2 items-center">
                    {SUBTITLE_COLORS.map(c => (
                      <div key={c} onClick={() => setSubtitleStyle(s => ({ ...s, primaryColor: c }))}
                        className="w-7 h-7 rounded-lg cursor-pointer transition-all"
                        style={{ background: c, border: subtitleStyle.primaryColor === c ? '2px solid white' : '2px solid transparent' }} />
                    ))}
                    <input type="color" value={subtitleStyle.primaryColor}
                      onChange={e => setSubtitleStyle(s => ({ ...s, primaryColor: e.target.value }))}
                      className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0" />
                  </div>
                </div>

                {/* Live preview */}
                <div className="relative rounded-xl overflow-hidden bg-black"
                  style={{ height: 96, display: 'flex',
                    alignItems: subtitleStyle.position === 'top' ? 'flex-start' : subtitleStyle.position === 'center' ? 'center' : 'flex-end',
                    justifyContent: 'center',
                    padding: subtitleStyle.position === 'bottom' ? '0 16px 16px' : subtitleStyle.position === 'top' ? '16px 16px 0' : '0 16px',
                  }}>
                  <span style={{
                    fontFamily:    subtitleStyle.fontFamily,
                    fontSize:      subtitleStyle.fontSize * 0.7,
                    color:         subtitleStyle.primaryColor,
                    textTransform: subtitleStyle.allCaps ? 'uppercase' : 'none',
                    textShadow:    subtitleStyle.background === 'none'
                      ? `0 0 4px ${subtitleStyle.outlineColor}, 1px 1px 2px ${subtitleStyle.outlineColor}, -1px -1px 2px ${subtitleStyle.outlineColor}`
                      : 'none',
                    background: subtitleStyle.background === 'box'
                      ? 'rgba(0,0,0,0.75)'
                      : subtitleStyle.background === 'highlight'
                        ? 'rgba(0,0,0,0.85)'
                        : 'transparent',
                    padding: subtitleStyle.background !== 'none' ? '4px 10px' : '0',
                    borderRadius: 4,
                  }}>
                    Texto de subtítulo de ejemplo
                  </span>
                </div>
              </div>

              {/* Moment cards */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-white">{moments.length} momentos detectados</p>
                    <button onClick={toggleAllMoments}
                      className="text-xs text-[#64748B] hover:text-[#94A3B8] underline transition-colors">
                      {selectedMoments.size === moments.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    </button>
                  </div>
                  <Button
                    onClick={generateSelectedClips}
                    disabled={selectedMoments.size === 0 || cuttingIdx !== null || ffmpegLoading}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-semibold gap-2 text-xs"
                  >
                    {cuttingIdx !== null
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Cortando…</>
                      : <><Film className="h-3 w-3" />
                          Generar {selectedMoments.size} clip{selectedMoments.size !== 1 ? 's' : ''} seleccionado{selectedMoments.size !== 1 ? 's' : ''}</>}
                  </Button>
                </div>

                {ffmpegLoading && (
                  <p className="text-xs text-[#64748B] flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Cargando ffmpeg.wasm (~30 MB, solo la primera vez)…
                  </p>
                )}

                {moments.map((m, i) => (
                  <div key={i} className={cn(
                    "rounded-xl bg-[#0D0D1F] border p-5 space-y-3 transition-colors",
                    selectedMoments.has(i) ? "border-[#00D4AA]/20" : "border-[#1A1A35]"
                  )}>
                    <div className="flex items-start gap-3">
                      <div onClick={() => toggleMoment(i)}
                        className={cn(
                          "flex-shrink-0 w-6 h-6 rounded-md cursor-pointer flex items-center justify-center text-xs font-bold transition-all",
                          selectedMoments.has(i)
                            ? "bg-[#00D4AA] text-black"
                            : "border-2 border-white/[0.15] hover:border-white/[0.3]"
                        )}>
                        {selectedMoments.has(i) && '✓'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white">{m.title}</p>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          {fmtSec(m.start_seconds)} — {fmtSec(m.end_seconds)} · {m.duration}s
                        </p>
                      </div>
                      <div className={cn(
                        "shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold border",
                        m.score >= 85 ? "bg-[#00D4AA]/10 text-[#00D4AA] border-[#00D4AA]/20" :
                        m.score >= 70 ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
                        "bg-[#0D0D1F] text-[#94A3B8] border-white/[0.08]"
                      )}>{m.score}%</div>
                    </div>

                    <p className="text-xs text-[#94A3B8]">{m.reason}</p>

                    <div className="rounded-lg bg-black/20 border border-[#1A1A35] p-2.5">
                      <p className="text-xs text-[#64748B] font-medium mb-1.5 uppercase tracking-wider">Texto del subtítulo</p>
                      <textarea
                        value={clipSubtitles[i] ?? m.subtitle_preview}
                        onChange={e => setClipSubtitles(prev => ({ ...prev, [i]: e.target.value }))}
                        rows={2}
                        className="w-full bg-transparent text-xs text-[#94A3B8] resize-none focus:outline-none focus:text-white leading-relaxed placeholder-[#64748B]"
                        placeholder="Texto del subtítulo..."
                      />
                    </div>

                    {clipUrls[i] ? (
                      <div className="space-y-2">
                        <video src={clipUrls[i]} controls className="w-full max-w-xs rounded-xl" />
                        <div className="flex gap-2">
                          <a href={clipUrls[i]}
                            download={`clip-${i + 1}-${m.title.replace(/\s+/g, '-').toLowerCase()}.mp4`}
                            className="flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg border border-[#00D4AA]/30 text-[#00D4AA] bg-[#00D4AA]/[0.08] hover:bg-[#00D4AA]/15 transition-colors">
                            <Download className="h-3 w-3" /> Descargar Reel
                          </a>
                          <button onClick={() => downloadSRTFile({ ...m, subtitle_preview: clipSubtitles[i] ?? m.subtitle_preview }, subtitleStyle, i)}
                            className="flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg border border-white/[0.08] text-[#94A3B8] bg-[#0D0D1F] hover:bg-white/[0.08] transition-colors">
                            <Download className="h-3 w-3" /> SRT
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm"
                          onClick={() => cutClip(m, i)}
                          disabled={cuttingIdx !== null || ffmpegLoading}
                          className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs h-7">
                          {cuttingIdx === i
                            ? <><Loader2 className="h-3 w-3 animate-spin" /> Cortando…</>
                            : <><Film className="h-3 w-3" /> Generar clip</>}
                        </Button>
                        <button onClick={() => downloadSRTFile({ ...m, subtitle_preview: clipSubtitles[i] ?? m.subtitle_preview }, subtitleStyle, i)}
                          className="flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg border border-white/[0.08] text-[#94A3B8] bg-[#0D0D1F] hover:bg-white/[0.08] transition-colors">
                          <Download className="h-3 w-3" /> Solo SRT
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Reset */}
          {step === 'done' && (
            <div className="text-center pt-2">
              <Button variant="ghost" onClick={resetAll} className="text-[#64748B] hover:text-white gap-2">
                <RefreshCw className="h-4 w-4" /> Procesar otro video
              </Button>
            </div>
          )}

          <p className="text-center text-[11px] text-[#64748B] pb-2">
            Costo por video: ~$0.006/min Whisper + ~$0.01 Claude Haiku · Video de 5 min ≈ $0.05 USD
          </p>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2 — GENERAR CON IA (Kling)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'generate' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Videos generados con IA</p>
              <p className="text-xs text-[#64748B]">Claude planifica el guión · Kling genera el video</p>
            </div>
            <button
              onClick={() => setShowGenModal(true)}
              className="h-9 px-4 bg-[#00D4AA] text-black text-sm font-semibold rounded-xl flex items-center gap-2 hover:bg-[#00D4AA]/90 transition-colors"
            >
              <Sparkles className="h-4 w-4" /> Generar clip
            </button>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Listos',     value: aiClips.filter(c => c.status === 'ready' || c.status === 'published').length, color: 'text-[#00D4AA]' },
              { label: 'Generando', value: aiClips.filter(c => c.status === 'generating').length,                          color: 'text-yellow-400' },
              { label: 'Publicados',value: aiClips.filter(c => c.status === 'published').length,                           color: 'text-blue-400'   },
            ].map(m => (
              <div key={m.label} className="rounded-xl bg-[#0D0D1F] border border-[#1A1A35] p-3 text-center">
                <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                <p className="text-xs text-[#64748B] mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Clips grid */}
          {aiClips.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-[#1A1A35] p-12 text-center">
              <Sparkles className="h-8 w-8 text-[#1A1A35] mx-auto mb-3" />
              <p className="text-sm text-[#3A3A5C]">Sin clips generados todavía</p>
              <p className="text-xs text-[#1A1A35] mt-1">Haz click en "Generar clip" para empezar</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {aiClips.map(clip => (
                <AiClipCard
                  key={clip.id}
                  clip={clip}
                  onDelete={() => handleDeleteAiClip(clip.id)}
                  onPublish={() => handlePublish(clip.id)}
                  onRetry={() => handleRetry(clip.id)}
                />
              ))}
            </div>
          )}

          {publishing && (
            <p className="text-xs text-[#64748B] flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Publicando…
            </p>
          )}

        </div>
      )}

      {/* ── Generate modal ── */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4 rounded-2xl border border-[#1A1A35] bg-[#0D0D1F] shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[#1A1A35] flex-shrink-0">
              <h2 className="text-base font-bold text-white">✨ Generar clip con IA</h2>
              <p className="text-xs text-[#64748B] mt-0.5">Claude escribe el guión · Kling genera el video</p>
            </div>

            {/* Body — dispatched state */}
            {genDispatched && (
              <div className="flex-1 px-6 py-10 flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-12 h-12 rounded-full bg-[#00D4AA]/10 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-[#00D4AA] animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Generando tu clip…</p>
                  <p className="text-xs text-[#64748B] mt-1">Claude escribe el guión · Kling genera el video</p>
                  <p className="text-xs text-[#3A3A5C] mt-2">Tarda ~60-90 segundos. Puedes cerrar y seguir trabajando.</p>
                </div>
                <div className="flex flex-col gap-1.5 w-full max-w-[220px] text-left text-xs text-[#64748B]">
                  <p>✅ Solicitud enviada</p>
                  <p className="text-[#3A3A5C]">⏳ Claude escribiendo guión…</p>
                  <p className="text-[#3A3A5C]">⏳ Kling generando video…</p>
                </div>
              </div>
            )}

            {/* Body — form */}
            {!genDispatched && (
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

              {/* Agent */}
              <div>
                <label className="text-xs font-medium text-[#64748B] mb-1.5 block">Agente</label>
                <select
                  value={genForm.agent_id}
                  onChange={e => setGenForm(f => ({ ...f, agent_id: e.target.value }))}
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
                  value={genForm.topic}
                  onChange={e => setGenForm(f => ({ ...f, topic: e.target.value }))}
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
                      onClick={() => setGenForm(f => ({ ...f, tone: t.value }))}
                      className={cn(
                        'h-9 rounded-xl border text-xs font-medium transition-colors',
                        genForm.tone === t.value
                          ? 'border-[#00D4AA]/40 bg-[#00D4AA]/[0.08] text-[#00D4AA]'
                          : 'border-[#1A1A35] text-[#64748B] hover:border-white/[0.12] hover:text-white'
                      )}
                    >
                      {t.label}
                    </button>
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
                      onClick={() => setGenForm(f => ({ ...f, duration: d }))}
                      className={cn(
                        'flex-1 h-9 rounded-xl border text-xs font-medium transition-colors',
                        genForm.duration === d
                          ? 'border-[#00D4AA]/40 bg-[#00D4AA]/[0.08] text-[#00D4AA]'
                          : 'border-[#1A1A35] text-[#64748B] hover:border-white/[0.12] hover:text-white'
                      )}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto publish */}
              <button
                type="button"
                onClick={() => setGenForm(f => ({ ...f, auto_publish: !f.auto_publish }))}
                className={cn(
                  'w-full flex items-center justify-between p-3 rounded-xl border transition-colors',
                  genForm.auto_publish
                    ? 'border-[#00D4AA]/30 bg-[#00D4AA]/[0.04]'
                    : 'border-[#1A1A35]'
                )}
              >
                <div className="text-left">
                  <p className={cn('text-xs font-medium', genForm.auto_publish ? 'text-white' : 'text-[#64748B]')}>
                    Publicar automáticamente
                  </p>
                  <p className="text-[10px] text-[#3A3A5C]">Publica en Facebook cuando el video esté listo</p>
                </div>
                <div className={cn(
                  'w-9 h-5 rounded-full transition-colors flex items-center px-0.5',
                  genForm.auto_publish ? 'bg-[#00D4AA]' : 'bg-[#1A1A35]'
                )}>
                  <div className={cn(
                    'w-4 h-4 rounded-full bg-white transition-transform',
                    genForm.auto_publish ? 'translate-x-4' : 'translate-x-0'
                  )} />
                </div>
              </button>

              {genError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 py-2.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{genError}</p>
                </div>
              )}
            </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#1A1A35] flex-shrink-0 flex gap-3">
              {genDispatched ? (
                <button
                  type="button"
                  onClick={closeGenModal}
                  className="flex-1 h-10 rounded-xl bg-[#00D4AA] text-black text-sm font-semibold hover:bg-[#00D4AA]/90 transition-colors"
                >
                  Cerrar y seguir en background
                </button>
              ) : (
              <>
              <button
                type="button"
                onClick={closeGenModal}
                disabled={generating}
                className="flex-1 h-10 rounded-xl border border-[#1A1A35] text-sm text-[#64748B] hover:text-white transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !genForm.agent_id || !genForm.topic.trim()}
                className="flex-1 h-10 rounded-xl bg-[#00D4AA] text-black text-sm font-semibold hover:bg-[#00D4AA]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando…</> : <><Sparkles className="h-4 w-4" /> Generar</>}
              </button>
              </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notifications ── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <div
              key={t.id}
              className={cn(
                'px-4 py-3 rounded-xl text-sm font-medium shadow-lg pointer-events-auto max-w-xs',
                t.type === 'success'
                  ? 'bg-[#00D4AA] text-black'
                  : 'bg-red-500 text-white'
              )}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
