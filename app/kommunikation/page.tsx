'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

type FonioCallItem = {
  id: string;
  phoneNumber: string;
  status: string;
  at: string;
  direction?: string;
};

type YeastarCallItem = {
  id: string;
  number: string;
  status: string;
  at: string;
};

type YeastarWebhookEvent = {
  id: string;
  receivedAt: string;
  eventType: string;
  number: string;
};

type CallRecording = {
  id: string;
  caller: string;
  callee: string;
  direction: string;
  duration_seconds: number;
  started_at: string | null;
  ended_at: string | null;
  transcript: string | null;
  summary: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

export default function KommunikationPage() {

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [callbackNumber, setCallbackNumber] = useState("");
  const [activePracticeId, setActivePracticeId] = useState<string | null>(null);
  const [fonioEnabled, setFonioEnabled] = useState(false);
  const [checkingFonioAccess, setCheckingFonioAccess] = useState(true);
  const [fonioCalls, setFonioCalls] = useState<FonioCallItem[]>([]);
  const [fonioMessage, setFonioMessage] = useState("");
  const [creatingCallback, setCreatingCallback] = useState(false);
  const [slackMessage, setSlackMessage] = useState("");
  const [sendingSlack, setSendingSlack] = useState(false);
  const [slackStatus, setSlackStatus] = useState('');
  const [yeastarLoading, setYeastarLoading] = useState(true);
  const [yeastarCalls, setYeastarCalls] = useState<YeastarCallItem[]>([]);
  const [yeastarStatus, setYeastarStatus] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<YeastarWebhookEvent[]>([]);
  const [webhookLoading, setWebhookLoading] = useState(true);
  const [webhookStatus, setWebhookStatus] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [callRecordings, setCallRecordings] = useState<CallRecording[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(true);
  const [recordingsStatus, setRecordingsStatus] = useState('');
  const [expandedRecording, setExpandedRecording] = useState<string | null>(null);

  const safeFetchJson = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const res = await fetch(input, init);
      const payload = await res.json().catch(() => ({}));
      return { ok: true as const, res, payload };
    } catch (error) {
      return { ok: false as const, error };
    }
  };

  const loadFonioData = async () => {
    setCheckingFonioAccess(true);
    setFonioMessage("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setActivePracticeId(null);
        setFonioEnabled(false);
        setFonioCalls([]);
        setFonioMessage('Bitte einloggen, um Fonio zu nutzen.');
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const response = await safeFetchJson('/api/fonio', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        setFonioEnabled(false);
        setFonioCalls([]);
        setFonioMessage('Verbindung zu Fonio momentan nicht möglich.');
        return;
      }

      const { res, payload } = response;
      setActivePracticeId(payload?.practiceId || null);

      if (res.status === 403 && payload?.enabled === false) {
        setFonioEnabled(false);
        setFonioCalls([]);
        setFonioMessage('Fonio ist nur für die freigeschaltete Praxis verfügbar.');
        return;
      }

      if (!res.ok) {
        setFonioEnabled(false);
        setFonioCalls([]);
        setFonioMessage(payload?.error || 'Fonio konnte nicht geladen werden.');
        return;
      }

      setFonioEnabled(true);
      setFonioCalls(Array.isArray(payload?.calls) ? payload.calls : []);
    } catch (error) {
      console.error('loadFonioData failed', error);
      setFonioEnabled(false);
      setFonioCalls([]);
      setFonioMessage('Fonio-Laden fehlgeschlagen. Bitte Seite neu laden.');
    } finally {
      setCheckingFonioAccess(false);
    }
  };

  const createCallback = async (numberRaw: string) => {
    const number = numberRaw.trim();
    if (!number) {
      setFonioMessage('Bitte eine Telefonnummer eingeben.');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setFonioMessage('Bitte erneut einloggen.');
      return;
    }

    setCreatingCallback(true);
    setFonioMessage('');
    try {
      const response = await safeFetchJson('/api/fonio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ phoneNumber: number }),
      });

      if (!response.ok) {
        setFonioMessage('Rückruf konnte nicht erstellt werden (Netzwerkfehler).');
        return;
      }

      const { res, payload } = response;
      if (!res.ok) {
        setFonioMessage(payload?.error || 'Rückruf konnte nicht erstellt werden.');
        return;
      }

      setFonioMessage(`Rückruf für ${number} wurde an Fonio übergeben.`);
      setCallbackNumber('');
      await loadFonioData();
    } catch (error) {
      console.error('createCallback failed', error);
      setFonioMessage('Rückruf konnte nicht erstellt werden.');
    } finally {
      setCreatingCallback(false);
    }
  };

  const sendSlackMessage = async () => {
    const text = slackMessage.trim();
    if (!text) {
      setSlackStatus('Bitte eine Nachricht eingeben.');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setSlackStatus('Bitte erneut einloggen.');
      return;
    }

    setSendingSlack(true);
    setSlackStatus('');

    try {
      const response = await safeFetchJson('/api/slack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        setSlackStatus('Slack-Nachricht konnte nicht gesendet werden (Netzwerkfehler).');
        return;
      }

      const { res, payload } = response;
      if (!res.ok) {
        setSlackStatus(payload?.error || 'Slack-Nachricht konnte nicht gesendet werden.');
        return;
      }

      setSlackStatus('Nachricht erfolgreich an Slack gesendet.');
      setSlackMessage('');
    } catch (error) {
      console.error('sendSlackMessage failed', error);
      setSlackStatus('Slack-Nachricht konnte nicht gesendet werden.');
    } finally {
      setSendingSlack(false);
    }
  };

  const loadYeastarData = async () => {
    setYeastarLoading(true);
    setYeastarStatus('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setYeastarCalls([]);
        setYeastarStatus('Bitte einloggen, um Yeastar zu nutzen.');
        return;
      }

      const response = await safeFetchJson('/api/yeastar', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        setYeastarCalls([]);
        setYeastarStatus('Verbindung zu Yeastar momentan nicht möglich.');
        return;
      }

      const { res, payload } = response;
      if (!res.ok) {
        setYeastarCalls([]);
        setYeastarStatus(payload?.error || 'Yeastar-Daten konnten nicht geladen werden.');
        return;
      }

      setYeastarCalls(Array.isArray(payload?.calls) ? payload.calls : []);
      if (!Array.isArray(payload?.calls) || payload.calls.length === 0) {
        setYeastarStatus('Keine Yeastar-Anrufe gefunden.');
      }
    } catch (error) {
      console.error('loadYeastarData failed', error);
      setYeastarCalls([]);
      setYeastarStatus('Yeastar-Daten konnten nicht geladen werden.');
    } finally {
      setYeastarLoading(false);
    }
  };

  const loadWebhookEvents = async () => {
    setWebhookLoading(true);
    setWebhookStatus('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setWebhookEvents([]);
        setWebhookStatus('Bitte einloggen, um Yeastar-Events zu sehen.');
        return;
      }

      const response = await safeFetchJson('/api/yeastar/events', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        setWebhookEvents([]);
        setWebhookStatus('Webhook-Events konnten nicht geladen werden.');
        return;
      }

      const { res, payload } = response;
      if (!res.ok) {
        setWebhookEvents([]);
        setWebhookStatus(payload?.error || 'Webhook-Events konnten nicht geladen werden.');
        return;
      }

      const events = Array.isArray(payload?.events) ? payload.events : [];
      setWebhookEvents(events);
      if (events.length === 0) {
        setWebhookStatus('Noch keine Yeastar-Webhook-Events empfangen.');
      }
    } catch (error) {
      console.error('loadWebhookEvents failed', error);
      setWebhookEvents([]);
      setWebhookStatus('Webhook-Events konnten nicht geladen werden.');
    } finally {
      setWebhookLoading(false);
    }
  };

  const loadCallRecordings = async () => {
    setRecordingsLoading(true);
    setRecordingsStatus('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setCallRecordings([]);
        setRecordingsStatus('Bitte einloggen, um Anruf-Protokolle zu sehen.');
        return;
      }

      const response = await safeFetchJson('/api/yeastar/recordings?limit=30', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });

      if (!response.ok) {
        setCallRecordings([]);
        setRecordingsStatus('Anruf-Protokolle konnten nicht geladen werden.');
        return;
      }

      const { res, payload } = response;
      if (!res.ok) {
        setCallRecordings([]);
        setRecordingsStatus(payload?.error || 'Anruf-Protokolle konnten nicht geladen werden.');
        return;
      }

      const recs = Array.isArray(payload?.recordings) ? payload.recordings : [];
      setCallRecordings(recs);
      if (recs.length === 0) {
        setRecordingsStatus('Noch keine Anruf-Protokolle vorhanden. Aufnahmen werden automatisch verarbeitet, sobald Telefonate über Yeastar beendet werden.');
      }
    } catch (error) {
      console.error('loadCallRecordings failed', error);
      setCallRecordings([]);
      setRecordingsStatus('Anruf-Protokolle konnten nicht geladen werden.');
    } finally {
      setRecordingsLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const statusLabel = (status: string) => {
    const map: Record<string, { label: string; color: string; bg: string }> = {
      pending: { label: 'Wartend', color: '#92400e', bg: '#fef3c7' },
      downloading: { label: 'Download…', color: '#1e40af', bg: '#dbeafe' },
      transcribing: { label: 'Transkription…', color: '#6d28d9', bg: '#ede9fe' },
      summarizing: { label: 'KI-Zusammenfassung…', color: '#0e7490', bg: '#cffafe' },
      done: { label: 'Fertig', color: '#065f46', bg: '#d1fae5' },
      failed: { label: 'Fehlgeschlagen', color: '#991b1b', bg: '#fee2e2' },
    };
    return map[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' };
  };

  useEffect(() => {
    loadFonioData();
    loadYeastarData();
    loadWebhookEvents();
    loadCallRecordings();
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/yeastar/webhook`);
    }
  }, []);

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
        <Link href="/kommunikation/whatsapp" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ ...card, cursor: 'pointer', transition: 'box-shadow 0.15s ease', position: 'relative' }}
               onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
               onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            <h3>📱 WhatsApp Inbox</h3>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              Eingehende WhatsApp-Nachrichten anzeigen, beantworten und KI-Antwortvorschläge erhalten.
            </div>
            <div style={{ ...primaryBtn, textAlign: 'center', marginTop: '4px' }}>
              Zum WhatsApp-Posteingang →
            </div>
          </div>
        </Link>

        {/* ☎️ TELEFON (FONIO) */}
        <div style={card}>
          <h3>☎️ Telefon (Fonio)</h3>

          {checkingFonioAccess ? (
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              Prüfe Praxisfreigabe...
            </div>
          ) : fonioEnabled ? (
            <>
              <div style={{ fontSize: '14px', color: '#0F6B74', fontWeight: 600 }}>
                Fonio ist für diese Praxis freigeschaltet.
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Praxis-ID: {activePracticeId}
              </div>

              <div style={{ fontSize: "14px", color: "#6b7280" }}>
                Verpasste Anrufe
              </div>

              <div style={{ display: 'grid', gap: '8px' }}>
                {fonioCalls.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>
                    Keine verpassten Anrufe gefunden.
                  </div>
                ) : (
                  fonioCalls.map((call) => (
                    <div
                      key={call.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '10px',
                        padding: '10px',
                        background: '#f8fafc'
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{call.phoneNumber}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {call.status} · {new Date(call.at).toLocaleString('de-DE')}
                      </div>
                      <button
                        style={{ ...secondaryBtn, marginTop: '8px' }}
                        onClick={() => createCallback(call.phoneNumber)}
                        disabled={creatingCallback}
                      >
                        ↩ Rückruf erstellen
                      </button>
                    </div>
                  ))
                )}
              </div>

              <input
                placeholder="Telefonnummer für Rückruf"
                value={callbackNumber}
                onChange={(e) => setCallbackNumber(e.target.value)}
                style={input}
              />

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  style={secondaryBtn}
                  onClick={() => createCallback(callbackNumber)}
                  disabled={creatingCallback}
                >
                  {creatingCallback ? 'Sende...' : '↩ Rückruf für Nummer erstellen'}
                </button>

                <button style={secondaryBtn} onClick={loadFonioData}>
                  🔄 Anrufe aktualisieren
                </button>
              </div>

              {fonioMessage && (
                <div style={{ fontSize: '12px', color: '#0f172a' }}>{fonioMessage}</div>
              )}
            </>
          ) : (
            <div
              style={{
                fontSize: '13px',
                color: '#6b7280',
                background: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '10px 12px'
              }}
            >
              {fonioMessage || 'Fonio ist für diese Praxis nicht freigeschaltet.'}
            </div>
          )}
        </div>

        {/* 💬 SLACK */}
        <div style={card}>
          <h3>💬 Team (Slack)</h3>

          <textarea
            placeholder="Nachricht an Team"
            value={slackMessage}
            onChange={(e) => setSlackMessage(e.target.value)}
            style={textarea}
          />

          <button style={primaryBtn} onClick={sendSlackMessage} disabled={sendingSlack}>
            {sendingSlack ? 'Sende...' : 'An Team senden'}
          </button>

          {slackStatus && (
            <div style={{ fontSize: '12px', color: '#475569' }}>{slackStatus}</div>
          )}
        </div>

        {/* ☎️ YEASTAR */}
        <div style={card}>
          <h3>☎️ Telefon (Yeastar API)</h3>

          <div style={{ fontSize: '13px', color: '#64748b' }}>
            API-basiertes Laden von Anrufdaten für die freigeschaltete Praxis.
          </div>

          {yeastarLoading ? (
            <div style={{ fontSize: '13px', color: '#6b7280' }}>Lade Yeastar-Daten...</div>
          ) : (
            <>
              <div style={{ display: 'grid', gap: '8px' }}>
                {yeastarCalls.map((call) => (
                  <div
                    key={call.id}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '10px',
                      padding: '10px',
                      background: '#f8fafc'
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{call.number}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {call.status} · {new Date(call.at).toLocaleString('de-DE')}
                    </div>
                  </div>
                ))}
              </div>

              <button style={secondaryBtn} onClick={loadYeastarData}>
                🔄 Yeastar aktualisieren
              </button>

              {yeastarStatus && (
                <div style={{ fontSize: '12px', color: '#475569' }}>{yeastarStatus}</div>
              )}
            </>
          )}

          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '8px', paddingTop: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Webhook Setup</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              URL in Yeastar eintragen: {webhookUrl || '/api/yeastar/webhook'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Methode: POST · Secret: Wert aus YEASTAR_WEBHOOK_SECRET (falls gesetzt)
            </div>

            <button style={{ ...secondaryBtn, marginTop: '8px' }} onClick={loadWebhookEvents}>
              🔄 Webhook-Events aktualisieren
            </button>

            {webhookLoading ? (
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>Lade Webhook-Events...</div>
            ) : (
              <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
                {webhookEvents.map((event) => (
                  <div key={event.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', background: '#fff' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{event.eventType}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {event.number} · {new Date(event.receivedAt).toLocaleString('de-DE')}
                    </div>
                  </div>
                ))}
                {webhookStatus && <div style={{ fontSize: '12px', color: '#64748b' }}>{webhookStatus}</div>}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 📞 ANRUF-PROTOKOLLE */}
      <div style={{
        marginTop: '24px',
        padding: '24px',
        borderRadius: '16px',
        background: '#fff',
        border: '1px solid #e5e7eb',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0F6B74' }}>📞 Anruf-Protokolle & KI-Zusammenfassungen</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
              Automatische Transkription und Zusammenfassung aller Telefonate über Yeastar PBX
            </p>
          </div>
          <button style={secondaryBtn} onClick={loadCallRecordings}>
            🔄 Aktualisieren
          </button>
        </div>

        {recordingsLoading ? (
          <div style={{ fontSize: '13px', color: '#6b7280', padding: '12px 0' }}>Lade Anruf-Protokolle…</div>
        ) : callRecordings.length === 0 ? (
          <div style={{
            fontSize: '13px',
            color: '#6b7280',
            background: '#f8fafc',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '16px',
          }}>
            {recordingsStatus}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {callRecordings.map((rec) => {
              const st = statusLabel(rec.status);
              const isExpanded = expandedRecording === rec.id;
              return (
                <div
                  key={rec.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    background: '#fafbfc',
                    overflow: 'hidden',
                  }}
                >
                  {/* Header row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '14px 16px',
                      cursor: rec.status === 'done' ? 'pointer' : 'default',
                    }}
                    onClick={() => rec.status === 'done' && setExpandedRecording(isExpanded ? null : rec.id)}
                  >
                    <div style={{
                      fontSize: '20px',
                      flexShrink: 0,
                    }}>
                      {rec.direction === 'inbound' ? '📥' : rec.direction === 'outbound' ? '📤' : '🔄'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>
                        {rec.caller} → {rec.callee}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {rec.started_at ? new Date(rec.started_at).toLocaleString('de-DE') : rec.created_at ? new Date(rec.created_at).toLocaleString('de-DE') : '–'}
                        {rec.duration_seconds > 0 && ` · ${formatDuration(rec.duration_seconds)}`}
                      </div>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: '99px',
                      background: st.bg,
                      color: st.color,
                      flexShrink: 0,
                    }}>
                      {st.label}
                    </span>

                    {rec.status === 'done' && (
                      <span style={{ fontSize: '14px', color: '#9ca3af', flexShrink: 0 }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    )}
                  </div>

                  {/* Summary preview (always visible for done) */}
                  {rec.status === 'done' && rec.summary && !isExpanded && (
                    <div style={{
                      padding: '0 16px 12px',
                      fontSize: '13px',
                      color: '#374151',
                      lineHeight: '1.5',
                    }}>
                      {rec.summary.length > 180 ? rec.summary.slice(0, 180) + '…' : rec.summary}
                    </div>
                  )}

                  {/* Error message */}
                  {rec.status === 'failed' && rec.error_message && (
                    <div style={{
                      padding: '0 16px 12px',
                      fontSize: '12px',
                      color: '#991b1b',
                    }}>
                      Fehler: {rec.error_message}
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && rec.status === 'done' && (
                    <div style={{ borderTop: '1px solid #e5e7eb', padding: '16px' }}>
                      {rec.summary && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F6B74', marginBottom: '6px' }}>
                            🤖 KI-Zusammenfassung
                          </div>
                          <div style={{
                            fontSize: '13px',
                            color: '#1f2937',
                            lineHeight: '1.6',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '10px',
                            padding: '12px',
                            whiteSpace: 'pre-wrap',
                          }}>
                            {rec.summary}
                          </div>
                        </div>
                      )}

                      {rec.transcript && (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                            📝 Vollständiges Transkript
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: '#4b5563',
                            lineHeight: '1.6',
                            background: '#f8fafc',
                            border: '1px solid #e5e7eb',
                            borderRadius: '10px',
                            padding: '12px',
                            maxHeight: '300px',
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                          }}>
                            {rec.transcript}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {recordingsStatus && callRecordings.length > 0 && (
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>{recordingsStatus}</div>
        )}
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
