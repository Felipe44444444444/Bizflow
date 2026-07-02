import { useEffect, useRef, useState, useCallback } from 'react';
import DiagramaAcorde, { transposeChord } from './DiagramaAcorde.jsx';
import { testPlaybackRateSupport, isIOSSafari } from '../utils/detectPlaybackSupport.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function duracion(seg) {
  if (!seg) return '--:--';
  return `${Math.floor(seg / 60)}:${String(Math.floor(seg % 60)).padStart(2, '0')}`;
}

// Use tiempo_segundos when calibrated; fall back to BPM formula with correct time signature.
function acordeToSecs(acorde, bpm, tiempos_por_compas) {
  if (acorde.tiempo_segundos !== undefined) return acorde.tiempo_segundos;
  const tpc = tiempos_por_compas || 4;
  return ((acorde.compas - 1) * tpc * 60) / (bpm || 120);
}

// Parse estructura from API (could be array or object)
function parseEstructura(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s, i) => (typeof s === 'string' ? { nombre: s, index: i } : { ...s, index: i }));
  if (typeof raw === 'object') return Object.entries(raw).map(([k, v], i) => ({ nombre: k, valor: v, index: i }));
  return [];
}

// ── YouTube IFrame API loader (singleton) ─────────────────────────────────────
let ytReady = false;
const ytCallbacks = [];
function loadYT(cb) {
  if (ytReady) { cb(); return; }
  ytCallbacks.push(cb);
  if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => { ytReady = true; ytCallbacks.forEach(f => f()); };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReproductorPrincipal({ cancion }) {
  const playerRef    = useRef(null);
  const containerRef = useRef(null);
  const intervalRef  = useRef(null);
  const acorde0Ref   = useRef(null);

  const [currentTime, setCurrentTime]     = useState(0);
  const [playerReady, setPlayerReady]     = useState(false);
  const [playback, setPlayback]           = useState(1);
  const [transpose, setTranspose]         = useState(0);
  const [bpmActive, setBpmActive]         = useState(false);
  const [seccionActiva, setSeccionActiva] = useState(0);
  const [speedSupported, setSpeedSupported] = useState(!isIOSSafari());

  const acordes         = cancion.acordes    ?? [];
  const estructura      = parseEstructura(cancion.estructura);
  const bpm             = cancion.bpm || 120;
  const durTot          = cancion.duracion_segundos || 0;
  const tiempos_por_compas = cancion.tiempos_por_compas || 4;
  const sincCalidad     = cancion.sync_calidad ?? 'estimado';

  // ── Estimate section times proportionally ──────────────────────────────────
  const secciones = estructura.map((s, i) => ({
    ...s,
    tiempo: durTot > 0 ? Math.round((i / Math.max(estructura.length, 1)) * durTot) : i * 30,
  }));

  // ── Active chord index ─────────────────────────────────────────────────────
  const acordeActivo = acordes.reduce((acc, a, i) => {
    const t = acordeToSecs(a, bpm, tiempos_por_compas);
    return t <= currentTime ? i : acc;
  }, 0);

  // ── Build YouTube player ───────────────────────────────────────────────────
  useEffect(() => {
    if (!cancion.youtube_id) return;

    loadYT(() => {
      // Destroy old player if any
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }

      playerRef.current = new window.YT.Player('yt-iframe-container', {
        videoId: cancion.youtube_id,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 0, controls: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            setPlayerReady(true);
            const supported = testPlaybackRateSupport(playerRef.current);
            setSpeedSupported(supported);
            if (supported) playerRef.current.setPlaybackRate(playback);
          },
          onStateChange: ({ data }) => {
            const playing = data === window.YT.PlayerState.PLAYING;
            setBpmActive(playing);
            if (playing) {
              clearInterval(intervalRef.current);
              intervalRef.current = setInterval(() => {
                const t = playerRef.current?.getCurrentTime?.() ?? 0;
                setCurrentTime(t);
                // Update active section
                const si = secciones.reduce((acc, s, i) => (s.tiempo <= t ? i : acc), 0);
                setSeccionActiva(si);
              }, 400);
            } else {
              clearInterval(intervalRef.current);
            }
          },
        },
      });
    });

    return () => {
      clearInterval(intervalRef.current);
      if (playerRef.current) { try { playerRef.current.destroy(); } catch {} }
    };
  }, [cancion.youtube_id]);

  // ── Scroll active chord into view ──────────────────────────────────────────
  useEffect(() => {
    const el = document.getElementById(`acorde-${acordeActivo}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [acordeActivo]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const setSpeed = (rate) => {
    setPlayback(rate);
    if (speedSupported) playerRef.current?.setPlaybackRate?.(rate);
  };

  const seekTo = (secs) => {
    playerRef.current?.seekTo?.(secs, true);
    setCurrentTime(secs);
  };

  const changeTranspose = (delta) => setTranspose(t => t + delta);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

      {/* ── Left column: video + controls ──────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Video embed */}
        <div style={{
          position: 'relative', paddingBottom: '56.25%', height: 0,
          background: '#000', borderRadius: 12, overflow: 'hidden',
          border: '1px solid var(--border)',
        }}>
          {cancion.youtube_id ? (
            <div id="yt-iframe-container" style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
            }} />
          ) : (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 12, color: 'var(--text-dim)',
            }}>
              <span style={{ fontSize: 48 }}>🎵</span>
              <p>Video no disponible</p>
            </div>
          )}
        </div>

        {/* Sync quality warning */}
        {sincCalidad === 'estimado' && acordes.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 8,
            background: 'rgba(201,168,76,0.08)',
            border: '1px solid rgba(201,168,76,0.2)',
            fontSize: 12, color: 'var(--text-dim)',
          }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            Sincronización aproximada — puede desviarse en temas largos
          </div>
        )}

        {/* ── Song info ────────────────────────────────────────────────────── */}
        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 18, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>

            {/* BPM metronome */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                className="bpm-dot"
                style={{ '--bpm-interval': `${60000 / bpm}ms`, opacity: bpmActive ? 1 : 0.3 }}
              />
              <div>
                <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>{bpm}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 4 }}>BPM</span>
              </div>
            </div>

            {/* Speed control */}
            {speedSupported ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', marginRight: 4 }}>Velocidad:</span>
                {[0.5, 0.75, 1].map(r => (
                  <button
                    key={r}
                    onClick={() => setSpeed(r)}
                    className="btn btn-ghost"
                    style={{
                      padding: '4px 10px', fontSize: 13,
                      ...(playback === r ? { borderColor: 'var(--gold)', color: 'var(--gold)' } : {}),
                    }}
                  >
                    {r}x
                  </button>
                ))}
              </div>
            ) : playerReady ? (
              <span style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 200, lineHeight: 1.4 }}>
                Tu navegador no soporta cambio de velocidad. Usa Chrome o la app de YouTube.
              </span>
            ) : null}

            {/* Transpose */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Transpose:</span>
              <button onClick={() => changeTranspose(-1)} className="btn-icon">−</button>
              <span style={{
                width: 32, textAlign: 'center', fontWeight: 700,
                color: transpose === 0 ? 'var(--text-dim)' : 'var(--gold)',
              }}>
                {transpose > 0 ? `+${transpose}` : transpose}
              </span>
              <button onClick={() => changeTranspose(1)} className="btn-icon">+</button>
              {transpose !== 0 && (
                <button onClick={() => setTranspose(0)} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }}>
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Song structure timeline ───────────────────────────────────────── */}
        {secciones.length > 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Estructura
            </h4>
            <div style={{ position: 'relative' }}>
              {/* Progress bar */}
              <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginBottom: 10 }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: durTot > 0 ? `${(currentTime / durTot) * 100}%` : '0%',
                  background: 'linear-gradient(90deg, var(--wine), var(--gold))',
                  transition: 'width 0.4s linear',
                }} />
              </div>
              {/* Section pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {secciones.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => seekTo(s.tiempo)}
                    className="btn btn-ghost"
                    style={{
                      fontSize: 12, padding: '4px 12px',
                      ...(seccionActiva === i ? {
                        borderColor: 'var(--gold)',
                        color: 'var(--gold)',
                        background: 'rgba(201,168,76,0.08)',
                      } : {}),
                    }}
                  >
                    {s.nombre}
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>
                      {duracion(s.tiempo)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right column: chord panel ───────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        height: 'min(600px, 80vh)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'sticky',
        top: 80,
      }}>
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h4 style={{ fontSize: 14, fontWeight: 600 }}>
            Acordes
            {transpose !== 0 && (
              <span style={{ fontSize: 11, color: 'var(--gold)', marginLeft: 6 }}>
                ({transpose > 0 ? '+' : ''}{transpose} semitono{Math.abs(transpose) !== 1 ? 's' : ''})
              </span>
            )}
          </h4>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {acordes.length} acordes
          </span>
        </div>

        {acordes.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
            Sin datos de acordes
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {acordes.map((a, i) => {
              const activo = i === acordeActivo;
              const nombre = transposeChord(a.acorde, transpose);
              const tiempoAcorde = acordeToSecs(a, bpm, tiempos_por_compas);

              return (
                <button
                  id={`acorde-${i}`}
                  key={i}
                  onClick={() => seekTo(tiempoAcorde)}
                  className={activo ? 'chord-active' : ''}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '10px 12px',
                    background: 'var(--surface2)',
                    border: `1px solid ${activo ? 'var(--gold)' : 'transparent'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.2s, background 0.2s',
                    width: '100%',
                  }}
                >
                  {/* Diagram (small) */}
                  <div style={{ flexShrink: 0 }}>
                    <DiagramaAcorde chord={a.acorde} semitones={transpose} size={0.55} label={false} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 20, fontWeight: 700,
                      color: activo ? 'var(--gold)' : 'var(--text)',
                      fontFamily: 'Playfair Display, serif',
                    }}>
                      {nombre}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                      Compás {a.compas}
                      {a.tipo && ` · ${a.tipo}`}
                    </div>
                  </div>

                  <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
                    {duracion(tiempoAcorde)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
