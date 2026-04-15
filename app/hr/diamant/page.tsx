import DiamondQuiz from '@/components/diamond/DiamondQuiz';
import { isPersonalDiamondEnabled } from '@/lib/features';

export default function HrDiamantPage() {
  if (!isPersonalDiamondEnabled()) {
    return (
      <div style={{ padding: '24px' }}>
        <h1 style={{ margin: 0, color: '#0f172a' }}>Persönlicher Diamant</h1>
        <p style={{ color: '#64748b', lineHeight: 1.5 }}>
          Diese Funktion ist in deinem aktuellen Abomodell nicht aktiv. Aktiviere den Feature-Flag
          NEXT_PUBLIC_FEATURE_PERSONAL_DIAMOND, um den Wertefragebogen freizuschalten.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
      <section
        style={{
          border: '1px solid #dbe5e6',
          background: '#ffffff',
          borderRadius: '16px',
          padding: '20px',
          display: 'grid',
          gap: '8px',
        }}
      >
        <h1 style={{ margin: 0, color: '#0f6b74', fontSize: '28px' }}>Persönlicher Diamant</h1>
        <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5 }}>
          Dein persönliches Werteprofil auf Basis von 40 Fragen und 8 Werteclustern.
          Die drei stärksten Werte werden hervorgehoben und als visuelle Diamant-Auswertung dargestellt.
        </p>
      </section>

      <DiamondQuiz />
    </div>
  );
}
