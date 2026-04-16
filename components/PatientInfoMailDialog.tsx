'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buildPatientMailHtml,
  buildPatientMailSubject,
  type PracticeBrand,
} from '@/lib/patientMailTemplate';

type Props = {
  open: boolean;
  onClose: () => void;
  defaultText: string;
  practice: PracticeBrand;
  patientName?: string;
  ownerName?: string;
};

async function fetchWithAuth(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Nicht angemeldet.');
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

export default function PatientInfoMailDialog({
  open,
  onClose,
  defaultText,
  practice,
  patientName,
  ownerName,
}: Props) {
  const [to, setTo] = useState('');
  const [recipientName, setRecipientName] = useState(ownerName || '');
  const [subject, setSubject] = useState(buildPatientMailSubject(patientName));
  const [body, setBody] = useState(defaultText);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      setTo('');
      setRecipientName(ownerName || '');
      setSubject(buildPatientMailSubject(patientName));
      setBody(defaultText);
      setPreview(false);
      setStatus(null);
    }
  }, [open, defaultText, patientName, ownerName]);

  const previewHtml = useMemo(
    () =>
      buildPatientMailHtml({
        text: body,
        practice,
        patientName,
        ownerName: recipientName || undefined,
      }),
    [body, practice, patientName, recipientName]
  );

  if (!open) return null;

  async function handleSend() {
    setStatus(null);
    const trimmedTo = to.trim();
    if (!trimmedTo || !trimmedTo.includes('@')) {
      setStatus({ type: 'error', text: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
      return;
    }
    if (!subject.trim()) {
      setStatus({ type: 'error', text: 'Betreff fehlt.' });
      return;
    }
    if (!body.trim()) {
      setStatus({ type: 'error', text: 'Inhalt fehlt.' });
      return;
    }

    const html = buildPatientMailHtml({
      text: body,
      practice,
      patientName,
      ownerName: recipientName || undefined,
    });

    try {
      setSending(true);
      const res = await fetchWithAuth('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: trimmedTo,
          subject: subject.trim(),
          body: html,
          isHtml: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Versand fehlgeschlagen.');
      setStatus({ type: 'success', text: '✅ E-Mail wurde versendet.' });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : 'Unbekannter Fehler' });
    } finally {
      setSending(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    fontSize: 14,
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#64748b',
    marginBottom: 6,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          padding: 24,
          display: 'grid',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0F6B74' }}>
              ✉️ Patienteninformation per Mail senden
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Versand über <strong>empfang@tzn-bergheim.de</strong>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              color: '#64748b',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        <div>
          <label style={labelStyle}>Empfänger-E-Mail*</label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@beispiel.de"
            style={inputStyle}
            autoFocus
          />
        </div>

        <div>
          <label style={labelStyle}>Anrede-Name (optional)</label>
          <input
            type="text"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="z. B. Frau Müller"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Betreff</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Inhalt</label>
            <button
              type="button"
              onClick={() => setPreview((v) => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 12,
                color: '#0F6B74',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {preview ? '✏️ Bearbeiten' : '👁 Vorschau'}
            </button>
          </div>
          {preview ? (
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                height: 360,
                overflow: 'auto',
                background: '#f4f7f8',
              }}
            >
              <iframe
                title="Mail-Vorschau"
                srcDoc={previewHtml}
                style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
              />
            </div>
          ) : (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ ...inputStyle, minHeight: 260, fontFamily: 'inherit', lineHeight: 1.6 }}
            />
          )}
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            Leerzeilen trennen Absätze. Die Mail wird mit Praxis-Header und Signatur verschickt.
          </div>
        </div>

        {status && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              fontSize: 13,
              background: status.type === 'error' ? '#fef2f2' : '#ecfdf5',
              color: status.type === 'error' ? '#b91c1c' : '#166534',
              border: `1px solid ${status.type === 'error' ? '#fca5a5' : '#86efac'}`,
            }}
          >
            {status.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid #e5e7eb',
              background: '#fff',
              color: '#64748b',
              fontSize: 14,
              fontWeight: 600,
              cursor: sending ? 'wait' : 'pointer',
            }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: 'none',
              background: sending ? '#94a3b8' : '#0F6B74',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: sending ? 'wait' : 'pointer',
            }}
          >
            {sending ? 'Sendet…' : '✉️ Senden'}
          </button>
        </div>
      </div>
    </div>
  );
}
