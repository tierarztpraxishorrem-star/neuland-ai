"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function HilfePage() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setLoading(false);
    };
    checkUser();
  }, []);

  if (loading) {
    return <div style={{ padding: 40 }}>Lade...</div>;
  }

  if (!user) {
    return <div style={{ padding: 40 }}>Nicht eingeloggt.</div>;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f4f7f8 0%, #eef3f4 100%)",
        padding: 40,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 28, color: "#0F6B74", marginBottom: 24 }}>
        Hilfe & Support
      </h1>
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>FAQ</h2>
        <ul style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
          <li style={{ marginBottom: 18 }}>
            <b>Wie kann ich mein Passwort zurücksetzen?</b><br />
            Über die Login-Seite auf "Passwort vergessen" klicken und den Anweisungen folgen.
          </li>
          <li style={{ marginBottom: 18 }}>
            <b>Wie erreiche ich den Support?</b><br />
            Schreibe eine E-Mail an <a href="mailto:support@neuland.ai" style={{ color: "#0F6B74" }}>support@neuland.ai</a> oder nutze das Kontaktformular unten.
          </li>
          <li style={{ marginBottom: 0 }}>
            <b>Wo finde ich Anleitungen zur Plattform?</b><br />
            Im Bereich "VetMind" findest du viele Anleitungen und SOPs.
          </li>
        </ul>
      </section>
      <section>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Kontaktformular</h2>
        <HilfeKontaktForm />
      </section>
    </main>
  );
}

function HilfeKontaktForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setSending(true);
    // Hier könnte ein Insert in eine Supabase-Tabelle erfolgen
    setTimeout(() => {
      setSent(true);
      setSending(false);
    }, 1200);
  };

  if (sent) {
    return <div style={{ color: "#16a34a", marginTop: 16 }}>Danke für deine Nachricht! Wir melden uns zeitnah.</div>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.04)", maxWidth: 420 }}>
      <input
        type="email"
        placeholder="Deine E-Mail"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 14 }}
      />
      <textarea
        placeholder="Deine Nachricht"
        value={message}
        onChange={e => setMessage(e.target.value)}
        required
        rows={4}
        style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 14, resize: "vertical" }}
      />
      <button
        type="submit"
        disabled={sending}
        style={{ width: "100%", padding: 12, borderRadius: 8, background: "#0F6B74", color: "#fff", border: "none", fontWeight: 600, cursor: sending ? "not-allowed" : "pointer" }}
      >
        {sending ? "Sende..." : "Absenden"}
      </button>
    </form>
  );
}
