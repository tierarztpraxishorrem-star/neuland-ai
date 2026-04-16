import DiamondQuiz from '@/components/diamond/DiamondQuiz';
import { isPersonalDiamondEnabled } from '@/lib/features';
import { uiTokens, Card } from '@/components/ui/System';

export default function DiamantPage() {
  if (!isPersonalDiamondEnabled()) {
    return (
      <main style={{ minHeight: '100vh', background: uiTokens.pageBackground, padding: uiTokens.pagePadding, display: 'grid', placeItems: 'center' }}>
        <Card style={{ width: 'min(720px, 100%)' }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: uiTokens.brand }}>Persönlicher Diamant</h1>
          <p style={{ color: uiTokens.textSecondary, lineHeight: 1.5, marginTop: 8, marginBottom: 0 }}>
            Diese Funktion ist in deinem aktuellen Abomodell nicht aktiv. Aktiviere den Feature-Flag NEXT_PUBLIC_FEATURE_PERSONAL_DIAMOND,
            um den Wertefragebogen freizuschalten.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: 'min(800px, 100%)', margin: '0 auto', display: 'grid', gap: uiTokens.sectionGap }}>
        <Card>
          <h1 style={{ margin: 0, color: uiTokens.brand, fontSize: 32, fontWeight: 700 }}>Persönlicher Diamant</h1>
          <p style={{ margin: '8px 0 0', color: uiTokens.textSecondary, lineHeight: 1.5, fontSize: 15 }}>
            Dein persönliches Werteprofil auf Basis von 40 Fragen und 8 Werteclustern.
            Die drei stärksten Werte werden hervorgehoben und als visuelle Diamant-Auswertung dargestellt.
          </p>
        </Card>

        <DiamondQuiz />
      </div>
    </main>
  );
}
