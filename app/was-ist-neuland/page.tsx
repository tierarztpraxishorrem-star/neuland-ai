import Link from 'next/link';

const modules = [
  {
    title: 'VetMind',
    text: 'Medizinischer Assistent fuer Anamnese, Strukturierung und klinische Entscheidungsunterstuetzung.',
  },
  {
    title: 'HR',
    text: 'Zeiterfassung fuer Team, Tages- und Wochenauswertung sowie Admin-Uebersicht.',
  },
  {
    title: 'SOPs',
    text: 'Wissensbasis fuer standardisierte Prozesse, Vorlagen und wiederkehrende Qualitaetsablaeufe.',
  },
  {
    title: 'Diamond',
    text: 'Persoenlichkeitsanalyse zur Team- und Selbstreflexion auf Basis strukturierter Fragen.',
  },
];

export default function WasIstNeulandPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f5f8f9 0%, #edf3f4 100%)', padding: '28px', fontFamily: 'Arial, sans-serif' }}>
      <section style={{ width: 'min(980px, 100%)', margin: '0 auto', display: 'grid', gap: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #dbe5e6', borderRadius: 16, padding: 20 }}>
          <h1 style={{ marginTop: 0, marginBottom: 8, color: '#0f6b74' }}>Was ist Neuland AI?</h1>
          <p style={{ margin: 0, color: '#64748b', lineHeight: 1.6 }}>
            Neuland AI ist eine Praxisplattform, die medizinische Arbeit, Teamprozesse und Organisation auf einer gemeinsamen Grundlage verbindet.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {modules.map((module) => (
            <article key={module.title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
              <h2 style={{ marginTop: 0, marginBottom: 6, fontSize: 18 }}>{module.title}</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>{module.text}</p>
            </article>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href='/' style={{ textDecoration: 'none' }}>
            <button style={{ border: 'none', borderRadius: 10, background: '#0f6b74', color: '#fff', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}>
              Zur Startseite
            </button>
          </Link>
          <Link href='/onboarding' style={{ textDecoration: 'none' }}>
            <button style={{ border: '1px solid #cbd5e1', borderRadius: 10, background: '#fff', color: '#0f172a', padding: '10px 14px', fontWeight: 600, cursor: 'pointer' }}>
              Praxiszuordnung starten
            </button>
          </Link>
        </div>
      </section>
    </main>
  );
}
