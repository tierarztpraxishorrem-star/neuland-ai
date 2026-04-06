'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function StartKonsultation() {

  const router = useRouter();

  const [loading, setLoading] = useState(false);


  // Titel (Pflicht)
  const [caseTitle, setCaseTitle] = useState("");

  // 📄 Templates
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const brand = {
    primary: '#0F6B74',
    border: '#E5E7EB',
    text: '#1F2937',
    bg: '#F4F7F8',
    card: '#FFFFFF'
  };

  // 🔥 Templates laden
  useEffect(() => {
    const loadTemplates = async () => {
      await supabase
        .from("templates")
        .update({ category: "internal" })
        .eq("category", "admin");

      const { data } = await supabase
        .from("templates")
        .select("*")
        .order("name");

      setTemplates(data || []);
    };

    loadTemplates();
  }, []);

  // 🚀 CASE ERSTELLEN
  const createCase = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cases")
        .insert({
          title: caseTitle || null,
          status: "draft"
        })
        .select()
        .single();
      if (error) throw error;
      localStorage.setItem("current_case_id", data.id);
      localStorage.setItem("last_consultation_case_id", data.id);
      router.push(`/konsultation/${data.id}/record`);
    } catch (err) {
      console.error(err);
      alert("Fehler beim Erstellen");
    }
    setLoading(false);
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: brand.bg,
      padding: "40px",
      fontFamily: "Arial"
    }}>

      <div style={{
        maxWidth: "700px",
        margin: "0 auto",
        background: brand.card,
        padding: "30px",
        borderRadius: "16px",
        border: `1px solid ${brand.border}`
      }}>


        <h1 style={{ color: brand.primary, marginBottom: "25px" }}>
          Neue Aufnahme / Dokumentation
        </h1>

        {/* Titel (Pflichtfeld) */}
        <input
          placeholder="Titel Pflichtfeld (z.B. Tiername - Konsultation, Meeting, SOP...)"
          value={caseTitle}
          onChange={e => setCaseTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading && caseTitle.trim()) {
              e.preventDefault();
              createCase();
            }
          }}
          style={inputStyle}
        />

        <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 18 }}>
          <b>Hinweis:</b> Weitere strukturierte Daten (z.B. Patient, Zusatzinfos) werden erst nach Auswahl der Vorlage abgefragt.
        </div>

        <button
          onClick={createCase}
          disabled={loading || !caseTitle}
          style={{
            width: "100%",
            marginTop: "20px",
            padding: "16px",
            borderRadius: "14px",
            background: brand.primary,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "16px"
          }}
        >
          {loading ? "Erstelle..." : "➡️ Zur Aufnahme"}
        </button>

      </div>
    </main>
  );
}

// 🔧 Styles
const inputStyle = {
  width: "100%",
  padding: "12px",
  marginBottom: "12px",
  borderRadius: "10px",
  border: "1px solid #E5E7EB"
};

const sectionTitle = {
  marginTop: "20px",
  marginBottom: "8px",
  fontSize: "14px",
  color: "#6B7280"
};