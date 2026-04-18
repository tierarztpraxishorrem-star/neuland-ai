'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { uiTokens, Card, Button, Badge } from '../../../components/ui/System';

type Animal = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  birth_date: string | null;
  gender: string | null;
  is_castrated: boolean;
  chip_number: string | null;
  has_insurance: boolean;
  insurance_company: string | null;
  insurance_number: string | null;
  wants_direct_billing: boolean;
  assignment_signed: boolean;
};

type Registration = {
  id: string;
  salutation: string | null;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  street: string | null;
  house_number: string | null;
  zip: string | null;
  city: string | null;
  phone: string | null;
  email: string;
  appointment_date: string | null;
  appointment_time: string | null;
  referral_source: string | null;
  referring_vet: string | null;
  status: 'pending' | 'processed' | 'archived';
  submitted_at: string;
  processed_at: string | null;
  animals: Animal[];
};

type FilterValue = 'all' | 'pending' | 'processed';

async function fetchWithAuth(url: string, options?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(options?.headers || {}),
    },
  });
}

export default function RegistrierungenPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/admin/registrations');
      if (!res) return;
      const data = await res.json();
      if (res.ok) {
        setRegistrations(data.registrations || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markProcessed = async (id: string) => {
    setProcessing(id);
    try {
      const res = await fetchWithAuth('/api/admin/registrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'processed' }),
      });
      if (res?.ok) {
        setRegistrations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: 'processed' as const, processed_at: new Date().toISOString() } : r)),
        );
      }
    } catch {
      // silent
    } finally {
      setProcessing(null);
    }
  };

  const filtered = registrations.filter((r) => {
    if (filter === 'pending') return r.status === 'pending';
    if (filter === 'processed') return r.status === 'processed';
    return true;
  });

  const pendingCount = registrations.filter((r) => r.status === 'pending').length;

  const statusBadge = (status: string) => {
    if (status === 'pending') return <Badge tone="accent">Ausstehend</Badge>;
    if (status === 'processed') return <Badge tone="success">Verarbeitet</Badge>;
    return <Badge>{status}</Badge>;
  };

  return (
    <main style={{ minHeight: '100vh', background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: 'min(900px, 100%)', margin: '0 auto', display: 'grid', gap: uiTokens.sectionGap }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>
            Registrierungen
            {pendingCount > 0 && (
              <span
                style={{
                  marginLeft: '10px',
                  background: '#fef3c7',
                  color: '#92400e',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderRadius: '999px',
                  padding: '3px 10px',
                }}
              >
                {pendingCount} ausstehend
              </span>
            )}
          </h1>
        </div>

        {/* Filter */}
        <Card style={{ display: 'flex', gap: '8px', padding: '12px 16px' }}>
          {(['all', 'pending', 'processed'] as FilterValue[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: filter === f ? `2px solid ${uiTokens.brand}` : '1px solid #e5e7eb',
                background: filter === f ? '#f0fdfa' : '#fff',
                color: filter === f ? uiTokens.brand : uiTokens.textSecondary,
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {f === 'all' ? 'Alle' : f === 'pending' ? 'Ausstehend' : 'Verarbeitet'}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '13px', color: uiTokens.textSecondary }}>
            {filtered.length} Einträge
          </span>
        </Card>

        {loading && <div style={{ fontSize: 14, color: uiTokens.textSecondary }}>Lade...</div>}

        {!loading && filtered.length === 0 && (
          <Card style={{ textAlign: 'center', padding: '40px', color: uiTokens.textSecondary }}>
            Keine Registrierungen gefunden.
          </Card>
        )}

        {!loading && filtered.map((reg) => {
          const isExpanded = expanded === reg.id;
          const dateStr = new Date(reg.submitted_at).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <Card key={reg.id} style={{ padding: 0, overflow: 'hidden' }}>
              {/* Summary row */}
              <div
                onClick={() => setExpanded(isExpanded ? null : reg.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 20px',
                  cursor: 'pointer',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'grid', gap: '4px' }}>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: uiTokens.textPrimary }}>
                    {reg.salutation} {reg.first_name} {reg.last_name}
                  </div>
                  <div style={{ fontSize: '13px', color: uiTokens.textSecondary }}>
                    {reg.animals.map((a) => `${a.name} (${a.species})`).join(', ')}
                  </div>
                  <div style={{ fontSize: '12px', color: uiTokens.textMuted }}>
                    {dateStr}
                    {reg.appointment_date && (
                      <span style={{ marginLeft: '12px' }}>
                        Termin: {new Date(reg.appointment_date + 'T00:00:00').toLocaleDateString('de-DE')}
                        {reg.appointment_time ? ` ${reg.appointment_time}` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {statusBadge(reg.status)}
                  <span style={{ color: '#94a3b8', fontSize: '14px' }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #e5e7eb', padding: '20px', background: '#fafbfc' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Owner info */}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: uiTokens.brand, marginBottom: '8px' }}>
                        Besitzerdaten
                      </div>
                      <div style={{ fontSize: '13px', color: uiTokens.textPrimary, lineHeight: 1.6 }}>
                        {reg.salutation} {reg.first_name} {reg.last_name}<br />
                        {reg.street} {reg.house_number}<br />
                        {reg.zip} {reg.city}<br />
                        {reg.birth_date && <>Geb.: {new Date(reg.birth_date + 'T00:00:00').toLocaleDateString('de-DE')}<br /></>}
                        Tel.: {reg.phone}<br />
                        E-Mail: {reg.email}
                      </div>
                    </div>

                    {/* Appointment info */}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: uiTokens.brand, marginBottom: '8px' }}>
                        Termin & Sonstiges
                      </div>
                      <div style={{ fontSize: '13px', color: uiTokens.textPrimary, lineHeight: 1.6 }}>
                        {reg.appointment_date ? (
                          <>Datum: {new Date(reg.appointment_date + 'T00:00:00').toLocaleDateString('de-DE')}
                            {reg.appointment_time ? ` um ${reg.appointment_time} Uhr` : ''}<br /></>
                        ) : 'Kein Termin angegeben\n'}
                        {reg.referral_source && <>Aufmerksam durch: {reg.referral_source}<br /></>}
                        {reg.referring_vet && <>Haustierarzt: {reg.referring_vet}<br /></>}
                      </div>
                    </div>
                  </div>

                  {/* Animals */}
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: uiTokens.brand, marginBottom: '8px' }}>
                      Tiere
                    </div>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {reg.animals.map((a) => (
                        <div
                          key={a.id}
                          style={{
                            background: '#fff',
                            border: '1px solid #e5e7eb',
                            borderRadius: '10px',
                            padding: '12px 16px',
                            fontSize: '13px',
                            lineHeight: 1.6,
                          }}
                        >
                          <strong>{a.name}</strong> ({a.species})
                          {a.breed && <> &middot; {a.breed}</>}
                          {a.gender && <> &middot; {a.gender}</>}
                          {a.is_castrated && <> &middot; kastriert</>}
                          {a.chip_number && <> &middot; Chip: {a.chip_number}</>}
                          {a.has_insurance && (
                            <div style={{ marginTop: '4px', color: uiTokens.textSecondary }}>
                              Versicherung: {a.insurance_company} ({a.insurance_number || '-'})
                              {a.wants_direct_billing && <> &middot; Direktabrechnung</>}
                              {a.assignment_signed && <> &middot; Abtretung unterschrieben</>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  {reg.status === 'pending' && (
                    <div style={{ marginTop: '16px' }}>
                      <Button
                        variant="primary"
                        onClick={() => markProcessed(reg.id)}
                        disabled={processing === reg.id}
                      >
                        {processing === reg.id ? 'Wird verarbeitet...' : 'Als verarbeitet markieren'}
                      </Button>
                    </div>
                  )}

                  {reg.processed_at && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: uiTokens.textMuted }}>
                      Verarbeitet am {new Date(reg.processed_at).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </main>
  );
}
