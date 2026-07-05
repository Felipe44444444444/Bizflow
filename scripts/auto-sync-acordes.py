#!/usr/bin/env python3
"""
Auto-sincronizador de acordes para ConnectaChat
Usa yt-dlp para bajar audio + librosa para detectar acordes via chromagrama CQT
"""

import sys
import json
import argparse
import tempfile
import os
import numpy as np


# ── Descarga (pytubefix — maneja SABR de YouTube) ─────────────────────────────

def descargar_audio(youtube_id: str, output_dir: str) -> str:
    import subprocess
    try:
        from pytubefix import YouTube
    except ImportError:
        raise ImportError("Instala pytubefix: pip3 install pytubefix --break-system-packages")

    url = f"https://www.youtube.com/watch?v={youtube_id}"
    yt = YouTube(url)
    stream = yt.streams.filter(only_audio=True).order_by("abr").last()
    if not stream:
        raise RuntimeError(f"No hay streams de audio para {youtube_id}")

    raw_path = stream.download(output_path=output_dir, filename=f"{youtube_id}.audio")
    wav_path = os.path.join(output_dir, f"{youtube_id}.wav")

    # Convertir a WAV mono 22050Hz con ffmpeg
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", raw_path, "-ac", "1", "-ar", "22050",
         "-f", "wav", wav_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg falló: {result.stderr[-200:]}")
    return wav_path


# ── Análisis ──────────────────────────────────────────────────────────────────

NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

PLANTILLAS_ACORDE = {
    # Mayores: raiz, 3a mayor, 5a
    'C':  [0,4,7],  'C#': [1,5,8],  'D':  [2,6,9],  'D#': [3,7,10],
    'E':  [4,8,11], 'F':  [5,9,0],  'F#': [6,10,1], 'G':  [7,11,2],
    'G#': [8,0,3],  'A':  [9,1,4],  'A#': [10,2,5], 'B':  [11,3,6],
    # Menores: raiz, 3a menor, 5a
    'Cm': [0,3,7],  'C#m':[1,4,8],  'Dm': [2,5,9],  'D#m':[3,6,10],
    'Em': [4,7,11], 'Fm': [5,8,0],  'F#m':[6,9,1],  'Gm': [7,10,2],
    'G#m':[8,11,3], 'Am': [9,0,4],  'A#m':[10,1,5], 'Bm': [11,2,6],
}


def mejor_acorde(chroma_frame: np.ndarray) -> tuple[str, str]:
    """Devuelve (nombre_acorde, tipo) para un frame de chromagrama."""
    scores = {nombre: sum(chroma_frame[n] for n in notas)
              for nombre, notas in PLANTILLAS_ACORDE.items()}
    ganador = max(scores, key=scores.get)
    tipo = "menor" if ganador.endswith("m") else "mayor"
    nombre_limpio = ganador.rstrip("m") if tipo == "menor" else ganador
    return nombre_limpio, tipo


def detectar_acordes(audio_path: str, bpm: float, tiempos_por_compas: int = 4) -> list[dict]:
    import librosa

    print(f"    Cargando audio...")
    y, sr = librosa.load(audio_path, sr=22050, mono=True)

    hop_length = 512
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)

    duracion_compas = (60.0 / bpm) * tiempos_por_compas
    frames_por_compas = max(1, int(duracion_compas * sr / hop_length))
    num_compases = chroma.shape[1] // frames_por_compas

    print(f"    {num_compases} compases @ {bpm} BPM ({tiempos_por_compas}/4)")

    acordes = []
    for i in range(num_compases):
        segmento = chroma[:, i * frames_por_compas:(i + 1) * frames_por_compas].mean(axis=1)
        acorde, tipo = mejor_acorde(segmento)
        acordes.append({
            "compas":           i + 1,
            "acorde":           acorde,
            "tipo":             tipo,
            "tiempo_segundos":  round(i * duracion_compas, 3),
            "duracion_estimada": round(duracion_compas, 3),
        })

    return acordes


# ── Pipeline completo ─────────────────────────────────────────────────────────

def sincronizar(cancion_id: int, youtube_id: str, bpm: float,
                tiempos_por_compas: int = 4, guardar: bool = True) -> dict:
    print(f"\n→ Canción {cancion_id} | YT={youtube_id} | {bpm} BPM | {tiempos_por_compas}/4")

    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, youtube_id)

        print("  [1/3] Descargando audio de YouTube...")
        audio_real = descargar_audio(youtube_id, audio_path)

        print("  [2/3] Analizando con chromagrama CQT...")
        acordes = detectar_acordes(audio_real, bpm, tiempos_por_compas)

        print(f"  [3/3] {len(acordes)} acordes detectados")

    resultado = {
        "cancion_id":  cancion_id,
        "youtube_id":  youtube_id,
        "bpm":         bpm,
        "sync_calidad": "auto-detectado",
        "acordes":     acordes,
    }

    if guardar:
        os.makedirs("data/sync", exist_ok=True)
        out = f"data/sync/cancion_{cancion_id}_sync.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(resultado, f, indent=2, ensure_ascii=False)
        print(f"  Guardado → {out}")

    return resultado


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Auto-sincronizador de acordes ConnectaChat")
    parser.add_argument("--id",     type=int,   required=True, help="ID de la canción en BD")
    parser.add_argument("--yt",     type=str,   required=True, help="YouTube video ID")
    parser.add_argument("--bpm",    type=float, required=True, help="BPM de la canción")
    parser.add_argument("--compas", type=int,   default=4,     help="Tiempos por compás (3 o 4)")
    parser.add_argument("--no-guardar", action="store_true",   help="No guardar JSON")
    args = parser.parse_args()

    resultado = sincronizar(
        cancion_id=args.id,
        youtube_id=args.yt,
        bpm=args.bpm,
        tiempos_por_compas=args.compas,
        guardar=not args.no_guardar,
    )

    print("\nPrimeros 10 acordes:")
    for a in resultado["acordes"][:10]:
        print(f"  compas {a['compas']:3} | {a['tiempo_segundos']:6.2f}s → {a['acorde']:3} ({a['tipo']})")


if __name__ == "__main__":
    main()
