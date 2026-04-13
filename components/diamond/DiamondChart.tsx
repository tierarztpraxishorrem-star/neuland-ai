'use client';

import type { DiamondClusterScore } from '@/lib/diamond/types';
import DiamondGraphic from './DiamondGraphic';
import DiamondSummary from './DiamondSummary';

type DiamondChartProps = {
  scores: DiamondClusterScore[];
  topClusterKeys: string[];
};

const byPercent = (a: DiamondClusterScore, b: DiamondClusterScore) => b.percent - a.percent;

export default function DiamondChart({ scores, topClusterKeys }: DiamondChartProps) {
  const topThree = [...scores].sort(byPercent).slice(0, 3);
  const topValues = topThree.map((item) => ({
    cluster: item.cluster,
    label: item.label,
    percent: item.percent,
    color: item.color,
  }));

  return (
    <section
      style={{
        border: '1px solid #dbe5e6',
        background: '#ffffff',
        borderRadius: '18px',
        padding: '18px',
        display: 'grid',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '22px', color: '#0f172a' }}>Mein Diamant</h2>
        <span style={{ color: '#64748b', fontSize: '13px' }}>Deine drei stärksten Werte im Fokus</span>
      </div>

      <div
        style={{
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          background: 'linear-gradient(180deg, #eef2f7 0%, #f8fafc 100%)',
          padding: '16px 12px',
          display: 'grid',
          gap: '10px',
          placeItems: 'center',
        }}
      >
        <DiamondGraphic topValues={topValues} />
        <DiamondSummary topValues={topValues} />
      </div>

      <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {scores.map((score) => {
          const isTop = topClusterKeys.includes(score.cluster);
          return (
            <div
              key={score.cluster}
              style={{
                border: isTop ? `1px solid ${score.color}` : '1px solid #e2e8f0',
                borderRadius: '12px',
                background: isTop ? 'rgba(15, 107, 116, 0.06)' : '#f8fafc',
                padding: '10px',
              }}
            >
              <div style={{ fontSize: '13px', color: '#475569' }}>{score.label}</div>
              <div style={{ fontWeight: 700, color: score.color, fontSize: '20px' }}>{score.percent}%</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
