"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { uiTokens, Card, Section, Button } from "../../components/ui/System";

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
    return <div style={{ padding: 40, color: uiTokens.textMuted }}>Lade...</div>;
  }

  if (!user) {
    return <div style={{ padding: 40, color: uiTokens.textMuted }}>Nicht eingeloggt.</div>;
  }

  return (
    <main style={{ minHeight: "100vh", background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}>
      <div style={{ width: "min(800px, 100%)", margin: "0 auto", display: "grid", gap: uiTokens.sectionGap }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: uiTokens.brand, margin: 0 }}>
          Hilfe & Support
        </h1>

        <Section title="FAQ">
          <Card>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 18 }}>
              <li>
                <b style={{ color: uiTokens.textPrimary }}>Wie kann ich mein Passwort zurücksetzen?</b>
                <br />
                <span style={{ fontSize: 14, color: uiTokens.textSecondary }}>
                  Über die Login-Seite auf &quot;Passwort vergessen&quot; klicken und den Anweisungen folgen.
                </span>
              </li>
              <li>
                <b style={{ color: uiTokens.textPrimary }}>Wie erreiche ich den Support?</b>
                <br />
                <span style={{ fontSize: 14, color: uiTokens.textSecondary }}>
                  Schreibe eine E-Mail an{" "}
                  <a href="mailto:support@neuland.ai" style={{ color: uiTokens.brand }}>support@neuland.ai</a>{" "}
                  oder nutze das Kontaktformular unten.
                </span>
              </li>
              <li>
                <b style={{ color: uiTokens.textPrimary }}>Wo finde ich Anleitungen zur Plattform?</b>
                <br />
                <span style={{ fontSize: 14, color: uiTokens.textSecondary }}>
                  Im Bereich &quot;VetMind&quot; findest du viele Anleitungen und SOPs.
                </span>
              </li>
            </ul>
          </Card>
        </Section>

        <Section title="Kontaktformular">
          <HilfeKontaktForm />
        </Section>
      </div>
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
    setTimeout(() => {
      setSent(true);
      setSending(false);
    }, 1200);
  };

  if (sent) {
    return <div style={{ color: "#16a34a", marginTop: 16, fontSize: 14 }}>Danke für deine Nachricht! Wir melden uns zeitnah.</div>;
  }

  return (
    <Card style={{ maxWidth: 420 }}>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <input
          type="email"
          placeholder="Deine E-Mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            width: "100%",
            padding: 12,
            borderRadius: uiTokens.radiusCard,
            border: uiTokens.cardBorder,
            fontSize: 14,
          }}
        />
        <textarea
          placeholder="Deine Nachricht"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={4}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: uiTokens.radiusCard,
            border: uiTokens.cardBorder,
            fontSize: 14,
            resize: "vertical",
          }}
        />
        <Button disabled={sending} type="submit" style={{ width: "100%" }}>
          {sending ? "Sende..." : "Absenden"}
        </Button>
      </form>
    </Card>
  );
}
