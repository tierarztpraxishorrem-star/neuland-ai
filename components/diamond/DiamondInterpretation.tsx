import type { DiamondClusterScore } from '@/lib/diamond/types';

type DiamondInterpretationProps = {
  dominant: DiamondClusterScore | null;
  topThree: DiamondClusterScore[];
  scores: DiamondClusterScore[];
  summaryText: string;
};

const levelText = (percent: number) => {
  if (percent >= 80) return 'sehr stark ausgeprägt';
  if (percent >= 65) return 'klar ausgeprägt';
  if (percent >= 50) return 'solide ausgeprägt';
  if (percent >= 35) return 'moderat ausgeprägt';
  return 'eher im Hintergrund';
};

const ROCK_TEXT: Record<string, string> = {
  gemeinschaft:
    'Du rockst überall dort, wo Zusammenarbeit, Vertrauen und gegenseitige Unterstützung wichtig sind. Du schaffst Verbindlichkeit, stärkst das Miteinander und bringst Menschen in einen guten Arbeitsfluss.',
  nachhaltigkeit:
    'Du rockst Felder, in denen Sinn, Verantwortung und langfristige Wirkung zählen. Du hast ein gutes Gespür für Fairness, Stabilität und nachhaltige Entscheidungen, die nicht nur heute, sondern auch morgen tragen.',
  sicherheit:
    'Du rockst Situationen, in denen Klarheit, Struktur und Verlässlichkeit gebraucht werden. Du denkst vorausschauend, erkennst Risiken früh und gibst Teams durch deinen Überblick Sicherheit.',
  tradition:
    'Du rockst Aufgaben, bei denen bewährte Standards, Qualität und Verbindlichkeit entscheidend sind. Du sorgst dafür, dass gute Routinen erhalten bleiben und Professionalität sichtbar wird.',
  freiheit:
    'Du rockst dort, wo Eigenverantwortung, Kreativität und Gestaltungsfreiheit gefragt sind. Du entwickelst Lösungen aus eigener Initiative und bringst neue Perspektiven in Bewegung.',
  abenteuer:
    'Du rockst dynamische Situationen mit Veränderung, Tempo und neuen Chancen. Du bringst Mut, Neugier und Umsetzungsenergie mit und gibst Impulse, wenn andere noch zögern.',
  leistung:
    'Du rockst leistungsorientierte Aufgaben mit klaren Zielen und messbaren Ergebnissen. Du bleibst dran, setzt Prioritäten und machst aus Anspruch konkrete Resultate.',
  einfluss:
    'Du rockst Kontexte, in denen Führung, Wirkung und klare Positionierung gebraucht werden. Du übernimmst Verantwortung, setzt Richtung und kannst andere für Entscheidungen gewinnen.',
};

const STRESS_TEXT: Record<string, string> = {
  gemeinschaft:
    'In stressigen Arbeitssituationen hilft dir dein Diamant, indem du bewusst auf Teamabstimmung und gegenseitige Unterstützung setzt. Für dich wirken kurze, klare Check-ins und ein gemeinsamer Fokus besonders entlastend.',
  nachhaltigkeit:
    'In stressigen Arbeitssituationen hilft dir dein Diamant, wenn du Prioritäten an Sinn und Langzeitwirkung ausrichtest. Du reduzierst Druck, indem du nicht alles gleichzeitig löst, sondern das Wesentliche mit nachhaltigem Effekt zuerst gehst.',
  sicherheit:
    'In stressigen Arbeitssituationen hilft dir dein Diamant, indem du Struktur in Unsicherheit bringst. Klare Reihenfolgen, Checklisten und transparente Zuständigkeiten geben dir sofort Stabilität und Handlungssicherheit.',
  tradition:
    'In stressigen Arbeitssituationen hilft dir dein Diamant, indem du auf bewährte Abläufe und Standards zurückgreifst. Diese Stabilität reduziert Fehlentscheidungen und gibt dir einen ruhigen, professionellen Rahmen.',
  freiheit:
    'In stressigen Arbeitssituationen hilft dir dein Diamant, wenn du dir aktive Entscheidungsspielräume schaffst. Eigenständiges Priorisieren, kurze Fokusblöcke und selbstbestimmte Lösungswege bringen dich schnell zurück in Wirksamkeit.',
  abenteuer:
    'In stressigen Arbeitssituationen hilft dir dein Diamant, indem du in Bewegung bleibst und lösungsorientiert denkst. Für dich ist wichtig, den Druck in konkrete Experimente und nächste Schritte zu verwandeln, statt in Grübeln zu verharren.',
  leistung:
    'In stressigen Arbeitssituationen hilft dir dein Diamant, indem du Ziele schärfst und konsequent in Teilziele übersetzt. Fortschritt, Messbarkeit und klare Erfolgskriterien geben dir Fokus und mentale Stabilität.',
  einfluss:
    'In stressigen Arbeitssituationen hilft dir dein Diamant, wenn du Verantwortung aktiv übernimmst und Kommunikation führst. Klare Ansagen, abgestimmte Entscheidungen und Richtung reduzieren Chaos und geben dir Kontrolle zurück.',
};

export default function DiamondInterpretation({ dominant, topThree, scores, summaryText }: DiamondInterpretationProps) {
  const ordered = [...scores].sort((a, b) => b.percent - a.percent);
  const topLabels = topThree.map((item) => item.label).join(', ');
  const weakest = ordered.slice(-2).map((item) => item.label).join(' und ');
  const top1 = topThree[0]?.label || 'dein stärkster Wert';
  const top2 = topThree[1]?.label || 'dein zweiter Wert';
  const top3 = topThree[2]?.label || 'dein dritter Wert';
  const rockText = dominant ? ROCK_TEXT[dominant.cluster] : 'Deine größte Stärke wird sichtbar, sobald dein dominierender Wert feststeht.';
  const stressText = dominant ? STRESS_TEXT[dominant.cluster] : 'Sobald dein Profil vollständig ist, erhältst du konkrete Hinweise für stressige Arbeitssituationen.';

  return (
    <section
      style={{
        border: '1px solid #dbe5e6',
        background: '#ffffff',
        borderRadius: '16px',
        padding: '18px',
        display: 'grid',
        gap: '18px',
      }}
    >
      <div style={{ display: 'grid', gap: '6px' }}>
        <h2 style={{ margin: 0, fontSize: '22px', color: '#0f172a' }}>Mein Diamant</h2>
        <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
          {dominant
            ? `Dein dominierender Wert ist ${dominant.label} mit ${dominant.percent}%. Dieser Wert bildet aktuell das Zentrum deines persönlichen Diamanten. Er beschreibt nicht nur eine Vorliebe, sondern einen stabilen inneren Kompass: So triffst du Entscheidungen, so gehst du mit Konflikten um und so lädst du deine Energie auf.`
            : 'Sobald dein Profil vollständig berechnet ist, erscheint hier deine individuelle Diamant-Interpretation.'}
        </p>
        <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
          Dein Diamant zeigt außerdem ein klares Profil statt Zufallswerte: Mit {topLabels} sind deine Prioritäten gut erkennbar. Das bedeutet, dass
          deine Motivation besonders stark wird, wenn dein Alltag und deine Aufgaben genau diese Werte spiegeln.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '19px', color: '#0f172a' }}>Meine Werte</h3>
        <div style={{ display: 'grid', gap: '8px' }}>
          {ordered.map((item) => (
            <div
              key={item.cluster}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '10px 12px',
                background: '#f8fafc',
                display: 'grid',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ color: '#0f172a' }}>{item.label}</strong>
                <strong style={{ color: item.color }}>{item.percent}%</strong>
              </div>
              <div style={{ fontSize: '14px', color: '#475569' }}>{levelText(item.percent)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '19px', color: '#0f172a' }}>Meine Passion und mein Sinn</h3>
        <p style={{ margin: 0, color: '#334155', lineHeight: 1.65 }}>
          Deine stärksten Werte sind {topLabels}. Deine Passion liegt damit in Feldern, in denen du {top1}, {top2} und {top3} aktiv leben kannst.
          Du bist besonders überzeugend, wenn du nicht nur Aufgaben erledigst, sondern spürbar nach deinen Werten handelst.
        </p>
        <p style={{ margin: 0, color: '#334155', lineHeight: 1.65 }}>
          Dein Sinn entsteht dort, wo deine Werte Wirkung erzeugen: in Entscheidungen, Projekten und Beziehungen, die zu deinem Profil passen. Wenn
          dieser Werte-Fit gegeben ist, arbeitest du klarer, fühlst dich stabiler und bleibst auch in anspruchsvollen Phasen fokussiert.
        </p>
        <p style={{ margin: 0, color: '#334155', lineHeight: 1.65 }}>
          Bereiche wie {weakest} stehen aktuell weniger im Vordergrund. Das ist kein Defizit, sondern ein Hinweis auf deinen momentanen Schwerpunkt.
          Für eine langfristig gesunde Balance kann es hilfreich sein, diese Felder situativ zu stärken, ohne deine Kernwerte zu verlassen.
        </p>
        <p style={{ margin: 0, color: '#334155', lineHeight: 1.65 }}>{summaryText}</p>
      </div>

      <div
        style={{
          border: '1px solid #dbe5e6',
          background: 'linear-gradient(145deg, #f5f8fc 0%, #edf3fa 100%)',
          borderRadius: '14px',
          padding: '14px',
          display: 'grid',
          gap: '8px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '19px', color: '#1e2b5f' }}>Was rockt bei dir</h3>
        <p style={{ margin: 0, color: '#334155', lineHeight: 1.7 }}>{rockText}</p>
      </div>

      <div
        style={{
          border: '1px solid #dbe5e6',
          background: '#f8fafc',
          borderRadius: '14px',
          padding: '14px',
          display: 'grid',
          gap: '8px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '19px', color: '#1e2b5f' }}>Wie hilft mir mein Diamant in stressigen Arbeitssituationen?</h3>
        <p style={{ margin: 0, color: '#334155', lineHeight: 1.7 }}>{stressText}</p>
        <p style={{ margin: 0, color: '#334155', lineHeight: 1.7 }}>
          Praktischer Mini-Check für akute Druckphasen: 1) Kurz stoppen und den nächsten klaren Schritt definieren. 2) Entscheiden, was jetzt
          Priorität hat und was warten kann. 3) Kommunikation aktiv halten, damit Erwartungen und Zuständigkeiten transparent bleiben.
        </p>
      </div>
    </section>
  );
}
