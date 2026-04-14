'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_REGISTRATION_CONFIG,
  evaluatePasswordRules,
  isPasswordValid,
  type RegistrationConfig,
} from '../lib/registrationConfig';
import { isPersonalDiamondEnabled } from '../lib/features';
import { showToast } from '../lib/toast';

type DebugSystemStateResponse = {
  work_sessions?: Array<{ ended_at: string | null }>;
  error?: string;
};

type HrStartResponse = {
  ok?: boolean;
  session?: { id: string; started_at: string; ended_at: string | null };
  error?: string;
};

type MotivationResponse = {
  message?: string;
  error?: string;
};

const FALLBACK_MOTIVATION_MESSAGES = [
  'Ein ruhiger Start bringt Struktur in den ganzen Tag.',
  'Bleib bei einem klaren Ablauf, dann bleibt auch im Stress der Fokus.',
  'Heute zaehlt Schritt fuer Schritt sauber zu arbeiten.',
];

const getDaytimeGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 11) return 'Guten Morgen 👋';
  if (hour >= 11 && hour < 17) return 'Guten Tag 👋';
  return 'Arbeitest du noch oder hast du vergessen auszustempeln? 😉';
};

async function fetchWithAuth(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  return fetch(path, {
    ...init,
    headers,
  });
}

export default function Home() {
  const router = useRouter();
  const diamondEnabled = isPersonalDiamondEnabled();

  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [checkingMembership, setCheckingMembership] = useState(false);
  const [hasPracticeMembership, setHasPracticeMembership] = useState(false);
  const [activePracticeName, setActivePracticeName] = useState<string | null>(null);
  const [showHrStartPrompt, setShowHrStartPrompt] = useState(false);
  const [startingHr, setStartingHr] = useState(false);
  const [hrStartHint, setHrStartHint] = useState<string | null>(null);
  const [motivationMessage, setMotivationMessage] = useState<string>('');

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptProductUpdates, setAcceptProductUpdates] = useState(false);
  const [registrationConfig, setRegistrationConfig] = useState<RegistrationConfig>(DEFAULT_REGISTRATION_CONFIG);

  const passwordRules = evaluatePasswordRules(password, registrationConfig);
  const passwordStrong = isPasswordValid(passwordRules, registrationConfig);
  const canRegister = passwordStrong && acceptTerms && acceptPrivacy;

  // 🎨 STYLES
  const inputStyle = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    marginBottom: "16px",
    fontSize: "16px",
    outline: "none",
    transition: "border-color 0.2s"
  };

  const primaryButton = {
    flex: 1,
    padding: "14px 24px",
    borderRadius: "12px",
    background: "#0F6B74",
    color: "#fff",
    border: "none",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.2s"
  };

  const secondaryButton = {
    flex: 1,
    padding: "14px 24px",
    borderRadius: "12px",
    background: "#fff",
    border: "1px solid #e5e7eb",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.2s"
  };

  // 🔐 LOGIN
  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) alert(error.message);
  };

  const persistConsentAudit = async (token: string) => {
    const acceptedAt = new Date().toISOString();
    try {
      await fetch('/api/auth/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          consents: [
            { type: 'terms', accepted: acceptTerms, acceptedAt },
            { type: 'privacy', accepted: acceptPrivacy, acceptedAt },
            { type: 'product_updates', accepted: acceptProductUpdates, acceptedAt },
          ],
          source: 'registration',
        }),
      });
    } catch {
      // Do not block signup if audit persistence fails.
    }
  };

  // 🆕 REGISTRIEREN
  const handleRegister = async () => {
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const fullName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(' ');

    if ((registrationConfig.requireFirstName && !normalizedFirstName) || (registrationConfig.requireLastName && !normalizedLastName)) {
      alert('Bitte Vorname und Nachname angeben.');
      return;
    }

    if (!acceptTerms || !acceptPrivacy) {
      alert('Bitte AGB und Datenschutz akzeptieren.');
      return;
    }

    if (!passwordStrong) {
      alert('Passwort erfüllt die Mindestanforderungen noch nicht.');
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: normalizedFirstName || undefined,
          last_name: normalizedLastName || undefined,
          full_name: fullName || undefined,
          accepted_terms: acceptTerms,
          accepted_privacy: acceptPrivacy,
          accepted_product_updates: acceptProductUpdates,
          registration_completed_at: new Date().toISOString(),
        },
      },
    });

    if (error) {
      alert(error.message);
      return;
    }

    if (!data.session) {
      alert('Registrierung erfolgreich. Bitte E-Mail bestaetigen und danach einloggen.');
      return;
    }

    await persistConsentAudit(data.session.access_token);

    router.push('/onboarding');
  };

  // 👤 USER CHECK
  useEffect(() => {
    const loadRegistrationConfig = async () => {
      try {
        const res = await fetch('/api/auth/registration-config');
        const data = (await res.json()) as Partial<RegistrationConfig>;
        setRegistrationConfig({ ...DEFAULT_REGISTRATION_CONFIG, ...data });
      } catch {
        setRegistrationConfig(DEFAULT_REGISTRATION_CONFIG);
      }
    };

    loadRegistrationConfig();
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      try {
        // Prefer local session bootstrap to avoid blocking UI on transient getUser failures.
        const { data: sessionData } = await supabase.auth.getSession();
        setUser(sessionData.session?.user ?? null);

        if (!sessionData.session) {
          const { data: userData } = await supabase.auth.getUser();
          setUser(userData.user ?? null);
        }
      } catch (err) {
        console.error('Auth bootstrap failed', err);
        setUser(null);
      } finally {
        setLoadingAuth(false);
      }
    };

    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoadingAuth(false);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadMembership = async () => {
      if (!user) {
        setHasPracticeMembership(false);
        setActivePracticeName(null);
        return;
      }

      setCheckingMembership(true);
      try {
        const { data, error } = await supabase
          .from('practice_memberships')
          .select('id, practice:practices(name)')
          .order('created_at', { ascending: true })
          .limit(1);

        if (error) {
          setHasPracticeMembership(false);
          setActivePracticeName(null);
          return;
        }

        const row = data?.[0] as { id: string; practice?: Array<{ name: string }> | null } | undefined;
        const practiceName = row?.practice?.[0]?.name || null;
        setHasPracticeMembership(Boolean(row?.id));
        setActivePracticeName(practiceName);
      } finally {
        setCheckingMembership(false);
      }
    };

    loadMembership();
  }, [user]);

  useEffect(() => {
    const loadHrPrompt = async () => {
      if (!user || !hasPracticeMembership) {
        setShowHrStartPrompt(false);
        return;
      }

      try {
        const res = await fetchWithAuth('/api/debug/system-state', { method: 'GET' });
        const data = (await res.json().catch(() => ({}))) as DebugSystemStateResponse;
        if (!res.ok) {
          setShowHrStartPrompt(false);
          return;
        }

        const hasOpenSession = Array.isArray(data.work_sessions)
          ? data.work_sessions.some((entry) => entry?.ended_at === null)
          : false;

        setShowHrStartPrompt(!hasOpenSession);
      } catch {
        setShowHrStartPrompt(false);
      }
    };

    void loadHrPrompt();
  }, [user, hasPracticeMembership]);

  useEffect(() => {
    const loadMotivation = async () => {
      if (!showHrStartPrompt) return;

      try {
        const res = await fetch('/api/motivation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: 'start' }),
        });

        const data = (await res.json().catch(() => ({}))) as MotivationResponse;
        if (!res.ok || !data.message) {
          throw new Error(data.error || 'fallback');
        }

        setMotivationMessage(data.message);
      } catch {
        const pick = FALLBACK_MOTIVATION_MESSAGES[Math.floor(Math.random() * FALLBACK_MOTIVATION_MESSAGES.length)];
        setMotivationMessage(pick);
      }
    };

    void loadMotivation();
  }, [showHrStartPrompt]);

  const startWorkingDay = async () => {
    setStartingHr(true);
    setHrStartHint(null);
    try {
      const res = await fetchWithAuth('/api/hr/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'dashboard_prompt' }),
      });
      const data = (await res.json().catch(() => ({}))) as HrStartResponse;

      if (!res.ok || !data.session) {
        throw new Error(data.error || 'Arbeitszeit konnte nicht gestartet werden.');
      }

      setShowHrStartPrompt(false);
      setHrStartHint('Arbeitszeit laeuft jetzt');
      showToast({ message: 'Arbeitszeit gestartet', type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Starten';
      setHrStartHint(message);
      showToast({ message: 'Fehler beim Stempeln', type: 'error' });
    } finally {
      setStartingHr(false);
    }
  };

  // ⏳ LOADING
  if (loadingAuth || checkingMembership) {
    return <div style={{ padding: "40px" }}>Lade...</div>;
  }

  // 🔐 LOGIN SCREEN
  if (!user) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, #f4f7f8 0%, #eaf0f1 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, sans-serif"
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "400px",
            background: "#fff",
            padding: "32px",
            borderRadius: "16px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 10px 30px rgba(0,0,0,0.05)"
          }}
        >
          {/* HEADER */}
          <div style={{ marginBottom: "24px" }}>
            <h1 style={{ margin: 0, color: "#0F6B74" }}>
              Neuland AI
            </h1>
            <p style={{ color: "#6b7280", marginTop: "6px" }}>
              {authMode === 'login' ? 'Login zur Praxisplattform' : registrationConfig.registrationSubtitle}
            </p>
            <p style={{ color: '#6b7280', marginTop: '10px', marginBottom: 0, fontSize: 13 }}>
              <Link href='/was-ist-neuland' style={{ color: '#0F6B74', textDecoration: 'none', fontWeight: 600 }}>
                Was ist Neuland AI?
              </Link>
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <button
              onClick={() => setAuthMode('login')}
              style={{
                ...secondaryButton,
                flex: 1,
                background: authMode === 'login' ? '#0F6B74' : '#fff',
                color: authMode === 'login' ? '#fff' : '#0f172a',
                marginBottom: 0,
              }}
            >
              Login
            </button>
            <button
              onClick={() => setAuthMode('register')}
              style={{
                ...secondaryButton,
                flex: 1,
                background: authMode === 'register' ? '#0F6B74' : '#fff',
                color: authMode === 'register' ? '#fff' : '#0f172a',
                marginBottom: 0,
              }}
            >
              Registrieren
            </button>
          </div>

          {/* INPUTS */}

          <input
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                (document.getElementById('pwfield') as HTMLInputElement)?.focus();
              }
            }}
          />

          <input
            id="pwfield"
            placeholder="Passwort"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleLogin();
              }
            }}
          />

          {authMode === 'register' && (
            <>
              {registrationConfig.requireFirstName && (
                <input
                  placeholder="Vorname"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  style={inputStyle}
                />
              )}

              {registrationConfig.requireLastName && (
                <input
                  placeholder="Nachname"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  style={inputStyle}
                />
              )}

              <div style={{ marginTop: -8, marginBottom: 12, fontSize: 12, color: '#475569' }}>
                Passwortregeln: mindestens {registrationConfig.minPasswordLength} Zeichen
                {registrationConfig.requireUppercase ? ', Großbuchstabe' : ''}
                {registrationConfig.requireLowercase ? ', Kleinbuchstabe' : ''}
                {registrationConfig.requireDigit ? ', Zahl' : ''}
                {registrationConfig.requireSpecialChar ? ', Sonderzeichen' : ''}.
              </div>
              <div style={{ marginTop: -6, marginBottom: 12, fontSize: 12, color: '#475569', display: 'grid', gap: 3 }}>
                <div style={{ color: passwordRules.minLength ? '#166534' : '#b91c1c' }}>• Mindestens {registrationConfig.minPasswordLength} Zeichen</div>
                {registrationConfig.requireUppercase && (
                  <div style={{ color: passwordRules.upper ? '#166534' : '#b91c1c' }}>• Mindestens 1 Großbuchstabe</div>
                )}
                {registrationConfig.requireLowercase && (
                  <div style={{ color: passwordRules.lower ? '#166534' : '#b91c1c' }}>• Mindestens 1 Kleinbuchstabe</div>
                )}
                {registrationConfig.requireDigit && (
                  <div style={{ color: passwordRules.digit ? '#166534' : '#b91c1c' }}>• Mindestens 1 Zahl</div>
                )}
                {registrationConfig.requireSpecialChar && (
                  <div style={{ color: passwordRules.special ? '#166534' : '#b91c1c' }}>• Mindestens 1 Sonderzeichen</div>
                )}
              </div>

              <label style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13, color: '#475569' }}>
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                />
                <span>
                  Ich akzeptiere die{' '}
                  <Link href='/legal/agb' style={{ color: '#0F6B74', fontWeight: 600 }}>
                    AGB
                  </Link>
                </span>
              </label>

              <label style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13, color: '#475569' }}>
                <input
                  type="checkbox"
                  checked={acceptPrivacy}
                  onChange={(e) => setAcceptPrivacy(e.target.checked)}
                />
                <span>
                  Ich akzeptiere die{' '}
                  <Link href='/legal/datenschutz' style={{ color: '#0F6B74', fontWeight: 600 }}>
                    Datenschutzerklärung
                  </Link>
                </span>
              </label>

              {registrationConfig.allowProductUpdates && (
                <label style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 13, color: '#475569' }}>
                  <input
                    type="checkbox"
                    checked={acceptProductUpdates}
                    onChange={(e) => setAcceptProductUpdates(e.target.checked)}
                  />
                  {registrationConfig.productUpdatesLabel}
                </label>
              )}
            </>
          )}

          {/* BUTTONS */}
          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
            {authMode === 'login' ? (
              <button onClick={handleLogin} style={primaryButton}>
                Login
              </button>
            ) : (
              <button
                onClick={handleRegister}
                disabled={!canRegister}
                style={{
                  ...primaryButton,
                  opacity: canRegister ? 1 : 0.7,
                  cursor: canRegister ? 'pointer' : 'not-allowed',
                }}
              >
                Registrieren
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (!hasPracticeMembership) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #f4f7f8 0%, #eef3f4 100%)',
          padding: '40px',
          fontFamily: 'Arial, sans-serif',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <section
          style={{
            width: 'min(760px, 100%)',
            border: '1px solid #dbe5e6',
            borderRadius: '16px',
            background: '#fff',
            padding: '24px',
            display: 'grid',
            gap: '12px',
          }}
        >
          <h1 style={{ margin: 0, color: '#0f172a' }}>Du bist noch keiner Praxis zugeordnet</h1>
          <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5 }}>
            Bitte wähle oder erstelle eine Praxis, damit du mit Fällen, VetMind und HR arbeiten kannst.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href='/onboarding?mode=search' style={{ textDecoration: 'none' }}>
              <button style={{ ...secondaryButton, minWidth: 170 }}>Praxis suchen</button>
            </Link>
            <Link href='/onboarding?mode=create' style={{ textDecoration: 'none' }}>
              <button style={{ ...primaryButton, minWidth: 170 }}>Praxis erstellen</button>
            </Link>
          </div>

          <div style={{ fontSize: 13, color: '#64748b' }}>
            <Link href='/was-ist-neuland' style={{ color: '#0F6B74', fontWeight: 600, textDecoration: 'none' }}>
              Was ist Neuland AI?
            </Link>
          </div>
        </section>
      </main>
    );
  }

  // 🧠 DASHBOARD
  const dashboardCards = [
    {
      title: "Patienten",
      icon: "📁",
      desc: "Patientenkontext und Verlauf öffnen",
      link: "/patienten"
    },
    {
      title: "Vorlagen",
      icon: "🧾",
      desc: "Eigene Templates verwalten",
      link: "/vorlagen"
    },
    ...(diamondEnabled
      ? [
          {
            title: "Persönlicher Diamant",
            icon: "💎",
            desc: "Werteprofil aus 40 Fragen auswerten",
            link: "/diamant"
          },
        ]
      : []),
    {
      title: "VetMind",
      icon: "🤖",
      desc: "SOPs & Wissen durchsuchen",
      link: "/vetmind"
    }
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f4f7f8 0%, #eef3f4 100%)",
        padding: "40px",
        fontFamily: "Arial, sans-serif",
      }}
    >

      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "40px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "28px",
              color: "#0F6B74",
              marginBottom: "4px",
            }}
          >
            Willkommen 👋
          </h1>
          <div style={{ color: "#6b7280", fontSize: "14px" }}>
            Wählen Sie, womit Sie arbeiten möchten
          </div>
          <div style={{ color: '#0f6b74', fontSize: '13px', marginTop: 6, fontWeight: 600 }}>
            Du arbeitest aktuell in: {activePracticeName || 'deiner Praxis'}
          </div>
        </div>

        <button
          onClick={async () => {
            await supabase.auth.signOut();
          }}
          style={{
            padding: "10px 16px",
            borderRadius: "10px",
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            transition: "0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#f9fafb";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#fff";
          }}
        >
          Logout
        </button>
      </div>

      {showHrStartPrompt ? (
        <section
          style={{
            marginBottom: '24px',
            border: '1px solid #bbf7d0',
            background: 'linear-gradient(180deg, #f0fdf4 0%, #ecfdf5 100%)',
            borderRadius: '14px',
            padding: '14px 16px',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#166534' }}>
              {getDaytimeGreeting()} Möchtest du deinen Arbeitstag starten?
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: '#166534' }}>
              Ein Klick reicht, dann startet deine Zeiterfassung.
            </div>
            {motivationMessage ? (
              <div style={{ marginTop: 6, fontSize: 13, color: '#14532d' }}>{motivationMessage}</div>
            ) : null}
          </div>
          <button
            onClick={startWorkingDay}
            disabled={startingHr}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: 'none',
              background: '#166534',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: 180,
            }}
          >
            {startingHr ? 'Starte...' : 'Arbeitszeit starten'}
          </button>
        </section>
      ) : null}

      {hrStartHint ? (
        <div style={{ marginBottom: '14px', fontSize: 13, color: '#166534' }}>{hrStartHint}</div>
      ) : null}

      {/* CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "22px",
        }}
      >

        {/* 🔥 PRIMARY CARD */}
        <Link href="/konsultation/start" style={{ textDecoration: "none" }}>
          <div
            style={{
              background: "#0F6B74",
              color: "#fff",
              padding: "28px",
              borderRadius: "18px",
              cursor: "pointer",
              transition: "all 0.25s ease",
              boxShadow: "0 12px 30px rgba(15,107,116,0.25)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-6px)";
              e.currentTarget.style.boxShadow = "0 18px 40px rgba(15,107,116,0.35)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 12px 30px rgba(15,107,116,0.25)";
            }}
          >
            <div style={{ fontSize: "30px", marginBottom: "12px" }}>➕</div>

            <div style={{ fontSize: "20px", fontWeight: 700 }}>
              Neue Konsultation
            </div>

            <div style={{ fontSize: "14px", opacity: 0.9 }}>
              Aufnahme starten und Bericht erstellen
            </div>
          </div>
        </Link>

        {/* 🔹 SECONDARY CARDS */}
        {dashboardCards.map((card, i) => (
          <Link key={i} href={card.link} style={{ textDecoration: "none" }}>
            <div
              style={{
                background: "#fff",
                padding: "26px",
                borderRadius: "18px",
                border: "1px solid #e5e7eb",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-5px)";
                e.currentTarget.style.boxShadow = "0 12px 30px rgba(0,0,0,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ fontSize: "26px", marginBottom: "12px" }}>
                {card.icon}
              </div>

              <div style={{ fontSize: "17px", fontWeight: 700 }}>
                {card.title}
              </div>

              <div style={{ fontSize: "14px", color: "#6b7280" }}>
                {card.desc}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}