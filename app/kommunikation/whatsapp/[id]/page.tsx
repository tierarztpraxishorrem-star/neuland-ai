"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { uiTokens } from "@/components/ui/System";

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  media_type: string | null;
  media_url: string | null;
  status: string;
  ai_suggested: boolean;
  ai_suggestion_original: string | null;
  created_at: string;
  sender: { id: string; display_name: string | null } | null;
};

type Contact = {
  id: string;
  phone: string;
  display_name: string | null;
};

type ConvInfo = {
  id: string;
  status: string;
  assigned_to: string | null;
  contact: Contact;
};

type MediaItem = {
  id: string;
  media_type: string;
  mime_type: string | null;
  storage_url: string | null;
  ai_analysis: string | null;
  ai_animal_type: string | null;
  ai_body_part: string | null;
  ai_condition: string | null;
  patient_id: string | null;
  patient: { id: string; name: string; tierart: string | null; owner_name: string | null } | null;
  created_at: string;
};

type PatientOption = {
  id: string;
  name: string;
  tierart: string | null;
  owner_name: string | null;
};

async function fetchWithAuth(url: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Nicht angemeldet.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ConversationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.id as string;

  const [conv, setConv] = useState<ConvInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Media panel
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Compose
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchWithAuth(
        `/api/whatsapp/conversations/${conversationId}/messages`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setConv(data.conversation || null);
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const loadMedia = useCallback(async () => {
    try {
      const res = await fetchWithAuth(
        `/api/whatsapp/media?conversation_id=${conversationId}`
      );
      const data = await res.json();
      if (res.ok) setMediaItems(data.media || []);
    } catch {
      // silently ignore
    }
  }, [conversationId]);

  const searchPatients = useCallback(async (query: string) => {
    if (!query.trim()) { setPatients([]); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("patients")
        .select("id, name, tierart, owner_name")
        .or(`name.ilike.%${query}%,owner_name.ilike.%${query}%`)
        .limit(10);
      setPatients(data || []);
    } catch {
      // silently ignore
    }
  }, []);

  const assignToPatient = async (mediaId: string, patientId: string | null) => {
    setAssigning(true);
    try {
      const res = await fetchWithAuth("/api/whatsapp/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_id: mediaId, patient_id: patientId }),
      });
      if (res.ok) {
        await loadMedia();
        setSelectedMedia(null);
      }
    } catch {
      // ignore
    } finally {
      setAssigning(false);
    }
  };

  useEffect(() => {
    loadMessages();
    loadMedia();
    const interval = setInterval(() => { loadMessages(); loadMedia(); }, 10000);
    return () => clearInterval(interval);
  }, [loadMessages, loadMedia]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(aiSuggested = false, originalSuggestion?: string) {
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          body: draft.trim(),
          ai_suggested: aiSuggested,
          ai_suggestion_original: originalSuggestion || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Senden.");
      setDraft("");
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSending(false);
    }
  }

  async function handleSuggest() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/whatsapp/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler.");
      if (data.suggestion) {
        setDraft(data.suggestion);
        textareaRef.current?.focus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleStatusChange(status: string) {
    try {
      await fetchWithAuth("/api/whatsapp/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conversationId, status }),
      });
      await loadMessages();
    } catch {
      // ignore
    }
  }

  // Group messages by date
  const grouped: { date: string; msgs: Message[] }[] = [];
  for (const m of messages) {
    const d = formatDate(m.created_at);
    if (grouped.length === 0 || grouped[grouped.length - 1].date !== d) {
      grouped.push({ date: d, msgs: [m] });
    } else {
      grouped[grouped.length - 1].msgs.push(m);
    }
  }

  const contactName =
    conv?.contact?.display_name || conv?.contact?.phone || "Kontakt";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: uiTokens.cardBorder, background: "#fff", padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/kommunikation/whatsapp"
            style={{ borderRadius: 8, padding: 4, color: uiTokens.textMuted, textDecoration: "none" }}
          >
            ← Zurück
          </Link>
          <div>
            <div style={{ fontWeight: 500, color: uiTokens.textPrimary }}>{contactName}</div>
            <div style={{ fontSize: 12, color: uiTokens.textMuted }}>
              {conv?.contact?.phone}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {mediaItems.length > 0 && (
            <button
              onClick={() => setShowMediaPanel(!showMediaPanel)}
              style={{
                borderRadius: uiTokens.radiusCard, border: showMediaPanel ? `1px solid ${uiTokens.brand}` : uiTokens.cardBorder,
                padding: "6px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                background: showMediaPanel ? `${uiTokens.brand}0a` : "#fff",
                color: showMediaPanel ? uiTokens.brand : uiTokens.textPrimary,
              }}
            >
              🖼 Bilder ({mediaItems.length})
            </button>
          )}
          {conv?.status === "open" || conv?.status === "waiting" ? (
            <button
              onClick={() => handleStatusChange("resolved")}
              style={{ borderRadius: uiTokens.radiusCard, background: "#16a34a", padding: "6px 12px", fontSize: 12, fontWeight: 500, color: "#fff", border: "none", cursor: "pointer" }}
            >
              ✓ Erledigt
            </button>
          ) : (
            <button
              onClick={() => handleStatusChange("open")}
              style={{ borderRadius: uiTokens.radiusCard, border: uiTokens.cardBorder, padding: "6px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer", background: "#fff" }}
            >
              Wieder öffnen
            </button>
          )}
        </div>
      </div>

      {/* Messages + Media Panel */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Chat messages */}
        <div style={{ flex: 1, overflowY: "auto", background: "#ece5dd", padding: 16 }}>
          {loading ? (
            <div style={{ textAlign: "center", fontSize: 14, color: uiTokens.textMuted }}>Laden…</div>
          ) : (
            <>
              {grouped.map((group) => (
                <div key={group.date}>
                  <div style={{ margin: "12px 0", textAlign: "center" }}>
                    <span style={{ borderRadius: 999, background: "rgba(255,255,255,0.8)", padding: "4px 12px", fontSize: 10, fontWeight: 500, color: uiTokens.textMuted }}>
                      {group.date}
                    </span>
                  </div>
                  {group.msgs.map((m) => (
                    <div
                      key={m.id}
                      style={{ marginBottom: 8, display: "flex", justifyContent: m.direction === "outbound" ? "flex-end" : "flex-start" }}
                    >
                      <div
                        style={{
                          maxWidth: "75%", borderRadius: 12, padding: "8px 12px",
                          background: m.direction === "outbound" ? "#dcf8c6" : "#fff",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                        }}
                      >
                        {m.media_type === "image" && m.media_url && (
                          <img
                            src={m.media_url}
                            alt="WhatsApp Bild"
                            style={{ marginBottom: 4, maxHeight: 256, borderRadius: 8, objectFit: "cover", cursor: "pointer" }}
                            onClick={() => {
                              const mi = mediaItems.find((x) => x.storage_url === m.media_url);
                              if (mi) { setSelectedMedia(mi); setShowMediaPanel(true); }
                            }}
                          />
                        )}
                        {m.media_type && m.media_type !== "image" && !m.body && (
                          <div style={{ marginBottom: 4, fontSize: 12, fontStyle: "italic", color: uiTokens.textMuted }}>
                            📎 {m.media_type}
                            {m.media_url && (
                              <a href={m.media_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 4, color: uiTokens.brand, textDecoration: "underline" }}>
                                Herunterladen
                              </a>
                            )}
                          </div>
                        )}
                        {m.media_type === "image" && !m.media_url && (
                          <div style={{ marginBottom: 4, fontSize: 12, fontStyle: "italic", color: uiTokens.textMuted }}>
                            🖼 Bild wird geladen…
                          </div>
                        )}
                        {m.body && (
                          <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>
                            {m.body}
                          </div>
                        )}
                        <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                          {m.ai_suggested && (
                            <span style={{ fontSize: 9, color: "#7c3aed" }}>KI</span>
                          )}
                          {m.sender?.display_name && (
                            <span style={{ fontSize: 9, color: uiTokens.textMuted }}>{m.sender.display_name}</span>
                          )}
                          <span style={{ fontSize: 10, color: uiTokens.textMuted }}>{formatTime(m.created_at)}</span>
                          {m.direction === "outbound" && (
                            <span style={{ fontSize: 10 }}>
                              {m.status === "read" ? "✓✓" : m.status === "delivered" ? "✓✓" : m.status === "sent" ? "✓" : m.status === "failed" ? "✗" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Media Side Panel */}
        {showMediaPanel && (
          <div style={{ width: 320, flexShrink: 0, overflowY: "auto", borderLeft: uiTokens.cardBorder, background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: uiTokens.cardBorder, padding: "12px 16px" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>🖼 Medien & KI-Analyse</h3>
              <button
                onClick={() => { setShowMediaPanel(false); setSelectedMedia(null); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: uiTokens.textMuted, fontSize: 16 }}
              >
                ✕
              </button>
            </div>

            {selectedMedia ? (
              <div style={{ padding: 16 }}>
                <button
                  onClick={() => setSelectedMedia(null)}
                  style={{ marginBottom: 12, fontSize: 12, color: uiTokens.brand, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                >
                  ← Alle Bilder
                </button>
                {selectedMedia.storage_url && (
                  <img src={selectedMedia.storage_url} alt="Bild" style={{ width: "100%", borderRadius: 12, marginBottom: 12 }} />
                )}
                {selectedMedia.ai_analysis && (
                  <div style={{ marginBottom: 12, borderRadius: 8, background: "#f5f3ff", padding: 12 }}>
                    <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#7c3aed" }}>KI-Analyse</div>
                    <p style={{ fontSize: 12, lineHeight: 1.5, color: uiTokens.textPrimary, margin: 0 }}>{selectedMedia.ai_analysis}</p>
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {selectedMedia.ai_animal_type && (
                        <span style={{ borderRadius: 999, background: "#ede9fe", padding: "2px 8px", fontSize: 10, fontWeight: 500, color: "#6d28d9" }}>🐾 {selectedMedia.ai_animal_type}</span>
                      )}
                      {selectedMedia.ai_body_part && (
                        <span style={{ borderRadius: 999, background: "#dbeafe", padding: "2px 8px", fontSize: 10, fontWeight: 500, color: "#1d4ed8" }}>📍 {selectedMedia.ai_body_part}</span>
                      )}
                      {selectedMedia.ai_condition && (
                        <span style={{ borderRadius: 999, background: "#ffedd5", padding: "2px 8px", fontSize: 10, fontWeight: 500, color: "#c2410c" }}>⚕ {selectedMedia.ai_condition}</span>
                      )}
                    </div>
                  </div>
                )}
                {!selectedMedia.ai_analysis && (
                  <div style={{ marginBottom: 12, borderRadius: 8, background: "#f9fafb", padding: 12, fontSize: 12, color: uiTokens.textMuted, fontStyle: "italic" }}>
                    KI-Analyse wird noch verarbeitet…
                  </div>
                )}
                {selectedMedia.patient && (
                  <div style={{ marginBottom: 12, borderRadius: 8, border: "1px solid #bbf7d0", background: "#f0fdf4", padding: 12 }}>
                    <div style={{ marginBottom: 4, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#16a34a" }}>Zugeordneter Patient</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: uiTokens.textPrimary }}>{selectedMedia.patient.name}</div>
                    <div style={{ fontSize: 12, color: uiTokens.textMuted }}>
                      {selectedMedia.patient.tierart && <span>{selectedMedia.patient.tierart} · </span>}
                      {selectedMedia.patient.owner_name && <span>Besitzer: {selectedMedia.patient.owner_name}</span>}
                    </div>
                    <button
                      onClick={() => assignToPatient(selectedMedia.id, null)}
                      disabled={assigning}
                      style={{ marginTop: 8, fontSize: 10, color: "#dc2626", background: "none", border: "none", cursor: "pointer", opacity: assigning ? 0.5 : 1, textDecoration: "underline", padding: 0 }}
                    >
                      Zuordnung entfernen
                    </button>
                  </div>
                )}
                <div style={{ borderRadius: 8, border: uiTokens.cardBorder, padding: 12 }}>
                  <div style={{ marginBottom: 8, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: uiTokens.textMuted }}>
                    {selectedMedia.patient ? "Anderem Patienten zuordnen" : "Patient zuordnen"}
                  </div>
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => { setPatientSearch(e.target.value); searchPatients(e.target.value); }}
                    placeholder="Name oder Besitzer suchen…"
                    style={{ width: "100%", borderRadius: 8, border: uiTokens.cardBorder, padding: "6px 8px", fontSize: 12 }}
                  />
                  {patients.length > 0 && (
                    <div style={{ marginTop: 6, maxHeight: 160, overflowY: "auto", borderRadius: 8, border: uiTokens.cardBorder, background: "#fff" }}>
                      {patients.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { assignToPatient(selectedMedia.id, p.id); setPatientSearch(""); setPatients([]); }}
                          disabled={assigning}
                          style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "6px 8px", textAlign: "left", fontSize: 12, background: "none", border: "none", cursor: "pointer", opacity: assigning ? 0.5 : 1 }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f0fdf4")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <span style={{ fontWeight: 500 }}>{p.name}</span>
                          <span style={{ color: uiTokens.textMuted }}>{p.tierart && `${p.tierart} · `}{p.owner_name || ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: uiTokens.textMuted }}>
                  {formatDate(selectedMedia.created_at)} · {formatTime(selectedMedia.created_at)}
                </div>
              </div>
            ) : (
              <div style={{ padding: 12 }}>
                {mediaItems.length === 0 ? (
                  <div style={{ padding: "32px 0", textAlign: "center", fontSize: 12, color: uiTokens.textMuted }}>Keine Medien in dieser Konversation.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {mediaItems.map((mi) => (
                      <button
                        key={mi.id}
                        onClick={() => setSelectedMedia(mi)}
                        style={{ position: "relative", overflow: "hidden", borderRadius: 12, border: uiTokens.cardBorder, cursor: "pointer", background: "none", padding: 0 }}
                      >
                        {mi.storage_url ? (
                          <img src={mi.storage_url} alt="" style={{ aspectRatio: "1", width: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", fontSize: 12, color: uiTokens.textMuted }}>
                            📎 {mi.media_type}
                          </div>
                        )}
                        {mi.ai_analysis && (
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)", padding: "16px 6px 4px" }}>
                            <span style={{ fontSize: 9, fontWeight: 500, color: "#fff" }}>{mi.ai_animal_type || "Analysiert"}</span>
                          </div>
                        )}
                        {mi.patient && (
                          <div style={{ position: "absolute", right: 4, top: 4, borderRadius: 999, background: "#22c55e", padding: "2px 6px", fontSize: 8, fontWeight: 700, color: "#fff" }}>✓</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{ borderTop: "1px solid #fca5a5", background: "#fef2f2", padding: "8px 16px", fontSize: 12, color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {/* Compose */}
      <div style={{ borderTop: uiTokens.cardBorder, background: "#fff", padding: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <button
            onClick={handleSuggest}
            disabled={suggesting}
            style={{
              flexShrink: 0, borderRadius: uiTokens.radiusCard,
              border: "1px solid #e9d5ff", background: "#faf5ff",
              padding: "8px 12px", fontSize: 12, fontWeight: 500,
              color: "#7c3aed", cursor: "pointer",
              opacity: suggesting ? 0.5 : 1,
            }}
            title="KI-Vorschlag generieren"
          >
            {suggesting ? "⏳" : "✨ KI"}
          </button>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(false);
              }
            }}
            placeholder="Nachricht eingeben…"
            rows={2}
            style={{
              flex: 1, resize: "none", borderRadius: uiTokens.radiusCard,
              border: uiTokens.cardBorder, padding: "8px 12px", fontSize: 14,
            }}
          />
          <button
            onClick={() => handleSend(false)}
            disabled={sending || !draft.trim()}
            style={{
              flexShrink: 0, borderRadius: uiTokens.radiusCard,
              background: "#16a34a", padding: "8px 16px", fontSize: 14,
              fontWeight: 500, color: "#fff", border: "none", cursor: "pointer",
              opacity: sending || !draft.trim() ? 0.5 : 1,
            }}
          >
            {sending ? "…" : "Senden"}
          </button>
        </div>
        <div style={{ marginTop: 4, fontSize: 10, color: uiTokens.textMuted }}>
          Enter = Senden · Shift+Enter = Zeilenumbruch · ✨ KI = Antwortvorschlag
        </div>
      </div>
    </div>
  );
}
