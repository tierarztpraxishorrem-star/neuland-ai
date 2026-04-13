import type { DiamondCluster } from '@/lib/diamond/types';

export type DiamondTopValue = {
  cluster: DiamondCluster;
  label: string;
  percent: number;
  color: string;
};

export interface DiamondGraphicProps {
  topValues: DiamondTopValue[];
}

const TOP_FACET_FILL = '#25356d';

const toSafeTopValues = (topValues: DiamondTopValue[]) => {
  const fallback: DiamondTopValue = {
    cluster: 'gemeinschaft',
    label: 'Gemeinschaft',
    percent: 0,
    color: '#26b7bc',
  };

  return [topValues[0] || fallback, topValues[1] || fallback, topValues[2] || fallback];
};

const resolveColor = (value: DiamondTopValue, index: number) => {
  const label = value.label.toLowerCase();
  if (label.includes('gemeinschaft')) return '#26b7bc';
  if (label.includes('nachhaltigkeit')) return '#8dbf3e';
  if (label.includes('machen') || label.includes('kreieren')) return '#9b5ac7';
  if (index === 2) return '#9b5ac7';
  return value.color;
};

export default function DiamondGraphic({ topValues }: DiamondGraphicProps) {
  const [left, right, bottom] = toSafeTopValues(topValues);

  const leftColor = resolveColor(left, 0);
  const rightColor = resolveColor(right, 1);
  const bottomColor = resolveColor(bottom, 2);

  return (
    <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto' }}>
      <svg viewBox='0 0 420 420' style={{ width: '100%', height: 'auto', display: 'block' }} role='img' aria-label='Persönlicher Diamant'>
        <defs>
          <linearGradient id='baseGrad' x1='0%' y1='0%' x2='0%' y2='100%'>
            <stop offset='0%' stopColor='#eef3f7' />
            <stop offset='100%' stopColor='#dbe2ea' />
          </linearGradient>
          <linearGradient id='topBlueGrad' x1='0%' y1='0%' x2='100%' y2='100%'>
            <stop offset='0%' stopColor='#2c3f7f' />
            <stop offset='100%' stopColor={TOP_FACET_FILL} />
          </linearGradient>
          <linearGradient id='leftActiveGrad' x1='0%' y1='0%' x2='100%' y2='100%'>
            <stop offset='0%' stopColor={leftColor} />
            <stop offset='100%' stopColor='#1f8f98' />
          </linearGradient>
          <linearGradient id='rightActiveGrad' x1='0%' y1='0%' x2='100%' y2='100%'>
            <stop offset='0%' stopColor={rightColor} />
            <stop offset='100%' stopColor='#79a231' />
          </linearGradient>
          <linearGradient id='bottomActiveGrad' x1='0%' y1='0%' x2='100%' y2='100%'>
            <stop offset='0%' stopColor={bottomColor} />
            <stop offset='100%' stopColor='#7d46ab' />
          </linearGradient>
          <filter id='softShadow' x='-20%' y='-20%' width='140%' height='160%'>
            <feDropShadow dx='0' dy='10' stdDeviation='8' floodColor='#24364f' floodOpacity='0.14' />
          </filter>
        </defs>

        <g filter='url(#softShadow)'>
          <polygon points='30,170 140,58 210,48 280,58 390,170 220,382' fill='url(#baseGrad)' />

          <polygon points='30,170 140,58 180,130 125,182' fill='url(#leftActiveGrad)' />
          <polygon points='140,58 210,48 200,115 180,130' fill='url(#topBlueGrad)' />
          <polygon points='210,48 280,58 240,130 200,115' fill='url(#topBlueGrad)' />
          <polygon points='280,58 390,170 295,182 240,130' fill='url(#rightActiveGrad)' />

          <polygon points='125,182 180,130 200,115 240,130 295,182 270,240 150,240' fill='url(#bottomActiveGrad)' />
          <polygon points='30,170 125,182 150,240 85,305' fill='url(#baseGrad)' opacity='0.92' />
          <polygon points='390,170 295,182 270,240 325,305' fill='url(#baseGrad)' opacity='0.92' />
          <polygon points='150,240 270,240 240,330 180,330' fill='url(#baseGrad)' opacity='0.9' />
          <polygon points='180,330 240,330 220,382' fill='url(#baseGrad)' opacity='0.88' />
        </g>

        <g fill='none' stroke='rgba(255,255,255,0.7)' strokeWidth='4' strokeLinejoin='round' strokeLinecap='round'>
          <polyline points='30,170 140,58 210,48 280,58 390,170 220,382 30,170' />
          <polyline points='140,58 180,130 125,182 30,170' />
          <polyline points='280,58 240,130 295,182 390,170' />
          <polyline points='180,130 200,115 240,130' />
          <polyline points='125,182 150,240 270,240 295,182' />
          <polyline points='150,240 180,330 240,330 270,240' />
          <polyline points='180,330 220,382 240,330' />
        </g>

        <text x='104' y='226' textAnchor='middle' style={{ fontSize: '42px', fontWeight: 800, fill: '#ffffff' }}>
          {left.percent}%
        </text>
        <text x='318' y='226' textAnchor='middle' style={{ fontSize: '42px', fontWeight: 800, fill: '#ffffff' }}>
          {right.percent}%
        </text>
        <text x='210' y='286' textAnchor='middle' style={{ fontSize: '42px', fontWeight: 800, fill: '#ffffff' }}>
          {bottom.percent}%
        </text>
      </svg>
    </div>
  );
}
