import { uiTokens, Card } from '@/components/ui/System';

export default function AgbPage() {
  return (
    <main style={{ minHeight: '100vh', background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: 'min(800px, 100%)', margin: '0 auto', display: 'grid', gap: uiTokens.sectionGap }}>
        <Card>
          <h1 style={{ marginTop: 0, fontSize: 32, fontWeight: 700, color: uiTokens.brand }}>Allgemeine Geschäftsbedingungen (AGB)</h1>
          <p style={{ color: uiTokens.textSecondary, lineHeight: 1.6 }}>Diese Seite dient als Platzhalter für die AGB der Neuland AI Plattform.</p>
          <p style={{ color: uiTokens.textSecondary, lineHeight: 1.6 }}>Bitte hinterlege hier euren finalen Rechtstext. Bis dahin gilt: Nutzung nur im Rahmen interner Tests.</p>
        </Card>
      </div>
    </main>
  );
}
