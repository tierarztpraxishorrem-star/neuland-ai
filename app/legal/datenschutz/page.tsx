import { uiTokens, Card } from '@/components/ui/System';

export default function DatenschutzPage() {
  return (
    <main style={{ minHeight: '100vh', background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: 'min(800px, 100%)', margin: '0 auto', display: 'grid', gap: uiTokens.sectionGap }}>
        <Card>
          <h1 style={{ marginTop: 0, fontSize: 32, fontWeight: 700, color: uiTokens.brand }}>Datenschutzerklärung</h1>
          <p style={{ color: uiTokens.textSecondary, lineHeight: 1.6 }}>Diese Seite dient als Platzhalter für die Datenschutzerklärung der Neuland AI Plattform.</p>
          <p style={{ color: uiTokens.textSecondary, lineHeight: 1.6 }}>Bitte hinterlege hier euren finalen DSGVO-konformen Rechtstext mit Kontakt, Rechtsgrundlagen und Aufbewahrungsfristen.</p>
        </Card>
      </div>
    </main>
  );
}
