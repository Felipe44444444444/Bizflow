// SVG chord diagrams for guitar. Strings: low E → high e (left → right).
// Fret values: -1 = muted, 0 = open, 1+ = fret number.

const SHAPES = {
  // ── Open chords ────────────────────────────────────────────────────────────
  'G':    { frets: [3,2,0,0,0,3],  fingers: [2,1,0,0,0,4], base: 1 },
  'Am':   { frets: [0,0,2,2,1,0],  fingers: [0,0,2,3,1,0], base: 1 },
  'C':    { frets: [0,3,2,0,1,0],  fingers: [0,3,2,0,1,0], base: 1 },
  'D':    { frets: [-1,0,0,2,3,2], fingers: [0,0,0,1,3,2], base: 1 },
  'E':    { frets: [0,2,2,1,0,0],  fingers: [0,2,3,1,0,0], base: 1 },
  'Em':   { frets: [0,2,2,0,0,0],  fingers: [0,2,3,0,0,0], base: 1 },
  'F':    { frets: [1,1,2,3,3,1],  fingers: [1,1,2,3,4,1], base: 1, barre: { fret: 1, from: 0, to: 5 } },
  'A':    { frets: [0,0,2,2,2,0],  fingers: [0,0,1,2,3,0], base: 1 },
  'Dm':   { frets: [-1,0,0,2,3,1], fingers: [0,0,0,2,3,1], base: 1 },
  // ── Barre chords ───────────────────────────────────────────────────────────
  'Bm':   { frets: [-1,2,4,4,3,2], fingers: [0,1,3,4,2,1], base: 2, barre: { fret: 2, from: 1, to: 5 } },
  'B':    { frets: [-1,2,4,4,4,2], fingers: [0,1,2,3,4,1], base: 2, barre: { fret: 2, from: 1, to: 5 } },
  'Bb':   { frets: [-1,1,3,3,3,1], fingers: [0,1,2,3,4,1], base: 1, barre: { fret: 1, from: 1, to: 5 } },
  'Cm':   { frets: [-1,3,5,5,4,3], fingers: [0,1,2,3,4,1], base: 3, barre: { fret: 3, from: 1, to: 5 } },
  'Fm':   { frets: [1,3,3,1,1,1],  fingers: [1,3,4,1,1,1], base: 1, barre: { fret: 1, from: 0, to: 5 } },
  'F#m':  { frets: [2,4,4,2,2,2],  fingers: [1,3,4,1,1,1], base: 2, barre: { fret: 2, from: 0, to: 5 } },
  'Gm':   { frets: [3,5,5,3,3,3],  fingers: [1,3,4,1,1,1], base: 3, barre: { fret: 3, from: 0, to: 5 } },
  // ── 7th chords ─────────────────────────────────────────────────────────────
  'A7':   { frets: [0,0,2,0,2,0],  fingers: [0,0,2,0,1,0], base: 1 },
  'D7':   { frets: [-1,0,0,2,1,2], fingers: [0,0,0,2,1,3], base: 1 },
  'E7':   { frets: [0,2,0,1,0,0],  fingers: [0,2,0,1,0,0], base: 1 },
  'G7':   { frets: [3,2,0,0,0,1],  fingers: [3,2,0,0,0,1], base: 1 },
  'B7':   { frets: [-1,2,1,2,0,2], fingers: [0,2,1,3,0,4], base: 1 },
  'C7':   { frets: [0,3,2,3,1,0],  fingers: [0,3,2,4,1,0], base: 1 },
  'Am7':  { frets: [0,0,2,0,1,0],  fingers: [0,0,2,0,1,0], base: 1 },
  'Dm7':  { frets: [-1,0,0,2,1,1], fingers: [0,0,0,2,1,1], base: 1, barre: { fret: 1, from: 4, to: 5 } },
  'Em7':  { frets: [0,2,2,0,3,0],  fingers: [0,2,3,0,4,0], base: 1 },
  // ── Fallback shape (unknown chord) ─────────────────────────────────────────
  '?':    { frets: [0,0,0,0,0,0],  fingers: [0,0,0,0,0,0], base: 1 },
};

// ── Transpose helper ──────────────────────────────────────────────────────────
const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const ENARMO = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#' };

export function transposeChord(name, semitones) {
  if (!name || semitones === 0) return name;
  const m = name.match(/^([A-G][b#]?)(.*)/);
  if (!m) return name;
  const root = ENARMO[m[1]] ?? m[1];
  const idx = NOTES.indexOf(root);
  if (idx === -1) return name;
  return NOTES[((idx + semitones) % 12 + 12) % 12] + m[2];
}

// Normalize chord name to match SHAPES keys (strips trailing slash-bass notes etc.)
function normalize(name) {
  if (!name) return '?';
  // Strip /bass note
  const clean = name.replace(/\/[A-G][b#]?$/, '').trim();
  if (SHAPES[clean]) return clean;
  // Try root only (e.g. "Amaj7" → "A")
  const root = clean.match(/^[A-G][b#]?/)?.[0];
  return SHAPES[root] ? root : '?';
}

// ── SVG constants ─────────────────────────────────────────────────────────────
const W = 90;          // viewBox width
const H = 110;         // viewBox height
const LEFT = 12;       // left margin (string 0 = low E)
const TOP = 36;        // top of fret grid
const STRING_GAP = 13; // horizontal gap between strings
const FRET_GAP = 14;   // vertical gap between frets
const FRETS = 5;
const STRINGS = 6;

function sx(s) { return LEFT + s * STRING_GAP; }         // x for string index
function fy(f) { return TOP + f * FRET_GAP; }            // y for fret index (0 = nut line)

export default function DiagramaAcorde({ chord, semitones = 0, size = 1, label = true }) {
  const transposed = transposeChord(chord, semitones);
  const key = normalize(transposed);
  const shape = SHAPES[key] ?? SHAPES['?'];
  const { frets, fingers, base, barre } = shape;

  const showNut = base === 1;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      {label && (
        <span style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 13 * size,
          fontWeight: 700,
          color: 'var(--gold)',
          letterSpacing: '0.02em',
        }}>
          {transposed || chord}
        </span>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W * size}
        height={H * size}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* String lines */}
        {Array.from({ length: STRINGS }, (_, i) => (
          <line
            key={`s${i}`}
            x1={sx(i)} y1={TOP}
            x2={sx(i)} y2={TOP + FRETS * FRET_GAP}
            stroke="#555" strokeWidth="1"
          />
        ))}

        {/* Fret lines */}
        {Array.from({ length: FRETS + 1 }, (_, f) => (
          <line
            key={`f${f}`}
            x1={sx(0)} y1={fy(f)}
            x2={sx(STRINGS - 1)} y2={fy(f)}
            stroke={f === 0 && showNut ? '#C9A84C' : '#555'}
            strokeWidth={f === 0 && showNut ? 3 : 1}
          />
        ))}

        {/* Base fret number (when not starting at nut) */}
        {!showNut && (
          <text x={sx(STRINGS - 1) + 5} y={fy(1) + 4} fill="#888" fontSize="9" fontFamily="Inter">
            {base}fr
          </text>
        )}

        {/* Open/muted indicators above nut */}
        {frets.map((fret, s) => {
          if (fret === 0) return (
            <circle key={`o${s}`} cx={sx(s)} cy={TOP - 8} r={4}
              fill="none" stroke="#C9A84C" strokeWidth="1.5" />
          );
          if (fret === -1) return (
            <g key={`x${s}`}>
              <line x1={sx(s)-4} y1={TOP-12} x2={sx(s)+4} y2={TOP-4} stroke="#666" strokeWidth="1.5" />
              <line x1={sx(s)+4} y1={TOP-12} x2={sx(s)-4} y2={TOP-4} stroke="#666" strokeWidth="1.5" />
            </g>
          );
          return null;
        })}

        {/* Barre */}
        {barre && (() => {
          const relFret = barre.fret - base + 1;
          const y = fy(relFret) - FRET_GAP / 2;
          return (
            <rect
              key="barre"
              x={sx(barre.from) - 5}
              y={y - 5}
              width={sx(barre.to) - sx(barre.from) + 10}
              height={10}
              rx={5}
              fill="#8B0000"
              opacity="0.85"
            />
          );
        })()}

        {/* Finger dots */}
        {frets.map((fret, s) => {
          if (fret <= 0) return null;
          const relFret = fret - base + 1;
          if (relFret < 1 || relFret > FRETS) return null;
          // Skip if covered by barre visual (still draw the dot)
          const cx = sx(s);
          const cy = fy(relFret) - FRET_GAP / 2;
          return (
            <g key={`d${s}`}>
              <circle cx={cx} cy={cy} r={5.5} fill="#8B0000" />
              <text x={cx} y={cy + 3.5} textAnchor="middle"
                fontSize="7" fill="#fff" fontFamily="Inter">
                {fingers[s] > 0 ? fingers[s] : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
