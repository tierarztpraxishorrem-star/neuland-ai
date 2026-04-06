'use client';

import { useEffect, useState } from 'react';
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import * as mammoth from 'mammoth';
import { supabase } from '../../lib/supabase';

export default function VorlagenPage() {

  const [templates, setTemplates] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("clinical");
  const [editUntersuchung, setEditUntersuchung] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("clinical");

  const [untersuchung, setUntersuchung] = useState("");

  // 📥 LADEN
  const loadTemplates = async () => {
    await supabase
      .from("templates")
      .update({ category: "internal" })
      .eq("category", "admin");

    const { data } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });

    setTemplates(data || []);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

    // 📤 UPLOAD
    const [uploadContent, setUploadContent] = useState("");
    const [uploadName, setUploadName] = useState("");
    const [showUpload, setShowUpload] = useState(false);
    const [uploadCategory, setUploadCategory] = useState("clinical");
    const [uploadUntersuchung, setUploadUntersuchung] = useState("");

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop()?.toLowerCase();
      setUploadName(file.name.replace(/\.[^.]+$/, ""));
      try {
        if (ext === 'txt') {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const text = ev.target?.result as string;
            setUploadContent(text || "");
            setShowUpload(true);
          };
          reader.readAsText(file);
        } else if (ext === 'pdf') {
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const typedarray = new Uint8Array(ev.target?.result as ArrayBuffer);
            pdfjsLib.GlobalWorkerOptions.workerSrc =
              '//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
            let text = '';
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const content = await page.getTextContent();
              text += content.items.map((item: any) => item.str).join(' ') + '\n';
            }
            setUploadContent(text.trim());
            setShowUpload(true);
          };
          reader.readAsArrayBuffer(file);
        } else if (ext === 'docx') {
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const arrayBuffer = ev.target?.result as ArrayBuffer;
            const result = await mammoth.extractRawText({ arrayBuffer });
            setUploadContent(result.value || "");
            setShowUpload(true);
          };
          reader.readAsArrayBuffer(file);
        } else {
          alert('Nur .txt, .pdf oder .docx werden unterstützt.');
        }
      } catch (err) {
        alert('Fehler beim Auslesen der Datei.');
      }
    };

    const saveUploadedTemplate = async () => {
      const struktur = {
        untersuchung: uploadUntersuchung
          .split("\n")
          .map(s => s.trim())
          .filter(Boolean)
      };
      const { error } = await supabase.from("templates").insert({
        name: uploadName,
        content: uploadContent,
        category: uploadCategory,
        structure: struktur
      });
      if (error) {
        alert("Fehler beim Speichern");
        return;
      }
      setUploadContent("");
      setUploadName("");
      setUploadUntersuchung("");
      setShowUpload(false);
      loadTemplates();
    };

  // 💾 SPEICHERN
  const saveTemplate = async () => {
    const struktur = {
      untersuchung: untersuchung
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean)
    };

    const { error } = await supabase.from("templates").insert({
      name,
      content,
      category,
      structure: struktur
    });

    if (error) {
      alert("Fehler beim Speichern");
      return;
    }

    setName("");
    setContent("");
    setUntersuchung("");

    loadTemplates();
  };

  // 🗑️ LÖSCHEN
  const deleteTemplate = async (id: string) => {
    await supabase.from("templates").delete().eq("id", id);
    loadTemplates();
  };

  const startEditTemplate = (t: any) => {
    setEditingId(t.id);
    setEditName(t.name || "");
    setEditContent(t.content || "");
    setEditCategory(t.category || "clinical");
    setEditUntersuchung((t.structure?.untersuchung || []).join("\n"));
  };

  const cancelEditTemplate = () => {
    setEditingId(null);
    setEditName("");
    setEditContent("");
    setEditCategory("clinical");
    setEditUntersuchung("");
  };

  const saveEditedTemplate = async () => {
    if (!editingId) return;

    const struktur = {
      untersuchung: editUntersuchung
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    };

    const { error } = await supabase
      .from("templates")
      .update({
        name: editName,
        content: editContent,
        category: editCategory,
        structure: struktur
      })
      .eq("id", editingId);

    if (error) {
      alert("Fehler beim Aktualisieren");
      return;
    }

    cancelEditTemplate();
    loadTemplates();
  };

  return (
    <main style={{
      padding: "40px",
      background: "#f4f7f8",
      minHeight: "100vh"
    }}>

      <h1 style={{ color: "#0F6B74", marginBottom: "20px" }}>
        Vorlagen
      </h1>

      {/* ➕ NEUE VORLAGE */}
      <div style={card}>
        <h3>Neue Vorlage erstellen</h3>

        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={input}
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={input}
        >
          <option value="clinical">Klinisch</option>
          <option value="communication">Kommunikation</option>
          <option value="internal">Intern</option>
        </select>

        <textarea
          placeholder="Prompt / Vorlage Inhalt"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={textarea}
        />

        <textarea
          placeholder={`Untersuchung (eine pro Zeile)
z.B.
Allgemeinbefinden
Herz
Lunge
Abdomen`}
          value={untersuchung}
          onChange={(e) => setUntersuchung(e.target.value)}
          style={textarea}
        />

        <button onClick={saveTemplate} style={primaryBtn}>
          💾 Speichern
        </button>
      </div>

        {/* 📤 VORLAGE HOCHLADEN */}
        <div style={{ ...card, marginTop: 20 }}>
          <h3>Vorlage hochladen (.txt, .pdf, .docx)</h3>
          <input type="file" accept=".txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileUpload} style={{ marginBottom: 10 }} />
          {showUpload && (
            <div style={{ marginTop: 10 }}>
              <b>Vorschlag aus Upload:</b>
              <input
                placeholder="Name"
                value={uploadName}
                onChange={e => setUploadName(e.target.value)}
                style={input}
              />
              <select
                value={uploadCategory}
                onChange={e => setUploadCategory(e.target.value)}
                style={input}
              >
                <option value="clinical">Klinisch</option>
                <option value="communication">Kommunikation</option>
                <option value="internal">Intern</option>
              </select>
              <textarea
                value={uploadContent}
                onChange={e => setUploadContent(e.target.value)}
                style={textarea}
                placeholder="Vorlageninhalt"
              />
              <textarea
                placeholder={`Untersuchung (eine pro Zeile)\nz.B.\nAllgemeinbefinden\nHerz\nLunge\nAbdomen`}
                value={uploadUntersuchung}
                onChange={e => setUploadUntersuchung(e.target.value)}
                style={textarea}
              />
              <button onClick={saveUploadedTemplate} style={primaryBtn}>
                Als neue Vorlage speichern
              </button>
              <button onClick={() => setShowUpload(false)} style={{ ...primaryBtn, background: '#e5e7eb', color: '#222', marginLeft: 10 }}>
                Abbrechen
              </button>
            </div>
          )}
        </div>

      {/* 📄 LISTE */}
      <div style={{ marginTop: "30px", display: "grid", gap: "16px" }}>
        {templates.map((t) => (
          <div key={t.id} style={card}>

            {editingId === t.id ? (
              <>
                <h4 style={{ marginTop: 0 }}>Vorlage bearbeiten</h4>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={input}
                  placeholder="Name"
                />
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  style={input}
                >
                  <option value="clinical">Klinisch</option>
                  <option value="communication">Kommunikation</option>
                  <option value="internal">Intern</option>
                </select>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  style={textarea}
                  placeholder="Vorlageninhalt"
                />
                <textarea
                  value={editUntersuchung}
                  onChange={(e) => setEditUntersuchung(e.target.value)}
                  style={textarea}
                  placeholder="Untersuchung (eine pro Zeile)"
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={saveEditedTemplate} style={primaryBtn}>💾 Änderungen speichern</button>
                  <button onClick={cancelEditTemplate} style={{ ...primaryBtn, background: "#e5e7eb", color: "#222" }}>Abbrechen</button>
                </div>
              </>
            ) : (
              <>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <b>{t.name}</b>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>
                  {t.category}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => startEditTemplate(t)}>
                  ✏️
                </button>
                <button onClick={() => deleteTemplate(t.id)}>
                  ❌
                </button>
              </div>
            </div>

            <div style={{
              fontSize: "13px",
              whiteSpace: "pre-wrap",
              marginTop: "10px",
              color: "#374151"
            }}>
              {t.content}
            </div>

            {t.structure?.untersuchung && (
              <div style={{ marginTop: "10px", fontSize: "13px" }}>
                <b>Untersuchung:</b>
                <ul>
                  {t.structure.untersuchung.map((u: string, i: number) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}

              </>
            )}

          </div>
        ))}
      </div>

    </main>
  );
}


// 🎨 Styles

const card = {
  background: "#fff",
  padding: "20px",
  borderRadius: "16px",
  border: "1px solid #e5e7eb"
};

const input = {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #e5e7eb",
  marginBottom: "10px"
};

const textarea = {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #e5e7eb",
  marginBottom: "10px",
  minHeight: "100px"
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
