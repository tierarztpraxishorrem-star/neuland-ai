'use client';

import { useEffect, useState } from 'react';
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

export default function KommunikationPage() {

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
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

  useEffect(() => {
    loadFonioData();
    loadYeastarData();
    loadWebhookEvents();
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
          <li>VetMind-Zusammenfassung von Telefonaten</li>
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
