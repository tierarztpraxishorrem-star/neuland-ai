'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

export default function Home() {

  const [user, setUser] = useState<any | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
      email,
      password
    });

    if (error) alert(error.message);
  };

  // 🆕 REGISTRIEREN
  const handleRegister = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) alert(error.message);
    else alert("Registriert! Jetzt einloggen.");
  };

  // 👤 USER CHECK
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setLoadingAuth(false);
    };

    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // ⏳ LOADING
  if (loadingAuth) {
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
              Login zur Praxisplattform
            </p>
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

          {/* BUTTONS */}
          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
            <button onClick={handleLogin} style={primaryButton}>
              Login
            </button>

            <button onClick={handleRegister} style={secondaryButton}>
              Registrieren
            </button>
          </div>
        </div>
      </main>
    );
  }

  // 🧠 DASHBOARD
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
        {[
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
          {
            title: "VetMind",
            icon: "🤖",
            desc: "SOPs & Wissen durchsuchen",
            link: "/vetmind"
          }
        ].map((card, i) => (
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