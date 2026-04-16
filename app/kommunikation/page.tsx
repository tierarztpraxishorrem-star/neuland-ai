'use client';

import { useEffect, useState } from 'react';
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
        headers: { Authorization: `Bearer ${accessToken}` },
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
        headers: { Authorization: `Bearer ${accessToken}` },
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
        headers: { Authorization: `Bearer ${accessToken}` },
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

  const loadCallRecordings = async (silent = false) => {
    if (!silent) {
      setRecordingsLoading(true);
      setRecordingsStatus('');
    }
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
      if (!silent) {
        setCallRecordings([]);
        setRecordingsStatus('Anruf-Protokolle konnten nicht geladen werden.');
      }
    } finally {
      if (!silent) setRecordingsLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const statusLabel = (status: string) => {
    const map: Record<string, { label: string; color: string; bg: string }> = {
      pending:      { label: 'Wartend',               color: '#92400e', bg: '#fef3c7' },
      downloading:  { label: 'Download…',             color: '#1e40af', bg: '#dbeafe' },
      transcribing: { label: 'Transkription…',        color: '#6d28d9', bg: '#ede9fe' },
      summarizing:  { label: 'KI-Zusammenfassung…',   color: '#0e7490', bg: '#cffafe' },
      done:         { label: 'Fertig',                color: '#065f46', bg: '#d1fae5' },
      failed:       { label: 'Fehlgeschlagen',        color: '#991b1b', bg: '#fee2e2' },
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

    const interval = setInterval(() => {
      loadCallRecordings(true);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="p-8 bg-[#f4f7f8] min-h-screen">

      {/* HEADER */}
      <div className="mb-6">
        <h1 className="m-0 text-[32px] font-bold text-[#0f6b74]">
          Kommunikation
        </h1>
        <p className="text-slate-500 mt-1.5 text-[15px]">
          Zentrale für Patienten- & Teamkommunikation
        </p>
      </div>

      {/* GRID */}
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>

        {/* 📧 EMAIL */}
        <Link href="/kommunikation/mail" className="no-underline text-inherit">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 flex flex-col gap-2.5 cursor-pointer transition-colors hover:border-[#0f6b74] relative">
            <h3>📧 E-Mail Inbox</h3>
            <div className="text-sm text-slate-500">
              Eingehende E-Mails lesen, beantworten und KI-Antwortvorschläge nutzen.
            </div>
            <div className="p-3 rounded-2xl bg-[#0f6b74] text-white font-semibold text-center mt-1">
              Zum E-Mail-Posteingang →
            </div>
          </div>
        </Link>

        {/* 📱 WHATSAPP */}
        <Link href="/kommunikation/whatsapp" className="no-underline text-inherit">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 flex flex-col gap-2.5 cursor-pointer transition-colors hover:border-[#0f6b74] relative">
            <h3>📱 WhatsApp Inbox</h3>
            <div className="text-sm text-slate-500">
              Eingehende WhatsApp-Nachrichten anzeigen, beantworten und KI-Antwortvorschläge erhalten.
            </div>
            <div className="p-3 rounded-2xl bg-[#0f6b74] text-white font-semibold text-center mt-1">
              Zum WhatsApp-Posteingang →
            </div>
          </div>
        </Link>

        {/* ☎️ TELEFON (FONIO) */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 flex flex-col gap-2.5">
          <h3>☎️ Telefon (Fonio)</h3>

          {checkingFonioAccess ? (
            <div className="text-sm text-gray-500">Prüfe Praxisfreigabe...</div>
          ) : fonioEnabled ? (
            <>
              <div className="text-sm text-[#0F6B74] font-semibold">
                Fonio ist für diese Praxis freigeschaltet.
              </div>
              <div className="text-xs text-gray-500">Praxis-ID: {activePracticeId}</div>

              <div className="text-sm text-gray-500">Verpasste Anrufe</div>

              <div className="grid gap-2">
                {fonioCalls.length === 0 ? (
                  <div className="text-[13px] text-gray-500">Keine verpassten Anrufe gefunden.</div>
                ) : (
                  fonioCalls.map((call) => (
                    <div key={call.id} className="border border-gray-200 rounded-xl p-2.5 bg-slate-50">
                      <div className="font-semibold">{call.phoneNumber}</div>
                      <div className="text-xs text-gray-500">
                        {call.status} · {new Date(call.at).toLocaleString('de-DE')}
                      </div>
                      <button
                        className="mt-2 p-3 rounded-2xl border border-gray-200 bg-white font-semibold cursor-pointer text-sm"
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
                className="p-3 rounded-2xl border border-gray-200 w-full"
              />

              <div className="flex gap-2 flex-wrap">
                <button
                  className="p-3 rounded-2xl border border-gray-200 bg-white font-semibold cursor-pointer"
                  onClick={() => createCallback(callbackNumber)}
                  disabled={creatingCallback}
                >
                  {creatingCallback ? 'Sende...' : '↩ Rückruf für Nummer erstellen'}
                </button>
                <button
                  className="p-3 rounded-2xl border border-gray-200 bg-white font-semibold cursor-pointer"
                  onClick={loadFonioData}
                >
                  🔄 Anrufe aktualisieren
                </button>
              </div>

              {fonioMessage && (
                <div className="text-xs text-slate-900">{fonioMessage}</div>
              )}
            </>
          ) : (
            <div className="text-[13px] text-gray-500 bg-slate-50 border border-gray-200 rounded-xl px-3 py-2.5">
              {fonioMessage || 'Fonio ist für diese Praxis nicht freigeschaltet.'}
            </div>
          )}
        </div>

        {/* 💬 SLACK */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 flex flex-col gap-2.5">
          <h3>💬 Team (Slack)</h3>
          <div className="text-[13px] text-slate-500 mb-2">
            Slack-Channels direkt in Neuland AI lesen und schreiben.
          </div>
          <Link
            href="/kommunikation/slack"
            className="inline-block px-4 py-2 bg-violet-700 text-white rounded-lg text-[13px] font-semibold no-underline"
          >
            💬 Slack öffnen →
          </Link>
        </div>

        {/* ☎️ YEASTAR */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 flex flex-col gap-2.5">
          <h3>☎️ Telefon (Yeastar API)</h3>

          <div className="text-[13px] text-slate-500">
            API-basiertes Laden von Anrufdaten für die freigeschaltete Praxis.
          </div>

          {yeastarLoading ? (
            <div className="text-[13px] text-gray-500">Lade Yeastar-Daten...</div>
          ) : (
            <>
              <div className="grid gap-2">
                {yeastarCalls.map((call) => (
                  <div key={call.id} className="border border-gray-200 rounded-xl p-2.5 bg-slate-50">
                    <div className="font-semibold">{call.number}</div>
                    <div className="text-xs text-gray-500">
                      {call.status} · {new Date(call.at).toLocaleString('de-DE')}
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="p-3 rounded-2xl border border-gray-200 bg-white font-semibold cursor-pointer"
                onClick={loadYeastarData}
              >
                🔄 Yeastar aktualisieren
              </button>
              {yeastarStatus && (
                <div className="text-xs text-slate-600">{yeastarStatus}</div>
              )}
            </>
          )}

          <div className="border-t border-gray-200 mt-2 pt-2.5">
            <div className="text-[13px] font-bold text-slate-900">Webhook Setup</div>
            <div className="text-xs text-slate-500">
              URL in Yeastar eintragen: {webhookUrl || '/api/yeastar/webhook'}
            </div>
            <div className="text-xs text-slate-500">
              Methode: POST · Secret: Wert aus YEASTAR_WEBHOOK_SECRET (falls gesetzt)
            </div>

            <button
              className="mt-2 p-3 rounded-2xl border border-gray-200 bg-white font-semibold cursor-pointer"
              onClick={loadWebhookEvents}
            >
              🔄 Webhook-Events aktualisieren
            </button>

            {webhookLoading ? (
              <div className="text-xs text-slate-500 mt-2">Lade Webhook-Events...</div>
            ) : (
              <div className="grid gap-1.5 mt-2">
                {webhookEvents.map((event) => (
                  <div key={event.id} className="border border-gray-200 rounded-lg p-2 bg-white">
                    <div className="text-xs font-semibold">{event.eventType}</div>
                    <div className="text-xs text-slate-500">
                      {event.number} · {new Date(event.receivedAt).toLocaleString('de-DE')}
                    </div>
                  </div>
                ))}
                {webhookStatus && <div className="text-xs text-slate-500">{webhookStatus}</div>}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 📞 ANRUF-PROTOKOLLE */}
      <div className="mt-6 p-6 rounded-2xl bg-white border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="m-0 text-[#0f6b74]">📞 Anruf-Protokolle & KI-Zusammenfassungen</h3>
            <p className="mt-1 text-[13px] text-slate-500">
              Automatische Transkription und Zusammenfassung aller Telefonate über Yeastar PBX
            </p>
          </div>
          <button
            className="p-3 rounded-2xl border border-gray-200 bg-white font-semibold cursor-pointer"
            onClick={() => loadCallRecordings()}
          >
            🔄 Aktualisieren
          </button>
        </div>

        {recordingsLoading ? (
          <div className="text-[13px] text-gray-500 py-3">Lade Anruf-Protokolle…</div>
        ) : callRecordings.length === 0 ? (
          <div className="text-[13px] text-gray-500 bg-slate-50 border border-gray-200 rounded-xl p-4">
            {recordingsStatus}
          </div>
        ) : (
          <div className="grid gap-3">
            {callRecordings.map((rec) => {
              const st = statusLabel(rec.status);
              const isExpanded = expandedRecording === rec.id;
              return (
                <div key={rec.id} className="border border-gray-200 rounded-xl bg-slate-50 overflow-hidden">
                  {/* Header row */}
                  <div
                    className={`flex items-center gap-3 px-4 py-3.5 ${rec.status === 'done' ? 'cursor-pointer' : ''}`}
                    onClick={() => rec.status === 'done' && setExpandedRecording(isExpanded ? null : rec.id)}
                  >
                    <div className="text-xl shrink-0">
                      {rec.direction === 'inbound' ? '📥' : rec.direction === 'outbound' ? '📤' : '🔄'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">
                        {rec.caller} → {rec.callee}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {rec.started_at
                          ? new Date(rec.started_at).toLocaleString('de-DE')
                          : rec.created_at
                            ? new Date(rec.created_at).toLocaleString('de-DE')
                            : '–'}
                        {rec.duration_seconds > 0 && ` · ${formatDuration(rec.duration_seconds)}`}
                      </div>
                    </div>

                    {/* Status badge – dynamic colors kept as inline style */}
                    <span
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
                      style={{ background: st.bg, color: st.color }}
                    >
                      {st.label}
                    </span>

                    {rec.status === 'done' && (
                      <span className="text-sm text-gray-400 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                    )}
                  </div>

                  {/* Summary preview */}
                  {rec.status === 'done' && rec.summary && !isExpanded && (
                    <div className="px-4 pb-3 text-[13px] text-gray-700 leading-relaxed">
                      {rec.summary.length > 180 ? rec.summary.slice(0, 180) + '…' : rec.summary}
                    </div>
                  )}

                  {/* Error message */}
                  {rec.status === 'failed' && rec.error_message && (
                    <div className="px-4 pb-3 text-xs text-red-800">
                      Fehler: {rec.error_message}
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && rec.status === 'done' && (
                    <div className="border-t border-gray-200 p-4">
                      {rec.summary && (
                        <div className="mb-4">
                          <div className="font-bold text-[13px] text-[#0F6B74] mb-1.5">
                            🤖 KI-Zusammenfassung
                          </div>
                          <div className="text-[13px] text-gray-800 leading-relaxed bg-green-50 border border-green-200 rounded-xl p-3 whitespace-pre-wrap">
                            {rec.summary}
                          </div>
                        </div>
                      )}

                      {rec.transcript && (
                        <div>
                          <div className="font-bold text-[13px] text-gray-700 mb-1.5">
                            📝 Vollständiges Transkript
                          </div>
                          <div className="text-xs text-gray-600 leading-relaxed bg-slate-50 border border-gray-200 rounded-xl p-3 max-h-72 overflow-y-auto whitespace-pre-wrap">
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
          <div className="text-xs text-gray-500 mt-2">{recordingsStatus}</div>
        )}
      </div>

      {/* FUTURE SECTION */}
      <div className="mt-10 p-5 rounded-2xl bg-white border border-gray-200">
        <h3>🚀 Nächste Ausbaustufe</h3>
        <ul className="text-gray-500 leading-loose">
          <li>Follow-up Erinnerungen für Patienten</li>
          <li>Direkte Übergabe von Fällen ins Team</li>
        </ul>
      </div>

    </main>
  );
}
