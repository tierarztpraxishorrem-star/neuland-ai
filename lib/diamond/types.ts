export type DiamondCluster =
  | 'gemeinschaft'
  | 'nachhaltigkeit'
  | 'sicherheit'
  | 'tradition'
  | 'freiheit'
  | 'abenteuer'
  | 'leistung'
  | 'einfluss';

export type DiamondQuestion = {
  id: string;
  text: string;
  cluster: DiamondCluster;
};

export type DiamondAnswerValue = 1 | 2 | 3 | 4 | 5 | 6;

export type DiamondAnswerMap = Record<string, DiamondAnswerValue | undefined>;

export type DiamondClusterScore = {
  cluster: DiamondCluster;
  label: string;
  color: string;
  average: number;
  percent: number;
  answered: number;
};

export type DiamondProfileResult = {
  totalAnswered: number;
  completionPercent: number;
  scores: DiamondClusterScore[];
  topThree: DiamondClusterScore[];
  dominant: DiamondClusterScore | null;
  summaryText: string;
};

export const DIAMOND_CLUSTER_LABELS: Record<DiamondCluster, string> = {
  gemeinschaft: 'Gemeinschaft',
  nachhaltigkeit: 'Nachhaltigkeit',
  sicherheit: 'Sicherheit',
  tradition: 'Tradition',
  freiheit: 'Freiheit',
  abenteuer: 'Abenteuer',
  leistung: 'Leistung',
  einfluss: 'Einfluss',
};

export const DIAMOND_CLUSTER_COLORS: Record<DiamondCluster, string> = {
  gemeinschaft: '#0F766E',
  nachhaltigkeit: '#16A34A',
  sicherheit: '#0891B2',
  tradition: '#7C3AED',
  freiheit: '#2563EB',
  abenteuer: '#EA580C',
  leistung: '#DC2626',
  einfluss: '#BE185D',
};

export const DIAMOND_SCALE_OPTIONS: Array<{ label: string; value: DiamondAnswerValue }> = [
  { label: 'sehr wichtig', value: 6 },
  { label: 'wichtig', value: 5 },
  { label: 'eher wichtig', value: 4 },
  { label: 'eher unwichtig', value: 3 },
  { label: 'unwichtig', value: 2 },
  { label: 'überhaupt nicht wichtig', value: 1 },
];
