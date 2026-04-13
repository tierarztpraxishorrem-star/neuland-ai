import { DIAMOND_QUESTIONS } from './questions';
import {
  DIAMOND_CLUSTER_COLORS,
  DIAMOND_CLUSTER_LABELS,
  type DiamondAnswerMap,
  type DiamondCluster,
  type DiamondClusterScore,
  type DiamondProfileResult,
} from './types';

const CLUSTER_ORDER: DiamondCluster[] = [
  'gemeinschaft',
  'nachhaltigkeit',
  'sicherheit',
  'tradition',
  'freiheit',
  'abenteuer',
  'leistung',
  'einfluss',
];

const round = (value: number) => Math.round(value * 10) / 10;

const toPercent = (average: number) => {
  if (!Number.isFinite(average)) return 0;
  const normalized = ((average - 1) / 5) * 100;
  return round(Math.max(0, Math.min(100, normalized)));
};

const summaryText = (scores: DiamondClusterScore[]) => {
  const ordered = [...scores].sort((a, b) => b.percent - a.percent);
  const top = ordered.slice(0, 3);
  const low = ordered.slice(-2);

  if (top.length === 0) {
    return 'Dein Profil ist noch unvollständig. Bitte beantworte weitere Fragen für eine aussagekräftige Auswertung.';
  }

  const dominant = top[0];
  const second = top[1];
  const third = top[2];

  const energyParts = [dominant?.label, second?.label, third?.label].filter(Boolean).join(', ');
  const lowParts = low.map((item) => item.label).join(' und ');

  return [
    `${dominant.label} ist dein dominierender Wert mit ${dominant.percent}%.`,
    `Dein Profil wirkt werteorientiert und klar priorisiert: ${energyParts} geben dir besonders Energie und Richtung.`,
    `Wichtig ist dir vor allem, Entscheidungen entlang dieser Top-Werte zu treffen und Verantwortung entsprechend zu leben.`,
    `Eher weniger im Fokus stehen aktuell ${lowParts}. Diese Bereiche rocken bei dir momentan weniger stark.`,
  ].join(' ');
};

export function calculateDiamondProfile(answers: DiamondAnswerMap): DiamondProfileResult {
  const clusterQuestions = new Map<DiamondCluster, string[]>();

  CLUSTER_ORDER.forEach((cluster) => {
    clusterQuestions.set(cluster, []);
  });

  DIAMOND_QUESTIONS.forEach((question) => {
    const list = clusterQuestions.get(question.cluster);
    if (list) list.push(question.id);
  });

  const scores: DiamondClusterScore[] = CLUSTER_ORDER.map((cluster) => {
    const questionIds = clusterQuestions.get(cluster) || [];
    const values = questionIds
      .map((questionId) => answers[questionId])
      .filter((value): value is 1 | 2 | 3 | 4 | 5 | 6 => typeof value === 'number');

    const answered = values.length;
    const average = answered > 0 ? values.reduce((sum, value) => sum + value, 0) / answered : 0;

    return {
      cluster,
      label: DIAMOND_CLUSTER_LABELS[cluster],
      color: DIAMOND_CLUSTER_COLORS[cluster],
      average: round(average),
      percent: toPercent(average),
      answered,
    };
  });

  const totalAnswered = DIAMOND_QUESTIONS.reduce((count, question) => {
    return answers[question.id] ? count + 1 : count;
  }, 0);

  const completionPercent = round((totalAnswered / DIAMOND_QUESTIONS.length) * 100);
  const topThree = [...scores].sort((a, b) => b.percent - a.percent).slice(0, 3);
  const dominant = topThree[0] || null;

  return {
    totalAnswered,
    completionPercent,
    scores,
    topThree,
    dominant,
    summaryText: summaryText(scores),
  };
}

export function toPersistedScores(scores: DiamondClusterScore[]) {
  return scores.map((item) => ({
    cluster: item.cluster,
    percent: item.percent,
    average: item.average,
    answered: item.answered,
  }));
}
