import { NextResponse } from 'next/server';

export const maxDuration = 60;

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY    = process.env.OPENAI_API_KEY;

function secondsToTimestamp(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export async function POST(req: Request) {
  // ── Direct file upload (FormData) ─────────────────────────────────────────
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    if (!OPENAI_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 });
    const fd   = await req.formData();
    const file = fd.get('file') as Blob | null;
    if (!file) return NextResponse.json({ error: 'No file in FormData' }, { status: 400 });

    const isAudio = file.type.includes('audio') || (file instanceof File && file.name.endsWith('.mp3'));
    const fname   = isAudio ? 'audio.mp3' : 'video.mp4';
    const mime    = isAudio ? 'audio/mpeg' : 'video/mp4';

    const whisperForm = new FormData();
    whisperForm.append('file', new File([file], fname, { type: mime }));
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('language', 'es');
    whisperForm.append('response_format', 'verbose_json');
    whisperForm.append('timestamp_granularities[]', 'segment');

    const wRes  = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: whisperForm,
    });
    const wData = await wRes.json() as { text?: string; segments?: { start: number; end: number; text: string }[]; duration?: number; error?: { message: string } };
    if (wData.error) return NextResponse.json({ error: wData.error.message }, { status: 500 });
    return NextResponse.json({ transcript: wData.text ?? '', segments: wData.segments ?? [], duration: wData.duration ?? 0 });
  }

  const body = await req.json() as {
    action: string;
    video_url?: string;
    transcript?: string;
    client_id?: string;
    is_audio?: boolean;
  };
  const { action } = body;

  // ── Transcribe via OpenAI Whisper ─────────────────────────────────────
  if (action === 'transcribe') {
    if (!OPENAI_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 });
    if (!body.video_url) return NextResponse.json({ error: 'video_url required' }, { status: 400 });

    let videoBlob: Blob;
    try {
      const res = await fetch(body.video_url);
      if (!res.ok) throw new Error(`Failed to fetch video: ${res.status}`);
      videoBlob = await res.blob();
    } catch (e: unknown) {
      return NextResponse.json({ error: 'Could not download video: ' + (e as Error).message }, { status: 500 });
    }

    if (videoBlob.size > 25 * 1024 * 1024) {
      return NextResponse.json({
        error: 'Video demasiado grande para Whisper (máx 25 MB). Comprime el video primero o sube solo el audio.',
        too_large: true,
      }, { status: 400 });
    }

    const form = new FormData();
    let filename: string;
    let mime: string;
    if (body.is_audio) {
      filename = 'audio.mp3';
      mime = 'audio/mpeg';
    } else {
      const ext = (body.video_url.split('?')[0].split('.').pop() ?? 'mp4').toLowerCase();
      mime = ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4';
      filename = `video.${ext}`;
    }
    form.append('file', new File([videoBlob], filename, { type: mime }));
    form.append('model', 'whisper-1');
    form.append('language', 'es');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form,
    });
    const whisper = await whisperRes.json() as {
      text?: string;
      segments?: { start: number; end: number; text: string }[];
      duration?: number;
      error?: { message: string };
    };

    if (whisper.error) return NextResponse.json({ error: whisper.error.message }, { status: 500 });

    return NextResponse.json({
      transcript: whisper.text ?? '',
      segments:   whisper.segments ?? [],
      duration:   whisper.duration ?? 0,
    });
  }

  // ── Find best moments with Claude ─────────────────────────────────────
  if (action === 'find_moments') {
    if (!ANTHROPIC_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
    if (!body.transcript) return NextResponse.json({ error: 'transcript required' }, { status: 400 });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Analiza esta transcripción con timestamps y encuentra los 3-5 momentos más interesantes para hacer clips de Reels (15-60 segundos cada uno).

TRANSCRIPCIÓN CON TIMESTAMPS:
${body.transcript.substring(0, 8000)}

Responde SOLO JSON válido, sin explicaciones, sin backticks:
[
  {
    "title": "título corto del clip (máx 8 palabras)",
    "start_seconds": 120,
    "end_seconds": 150,
    "duration": 30,
    "subtitle_preview": "primeras 15 palabras del clip...",
    "score": 95,
    "reason": "por qué este momento es interesante para Reels"
  }
]

Criterios: declaraciones impactantes, datos sorprendentes, historias personales, consejos prácticos, momentos de humor, fragmentos que funcionen solos sin contexto.
Duración ideal: 20-45 segundos. Máximo 60. Mínimo 15.`,
        }],
      }),
    });

    const data = await res.json() as { content?: { text: string }[]; error?: { message: string } };
    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 500 });

    let moments: unknown[] = [];
    try {
      const raw = data.content?.[0]?.text ?? '[]';
      const cleaned = raw.replace(/```json|```/g, '').trim();
      moments = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'Failed to parse moments JSON', raw: data.content?.[0]?.text }, { status: 500 });
    }

    return NextResponse.json({ moments });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
