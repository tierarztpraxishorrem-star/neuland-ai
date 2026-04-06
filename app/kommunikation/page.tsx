'use client';

import { useState } from 'react';

export default function KommunikationPage() {

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <main style={{
      padding: "40px",
      fontFamily: "Arial, sans-serif",
      background: "linear-gradient(180deg, #f4f7f8 0%, #eaf0f1 100%)",
      minHeight: "100vh"
    }}>

      {/* HEADER */}
      <div style={{ marginBottom: "30px" }}>
        <h1 style={{ margin: 0, color: "#0F6B74" }}>
          Kommunikation
        </h1>
        <p style={{ color: "#6b7280", marginTop: "6px" }}>
          Zentrale für Patienten- & Teamkommunikation
        </p>
      </div>

      {/* GRID */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: "20px"
      }}>

        {/* 📧 EMAIL */}
        <div style={card}>
          <h3>📧 E-Mail</h3>

          <input
            placeholder="Empfänger"
            onChange={(e) => setEmail(e.target.value)}
            style={input}
          />

          <textarea
            placeholder="Nachricht"
            onChange={(e) => setMessage(e.target.value)}
            style={textarea}
          />

          <button style={primaryBtn}>
            Senden
          </button>
        </div>

        {/* 📱 WHATSAPP */}
        <div style={card}>
          <h3>📱 WhatsApp</h3>

          <input
            placeholder="Telefonnummer"
            onChange={(e) => setPhone(e.target.value)}
            style={input}
          />

          <textarea
            placeholder="Nachricht"
            onChange={(e) => setMessage(e.target.value)}
            style={textarea}
          />

          <button style={primaryBtn}>
            Senden (kommt bald)
          </button>
        </div>

        {/* ☎️ TELEFON (FONIO) */}
        <div style={card}>
          <h3>☎️ Telefon (Fonio)</h3>

          <div style={{ fontSize: "14px", color: "#6b7280" }}>
            Verpasste Anrufe
          </div>

          <ul>
            <li>📞 0176 123456 – verpasst</li>
            <li>📞 02234 987654 – angenommen</li>
          </ul>

          <button style={secondaryBtn}>↩ Rückruf erstellen</button>
          <button style={secondaryBtn}>➕ Fall aus Anruf</button>
        </div>

        {/* 💬 SLACK */}
        <div style={card}>
          <h3>💬 Team (Slack)</h3>

          <textarea
            placeholder="Nachricht an Team"
            style={textarea}
          />

          <button style={primaryBtn}>
            An Team senden
          </button>
        </div>

      </div>

      {/* FUTURE SECTION */}
      <div style={{
        marginTop: "40px",
        padding: "20px",
        borderRadius: "16px",
        background: "#fff",
        border: "1px solid #e5e7eb"
      }}>
        <h3>🚀 Nächste Ausbaustufe</h3>
        <ul style={{ color: "#6b7280", lineHeight: "1.8" }}>
          <li>Automatische WhatsApp-Benachrichtigungen</li>
          <li>KI-Zusammenfassung von Telefonaten</li>
          <li>Follow-up Erinnerungen für Patienten</li>
          <li>Direkte Übergabe von Fällen ins Team</li>
        </ul>
      </div>

    </main>
  );
}


// 🎨 STYLES

const card = {
  background: "#fff",
  padding: "20px",
  borderRadius: "16px",
  border: "1px solid #e5e7eb",
  display: "flex",
  flexDirection: "column" as const,
  gap: "10px"
};

const input = {
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #e5e7eb"
};

const textarea = {
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #e5e7eb",
  minHeight: "80px"
};

const primaryBtn = {
  padding: "12px",
  borderRadius: "10px",
  border: "none",
  background: "#0F6B74",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer"
};

const secondaryBtn = {
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontWeight: 600,
  cursor: "pointer"
};
