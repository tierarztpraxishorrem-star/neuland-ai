import DiamondGraphic, { type DiamondTopValue } from './DiamondGraphic';
import DiamondSummary from './DiamondSummary';

const DEMO_TOP_VALUES: DiamondTopValue[] = [
  {
    cluster: 'gemeinschaft',
    label: 'Gemeinschaft',
    percent: 90,
    color: '#26b7bc',
  },
  {
    cluster: 'nachhaltigkeit',
    label: 'Nachhaltigkeit',
    percent: 86,
    color: '#8dbf3e',
  },
  {
    cluster: 'abenteuer',
    label: 'Kreieren',
    percent: 79,
    color: '#9b5ac7',
  },
];

export default function DiamondGraphicExample() {
  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <DiamondGraphic topValues={DEMO_TOP_VALUES} />
      <DiamondSummary topValues={DEMO_TOP_VALUES} />
    </div>
  );
}
