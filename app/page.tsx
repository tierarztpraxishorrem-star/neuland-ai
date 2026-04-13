'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_REGISTRATION_CONFIG,
  evaluatePasswordRules,
  isPasswordValid,
  type RegistrationConfig,
} from '../lib/registrationConfig';
import { isPersonalDiamondEnabled } from '../lib/features';

export default function Home() {
  const router = useRouter();
  const diamondEnabled = isPersonalDiamondEnabled();

  const [user, setUser] = useState<any | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [checkingMembership, setCheckingMembership] = useState(false);

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

    if ((registrationConfig.requireTerms && !acceptTerms) || (registrationConfig.requirePrivacy && !acceptPrivacy)) {
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
    const ensureMembership = async () => {
      if (!user) return;

      setCheckingMembership(true);
      try {
        const { data, error } = await supabase
          .from('practice_memberships')
          .select('id')
          .limit(1);

        if (error) {
          return;
        }

        if (!data || data.length === 0) {
          router.push('/onboarding');
        }
      } finally {
        setCheckingMembership(false);
      }
    };

    ensureMembership();
  }, [router, user]);

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

              {registrationConfig.requireTerms && (
                <label style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13, color: '#475569' }}>
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                  />
                  {registrationConfig.termsLabel}
                </label>
              )}

              {registrationConfig.requirePrivacy && (
                <label style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13, color: '#475569' }}>
                  <input
                    type="checkbox"
                    checked={acceptPrivacy}
                    onChange={(e) => setAcceptPrivacy(e.target.checked)}
                  />
                  {registrationConfig.privacyLabel}
                </label>
              )}

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
                style={{
                  ...primaryButton,
                  opacity:
                    passwordStrong
                    && (!registrationConfig.requireTerms || acceptTerms)
                    && (!registrationConfig.requirePrivacy || acceptPrivacy)
                      ? 1
                      : 0.7,
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

const inputStyle = {
  width: "100%",
  padding: "12px",
  marginBottom: "12px",
  borderRadius: "10px",
  border: "1px solid #E5E7EB",
  fontSize: "14px"
};

const primaryButton = {
  flex: 1,
  padding: "12px",
  borderRadius: "10px",
  border: "none",
  background: "#0F6B74",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer"
};

const secondaryButton = {
  flex: 1,
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #E5E7EB",
  background: "#fff",
  fontWeight: 600,
  cursor: "pointer"
};