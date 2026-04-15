'use client';

import { brand, type CaseRecord } from '../_brand';

type Props = {
  cases: CaseRecord[];
  loadingCases: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  showAllCases: boolean;
  onShowAllCasesChange: (value: boolean) => void;
  onSelectCase: (c: CaseRecord) => void;
  isMobile: boolean;
  sectionCardStyle: React.CSSProperties;
};

export default function CaseList({
  cases,
  loadingCases,
  search,
  onSearchChange,
  showAllCases,
  onShowAllCasesChange,
  onSelectCase,
  isMobile,
  sectionCardStyle,
}: Props) {
  const filtered = cases.filter((c) => {
    const s = search.toLowerCase();
    return (
      c.patient_name?.toLowerCase().includes(s) ||
      c.species?.toLowerCase().includes(s) ||
      c.vet?.toLowerCase().includes(s)
    );
  });

  return (
    <div style={{ ...sectionCardStyle, marginTop: '30px', padding: '20px' }}>
      <input
        type="text"
        placeholder="Fall suchen (Name, Tierart, Tierarzt...)"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          width: '100%',
          padding: '10px',
          marginBottom: '12px',
          borderRadius: '8px',
          border: '1px solid #ccc',
        }}
      />

      <h2 style={{ color: brand.primary }}>Letzte Fälle</h2>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ cursor: 'pointer', fontSize: '14px' }}>
          <input
            type="checkbox"
            checked={showAllCases}
            onChange={(e) => onShowAllCasesChange(e.target.checked)}
            style={{ marginRight: '6px' }}
          />
          Alle Fälle der Praxis anzeigen
        </label>
      </div>

      {loadingCases && <div>Lade Fälle...</div>}

      {!loadingCases && (!cases || cases.length === 0) && (
        <div style={{ color: brand.muted }}>Noch keine Fälle vorhanden</div>
      )}

      {filtered.map((c, i) => (
        <div
          key={c.id || i}
          onClick={() => onSelectCase(c)}
          style={{
            cursor: 'pointer',
            padding: '12px',
            borderBottom: '1px solid #eee',
            marginBottom: '8px',
          }}
        >
          <b>{c.patient_name || 'Unbekannt'}</b> – {c.species || '—'}
          <div style={{ fontSize: '13px', color: brand.muted }}>
            {c.vet || '—'} · {c.practice || '—'}
          </div>
          <div style={{ fontSize: '12px', color: '#999' }}>
            {new Date(c.created_at).toLocaleString('de-DE')}
          </div>
        </div>
      ))}
    </div>
  );
}
