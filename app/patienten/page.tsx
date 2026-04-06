'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

type Patient = {
  id: string;
  name: string;
  tierart: string | null;
  rasse: string | null;
  alter: string | null;
  geschlecht: string | null;
  owner_name: string | null;
  external_id: string | null;
  created_at: string;
};

type CaseLite = {
  id: string;
  patient_id: string | null;
  created_at: string;
};

export default function PatientenPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [cases, setCases] = useState<CaseLite[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      const [patientsRes, casesRes] = await Promise.all([
        supabase
          .from('patients')
          .select('id, name, tierart, rasse, alter, geschlecht, owner_name, external_id, created_at')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('cases')
          .select('id, patient_id, created_at')
          .not('patient_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(2000)
      ]);

      if (patientsRes.error) {
        console.error(patientsRes.error);
      } else {
        setPatients((patientsRes.data || []) as Patient[]);
      }

      if (casesRes.error) {
        console.error(casesRes.error);
      } else {
        setCases((casesRes.data || []) as CaseLite[]);
      }

      setLoading(false);
    };

    loadData();
  }, []);

  const latestByPatient = cases.reduce<Record<string, string>>((acc, entry) => {
    if (!entry.patient_id) return acc;
    if (!acc[entry.patient_id]) {
      acc[entry.patient_id] = entry.created_at;
    }
    return acc;
  }, {});

  const filteredPatients = patients.filter((patient) => {
    const haystack = [
      patient.name,
      patient.external_id || '',
      patient.tierart || '',
      patient.rasse || '',
      patient.alter || '',
      patient.geschlecht || '',
      patient.owner_name || ''
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(search.toLowerCase());
  });

  const formatDate = (value: string | undefined) => {
    if (!value) return 'Keine Konsultation';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Keine Konsultation';
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <main style={{
      padding: '40px',
      background: '#f4f7f8',
      minHeight: '100vh'
    }}>

      <h1 style={{ color: '#0F6B74', marginBottom: '20px' }}>
        Patienten
      </h1>

      <input
        placeholder='Suche nach Name, PMS-ID, Rasse, Besitzer ...'
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%',
          maxWidth: '480px',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid #e5e7eb',
          marginBottom: '18px'
        }}
      />

      {!loading && filteredPatients.length === 0 && (
        <div style={{ color: '#6b7280' }}>
          Noch keine Patienten vorhanden
        </div>
      )}

      <div style={{
        display: 'grid',
        gap: '16px'
      }}>
        {filteredPatients.map((patient) => (
          <div
            key={patient.id}
            onClick={() => router.push(`/patienten/${patient.id}`)}
            style={{
              background: '#fff',
              padding: '20px',
              borderRadius: '14px',
              border: '1px solid #e5e7eb',
              cursor: 'pointer'
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {patient.name}
              {patient.external_id ? ` (#${patient.external_id})` : ''}
            </div>

            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              {patient.tierart || 'Tierart offen'}
            </div>

            <div style={{ fontSize: '13px', color: '#475569', marginTop: '6px' }}>
              {[patient.rasse, patient.alter, patient.geschlecht].filter(Boolean).join(' · ') || 'Rasse/Alter/Geschlecht offen'}
            </div>

            <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
              Besitzer: {patient.owner_name || '-'}
            </div>

            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
              Letzte Konsultation: {formatDate(latestByPatient[patient.id])}
            </div>
          </div>
        ))}
      </div>

    </main>
  );
}
