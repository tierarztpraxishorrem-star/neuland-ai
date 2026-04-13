'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

type MembershipRow = {
  id: string;
  role: 'owner' | 'admin' | 'member';
  practice: { id: string; name: string } | null;
  unit: { id: string; name: string } | null;
};

type MembershipQueryRow = {
  id: string;
  role: 'owner' | 'admin' | 'member';
  practice: Array<{ id: string; name: string }> | null;
  unit: Array<{ id: string; name: string }> | null;
};

type PracticeSearchResult = {
  placeId: string;
  name: string;
  displayName: string;
  address: string;
  lat: string;
  lon: string;
};

const FREE_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'web.de',
  'gmx.de',
  't-online.de'
]);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export default function OnboardingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [autoJoinMessage, setAutoJoinMessage] = useState<string | null>(null);
  const [tryingAutoJoin, setTryingAutoJoin] = useState(false);
  const [autoJoinTried, setAutoJoinTried] = useState(false);

  const [practiceName, setPracticeName] = useState('');
  const [practiceAddress, setPracticeAddress] = useState('');
  const [practicePhone, setPracticePhone] = useState('');
  const [practiceEmail, setPracticeEmail] = useState('');
  const [practiceWebsite, setPracticeWebsite] = useState('');
  const [placeSearch, setPlaceSearch] = useState('');
  const [placeResults, setPlaceResults] = useState<PracticeSearchResult[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PracticeSearchResult | null>(null);
  const [inviteCode, setInviteCode] = useState('');

  const hasMembership = memberships.length > 0;

  const membershipLabel = useMemo(() => {
    if (!hasMembership) return '';
    return memberships
      .map((m) => {
        const unit = m.unit?.name ? ` / ${m.unit.name}` : '';
        return `${m.practice?.name || 'Praxis'} (${m.role})${unit}`;
      })
      .join(', ');
  }, [hasMembership, memberships]);

  const loadMemberships = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      router.push('/');
      return;
    }
    setUserEmail(authData.user.email || '');

    const { data, error } = await supabase
      .from('practice_memberships')
      .select('id, role, practice:practices(id, name), unit:practice_units(id, name)')
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      setMemberships([]);
      setLoading(false);
      return;
    }

    const mapped = ((data || []) as MembershipQueryRow[]).map((row) => ({
      id: row.id,
      role: row.role,
      practice: row.practice?.[0] || null,
      unit: row.unit?.[0] || null
    }));

    setMemberships(mapped);
    setLoading(false);
  };

  useEffect(() => {
    loadMemberships();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const requestDomainJoin = async () => {
      if (loading || hasMembership || tryingAutoJoin || autoJoinTried || !userEmail) return;

      setTryingAutoJoin(true);
      setAutoJoinTried(true);
      try {
        const { error } = await supabase.rpc('request_practice_join_by_email_domain');

        if (error) {
          if (String(error.message || '').includes('no_domain_match')) {
            setAutoJoinMessage(null);
          } else {
            setAutoJoinMessage('Automatische Domain-Zuordnung konnte nicht abgeschlossen werden.');
          }
          return;
        }

        setAutoJoinMessage('Automatische Praxiszuordnung erkannt. Anfrage wurde an den Owner gesendet.');
      } catch {
        setAutoJoinMessage('Automatische Domain-Zuordnung aktuell nicht verfügbar.');
      } finally {
        setTryingAutoJoin(false);
      }
    };

    requestDomainJoin();
  }, [autoJoinTried, hasMembership, loading, tryingAutoJoin, userEmail]);

  useEffect(() => {
    if (hasMembership) {
      const t = window.setTimeout(() => {
        router.push('/');
      }, 700);

      return () => window.clearTimeout(t);
    }
  }, [hasMembership, router]);

  const createPractice = async () => {
    const normalizedName = practiceName.trim();
    if (!normalizedName) {
      alert('Bitte gib einen Praxisnamen ein.');
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        alert('Nicht eingeloggt.');
        return;
      }

      const slugBase = slugify(normalizedName);
      const slugCandidate = slugBase || `praxis-${Date.now()}`;

      const { data: createdPractice, error: practiceError } = await supabase
        .from('practices')
        .insert({
          name: normalizedName,
          slug: `${slugCandidate}-${Math.random().toString(36).slice(2, 6)}`,
          created_by: userId
        })
        .select('id')
        .single();

      if (practiceError || !createdPractice) {
        throw practiceError || new Error('Praxis konnte nicht erstellt werden.');
      }

      const { error: membershipError } = await supabase.from('practice_memberships').insert({
        practice_id: createdPractice.id,
        user_id: userId,
        role: 'owner'
      });

      if (membershipError) throw membershipError;

      const ownEmail = userData.user?.email || '';
      const ownDomain = ownEmail.includes('@') ? ownEmail.split('@')[1].toLowerCase() : '';
      const webDomain = practiceWebsite
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split('/')[0]
        .toLowerCase();

      const domainCandidates = [ownDomain, webDomain]
        .map((d) => d.trim())
        .filter((d) => d && !FREE_MAIL_DOMAINS.has(d));

      const uniqueDomains = Array.from(new Set(domainCandidates));
      if (uniqueDomains.length > 0) {
        await supabase.from('practice_domain_links').upsert(
          uniqueDomains.map((domain) => ({
            practice_id: createdPractice.id,
            domain,
            created_by: userId
          })),
          { onConflict: 'domain' }
        );
      }

      await supabase.from('practice_settings').upsert(
        {
          practice_id: createdPractice.id,
          practice_name: normalizedName,
          address: practiceAddress.trim() || null,
          phone: practicePhone.trim() || null,
          email: practiceEmail.trim() || null
        },
        { onConflict: 'practice_id' }
      );

      await loadMemberships();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      alert(`Praxis konnte nicht erstellt werden: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const joinByInvite = async () => {
    const code = inviteCode.trim();
    if (!code) {
      alert('Bitte gib einen Einladungscode ein.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc('accept_practice_invitation', {
        p_invite_code: code
      });

      if (error) throw error;

      await loadMemberships();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      alert(`Einladungscode ungueltig oder abgelaufen: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main style={{ padding: 32 }}>Lade Onboarding...</main>;
  }

  const searchPlaces = async () => {
    const q = placeSearch.trim();
    if (q.length < 3) {
      setPlaceResults([]);
      return;
    }

    setSearchingPlaces(true);
    try {
      const res = await fetch(`/api/practice-search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setPlaceResults((json?.results || []) as PracticeSearchResult[]);
    } catch {
      setPlaceResults([]);
    } finally {
      setSearchingPlaces(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f4f7f8 0%, #e8f0f1 100%)',
        padding: 32,
        display: 'grid',
        placeItems: 'center'
      }}
    >
      <div
        style={{
          width: 'min(780px, 100%)',
          borderRadius: 16,
          border: '1px solid #dbe3e5',
          background: '#fff',
          padding: 24,
          display: 'grid',
          gap: 18
        }}
      >
        <h1 style={{ margin: 0, color: '#0f6b74' }}>Praxis-Zuordnung</h1>
        <p style={{ margin: 0, color: '#64748b' }}>
          Damit Patienten und Faelle korrekt getrennt sind, brauchst du zuerst eine Praxiszuordnung.
        </p>

        {autoJoinMessage && (
          <div style={{ border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: 12, padding: 12, color: '#1e3a8a' }}>
            {autoJoinMessage}
          </div>
        )}

        {hasMembership ? (
          <div style={{ border: '1px solid #bae6fd', background: '#f0f9ff', borderRadius: 12, padding: 14, color: '#0c4a6e' }}>
            Zugeordnet: {membershipLabel}. Weiterleitung...
          </div>
        ) : (
          <>
            <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, display: 'grid', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Neue Praxis erstellen</h2>

              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, color: '#475569' }}>Praxis suchen (Adresse uebernehmen)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={placeSearch}
                    onChange={(e) => setPlaceSearch(e.target.value)}
                    placeholder='z. B. Tierarztpraxis Horrem'
                    style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 14, flex: 1 }}
                  />
                  <button
                    onClick={searchPlaces}
                    disabled={searchingPlaces}
                    style={{ border: '1px solid #cbd5e1', borderRadius: 10, background: '#fff', padding: '10px 12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {searchingPlaces ? 'Suche...' : 'Suchen'}
                  </button>
                </div>

                {placeResults.length > 0 && (
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, maxHeight: 180, overflow: 'auto' }}>
                    {placeResults.map((place) => (
                      <button
                        key={place.placeId}
                        onClick={() => {
                          setSelectedPlace(place);
                          setPracticeName(place.name || practiceName);
                          setPracticeAddress(place.address || practiceAddress);
                          setPlaceResults([]);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          borderBottom: '1px solid #f1f5f9',
                          background: selectedPlace?.placeId === place.placeId ? '#eff6ff' : '#fff',
                          padding: '10px 12px',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{place.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{place.address || place.displayName}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                value={practiceName}
                onChange={(e) => setPracticeName(e.target.value)}
                placeholder='Praxisname'
                style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}
              />
              <input
                value={practiceAddress}
                onChange={(e) => setPracticeAddress(e.target.value)}
                placeholder='Adresse'
                style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}
              />
              <input
                value={practicePhone}
                onChange={(e) => setPracticePhone(e.target.value)}
                placeholder='Telefon (optional)'
                style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}
              />
              <input
                value={practiceEmail}
                onChange={(e) => setPracticeEmail(e.target.value)}
                placeholder='Praxis-E-Mail (optional)'
                style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}
              />
              <input
                value={practiceWebsite}
                onChange={(e) => setPracticeWebsite(e.target.value)}
                placeholder='Website (optional)'
                style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}
              />

              <div style={{ fontSize: 12, color: '#64748b' }}>
                Bei professioneller Mail-Domain wird diese Praxis fuer Auto-Zuordnungen neuer Nutzer registriert.
              </div>

              <button
                onClick={createPractice}
                disabled={saving}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  background: '#0f6b74',
                  color: '#fff',
                  padding: '10px 14px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? 'Speichert...' : 'Praxis anlegen'}
              </button>
            </section>

            <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, display: 'grid', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Mit Einladungscode beitreten</h2>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder='Einladungscode'
                style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}
              />
              <button
                onClick={joinByInvite}
                disabled={saving}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 10,
                  background: '#fff',
                  color: '#0f172a',
                  padding: '10px 14px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? 'Prueft...' : 'Beitreten'}
              </button>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
