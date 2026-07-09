import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import DiagramaAcorde, { transposeChord } from '../components/DiagramaAcorde.jsx';

function formatTime(s) {
  if (!s && s !== 0) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function buildLetraLineas(letra_por_seccion, duracion) {
  if (!letra_por_seccion || typeof letra_por_seccion !== 'object') return [];
  const secciones = Object.entries(letra_por_seccion);
  if (!secciones.length) return [];
  const durSeccion = (duracion || 200) / secciones.length;
  return secciones.flatMap(([seccion, texto], si) => {
    const raw = Array.isArray(texto) ? texto.join('\n') : String(texto);
    const lineas = raw.split('\n').filter(l => l.trim());
    return [
      { tipo: 'seccion', texto: seccion, tiempo: si * durSeccion },
      ...lineas.map((linea, li) => ({
        tipo: 'linea',
        texto: linea,
        tiempo: si * durSeccion + (li * durSeccion / Math.max(lineas.length, 1)),
      })),
    ];
  });
}

export default function Cancion() {
  const { id } = useParams();
  const [cancion, setCancion]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [currentTime, setCurrentTime]   = useState(0);
  const [duration, setDuration]         = useState(0);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [transpose, setTranspose]       = useState(0);
  const [speed, setSpeed]               = useState(1);
  const [acordeActivo, setAcordeActivo] = useState(0);
  const [letraActiva, setLetraActiva]   = useState(0);
  const [speedRates, setSpeedRates]     = useState([1]);
  const playerRef      = useRef(null);
  const timerRef       = useRef(null);
  const acordesListRef = useRef(null);
  const letraRef       = useRef(null);

  useEffect(() => {
    api.detalle(id).then(setCancion).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  // YouTube IFrame API
  useEffect(() => {
    if (!cancion?.youtube_id) return;

    const initPlayer = () => {
      if (playerRef.current) return;
      playerRef.current = new window.YT.Player('yt-player', {
        videoId: cancion.youtube_id,
        playerVars: { controls: 0, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: (e) => {
            setDuration(e.target.getDuration() || 0);
            const rates = e.target.getAvailablePlaybackRates?.() || [1];
            setSpeedRates(rates.filter(r => [0.5, 0.75, 1].includes(r)));
          },
          onStateChange: (e) => setIsPlaying(e.data === 1),
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }

    return () => {
      clearInterval(timerRef.current);
      playerRef.current = null;
    };
  }, [cancion?.youtube_id]);

  // Polling de tiempo + sync acordes
  useEffect(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      const t = p.getCurrentTime();
      setCurrentTime(t);

      if (cancion?.acordes?.length) {
        let idx = 0;
        for (let i = 0; i < cancion.acordes.length; i++) {
          if (t >= cancion.acordes[i].tiempo_segundos) idx = i;
          else break;
        }
        setAcordeActivo(prev => {
          if (prev !== idx) {
            acordesListRef.current
              ?.querySelector(`[data-idx="${idx}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          return idx;
        });
      }
    }, 400);
    return () => clearInterval(timerRef.current);
  }, [cancion]);

  // Sync letra
  const letraLineas = cancion
    ? buildLetraLineas(cancion.letra_por_seccion, cancion.duracion_segundos)
    : [];

  useEffect(() => {
    if (!letraLineas.length || !currentTime) return;
    let idx = 0;
    for (let i = 0; i < letraLineas.length; i++) {
      if (currentTime >= letraLineas[i].tiempo) idx = i;
      else break;
    }
    setLetraActiva(prev => {
      if (prev !== idx) {
        letraRef.current
          ?.querySelector(`[data-li="${idx}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return idx;
    });
  }, [currentTime, letraLineas.length]);

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    isPlaying ? p.pauseVideo() : p.playVideo();
  };

  const seekTo = useCallback((t) => {
    playerRef.current?.seekTo(t, true);
    setCurrentTime(t);
  }, []);

  const setSpeedHandler = (s) => {
    setSpeed(s);
    playerRef.current?.setPlaybackRate(s);
  };

  if (loading) return (
    <div style={{ padding: '2rem' }}>
      <div className="skeleton" style={{ height: 28, width: 220, marginBottom: '1.5rem' }}/>
      <div className="cancion-layout">
        <div className="video-section">
          <div className="skeleton" style={{ aspectRatio: '16/9', borderRadius: 'var(--radius-lg)' }}/>
        </div>
        <div className="skeleton" style={{ borderRadius: 'var(--radius-lg)', minHeight: 400 }}/>
      </div>
    </div>
  );

  if (!cancion) return (
    <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😔</div>
      <p style={{ marginBottom: '1rem' }}>Canción no encontrada</p>
      <Link to="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← Volver al catálogo</Link>
    </div>
  );

  const progreso = duration > 0 ? (currentTime / duration) * 100 : 0;
  const acorActivo = cancion.acordes?.[acordeActivo];
  const acordesTranspuestos = (cancion.acordes || []).map(a => ({
    ...a,
    acorde: transposeChord(a.acorde, transpose),
  }));
  const badgeClass = `genre-badge badge-${(cancion.genero || '').replace(/\s+/g, '-')}`;

  return (
    <>
      {/* TOPBAR */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
          </Link>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {cancion.artista}
            </div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{cancion.titulo}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className={badgeClass}>{cancion.genero}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {cancion.tono} · {cancion.bpm} BPM
          </span>
        </div>
      </div>

      <div className="cancion-layout">
        {/* IZQUIERDA: VIDEO + CONTROLES + LETRA */}
        <div className="video-section">

          {/* VIDEO */}
          <div className="video-wrapper">
            {cancion.youtube_id ? (
              <div id="yt-player" style={{ width: '100%', height: '100%' }}/>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: 'var(--text-muted)' }}>
                <span style={{ fontSize: '3rem' }}>🎵</span>
                <span>Video no disponible</span>
              </div>
            )}
          </div>

          {/* CONTROLES */}
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: '1.25rem 1.5rem' }}>
            <div className="progress-bar" style={{ marginBottom: '1rem' }}>
              <span className="progress-time">{formatTime(currentTime)}</span>
              <div className="progress-track" onClick={e => {
                const r = e.currentTarget.getBoundingClientRect();
                seekTo(((e.clientX - r.left) / r.width) * duration);
              }}>
                <div className="progress-fill" style={{ width: `${progreso}%` }}/>
              </div>
              <span className="progress-time">{formatTime(duration)}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="bpm-indicator">
                <div
                  className={`bpm-dot ${isPlaying ? 'pulsing' : ''}`}
                  style={{ '--bpm-duration': `${Math.round(60000 / (cancion.bpm || 120))}ms` }}
                />
                <span>{cancion.bpm} BPM</span>
              </div>

              <button className="play-main-btn" onClick={togglePlay}>
                {isPlaying ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                {speedRates.map(s => (
                  <button key={s} className={`speed-btn ${speed === s ? 'active' : ''}`}
                    onClick={() => setSpeedHandler(s)}>{s}×</button>
                ))}
                <div className="transpose-ctrl">
                  <button className="transpose-btn" onClick={() => setTranspose(t => t - 1)}>−</button>
                  <span style={{ minWidth: '22px', textAlign: 'center', fontSize: '0.75rem', color: transpose !== 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {transpose > 0 ? `+${transpose}` : transpose}
                  </span>
                  <button className="transpose-btn" onClick={() => setTranspose(t => t + 1)}>+</button>
                </div>
              </div>
            </div>
          </div>

          {/* LETRA SINCRONIZADA */}
          {letraLineas.length > 0 && (
            <div className="letra-section" ref={letraRef}>
              <div className="letra-title">Letra</div>
              {letraLineas.map((linea, i) =>
                linea.tipo === 'seccion' ? (
                  <div key={i} className="letra-seccion-titulo">{linea.texto}</div>
                ) : (
                  <div key={i} data-li={i}
                    className={`letra-linea ${i === letraActiva ? 'active' : ''}`}
                    onClick={() => seekTo(linea.tiempo)}>
                    {linea.texto}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* PANEL ACORDES */}
        <div className="acordes-panel">
          <div className="acordes-header">
            <div>
              <div style={{ fontWeight: 700 }}>Acordes</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {acordesTranspuestos.length} acordes · {cancion.sync_calidad}
              </div>
            </div>
            {acorActivo && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
                  {transposeChord(acorActivo.acorde, transpose)}
                </div>
                <DiagramaAcorde
                  chord={transposeChord(acorActivo.acorde, transpose)}
                  size={0.65}
                  label={false}
                />
              </div>
            )}
          </div>

          <div className="acordes-list" ref={acordesListRef}>
            {acordesTranspuestos.map((a, i) => (
              <div key={i} data-idx={i}
                className={`acorde-item ${i === acordeActivo ? 'active' : ''}`}
                onClick={() => seekTo(a.tiempo_segundos)}>
                <DiagramaAcorde chord={a.acorde} size={0.5} label={false}/>
                <div className="acorde-info">
                  <div className="acorde-nombre" style={{ color: i === acordeActivo ? 'var(--accent)' : '' }}>
                    {a.acorde}
                  </div>
                  <div className="acorde-compas">Compás {a.compas} · {a.tipo}</div>
                </div>
                <div className="acorde-tiempo">{formatTime(a.tiempo_segundos)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
