"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { uiTokens } from "./ui/System";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  label?: string;
};

// Minimaler Rich-Text-Editor auf contenteditable-Basis (keine externen Abhängigkeiten).
// Liefert HTML zurück; bei Paste wird Fremd-Formatierung entfernt, um sauberes Markup zu halten.
export default function RichTextEditor({ value, onChange, placeholder, minHeight = 200, label }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);

  // Initialer Inhalt + externe Updates (z.B. KI-Entwurf, Vorlage)
  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  function exec(command: string, arg?: string) {
    ref.current?.focus();
    // execCommand ist deprecated, funktioniert aber browserübergreifend verlässlich für einfache Formatierung.
    document.execCommand(command, false, arg);
    emit();
  }

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    // Immer als plain-text einfügen – vermeidet verseuchte Styles aus Word/Outlook etc.
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  function handleLink() {
    const existing = document.getSelection()?.toString() || "";
    const url = prompt(existing ? `Link für "${existing}":` : "URL:", "https://");
    if (!url) return;
    exec("createLink", url);
  }

  const toolbarBtn: CSSProperties = {
    padding: "5px 9px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    background: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    color: uiTokens.textPrimary,
  };

  return (
    <div style={{ display: "grid", gap: 6, width: "100%" }}>
      {label && <span style={{ fontSize: 12, color: uiTokens.textSecondary }}>{label}</span>}
      <div
        style={{
          borderRadius: 10,
          border: `1px solid ${focused ? uiTokens.brand : "#e5e7eb"}`,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <div style={{
          display: "flex",
          gap: 4,
          padding: 6,
          borderBottom: uiTokens.cardBorder,
          background: "#f8fafc",
          flexWrap: "wrap",
        }}>
          <button type="button" onClick={() => exec("bold")} style={{ ...toolbarBtn, fontWeight: 900 }} title="Fett (Ctrl+B)">B</button>
          <button type="button" onClick={() => exec("italic")} style={{ ...toolbarBtn, fontStyle: "italic" }} title="Kursiv (Ctrl+I)">I</button>
          <button type="button" onClick={() => exec("underline")} style={{ ...toolbarBtn, textDecoration: "underline" }} title="Unterstrichen (Ctrl+U)">U</button>
          <span style={{ width: 1, background: "#e5e7eb", margin: "0 2px" }} />
          <button type="button" onClick={() => exec("insertUnorderedList")} style={toolbarBtn} title="Aufzählung">•—</button>
          <button type="button" onClick={() => exec("insertOrderedList")} style={toolbarBtn} title="Nummerierung">1.</button>
          <span style={{ width: 1, background: "#e5e7eb", margin: "0 2px" }} />
          <button type="button" onClick={handleLink} style={toolbarBtn} title="Link einfügen">🔗</button>
          <button type="button" onClick={() => exec("unlink")} style={toolbarBtn} title="Link entfernen">⌫🔗</button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => exec("removeFormat")} style={toolbarBtn} title="Formatierung entfernen">✕ Format</button>
        </div>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={() => { setFocused(false); emit(); }}
          onFocus={() => setFocused(true)}
          onPaste={handlePaste}
          data-placeholder={placeholder || ""}
          style={{
            minHeight,
            padding: 12,
            fontSize: 14,
            lineHeight: 1.6,
            outline: "none",
            color: uiTokens.textPrimary,
            overflowY: "auto",
          }}
        />
      </div>
      <style>{`
        [contenteditable][data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }
        [contenteditable] a {
          color: ${uiTokens.brand};
          text-decoration: underline;
        }
        [contenteditable] ul, [contenteditable] ol {
          margin: 6px 0;
          padding-left: 24px;
        }
      `}</style>
    </div>
  );
}
