'use client';

interface PageSkeletonProps {
  rows?: number;
  cols?: number;
  cardHeight?: number;
}

const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, #0D0D1F 25%, #151530 50%, #0D0D1F 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: 12,
};

function SkimBar({ w, h, delay = 0 }: { w: number | string; h: number; delay?: number }) {
  return (
    <div style={{ ...shimmerStyle, width: w, height: h, animationDelay: `${delay}s`, flexShrink: 0 }} />
  );
}

export function PageSkeleton({ rows = 4, cols = 2, cardHeight = 150 }: PageSkeletonProps) {
  return (
    <div style={{ padding: '0 0 32px 0' }}>
      {/* Toolbar row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <SkimBar w={180} h={34} />
        <SkimBar w={120} h={34} delay={0.05} />
        <div style={{ marginLeft: 'auto' }}>
          <SkimBar w={140} h={34} delay={0.1} />
        </div>
      </div>

      {/* Card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: 16,
      }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ ...shimmerStyle, height: cardHeight, animationDelay: `${i * 0.07}s` }} />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', display: 'flex', gap: 16 }}>
        {[30, 20, 15, 15, 10].map((w, i) => (
          <SkimBar key={i} w={`${w}%`} h={12} delay={i * 0.04} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ padding: '14px 16px', display: 'flex', gap: 16, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {[30, 20, 15, 15, 10].map((w, j) => (
            <SkimBar key={j} w={`${w}%`} h={12} delay={(i * 5 + j) * 0.02} />
          ))}
        </div>
      ))}
    </div>
  );
}
