'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import { searchBreeds } from '../../lib/patientBreeds';
import { Badge, Button, Card, EmptyState, Input, ListItem, Section, SelectInput, uiTokens } from '../../components/ui/System';

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
  const [dataError, setDataError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newPatient, setNewPatient] = useState({
    name: '',
    tierart: '',
    rasse: '',
    alter: '',
    geschlecht: '',
    external_id: ''
  });
  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setDataError(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        setLoading(false);
        router.push('/');
        return;
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from('practice_memberships')
        .select('practice_id, role, created_at')
        .order('created_at', { ascending: true });

      if (membershipsError) {
        setPatients([]);
        setCases([]);
        setDataError(`Praxiszuordnung konnte nicht geladen werden: ${membershipsError.message || 'Unbekannter Fehler'}`);
        setLoading(false);
        return;
      }

      if (!memberships || memberships.length === 0) {
        setLoading(false);
        router.push('/onboarding');
        return;
      }

      const rank: Record<string, number> = { owner: 0, admin: 1, member: 2 };
      const selectedMembership = [...memberships].sort((a: any, b: any) => {
        const ra = rank[a.role] ?? 99;
        const rb = rank[b.role] ?? 99;
        if (ra !== rb) return ra - rb;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      })[0];

      const activePracticeId = selectedMembership?.practice_id;

      if (!activePracticeId) {
        setLoading(false);
        router.push('/onboarding');
        return;
      }

      const [patientsRes, casesRes] = await Promise.all([
        supabase
          .from('patients')
          .select('id, name, tierart, rasse, alter, geschlecht, owner_name, external_id, created_at')
          .eq('practice_id', activePracticeId)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('cases')
          .select('id, patient_id, created_at')
          .eq('practice_id', activePracticeId)
          .not('patient_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(2000)
      ]);

      if (patientsRes.error) {
        setPatients([]);
        setDataError('Patienten konnten nicht geladen werden.');
      } else {
        setPatients((patientsRes.data || []) as Patient[]);
      }

      if (casesRes.error) {
        setCases([]);
        setDataError((prev) => prev || 'Konsultationen konnten nicht geladen werden.');
      } else {
        setCases((casesRes.data || []) as CaseLite[]);
      }

      setLoading(false);
    };

    loadData();
  }, [router]);

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

  const breedSuggestions = searchBreeds(newPatient.rasse);

  const createPatient = async () => {
    if (!newPatient.name.trim()) {
      alert('Name ist ein Pflichtfeld.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: newPatient.name.trim(),
        tierart: newPatient.tierart || null,
        rasse: newPatient.rasse.trim() || null,
        alter: newPatient.alter.trim() || null,
        geschlecht: newPatient.geschlecht || null,
        external_id: newPatient.external_id.trim() || null,
        owner_name: null
      };

      const { data, error } = await supabase
        .from('patients')
        .insert(payload)
        .select('id, name, tierart, rasse, alter, geschlecht, owner_name, external_id, created_at')
        .single();

      if (error) throw error;

      const created = data as Patient;
      setPatients((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setNewPatient({
        name: '',
        tierart: '',
        rasse: '',
        alter: '',
        geschlecht: '',
        external_id: ''
      });

      const goToDetail = window.confirm('Patient gespeichert. Jetzt Konsultation starten?');
      if (goToDetail) {
        router.push('/konsultation/start');
      } else {
        router.push(`/patienten/${created.id}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      alert(`Patient konnte nicht angelegt werden: ${message}`);
    } finally {
      setSaving(false);
    }
  };

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
    <main style={{ padding: uiTokens.pagePadding, background: uiTokens.pageBackground, minHeight: '100vh' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <h1 style={{ color: uiTokens.brand, margin: 0, fontSize: '32px', fontWeight: 700 }}>Patienten</h1>
        <Button variant='primary' size='lg' onClick={() => setShowCreateModal(true)}>
          + Neuer Patient
        </Button>
      </div>

      <div style={{ marginBottom: uiTokens.sectionGap }}>
        <Input
          placeholder='Suche nach Name, PMS-ID, Rasse, Besitzer ...'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: '260px', maxWidth: '560px' }}
        />
        {dataError && (
          <div style={{ marginTop: '8px', fontSize: '13px', color: '#b91c1c' }}>{dataError}</div>
        )}
      </div>

      {!loading && filteredPatients.length === 0 && (
        <EmptyState
          text='Noch keine Patienten vorhanden'
          actionLabel='+ Ersten Patienten anlegen'
          onAction={() => setShowCreateModal(true)}
        />
      )}

      <div style={{ display: 'grid', gap: '12px' }}>
        {filteredPatients.map((patient) => (
          <ListItem key={patient.id} onClick={() => router.push(`/patienten/${patient.id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: '17px' }}>
                {patient.name}
                {patient.external_id ? ` (#${patient.external_id})` : ''}
              </div>
              <Badge tone='accent'>{patient.tierart || 'Tierart offen'}</Badge>
            </div>

            <div style={{ fontSize: '13px', color: uiTokens.textSecondary }}>
              {[patient.rasse, patient.alter, patient.geschlecht].filter(Boolean).join(' · ') || 'Rasse/Alter/Geschlecht offen'}
            </div>

            <div style={{ fontSize: '13px', color: uiTokens.textSecondary }}>
              Besitzer: {patient.owner_name || '-'}
            </div>

            <div style={{ fontSize: '12px', color: uiTokens.textMuted }}>
              Letzte Konsultation: {formatDate(latestByPatient[patient.id])}
            </div>
          </ListItem>
        ))}
      </div>

      {showCreateModal && (
        <div
          onClick={() => setShowCreateModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.32)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120
          }}
        >
          <Card style={{ width: 'min(620px, calc(100vw - 24px))', padding: '20px' }}>
            <div onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '22px' }}>Neuen Patienten anlegen</h3>
                <Button variant='ghost' onClick={() => setShowCreateModal(false)} style={{ fontSize: '18px' }}>
                  ✕
                </Button>
              </div>

              <Section title='Stammdaten'>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Input
                      label='Name (Pflichtfeld)'
                      value={newPatient.name}
                      onChange={(e) => setNewPatient((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder='Patientenname'
                    />
                  </div>

                  <SelectInput
                    label='Tierart'
                    value={newPatient.tierart}
                    onChange={(e) => setNewPatient((prev) => ({ ...prev, tierart: e.target.value }))}
                  >
                    <option value=''>-</option>
                    <option value='Hund'>Hund</option>
                    <option value='Katze'>Katze</option>
                    <option value='Heimtier'>Heimtier</option>
                  </SelectInput>

                  <div style={{ position: 'relative' }}>
                    <Input
                      label='Rasse'
                      value={newPatient.rasse}
                      onChange={(e) => setNewPatient((prev) => ({ ...prev, rasse: e.target.value }))}
                      placeholder='Rasse suchen oder frei eingeben'
                    />

                    {newPatient.rasse.trim() && breedSuggestions.length > 0 && (
                      <Card
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          marginTop: 4,
                          maxHeight: '150px',
                          overflow: 'auto',
                          zIndex: 20,
                          padding: '6px'
                        }}
                      >
                        <div style={{ display: 'grid', gap: '4px' }}>
                          {breedSuggestions.map((breed) => (
                            <Button
                              key={breed}
                              variant='ghost'
                              onClick={() => setNewPatient((prev) => ({ ...prev, rasse: breed }))}
                              style={{ justifyContent: 'flex-start', textAlign: 'left', width: '100%' }}
                            >
                              {breed}
                            </Button>
                          ))}
                        </div>
                      </Card>
                    )}
                  </div>

                  <Input
                    label='Alter (optional)'
                    value={newPatient.alter}
                    onChange={(e) => setNewPatient((prev) => ({ ...prev, alter: e.target.value }))}
                    placeholder='Alter'
                  />

                  <SelectInput
                    label='Geschlecht'
                    value={newPatient.geschlecht}
                    onChange={(e) => setNewPatient((prev) => ({ ...prev, geschlecht: e.target.value }))}
                  >
                    <option value=''>-</option>
                    <option value='m'>m</option>
                    <option value='w'>w</option>
                    <option value='mk'>mk</option>
                    <option value='wk'>wk</option>
                  </SelectInput>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <Input
                      label='PMS-ID (optional)'
                      value={newPatient.external_id}
                      onChange={(e) => setNewPatient((prev) => ({ ...prev, external_id: e.target.value }))}
                      placeholder='z. B. 12345'
                    />
                  </div>
                </div>
              </Section>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                <Button variant='secondary' onClick={() => setShowCreateModal(false)}>
                  Abbrechen
                </Button>

                <Button variant='primary' onClick={createPatient} disabled={saving}>
                  {saving ? 'Speichert...' : 'Speichern'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

    </main>
  );
}
