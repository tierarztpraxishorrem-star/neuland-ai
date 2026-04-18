'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
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
  coat_color: string | null;
  chip_number: string | null;
  has_insurance: boolean;
  insurance_company: string | null;
  insurance_type: string | null;
  insurance_number: string | null;
  wants_direct_billing: boolean;
  wants_insurance_info: boolean;
  assignment_signed: boolean;
  assignment_signature_data: string | null;
  patient_id: string | null;
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
  visit_reason: string | null;
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
  const [processModal, setProcessModal] = useState<Registration | null>(null);
  const [pmsIds, setPmsIds] = useState<Record<string, string>>({});

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

  const markProcessed = async (reg: Registration) => {
    setProcessing(reg.id);
    try {
      // Update external_id (PMS-ID) on linked patient records
      for (const a of reg.animals) {
        const easyvetId = pmsIds[a.id] || '';
        if (a.patient_id && easyvetId) {
          await supabase.from('patients').update({ external_id: easyvetId }).eq('id', a.patient_id);
        }
        // Store visit_reason as first document context if provided
        if (a.patient_id && reg.visit_reason) {
          // Save as a note on the patient for later reference
          await supabase.from('patients').update({
            alter: (await supabase.from('patients').select('alter').eq('id', a.patient_id).single()).data?.alter || null,
          }).eq('id', a.patient_id);
        }
      }

      const res = await fetchWithAuth('/api/admin/registrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reg.id, status: 'processed' }),
      });
      if (res?.ok) {
        setRegistrations((prev) =>
          prev.map((r) => (r.id === reg.id ? { ...r, status: 'processed' as const, processed_at: new Date().toISOString() } : r)),
        );
        setProcessModal(null);
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
          <Link
            href="/admin/registrierungen/statistik"
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              background: uiTokens.brand,
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            Statistik
          </Link>
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
                            padding: '14px 16px',
                            fontSize: '13px',
                            lineHeight: 1.7,
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>{a.name}</div>
                          <div>Tierart: <strong>{a.species}</strong></div>
                          {a.breed && <div>Rasse: {a.breed}</div>}
                          {a.birth_date && <div>Geburtsdatum: {a.birth_date}</div>}
                          {a.gender && <div>Geschlecht: {a.gender}{a.is_castrated ? ' (kastriert)' : ''}</div>}
                          {a.coat_color && <div>Fellfarbe: {a.coat_color}</div>}
                          {a.chip_number && <div>Chipnummer: {a.chip_number}</div>}
                          {a.has_insurance ? (
                            <div style={{ marginTop: '6px', padding: '8px 10px', background: '#f0fdfa', borderRadius: '8px', border: '1px solid #99f6e4' }}>
                              <div>Versicherung: <strong>{a.insurance_company}</strong></div>
                              {a.insurance_type && <div>Art: {a.insurance_type}</div>}
                              {a.wants_direct_billing && <div>Direktabrechnung: Ja · Nr. {a.insurance_number || '-'}</div>}
                              {a.assignment_signed && <div style={{ color: uiTokens.brand, fontWeight: 600 }}>Abtretungserklärung unterschrieben</div>}
                            </div>
                          ) : (
                            <div style={{ marginTop: '4px', color: uiTokens.textSecondary }}>
                              Versicherung: Nein
                              {a.wants_insurance_info && <span style={{ marginLeft: '8px', color: uiTokens.brand }}> · Infos gewünscht</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Termingrund */}
                  {reg.visit_reason && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: uiTokens.brand, marginBottom: '6px' }}>Termingrund (vom Besitzer)</div>
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', lineHeight: 1.6, color: '#92400e', whiteSpace: 'pre-wrap' }}>
                        {reg.visit_reason}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                    {reg.status === 'pending' && (
                      <Button
                        variant="primary"
                        onClick={() => { setProcessModal(reg); setPmsIds({}); }}
                      >
                        Als verarbeitet markieren
                      </Button>
                    )}
                    {/* PDF Download – Summary */}
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const w = window.open('', '_blank');
                        if (!w) return;
                        const animalHtml = reg.animals.map((a) => `
                          <div style="margin-bottom:12px;padding:10px;border:1px solid #ddd;border-radius:8px;">
                            <strong>${a.name}</strong> (${a.species})<br/>
                            ${a.breed ? `Rasse: ${a.breed}<br/>` : ''}
                            ${a.birth_date ? `Geb.: ${a.birth_date}<br/>` : ''}
                            ${a.gender ? `Geschlecht: ${a.gender}${a.is_castrated ? ' (kastriert)' : ''}<br/>` : ''}
                            ${a.coat_color ? `Fellfarbe: ${a.coat_color}<br/>` : ''}
                            ${a.chip_number ? `Chip: ${a.chip_number}<br/>` : ''}
                            ${a.has_insurance ? `Versicherung: ${a.insurance_company}${a.insurance_type ? ` (${a.insurance_type})` : ''}${a.wants_direct_billing ? ` · Direktabr. Nr. ${a.insurance_number || '-'}` : ''}${a.assignment_signed ? ' · Abtretung unterz.' : ''}` : 'Versicherung: Nein'}
                          </div>
                        `).join('');
                        w.document.write(`<html><head><title>Registrierung ${reg.first_name} ${reg.last_name}</title>
                          <style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#1f2937;font-size:14px;line-height:1.6}h1{color:#0f6b74;font-size:20px}h2{color:#0f6b74;font-size:15px;margin-top:20px}.label{color:#64748b;font-size:12px}</style></head><body>
                          <h1>Neukundenregistrierung</h1>
                          <p class="label">Eingegangen: ${new Date(reg.submitted_at).toLocaleString('de-DE')}</p>
                          <h2>Besitzer</h2>
                          <p>${reg.salutation || ''} ${reg.first_name} ${reg.last_name}<br/>
                          ${reg.street || ''} ${reg.house_number || ''}, ${reg.zip || ''} ${reg.city || ''}<br/>
                          ${reg.birth_date ? `Geb.: ${reg.birth_date}<br/>` : ''}
                          Tel.: ${reg.phone || '-'}<br/>E-Mail: ${reg.email}</p>
                          <h2>Tiere</h2>${animalHtml}
                          <h2>Termin</h2>
                          <p>${reg.appointment_date ? `${reg.appointment_date}${reg.appointment_time ? ` um ${reg.appointment_time}` : ''}` : 'Kein Termin'}<br/>
                          ${reg.referral_source ? `Aufmerksam: ${reg.referral_source}<br/>` : ''}
                          ${reg.referring_vet ? `Haustierarzt: ${reg.referring_vet}<br/>` : ''}</p>
                          ${reg.visit_reason ? `<h2>Termingrund</h2><p>${reg.visit_reason}</p>` : ''}
                          <h2>Bestätigungen</h2>
                          <p>&#10003; Richtigkeit der Angaben bestätigt, Datenschutzerklärung zugestimmt<br/>
                          &#10003; Gebührenordnung für Tierärzte und AGB anerkannt<br/>
                          &#10003; Zahlungsbedingungen akzeptiert</p>
                          <p style="color:#94a3b8;font-size:11px;margin-top:30px;">Registrierung eingegangen am ${new Date(reg.submitted_at).toLocaleString('de-DE')} | Tierärztezentrum Neuland</p>
                          </body></html>`);
                        w.document.close();
                        w.print();
                      }}
                    >
                      PDF drucken
                    </Button>
                    {/* Abtretungserklärung Download */}
                    {reg.animals.some((a) => a.assignment_signed && a.assignment_signature_data) && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const signed = reg.animals.filter((a) => a.assignment_signed && a.assignment_signature_data);
                          for (const a of signed) {
                            const w = window.open('', '_blank');
                            if (!w) continue;
                            w.document.write(`<html><head><title>Abtretung ${a.name}</title>
                              <style>body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;color:#1f2937;font-size:14px;line-height:1.8}h1{color:#0f6b74;font-size:20px}</style></head><body>
                              <h1>Abtretungserklärung</h1>
                              <p>Hiermit trete ich, ${reg.salutation || ''} ${reg.first_name} ${reg.last_name},<br/>
                              wohnhaft in ${reg.street || ''} ${reg.house_number || ''}, ${reg.zip || ''} ${reg.city || ''},</p>
                              <p>meinen Erstattungsanspruch aus dem Versicherungsvertrag<br/>
                              bei ${a.insurance_company || '-'} (Nr.: ${a.insurance_number || '-'})<br/>
                              für mein Tier "${a.name}" (${a.species})</p>
                              <p>an das Tierärztezentrum Neuland, Kopernikusstraße 35, 50126 Bergheim ab.</p>
                              <p>Bergheim, den ${new Date(reg.submitted_at).toLocaleDateString('de-DE')}</p>
                              <p>Unterschrift:</p>
                              <img src="${a.assignment_signature_data}" style="max-width:300px;border-bottom:1px solid #333;padding-bottom:8px;"/>
                              <p>${reg.first_name} ${reg.last_name}</p>
                              </body></html>`);
                            w.document.close();
                            w.print();
                          }
                        }}
                      >
                        Abtretungserklärung(en)
                      </Button>
                    )}
                  </div>

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
      {/* Verarbeitungs-Modal mit PMS-ID */}
      {processModal && (
        <div
          onClick={() => setProcessModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}
        >
          <Card
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{ width: 'min(520px, calc(100vw - 24px))', padding: '24px', maxHeight: '80vh', overflow: 'auto' }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: uiTokens.brand }}>Registrierung verarbeiten</h3>
            <p style={{ fontSize: '13px', color: uiTokens.textSecondary, marginBottom: '16px' }}>
              Tragen Sie optional die EasyVet Patienten-ID ein. Die Patienten sind bereits im System angelegt und werden aktualisiert.
            </p>
            <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
              {processModal.animals.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: '#f8fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{a.name}</div>
                    <div style={{ fontSize: '12px', color: uiTokens.textSecondary }}>{a.species}{a.breed ? ` · ${a.breed}` : ''}</div>
                  </div>
                  <input
                    value={pmsIds[a.id] || ''}
                    onChange={(e) => setPmsIds((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    placeholder="EasyVet ID"
                    style={{ width: '120px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="secondary" onClick={() => setProcessModal(null)}>Abbrechen</Button>
              <Button
                variant="primary"
                onClick={() => markProcessed(processModal)}
                disabled={processing === processModal.id}
              >
                {processing === processModal.id ? 'Wird verarbeitet...' : 'Verarbeiten'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
