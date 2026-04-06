'use client';

import { supabase } from '../../lib/supabase';
import { useState, useEffect } from 'react';

export default function VetMind() {
useEffect(() => {
  const stored = localStorage.getItem("activeCase");


  if (stored) {
    const parsed = JSON.parse(stored);

    const contextMessage = `
FALLKONTEXT:

Patient: ${parsed.patient_name}
Tierart: ${parsed.species}
Alter: ${parsed.age}
Rasse: ${parsed.breed}

BERICHT:
${parsed.result}
    `;

    setMessages([
      {
        role: "assistant",
        content: "Fall wurde geladen. Du kannst jetzt Fragen stellen."
      },
      {
        role: "system",
        content: contextMessage
      }
    ]);
  }
}, []);
const [showMenu, setShowMenu] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
const [cases, setCases] = useState<any[]>([]);
const [selectedCase, setSelectedCase] = useState<any | null>(null);
const [showCases, setShowCases] = useState(false);

  const brand = {
    primary: '#0F6B74',
    border: '#E5E7EB',
    text: '#1F2937',
    muted: '#6B7280',
    bg: '#F4F7F8',
    card: '#FFFFFF'
  };
const menuItemStyle = {
  padding: "10px",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "14px"
};

  const sendMessage = async (preset?: string) => {

    const text = preset || input;
const contextBlock = selectedCase
  ? `
AKTUELLER FALL:

Patient: ${selectedCase.patient_name || "unbekannt"}
Tierart: ${selectedCase.species || "unbekannt"}
Alter: ${selectedCase.age || "unbekannt"}
Rasse: ${selectedCase.breed || "unbekannt"}

KLINISCHER BERICHT:
${selectedCase.result || "kein Bericht vorhanden"}
`
  : "";
    if (!text.trim()) return;

    const newMessages = [
      ...messages,
      { role: "user", content: text }
    ];

    setMessages(newMessages);
    setInput("");
    setLoading(true);
const [hasContext, setHasContext] = useState(false);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
  messages: newMessages,
  context: contextBlock
})
      });

      const data = await res.json();

      setMessages([
        ...newMessages,
        { role: "assistant", content: data.answer }
      ]);

    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  };
const loadCases = async () => {
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!error) {
    setCases(data || []);
  }
};

  return (
    <main style={{
      minHeight: "100vh",
      background: brand.bg,
      padding: "40px",
      fontFamily: "Arial",
      color: brand.text
    }}>

      {/* HEADER */}
      <div style={{ marginBottom: "30px" }}>
        <h1 style={{ margin: 0, color: brand.primary }}>
          🧠 VetMind
        </h1>
        <p style={{ color: brand.muted }}>
          Intelligente Unterstützung für SOPs, Wissen und klinische Fragen
        </p>
      </div>

      {/* QUICK ACTIONS */}
      {messages.length <= 2 && (
        <div style={{ marginBottom: "24px" }}>

          <div style={{
            marginBottom: "10px",
            color: brand.muted,
            fontSize: "14px"
          }}>
            Vorschläge
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "12px"
          }}>
            {[
  "Gib mir eine strukturierte klinische Einschätzung dieses Falls",
  "Ist eine Überweisung an eine Tierklinik sinnvoll? Begründe klar",
  "Welche Differentialdiagnosen sind am wahrscheinlichsten?",
  "Welche Therapieoptionen sind evidenzbasiert sinnvoll?",
  "Wie ist die Prognose für diesen Patienten?",
  "Wie sollte eine Übergabe an die stationäre Betreuung aussehen?"
].map((q, i) => (
              <div
                key={i}
                onClick={() => sendMessage(q)}
                style={{
  padding: "14px",
  border: `1px solid ${brand.border}`,
  borderRadius: "10px",
  cursor: "pointer",
  background: "#fff",
  transition: "0.2s",
  fontWeight: 500
}}
onMouseEnter={(e) => e.currentTarget.style.background = "#f0f9fa"}
onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
              >
                {q}
              </div>
            ))}
          </div>

        </div>
      )}
{selectedCase && (
  <div style={{
    marginBottom: "16px",
    padding: "12px",
    background: "#EAF4F5",
    borderRadius: "10px"
  }}>
    <b>Aktive Konsultation:</b> {selectedCase.patient_name} ({selectedCase.species})
  </div>
)}
      {/* CHAT */}
      <div style={{
        border: `1px solid ${brand.border}`,
        borderRadius: "12px",
        padding: "16px",
        height: "360px",
        overflowY: "auto",
        background: brand.card,
        marginBottom: "16px"
      }}>

        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: "12px" }}>
            <b>{m.role === "user" ? "Du" : "VetMind"}:</b>
            <div style={{ whiteSpace: "pre-wrap" }}>
              {m.content}
            </div>
{showCases && (
  <div style={{
    marginTop: "20px",
    border: `1px solid ${brand.border}`,
    borderRadius: "12px",
    padding: "16px",
    background: "#fff"
  }}>

    <h3 style={{ marginTop: 0 }}>Konsultation auswählen</h3>

    {cases.length === 0 && (
      <div style={{ color: brand.muted }}>
        Keine Fälle gefunden
      </div>
    )}

    {cases.map((c, i) => (
      <div
        key={i}
        onClick={() => {
          setSelectedCase(c);
          setShowCases(false);
        }}
        style={{
          padding: "10px",
          borderBottom: "1px solid #eee",
          cursor: "pointer"
        }}
      >
        <b>{c.patient_name || "Unbekannt"}</b> – {c.species || "—"}
      </div>
    ))}

  </div>
)}
          </div>
        ))}

        {loading && <div style={{ color: brand.muted }}>
          VetMind denkt nach...
        </div>}

      </div>

      {/* INPUT BAR */}
      <div style={{
        display: "flex",
        gap: "10px",
        alignItems: "center"
      }}>

        {/* + BUTTON */}
        <div style={{ position: "relative" }}>

  <div
    onClick={() => setShowMenu(!showMenu)}
    style={{
      width: "42px",
      height: "42px",
      borderRadius: "10px",
      border: `1px solid ${brand.border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      background: "#fff",
      fontSize: "20px",
      fontWeight: 600
    }}
  >
    +
  </div>

  {showMenu && (
    <div style={{
      position: "absolute",
      bottom: "50px",
      left: 0,
      background: "#fff",
      border: `1px solid ${brand.border}`,
      borderRadius: "10px",
      boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
      padding: "8px",
      width: "220px",
      zIndex: 10
    }}>

      <div
  style={menuItemStyle}
  onClick={async () => {
    await loadCases();
    setShowCases(true);
    setShowMenu(false);
  }}
>
  📄 Konsultation anhängen
</div>

      <div style={menuItemStyle}>
        🐾 Patient anhängen
      </div>

      <div style={menuItemStyle}>
        📎 Datei anhängen
      </div>

    </div>
  )}

</div>

        {/* INPUT */}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Frage stellen oder SOP suchen..."
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "10px",
            border: `1px solid ${brand.border}`,
            fontSize: "14px"
          }}
        />

        {/* SEND */}
        <button
          onClick={() => sendMessage()}
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "10px",
            background: brand.primary,
            color: "#fff",
            border: "none",
            cursor: "pointer"
          }}
        >
          ➤
        </button>

      </div>

    </main>
  );
}