import { useState, useEffect, useCallback } from 'react';

// ── EditorSync ─────────────────────────────────────────────────────────────────
// Spacebar-tap calibration tool for assigning real tiempo_segundos to each chord.
// Usage: mount next to the YouTube player, tap Space when each chord starts.
// Copy the JSON output and paste into the song data file.
export default function EditorSync({ cancion, playerRef }) {
  const acordes      = cancion?.acordes ?? [];
  const [tapIndex, setTapIndex]   = useState(0);
  const [tiempos, setTiempos]     = useState([]);
  const [done, setDone]           = useState(false);
  const [lastTap, setLastTap]     = useState(null);

  const tap = useCallback(() => {
    const t = playerRef?.current?.getCurrentTime?.();
    if (t === undefined || t === null) return;
    const ts = parseFloat(t.toFixed(3));
    setLastTap(ts);

    setTiempos(prev => {
      const next = [...prev];
      next[tapIndex] = ts;
      return next;
    });

    if (tapIndex + 1 >= acordes.length) {
      setDone(true);
    } else {
      setTapIndex(i => i + 1);
    }
  }, [tapIndex, acordes.length, playerRef]);

  // Spacebar listener
  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Space' && !e.target.matches('input,textarea,button')) {
        e.preventDefault();
        tap();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tap]);

  function reset() {
    setTapIndex(0);
    setTiempos([]);
    setDone(false);
    setLastTap(null);
  }

  // Build output JSON
  const outputAcordes = acordes.map((a, i) => ({
    ...a,
    tiempo_segundos:   tiempos[i] ?? a.tiempo_segundos,
    duracion_estimada: a.duracion_estimada,
  }));

  const outputJson = JSON.stringify(
    { ...cancion, acordes: outputAcordes, sync_calidad: 'calibrado' },
    null, 2
  );

  const progress = Math.round(((done ? acordes.length : tapIndex) / Math.max(acordes.length, 1)) * 100);

  return (
    <div style={{
      fontFamily: 'Inter, sans-serif',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Calibrador de acordes</h3>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '2px 0 0' }}>
            Toca la barra espaciadora cuando escuches cada acorde
          </p>
        </div>
        <button onClick={reset} className="btn btn-ghost" style={{ fontSize: 12 }}>
          Reiniciar
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--border)' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: done
            ? 'linear-gradient(90deg, #22c55e, #16a34a)'
            : 'linear-gradient(90deg, var(--wine), var(--gold))',
          transition: 'width 0.2s ease',
        }} />
      </div>

      {/* Chord list */}
      <div style={{ maxHeight: 320, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {acordes.map((a, i) => {
          const estado = i < tapIndex || (done && i === tapIndex)
            ? 'calibrado'
            : i === tapIndex && !done
              ? 'actual'
              : 'pendiente';

          return (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 12px', borderRadius: 8,
                background: estado === 'actual'
                  ? 'rgba(201,168,76,0.12)'
                  : estado === 'calibrado'
                    ? 'rgba(34,197,94,0.08)'
                    : 'var(--surface2)',
                border: `1px solid ${
                  estado === 'actual' ? 'var(--gold)'
                    : estado === 'calibrado' ? 'rgba(34,197,94,0.4)'
                      : 'transparent'
                }`,
                transition: 'all 0.15s',
              }}
            >
              <span style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: estado === 'calibrado' ? '#22c55e'
                  : estado === 'actual' ? 'var(--gold)' : 'var(--border)',
                color: estado === 'pendiente' ? 'var(--text-dim)' : '#000',
              }}>
                {estado === 'calibrado' ? '✓' : i + 1}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: estado === 'actual' ? 'var(--gold)' : 'var(--text)' }}>
                  {a.acorde}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>
                  compás {a.compas}
                </span>
              </div>

              <span style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {tiempos[i] !== undefined
                  ? `${tiempos[i].toFixed(2)}s`
                  : estado === 'actual'
                    ? '← toca espacio'
                    : ''}
              </span>
            </div>
          );
        })}
      </div>

      {/* Status bar */}
      <div style={{
        padding: '10px 18px',
        borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          {done
            ? '✓ Calibración completa'
            : `${tapIndex} / ${acordes.length} acordes calibrados`}
          {lastTap !== null && !done && (
            <span style={{ marginLeft: 8, color: 'var(--gold)' }}>
              {lastTap.toFixed(2)}s
            </span>
          )}
        </span>

        <kbd style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '2px 8px', fontSize: 12,
          color: done ? 'var(--text-dim)' : 'var(--text)',
        }}>
          SPACE
        </kbd>
      </div>

      {/* JSON output when done */}
      {done && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{
            padding: '10px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'rgba(34,197,94,0.06)',
          }}>
            <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
              JSON listo para copiar
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(outputJson)}
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
            >
              Copiar JSON
            </button>
          </div>
          <textarea
            readOnly
            value={outputJson}
            style={{
              width: '100%', height: 200, resize: 'none', border: 'none',
              background: '#0a0a0a', color: '#a3e635',
              fontFamily: 'monospace', fontSize: 11, padding: 12,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      )}
    </div>
  );
}
