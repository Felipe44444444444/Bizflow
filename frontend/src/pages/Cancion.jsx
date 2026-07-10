import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import DiagramaAcorde, { transposeChord } from '../components/DiagramaAcorde.jsx';

const GENERO_EMOJI = {
  corrido: '🤠', ranchera: '🌹', banda: '🎺',
  'norteña': '🪗', grupero: '🎹', 'corrido tumbado': '🔥',
};

function formatTime(s) {
  if (!s && s !== 0) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
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

function buildLetraConAcordes(letraRaw, acordes) {
  if (!acordes?.length || !letraRaw?.length) return letraRaw;

  const lineas = letraRaw.filter(l => l.tipo === 'linea');
  if (lineas.length === 0) return letraRaw;

  const acordesPorLinea = acordes.length / lineas.length;
  let lineaIdx = 0;

  return letraRaw.map(item => {
    if (item.tipo === 'seccion') return item;
    const acordeIdx = Math.min(
      Math.floor(lineaIdx * acordesPorLinea),
      acordes.length - 1
    );
    const acorde = acordes[acordeIdx];
    lineaIdx++;
    return {
      ...item,
      tiempo: acorde.tiempo_segundos,
      acorde: acorde.acorde,
      tipoAcorde: acorde.tipo,
    };
  });
}

function Metronomo({ bpm: bpmInicial }) {
  const [bpm, setBpm] = useState(bpmInicial || 120);
  const [corriendo, setCorriendo] = useState(false);
  const [beatActual, setBeatActual] = useState(0);
  const timerRef = useRef(null);
  const BEATS = 4;

  useEffect(() => {
    setBpm(bpmInicial || 120);
    setCorriendo(false);
  }, [bpmInicial]);

  useEffect(() => {
    clearInterval(timerRef.current);
    if (corriendo) {
      timerRef.current = setInterval(() => {
        setBeatActual(b => (b + 1) % BEATS);
      }, (60 / bpm) * 1000);
    } else {
      setBeatActual(0);
    }
    return () => clearInterval(timerRef.current);
  }, [corriendo, bpm]);

  return (
    <div className="metronomo">
      <div className="metronomo-titulo">METRÓNOMO</div>
      <div className="metronomo-bpm">{bpm} BPM</div>
      <div className="metronomo-beats">
        {Array.from({ length: BEATS }).map((_, i) => (
          <div key={i} className={`beat-dot ${corriendo && i === beatActual ? 'active' : ''}`} />
        ))}
      </div>
      <div className="metronomo-controls">
        <button className="bpm-adjust-btn" onClick={() => setBpm(b => Math.max(40, b - 5))}>−</button>
        <button
          onClick={() => setCorriendo(c => !c)}
          style={{
            padding: '0.75rem 2rem',
            background: corriendo ? 'var(--bg-highlight)' : 'var(--accent)',
            color: corriendo ? 'var(--text-primary)' : '#000',
            border: 'none', borderRadius: 'var(--radius-full)',
            fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
          }}>
          {corriendo ? '⏹ Detener' : '▶ Iniciar'}
        </button>
        <button className="bpm-adjust-btn" onClick={() => setBpm(b => Math.min(300, b + 5))}>+</button>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Ajusta con − / + de 5 en 5</div>
    </div>
  );
}

export default function Cancion() {
  const { id } = useParams();
  const [cancion, setCancion]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [modo, setModo]               = useState('tocada'); // 'tocada' | 'video'
  const [player, setPlayer]           = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [manualTime, setManualTime]   = useState(0);
  const [duration, setDuration]       = useState(0);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [videoError, setVideoError]   = useState(false);
  const [transpose, setTranspose]     = useState(0);
  const [speed, setSpeed]             = useState(1);
  const [acordeActivo, setAcordeActivo] = useState(0);
  const [lineaActiva, setLineaActiva]   = useState(0);
  const [compasManual, setCompasManual] = useState(0);
  const timerRef                        = useRef(null);
  const manualTimerRef                  = useRef(null);
  const acordesListRef                  = useRef(null);
  const letraRef                        = useRef(null);

  useEffect(() => {
    api.detalle(id).then(setCancion).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  // YouTube IFrame API
  useEffect(() => {
    if (!cancion?.youtube_id || modo !== 'video') return;
    const initPlayer = () => {
      if (player) return;
      const p = new window.YT.Player('yt-player', {
        videoId: cancion.youtube_id,
        playerVars: { controls: 0, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: e => {
            setPlayer(e.target);
            setDuration(e.target.getDuration() || 0);
          },
          onStateChange: e => setIsPlaying(e.data === 1),
          onError: () => setVideoError(true),
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
    return () => clearInterval(timerRef.current);
  }, [cancion?.youtube_id, modo]);

  // Polling tiempo video
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!player || modo !== 'video') return;
    timerRef.current = setInterval(() => {
      setCurrentTime(player.getCurrentTime?.() || 0);
    }, 300);
    return () => clearInterval(timerRef.current);
  }, [player, modo]);

  // Timer manual modo tocada
  const toggleManualPlay = useCallback(() => {
    if (isPlaying) {
      clearInterval(manualTimerRef.current);
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      manualTimerRef.current = setInterval(() => {
        setManualTime(t => t + 0.5);
      }, 300);
    }
  }, [isPlaying]);

  useEffect(() => () => clearInterval(manualTimerRef.current), []);

  const tiempoActual = modo === 'video' ? currentTime : manualTime;

  // Build líneas de letra
  const letraLineas = cancion
    ? buildLetraLineas(cancion.letra_por_seccion, cancion.duracion_segundos)
    : [];

  // Acordes transpuestos
  const acordesTranspuestos = (cancion?.acordes || []).map(a => ({
    ...a,
    acorde: transposeChord(a.acorde, transpose),
  }));

  // Letra + acordes intercalados
  const letraConAcordes = buildLetraConAcordes(letraLineas, acordesTranspuestos);

  // Sync acorde activo
  useEffect(() => {
    if (!acordesTranspuestos.length) return;
    let idx = 0;
    for (let i = 0; i < acordesTranspuestos.length; i++) {
      if (tiempoActual >= acordesTranspuestos[i].tiempo_segundos) idx = i;
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
  }, [tiempoActual, acordesTranspuestos.length]);

  // Sync línea activa
  useEffect(() => {
    if (!letraConAcordes.length) return;
    let idx = 0;
    for (let i = 0; i < letraConAcordes.length; i++) {
      if (letraConAcordes[i].tipo === 'linea' && tiempoActual >= letraConAcordes[i].tiempo) idx = i;
    }
    setLineaActiva(prev => {
      if (prev !== idx) {
        letraRef.current
          ?.querySelector(`[data-li="${idx}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return idx;
    });
  }, [tiempoActual, letraConAcordes.length]);

  const seekTo = (t) => {
    if (modo === 'video') {
      player?.seekTo(t, true);
      setCurrentTime(t);
    } else {
      setManualTime(t);
    }
  };

  if (loading) return (
    <div style={{ padding: '2rem' }}>
      <div className="skeleton" style={{ height: 28, width: 220, marginBottom: '1.5rem' }} />
      <div className="skeleton" style={{ borderRadius: 'var(--radius-lg)', minHeight: 400 }} />
    </div>
  );

  if (!cancion) return (
    <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😔</div>
      <p style={{ marginBottom: '1rem' }}>Canción no encontrada</p>
      <Link to="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← Volver al catálogo</Link>
    </div>
  );

  const acorActivo    = acordesTranspuestos[acordeActivo];
  const progreso      = duration > 0 ? (currentTime / duration) * 100 : 0;
  const badgeClass    = `genre-badge badge-${(cancion.genero || '').replace(/\s+/g, '-')}`;
  const tonoActual    = transposeChord(cancion.tono, transpose);

  return (
    <>
      {/* TOPBAR */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
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
            {tonoActual} · {cancion.bpm} BPM
          </span>
        </div>
      </div>

      <div className="cancion-layout">
        {/* IZQUIERDA: CONTROLES + LETRA */}
        <div className="video-section">

          {/* TOGGLE MODO */}
          <div className="toggle-modo">
            <button className={`toggle-btn ${modo === 'tocada' ? 'active' : ''}`}
              onClick={() => setModo('tocada')}>
              🎸 Modo Tocada
            </button>
            {cancion.youtube_id && (
              <button className={`toggle-btn ${modo === 'video' ? 'active' : ''}`}
                onClick={() => setModo('video')}>
                ▶ Ver Video
              </button>
            )}
          </div>

          {/* MODO TOCADA */}
          {modo === 'tocada' && (
            <>
              <Metronomo bpm={cancion.bpm} />
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
                padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Letra:</span>
                    <button onClick={toggleManualPlay} style={{
                      padding: '0.5rem 1.5rem',
                      background: isPlaying ? 'var(--bg-highlight)' : 'var(--accent)',
                      color: isPlaying ? 'var(--text-primary)' : '#000',
                      border: 'none', borderRadius: 'var(--radius-full)',
                      fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
                    }}>
                      {isPlaying ? '⏸ Pausar' : '▶ Avanzar letra'}
                    </button>
                    <button
                      onClick={() => {
                        const nextIdx = Math.min(compasManual + 1, acordesTranspuestos.length - 1);
                        setCompasManual(nextIdx);
                        setManualTime(acordesTranspuestos[nextIdx]?.tiempo_segundos || 0);
                      }}
                      style={{
                        padding: '0.5rem 1.25rem',
                        background: 'var(--bg-highlight)',
                        border: '1px solid var(--accent)',
                        borderRadius: 'var(--radius-full)',
                        color: 'var(--accent)',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                      }}>
                      ► Siguiente compás
                    </button>
                    <button onClick={() => { setManualTime(0); setCompasManual(0); setIsPlaying(false); clearInterval(manualTimerRef.current); }}
                      style={{
                        padding: '0.5rem 1rem', background: 'var(--bg-highlight)',
                        border: 'none', borderRadius: 'var(--radius-full)',
                        color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem',
                      }}>
                      ↺ Reiniciar
                    </button>
                  </div>
                  <div className="transpose-ctrl">
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>Transpose:</span>
                    <button className="transpose-btn" onClick={() => setTranspose(t => t - 1)}>−</button>
                    <span style={{
                      minWidth: '28px', textAlign: 'center',
                      color: transpose !== 0 ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 700,
                    }}>
                      {transpose > 0 ? `+${transpose}` : transpose}
                    </span>
                    <button className="transpose-btn" onClick={() => setTranspose(t => t + 1)}>+</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* MODO VIDEO */}
          {modo === 'video' && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div className="video-wrapper">
                {cancion.youtube_id && !videoError ? (
                  <div id="yt-player" style={{ width: '100%', height: '100%' }} />
                ) : (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100%', color: 'var(--text-muted)', flexDirection: 'column', gap: '1rem',
                  }}>
                    <span style={{ fontSize: '3rem' }}>{GENERO_EMOJI[cancion.genero] || '🎵'}</span>
                    <span>Video no disponible</span>
                    <button onClick={() => setModo('tocada')} style={{
                      padding: '0.5rem 1.5rem', background: 'var(--accent)',
                      border: 'none', borderRadius: 'var(--radius-full)',
                      color: '#000', fontWeight: 700, cursor: 'pointer',
                    }}>
                      Usar Modo Tocada
                    </button>
                  </div>
                )}
              </div>

              {player && !videoError && (
                <div style={{
                  background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
                  padding: '1.25rem 1.5rem', marginTop: '1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '36px' }}>
                      {formatTime(currentTime)}
                    </span>
                    <div className="progress-track" style={{ flex: 1 }}
                      onClick={e => {
                        const r = e.currentTarget.getBoundingClientRect();
                        seekTo(((e.clientX - r.left) / r.width) * duration);
                      }}>
                      <div className="progress-fill" style={{ width: `${progreso}%` }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '36px' }}>
                      {formatTime(duration)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button className="play-main-btn"
                      onClick={() => isPlaying ? player.pauseVideo() : player.playVideo()}>
                      {isPlaying
                        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      }
                    </button>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      {[0.5, 0.75, 1].map(s => (
                        <button key={s} className={`speed-btn ${speed === s ? 'active' : ''}`}
                          onClick={() => { setSpeed(s); player.setPlaybackRate(s); }}>
                          {s}×
                        </button>
                      ))}
                      <div className="transpose-ctrl">
                        <button className="transpose-btn" onClick={() => setTranspose(t => t - 1)}>−</button>
                        <span style={{
                          minWidth: '22px', textAlign: 'center', fontSize: '0.75rem',
                          color: transpose !== 0 ? 'var(--accent)' : 'var(--text-muted)',
                        }}>
                          {transpose > 0 ? `+${transpose}` : transpose}
                        </span>
                        <button className="transpose-btn" onClick={() => setTranspose(t => t + 1)}>+</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* LETRA CON ACORDES INTERCALADOS */}
          {letraConAcordes.length > 0 && (
            <div className="letra-section" ref={letraRef}>
              <div className="letra-title">LETRA Y ACORDES</div>
              {letraConAcordes.map((linea, i) =>
                linea.tipo === 'seccion' ? (
                  <div key={i} className="letra-seccion-titulo">{linea.texto}</div>
                ) : (
                  <div key={i} className="letra-linea-wrapper" data-li={i}
                    onClick={() => seekTo(linea.tiempo)}>
                    {linea.acorde && (
                      <div className="acorde-inline">{linea.acorde}</div>
                    )}
                    <div className={`letra-linea ${i === lineaActiva ? 'active' : ''}`}>
                      {linea.texto}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* DERECHA: PANEL ACORDES */}
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
                  {acorActivo.acorde}
                </div>
                <DiagramaAcorde chord={acorActivo.acorde} size={0.65} label={false} />
              </div>
            )}
          </div>

          <div className="acordes-list" ref={acordesListRef}>
            {acordesTranspuestos.map((a, i) => (
              <div key={i} data-idx={i}
                className={`acorde-item ${i === acordeActivo ? 'active' : ''}`}
                onClick={() => seekTo(a.tiempo_segundos)}>
                <DiagramaAcorde chord={a.acorde} size={0.5} label={false} />
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
