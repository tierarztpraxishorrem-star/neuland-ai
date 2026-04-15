'use client';

import { supabase } from '../../../lib/supabase';
import { brand, type CaseRecord } from '../_brand';

type Props = {
  selectedCase: CaseRecord | null;
  onCaseChange: (c: CaseRecord) => void;
};

export default function CaseDetailPanel({ selectedCase, onCaseChange }: Props) {
  if (!selectedCase) return null;

  const saveChanges = async () => {
    const { error } = await supabase
      .from('cases')
      .update({ result: selectedCase.result })
      .eq('id', selectedCase.id);

    if (error) {
      console.error('Fehler beim Speichern', error);
      alert('Fehler beim Speichern');
    } else {
      alert('Gespeichert');
    }
  };

  return (
    <div
      style={{
        marginTop: '20px',
        marginBottom: '20px',
        padding: '20px',
        border: '2px solid #0F6B74',
        borderRadius: '12px',
        background: '#f0f9fa',
      }}
    >
      <h2 style={{ color: brand.primary }}>Aktiver Fall</h2>

      <div><b>Patient:</b> {selectedCase.patient_name}</div>
      <div><b>Tierart:</b> {selectedCase.species}</div>
      <div><b>Tierarzt:</b> {selectedCase.vet}</div>
      <div><b>Praxis:</b> {selectedCase.practice}</div>

      <div style={{ marginTop: '10px' }}>
        <b>Ergebnis:</b>
        <textarea
          value={selectedCase.result || ''}
          onChange={(e) => onCaseChange({ ...selectedCase, result: e.target.value })}
          style={{
            width: '100%',
            minHeight: '150px',
            marginTop: '6px',
            padding: '10px',
          }}
        />
        <button
          onClick={saveChanges}
          style={{
            marginTop: '10px',
            padding: '10px 16px',
            background: brand.primary,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Änderungen speichern
        </button>
      </div>
    </div>
  );
}
