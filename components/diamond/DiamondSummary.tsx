import type { DiamondTopValue } from './DiamondGraphic';

export interface DiamondSummaryProps {
  topValues: DiamondTopValue[];
}

const normalizeTopValues = (topValues: DiamondTopValue[]) => {
  const fallback: DiamondTopValue = {
    cluster: 'gemeinschaft',
    label: 'Wert',
    percent: 0,
    color: '#26b7bc',
  };

  return [topValues[0] || fallback, topValues[1] || fallback, topValues[2] || fallback];
};

export default function DiamondSummary({ topValues }: DiamondSummaryProps) {
  const [first, second, third] = normalizeTopValues(topValues);

  return (
    <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto', display: 'grid', gap: '10px' }}>
      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
        <ValueSlot value={first} />
        <ValueSlot value={second} />
      </div>

      <div style={{ width: '100%', display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 'min(300px, 100%)' }}>
          <ValueSlot value={third} />
        </div>
      </div>
    </div>
  );
}

function ValueSlot({ value }: { value: DiamondTopValue }) {
  return (
    <div style={{ textAlign: 'center', display: 'grid', gap: '2px' }}>
      <div style={{ color: '#1e2b5f', fontWeight: 800, fontSize: 'clamp(40px, 6vw, 62px)', lineHeight: 1 }}>{value.percent}%</div>
      <div style={{ color: '#1e2b5f', fontWeight: 600, fontSize: 'clamp(20px, 3vw, 34px)', lineHeight: 1.12 }}>{value.label}</div>
    </div>
  );
}
