'use client';

import { brand } from '../_brand';

type Props = {
  patientLetter: string;
  onPatientLetterChange: (value: string) => void;
  medication: string;
  onMedicationChange: (value: string) => void;
  followUp: string;
  onFollowUpChange: (value: string) => void;
  sectionCardStyle: React.CSSProperties;
};

export default function PatientLetterEditor({
  patientLetter,
  onPatientLetterChange,
  medication,
  onMedicationChange,
  followUp,
  onFollowUpChange,
  sectionCardStyle,
}: Props) {
  if (!patientLetter) return null;

  return (
    <div style={{ ...sectionCardStyle, marginTop: '20px', padding: '20px' }}>
      <h2 style={{ color: brand.primary }}>Patientenbrief</h2>

      <textarea
        value={patientLetter}
        onChange={(e) => onPatientLetterChange(e.target.value)}
        style={{
          width: '100%',
          minHeight: '200px',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid #ccc',
        }}
      />

      <div style={{ marginTop: '20px' }}>
        <label style={{ fontWeight: 700, color: brand.primary, display: 'block', marginBottom: '6px' }}>
          Medikamente
        </label>
        <textarea
          value={medication}
          onChange={(e) => onMedicationChange(e.target.value)}
          placeholder="z.B. Prednisolon 5 mg – 1x täglich"
          style={{
            width: '100%',
            minHeight: '90px',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
          }}
        />
      </div>

      <div style={{ marginTop: '16px' }}>
        <label style={{ fontWeight: 700, color: brand.primary, display: 'block', marginBottom: '6px' }}>
          Empfohlene Kontrolle
        </label>
        <input
          value={followUp}
          onChange={(e) => onFollowUpChange(e.target.value)}
          placeholder="z.B. Kontrolle in 7 Tagen"
          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc' }}
        />
      </div>
    </div>
  );
}
