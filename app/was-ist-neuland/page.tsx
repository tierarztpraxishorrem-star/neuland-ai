import Link from 'next/link';
import { uiTokens, Card, Button } from '../../components/ui/System';

const modules = [
  {
    title: 'VetMind',
    text: 'Medizinischer Assistent für Anamnese, Strukturierung und klinische Entscheidungsunterstützung.',
  },
  {
    title: 'HR',
    text: 'Zeiterfassung für Team, Tages- und Wochenauswertung sowie Admin-Übersicht.',
  },
  {
    title: 'SOPs',
    text: 'Wissensbasis für standardisierte Prozesse, Vorlagen und wiederkehrende Qualitätsabläufe.',
  },
  {
    title: 'Diamond',
    text: 'Persönlichkeitsanalyse zur Team- und Selbstreflexion auf Basis strukturierter Fragen.',
  },
];

export default function WasIstNeulandPage() {
  return (
    <main style={{ minHeight: '100vh', background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: 'min(800px, 100%)', margin: '0 auto', display: 'grid', gap: uiTokens.sectionGap }}>
        <Card>
          <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 32, fontWeight: 700, color: uiTokens.brand }}>Was ist Neuland AI?</h1>
          <p style={{ margin: 0, color: uiTokens.textSecondary, lineHeight: 1.6, fontSize: 15 }}>
            Neuland AI ist eine Praxisplattform, die medizinische Arbeit, Teamprozesse und Organisation auf einer gemeinsamen Grundlage verbindet.
          </p>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: uiTokens.cardGap }}>
          {modules.map((module) => (
            <Card key={module.title}>
              <h2 style={{ marginTop: 0, marginBottom: 6, fontSize: 18, fontWeight: 600, color: uiTokens.textPrimary }}>{module.title}</h2>
              <p style={{ margin: 0, color: uiTokens.textSecondary, fontSize: 14, lineHeight: 1.5 }}>{module.text}</p>
            </Card>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href='/' style={{ textDecoration: 'none' }}>
            <Button>Zur Startseite</Button>
          </Link>
          <Link href='/onboarding' style={{ textDecoration: 'none' }}>
            <Button variant="secondary">Praxiszuordnung starten</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
