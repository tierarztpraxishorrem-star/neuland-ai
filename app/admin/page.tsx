"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "../../lib/supabase";
import { uiTokens } from "../../components/ui/System";
import type { User } from "@supabase/supabase-js";

type UserRow = {
  id: string;
  email: string;
  role?: string;
};

type PracticeSettingsRow = {
  id?: number;
  practice_id: string | null;
  practice_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_data_url: string | null;
};

type RegistrationSettingsRow = {
  registration_title: string | null;
  registration_subtitle: string | null;
  require_first_name: boolean | null;
  require_last_name: boolean | null;
  require_terms: boolean | null;
  require_privacy: boolean | null;
  allow_product_updates: boolean | null;
  min_password_length: number | null;
  require_uppercase: boolean | null;
  require_lowercase: boolean | null;
  require_digit: boolean | null;
  require_special_char: boolean | null;
  terms_label: string | null;
  privacy_label: string | null;
  product_updates_label: string | null;
};

type InvitationRow = {
  id: string;
  invite_code: string;
  role: 'owner' | 'admin' | 'member';
  expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

type JoinRequestRow = {
  id: string;
  email: string;
  email_domain: string;
  requested_role: 'member' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

type DomainLinkRow = {
  id: string;
  domain: string;
  created_at: string;
};

type NotificationRow = {
  id: string;
  type: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

type PracticeMembershipRow = {
  practice_id: string | null;
  role: string | null;
  created_at: string | null;
};

type ListedAuthUser = {
  id: string;
  email?: string | null;
  role?: string | null;
};

type ListUsersResponse = {
  data?: {
    users?: ListedAuthUser[];
  };
};

const generateInviteCode = () => {
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `PRAXIS-${random}`;
};

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [registrationSettingsLoading, setRegistrationSettingsLoading] = useState(true);
  const [savingRegistrationSettings, setSavingRegistrationSettings] = useState(false);
  const [registrationSettingsMessage, setRegistrationSettingsMessage] = useState<string | null>(null);
  const [practiceName, setPracticeName] = useState("");
  const [practiceAddress, setPracticeAddress] = useState("");
  const [practicePhone, setPracticePhone] = useState("");
  const [practiceEmail, setPracticeEmail] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [registrationTitle, setRegistrationTitle] = useState('Konto erstellen');
  const [registrationSubtitle, setRegistrationSubtitle] = useState('Bitte Registrierungsdaten vollständig ausfüllen.');
  const [requireFirstName, setRequireFirstName] = useState(true);
  const [requireLastName, setRequireLastName] = useState(true);
  const [requireTerms, setRequireTerms] = useState(true);
  const [requirePrivacy, setRequirePrivacy] = useState(true);
  const [allowProductUpdates, setAllowProductUpdates] = useState(true);
  const [minPasswordLength, setMinPasswordLength] = useState('10');
  const [requireUppercase, setRequireUppercase] = useState(true);
  const [requireLowercase, setRequireLowercase] = useState(true);
  const [requireDigit, setRequireDigit] = useState(true);
  const [requireSpecialChar, setRequireSpecialChar] = useState(true);
  const [termsLabel, setTermsLabel] = useState('AGB akzeptieren (Pflicht)');
  const [privacyLabel, setPrivacyLabel] = useState('Datenschutz akzeptieren (Pflicht)');
  const [productUpdatesLabel, setProductUpdatesLabel] = useState('Produkt-Updates per E-Mail erhalten (optional)');
  const [activePracticeId, setActivePracticeId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviteExpiryDays, setInviteExpiryDays] = useState('14');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [invitationMessage, setInvitationMessage] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequestRow[]>([]);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [domainLinks, setDomainLinks] = useState<DomainLinkRow[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [domainMessage, setDomainMessage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const resolvePracticeId = async () => {
    const { data, error } = await supabase
      .from('practice_memberships')
      .select('practice_id, role, created_at')
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      setActivePracticeId(null);
      return null;
    }

    const rank: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    const selected = [...(data as PracticeMembershipRow[])].sort((a, b) => {
      const ra = rank[a.role || ''] ?? 99;
      const rb = rank[b.role || ''] ?? 99;
      if (ra !== rb) return ra - rb;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    })[0];

    const practiceId = selected?.practice_id || null;
    setActivePracticeId(practiceId);
    return practiceId;
  };

  const loadInvitations = async (practiceId: string) => {
    const { data, error } = await supabase
      .from('practice_invitations')
      .select('id, invite_code, role, expires_at, accepted_at, created_at')
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      setInvitationMessage('Einladungen konnten nicht geladen werden.');
      setInvitations([]);
      return;
    }

    setInvitations((data || []) as InvitationRow[]);
  };

  const loadJoinRequests = async (practiceId: string) => {
    const { data, error } = await supabase
      .from('practice_join_requests')
      .select('id, email, email_domain, requested_role, status, created_at')
      .eq('practice_id', practiceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      setDomainMessage('Beitrittsanfragen konnten nicht geladen werden.');
      setJoinRequests([]);
      return;
    }

    setJoinRequests((data || []) as JoinRequestRow[]);
  };

  const loadDomainLinks = async (practiceId: string) => {
    const { data, error } = await supabase
      .from('practice_domain_links')
      .select('id, domain, created_at')
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      setDomainLinks([]);
      return;
    }

    setDomainLinks((data || []) as DomainLinkRow[]);
  };

  const loadNotifications = async (practiceId: string) => {
    const { data } = await supabase
      .from('practice_notifications')
      .select('id, type, message, read_at, created_at')
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false })
      .limit(20);

    setNotifications((data || []) as NotificationRow[]);
  };

  const reviewJoinRequest = async (requestId: string, approve: boolean) => {
    setReviewingRequestId(requestId);
    setDomainMessage(null);
    try {
      const { error } = await supabase.rpc('review_practice_join_request', {
        p_request_id: requestId,
        p_approve: approve,
        p_role: 'member'
      });

      if (error) throw error;

      setJoinRequests((prev) => prev.filter((entry) => entry.id !== requestId));
      setDomainMessage(approve ? 'Anfrage als Member freigegeben.' : 'Anfrage abgelehnt.');
      if (activePracticeId) {
        await loadNotifications(activePracticeId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setDomainMessage(`Anfrage konnte nicht verarbeitet werden: ${message}`);
    } finally {
      setReviewingRequestId(null);
    }
  };

  const addDomainLink = async () => {
    if (!activePracticeId) return;
    const normalized = newDomain
      .trim()
      .toLowerCase()
      .replace(/^@+/, '')
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];

    if (!normalized || !normalized.includes('.')) {
      setDomainMessage('Bitte eine gültige Domain eingeben (z. B. tierarztpraxis-horrem.de).');
      return;
    }

    const { error } = await supabase
      .from('practice_domain_links')
      .upsert({ practice_id: activePracticeId, domain: normalized }, { onConflict: 'domain' });

    if (error) {
      setDomainMessage('Domain konnte nicht gespeichert werden.');
      return;
    }

    setNewDomain('');
    setDomainMessage('Domain gespeichert. Nutzer mit dieser Praxis-Mail können automatisch zugeordnet werden.');
    await loadDomainLinks(activePracticeId);
  };

  const removeDomainLink = async (id: string) => {
    const { error } = await supabase.from('practice_domain_links').delete().eq('id', id);
    if (error) {
      setDomainMessage('Domain konnte nicht entfernt werden.');
      return;
    }
    setDomainLinks((prev) => prev.filter((entry) => entry.id !== id));
  };

  const createInvitation = async () => {
    if (!activePracticeId) {
      setInvitationMessage('Keine aktive Praxis gefunden.');
      return;
    }

    setCreatingInvite(true);
    setInvitationMessage(null);

    try {
      const days = Number.parseInt(inviteExpiryDays, 10);
      const expiresAt = Number.isFinite(days) && days > 0
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const payload = {
        practice_id: activePracticeId,
        invite_code: generateInviteCode(),
        role: inviteRole,
        expires_at: expiresAt
      };

      const { data, error } = await supabase
        .from('practice_invitations')
        .insert(payload)
        .select('id, invite_code, role, expires_at, accepted_at, created_at')
        .single();

      if (error) throw error;

      setInvitations((prev) => [data as InvitationRow, ...prev]);
      setInvitationMessage('Einladungscode erstellt.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setInvitationMessage(`Einladung konnte nicht erstellt werden: ${message}`);
    } finally {
      setCreatingInvite(false);
    }
  };

  const revokeInvitation = async (id: string) => {
    const { error } = await supabase
      .from('practice_invitations')
      .delete()
      .eq('id', id);

    if (error) {
      setInvitationMessage('Einladung konnte nicht entfernt werden.');
      return;
    }

    setInvitations((prev) => prev.filter((entry) => entry.id !== id));
  };

  const copyInviteCode = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedInviteId(id);
      window.setTimeout(() => setCopiedInviteId((current) => (current === id ? null : current)), 1200);
    } catch {
      setInvitationMessage('Code konnte nicht in die Zwischenablage kopiert werden.');
    }
  };

  useEffect(() => {
    if (!user || !activePracticeId) return;

    const loadPracticeSettings = async () => {
      setSettingsLoading(true);
      const { data } = await supabase
        .from("practice_settings")
        .select("id, practice_id, practice_name, address, phone, email, logo_data_url")
        .eq('practice_id', activePracticeId)
        .maybeSingle();

      const row = (data as PracticeSettingsRow | null) || null;
      if (row) {
        setPracticeName(row.practice_name || "");
        setPracticeAddress(row.address || "");
        setPracticePhone(row.phone || "");
        setPracticeEmail(row.email || "");
        setLogoDataUrl(row.logo_data_url || "");
      }

      setSettingsLoading(false);
    };

    loadPracticeSettings();
  }, [user, activePracticeId]);

  useEffect(() => {
    if (!user) return;

    const loadRegistrationSettings = async () => {
      setRegistrationSettingsLoading(true);
      const { data } = await supabase
        .from('registration_form_settings')
        .select('registration_title, registration_subtitle, require_first_name, require_last_name, require_terms, require_privacy, allow_product_updates, min_password_length, require_uppercase, require_lowercase, require_digit, require_special_char, terms_label, privacy_label, product_updates_label')
        .eq('id', 1)
        .maybeSingle();

      const row = (data as RegistrationSettingsRow | null) || null;
      if (row) {
        setRegistrationTitle(row.registration_title || 'Konto erstellen');
        setRegistrationSubtitle(row.registration_subtitle || 'Bitte Registrierungsdaten vollständig ausfüllen.');
        setRequireFirstName(row.require_first_name ?? true);
        setRequireLastName(row.require_last_name ?? true);
        setRequireTerms(row.require_terms ?? true);
        setRequirePrivacy(row.require_privacy ?? true);
        setAllowProductUpdates(row.allow_product_updates ?? true);
        setMinPasswordLength(String(row.min_password_length ?? 10));
        setRequireUppercase(row.require_uppercase ?? true);
        setRequireLowercase(row.require_lowercase ?? true);
        setRequireDigit(row.require_digit ?? true);
        setRequireSpecialChar(row.require_special_char ?? true);
        setTermsLabel(row.terms_label || 'AGB akzeptieren (Pflicht)');
        setPrivacyLabel(row.privacy_label || 'Datenschutz akzeptieren (Pflicht)');
        setProductUpdatesLabel(row.product_updates_label || 'Produkt-Updates per E-Mail erhalten (optional)');
      }

      setRegistrationSettingsLoading(false);
    };

    loadRegistrationSettings();
  }, [user]);

  useEffect(() => {
    if (!activePracticeId) return;
    loadInvitations(activePracticeId);
    loadJoinRequests(activePracticeId);
    loadDomainLinks(activePracticeId);
    loadNotifications(activePracticeId);
  }, [activePracticeId]);

  const onLogoUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setLogoDataUrl(value);
    };
    reader.readAsDataURL(file);
  };

  const savePracticeSettings = async () => {
    setSavingSettings(true);
    setSettingsMessage(null);

    const { error } = await supabase
      .from("practice_settings")
      .upsert(
        {
          practice_id: activePracticeId,
          practice_name: practiceName || null,
          address: practiceAddress || null,
          phone: practicePhone || null,
          email: practiceEmail || null,
          logo_data_url: logoDataUrl || null
        },
        { onConflict: "practice_id" }
      );

    if (error) {
      setSettingsMessage("Speichern fehlgeschlagen.");
      setSavingSettings(false);
      return;
    }

    setSettingsMessage("Praxisdaten gespeichert.");
    setSavingSettings(false);
  };

  const saveRegistrationSettings = async () => {
    setSavingRegistrationSettings(true);
    setRegistrationSettingsMessage(null);

    const safeMinLength = Math.max(6, Number.parseInt(minPasswordLength, 10) || 10);

    const { error } = await supabase
      .from('registration_form_settings')
      .upsert(
        {
          id: 1,
          registration_title: registrationTitle || 'Konto erstellen',
          registration_subtitle: registrationSubtitle || 'Bitte Registrierungsdaten vollständig ausfüllen.',
          require_first_name: requireFirstName,
          require_last_name: requireLastName,
          require_terms: requireTerms,
          require_privacy: requirePrivacy,
          allow_product_updates: allowProductUpdates,
          min_password_length: safeMinLength,
          require_uppercase: requireUppercase,
          require_lowercase: requireLowercase,
          require_digit: requireDigit,
          require_special_char: requireSpecialChar,
          terms_label: termsLabel || 'AGB akzeptieren (Pflicht)',
          privacy_label: privacyLabel || 'Datenschutz akzeptieren (Pflicht)',
          product_updates_label: productUpdatesLabel || 'Produkt-Updates per E-Mail erhalten (optional)',
        },
        { onConflict: 'id' },
      );

    if (error) {
      setRegistrationSettingsMessage('Registrierungseinstellungen konnten nicht gespeichert werden.');
      setSavingRegistrationSettings(false);
      return;
    }

    setMinPasswordLength(String(safeMinLength));
    setRegistrationSettingsMessage('Registrierungseinstellungen gespeichert.');
    setSavingRegistrationSettings(false);
  };

  // Check if logged in
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      if (data.user) {
        await resolvePracticeId();
      }
      setLoading(false);
    };
    checkUser();
  }, []);

  // Load all users (if admin)
  useEffect(() => {
    if (!user) return;
    setUsersLoading(true);
    setUsersError(null);
    // Supabase Admin API: list all users (requires service role key in production)
    supabase.auth.admin
      ?.listUsers?.()
      .then((res: ListUsersResponse) => {
        if (res?.data?.users) {
          setUsers(
            res.data.users.map((u) => ({
              id: u.id,
              email: u.email || '-',
              role: u.role || "-"
            }))
          );
        } else {
          setUsersError("Keine Benutzer gefunden oder keine Berechtigung.");
        }
        setUsersLoading(false);
      })
      .catch(() => {
        setUsersError("Fehler beim Laden der Benutzer.");
        setUsersLoading(false);
      });
  }, [user]);

  if (loading) {
    return <div style={{ padding: uiTokens.pagePadding }}>Lade...</div>;
  }

  if (!user) {
    return <div style={{ padding: uiTokens.pagePadding }}>Nicht eingeloggt.</div>;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: uiTokens.pageBackground,
        padding: uiTokens.pagePadding,
        fontFamily: "inherit",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, color: uiTokens.brand, margin: 0, fontWeight: 700 }}>Admin Bereich</h1>
        <div style={{ marginTop: 6, fontSize: 14, color: uiTokens.textSecondary }}>
          Praxisverwaltung, Einladungen und Konfigurationen zentral verwalten.
        </div>
        <a
          href="/admin/statistik"
          style={{
            marginTop: 12,
            display: 'inline-block',
            padding: '10px 14px',
            borderRadius: 10,
            background: '#0F6B74',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Bereich Statistik öffnen
        </a>
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Praxisdaten für PDF</h2>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 18,
            border: uiTokens.cardBorder,
            display: "grid",
            gap: 10
          }}
        >
          {settingsLoading ? <div>Lade Praxisdaten...</div> : null}

          <input
            value={practiceName}
            onChange={(e) => setPracticeName(e.target.value)}
            placeholder="Praxisname"
            style={fieldStyle}
          />
          <textarea
            value={practiceAddress}
            onChange={(e) => setPracticeAddress(e.target.value)}
            placeholder="Adresse"
            style={{ ...fieldStyle, minHeight: 70 }}
          />
          <input
            value={practicePhone}
            onChange={(e) => setPracticePhone(e.target.value)}
            placeholder="Telefon"
            style={fieldStyle}
          />
          <input
            value={practiceEmail}
            onChange={(e) => setPracticeEmail(e.target.value)}
            placeholder="E-Mail"
            style={fieldStyle}
          />

          <label style={{ fontSize: 14, color: "#475569" }}>Praxislogo</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onLogoUpload(e.target.files?.[0] || null)}
          />

          {logoDataUrl ? (
            <img
              src={logoDataUrl}
              alt="Praxislogo"
              style={{ maxHeight: 80, objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}
            />
          ) : (
            <div style={{ fontSize: 13, color: "#64748b" }}>Kein Logo hinterlegt.</div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={savePracticeSettings}
              disabled={savingSettings}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "none",
                background: "#0F6B74",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600
              }}
            >
              {savingSettings ? "Speichere..." : "💾 Praxisdaten speichern"}
            </button>

            {settingsMessage ? <span style={{ fontSize: 13, color: "#0f766e" }}>{settingsMessage}</span> : null}
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Registrierung konfigurieren</h2>
        <div
          style={{
            background: 'linear-gradient(160deg, #ffffff 0%, #f6fbfb 100%)',
            borderRadius: 14,
            padding: 20,
            border: uiTokens.cardBorder,
            display: 'grid',
            gap: 14,
          }}
        >
          {registrationSettingsLoading ? <div>Lade Registrierungseinstellungen...</div> : null}

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <input
              value={registrationTitle}
              onChange={(e) => setRegistrationTitle(e.target.value)}
              placeholder='Titel im Registrieren-Tab'
              style={fieldStyle}
            />
            <input
              value={registrationSubtitle}
              onChange={(e) => setRegistrationSubtitle(e.target.value)}
              placeholder='Untertitel im Registrieren-Tab'
              style={fieldStyle}
            />
          </div>

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <ToggleChip label='Vorname abfragen' checked={requireFirstName} onChange={setRequireFirstName} />
            <ToggleChip label='Nachname abfragen' checked={requireLastName} onChange={setRequireLastName} />
            <ToggleChip label='AGB erforderlich' checked={requireTerms} onChange={setRequireTerms} />
            <ToggleChip label='Datenschutz erforderlich' checked={requirePrivacy} onChange={setRequirePrivacy} />
            <ToggleChip label='Produkt-Updates anzeigen' checked={allowProductUpdates} onChange={setAllowProductUpdates} />
            <ToggleChip label='Großbuchstabe erforderlich' checked={requireUppercase} onChange={setRequireUppercase} />
            <ToggleChip label='Kleinbuchstabe erforderlich' checked={requireLowercase} onChange={setRequireLowercase} />
            <ToggleChip label='Zahl erforderlich' checked={requireDigit} onChange={setRequireDigit} />
            <ToggleChip label='Sonderzeichen erforderlich' checked={requireSpecialChar} onChange={setRequireSpecialChar} />
          </div>

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <input
              value={minPasswordLength}
              onChange={(e) => setMinPasswordLength(e.target.value)}
              placeholder='Mindestlänge Passwort'
              style={fieldStyle}
            />
            <input
              value={termsLabel}
              onChange={(e) => setTermsLabel(e.target.value)}
              placeholder='Label AGB'
              style={fieldStyle}
            />
            <input
              value={privacyLabel}
              onChange={(e) => setPrivacyLabel(e.target.value)}
              placeholder='Label Datenschutz'
              style={fieldStyle}
            />
            <input
              value={productUpdatesLabel}
              onChange={(e) => setProductUpdatesLabel(e.target.value)}
              placeholder='Label Produkt-Updates'
              style={fieldStyle}
            />
          </div>

          <div style={{ border: '1px solid #dbeafe', borderRadius: 12, background: '#f8fbff', padding: 12 }}>
            <div style={{ fontSize: 12, color: '#1e3a8a', fontWeight: 700, marginBottom: 6 }}>Vorschau</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{registrationTitle || 'Konto erstellen'}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{registrationSubtitle || 'Bitte Registrierungsdaten vollständig ausfüllen.'}</div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#334155' }}>
              Passwortregeln: mind. {Math.max(6, Number.parseInt(minPasswordLength, 10) || 10)} Zeichen
              {requireUppercase ? ', Großbuchstabe' : ''}
              {requireLowercase ? ', Kleinbuchstabe' : ''}
              {requireDigit ? ', Zahl' : ''}
              {requireSpecialChar ? ', Sonderzeichen' : ''}.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={saveRegistrationSettings}
              disabled={savingRegistrationSettings}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: 'none',
                background: '#0F6B74',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              {savingRegistrationSettings ? 'Speichere...' : 'Registrierung speichern'}
            </button>
            {registrationSettingsMessage ? <span style={{ fontSize: 13, color: '#0f766e' }}>{registrationSettingsMessage}</span> : null}
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Automatische Praxis-Zuordnung</h2>
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 18,
            border: uiTokens.cardBorder,
            display: 'grid',
            gap: 12,
            marginBottom: 16
          }}
        >
          <div style={{ fontSize: 13, color: '#64748b' }}>
            Hinterlege Praxis-Domains. Neue Nutzer mit passender E-Mail-Domain werden automatisch als Anfrage erkannt und können von dir als Member freigegeben werden.
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder='z. B. tierarztpraxis-horrem.de'
              style={{ ...fieldStyle, flex: 1, minWidth: 280 }}
            />
            <button
              onClick={addDomainLink}
              style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: '#0F6B74', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >
              Domain speichern
            </button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {domainLinks.length === 0 ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>Noch keine Domains hinterlegt.</div>
            ) : (
              domainLinks.map((entry) => (
                <div key={entry.id} style={{ border: uiTokens.cardBorder, borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{entry.domain}</div>
                  <button
                    onClick={() => removeDomainLink(entry.id)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', cursor: 'pointer' }}
                  >
                    Entfernen
                  </button>
                </div>
              ))
            )}
          </div>

          {domainMessage ? <div style={{ fontSize: 13, color: '#0f766e' }}>{domainMessage}</div> : null}
        </div>

        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 18,
            border: uiTokens.cardBorder,
            display: 'grid',
            gap: 10
          }}
        >
          <h3 style={{ margin: 0, fontSize: 17 }}>Offene Beitrittsanfragen</h3>
          {joinRequests.length === 0 ? (
            <div style={{ fontSize: 13, color: '#64748b' }}>Aktuell keine offenen Anfragen.</div>
          ) : (
            joinRequests.map((request) => (
              <div key={request.id} style={{ border: uiTokens.cardBorder, borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 700 }}>{request.email}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>Domain: {request.email_domain} · {new Date(request.created_at).toLocaleString('de-DE')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => reviewJoinRequest(request.id, true)}
                    disabled={reviewingRequestId === request.id}
                    style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0F6B74', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Als Member freigeben
                  </button>
                  <button
                    onClick={() => reviewJoinRequest(request.id, false)}
                    disabled={reviewingRequestId === request.id}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Ablehnen
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 18,
            border: uiTokens.cardBorder,
            display: 'grid',
            gap: 8,
            marginTop: 16
          }}
        >
          <h3 style={{ margin: 0, fontSize: 17 }}>Benachrichtigungen</h3>
          {notifications.length === 0 ? (
            <div style={{ fontSize: 13, color: '#64748b' }}>Keine Benachrichtigungen.</div>
          ) : (
            notifications.map((entry) => (
              <div key={entry.id} style={{ border: uiTokens.cardBorder, borderRadius: 10, padding: 10, fontSize: 13, color: '#334155', background: entry.read_at ? '#fff' : '#f8fafc' }}>
                {entry.message}
              </div>
            ))
          )}
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Einladungen</h2>
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 18,
            border: uiTokens.cardBorder,
            display: 'grid',
            gap: 12
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px 170px', gap: 10 }}>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
              style={fieldStyle}
            >
              <option value='member'>Rolle: member</option>
              <option value='admin'>Rolle: admin</option>
            </select>

            <input
              value={inviteExpiryDays}
              onChange={(e) => setInviteExpiryDays(e.target.value)}
              placeholder='Ablauf in Tagen'
              style={fieldStyle}
            />

            <button
              onClick={createInvitation}
              disabled={creatingInvite || !activePracticeId}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#0F6B74',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {creatingInvite ? 'Erstelle...' : 'Einladung erstellen'}
            </button>
          </div>

          {invitationMessage ? <div style={{ fontSize: 13, color: '#0f766e' }}>{invitationMessage}</div> : null}

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, display: 'grid', gap: 8 }}>
            {invitations.length === 0 ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>Noch keine Einladungen vorhanden.</div>
            ) : (
              invitations.map((entry) => {
                const expired = entry.expires_at ? new Date(entry.expires_at).getTime() < Date.now() : false;
                const accepted = Boolean(entry.accepted_at);

                return (
                  <div key={entry.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{entry.invite_code}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          onClick={() => copyInviteCode(entry.id, entry.invite_code)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: '1px solid #dbe2e8',
                            background: '#fff',
                            cursor: 'pointer'
                          }}
                        >
                          {copiedInviteId === entry.id ? 'Kopiert' : 'Code kopieren'}
                        </button>

                        {!accepted && (
                          <button
                            onClick={() => revokeInvitation(entry.id)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 8,
                              border: '1px solid #fecaca',
                              background: '#fff1f2',
                              color: '#b91c1c',
                              cursor: 'pointer'
                            }}
                          >
                            Zurückziehen
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: 13, color: '#475569' }}>
                      Rolle: {entry.role} · Erstellt: {new Date(entry.created_at).toLocaleString('de-DE')}
                    </div>
                    <div style={{ fontSize: 13, color: '#475569' }}>
                      Ablauf: {entry.expires_at ? new Date(entry.expires_at).toLocaleString('de-DE') : 'kein Ablauf'}
                    </div>
                    <div style={{ fontSize: 13, color: accepted ? '#166534' : expired ? '#b45309' : '#0f766e' }}>
                      Status: {accepted ? 'angenommen' : expired ? 'abgelaufen' : 'offen'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Benutzerverwaltung */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Benutzerverwaltung 👥</h2>
        {usersLoading ? (
          <div>Lade Benutzer...</div>
        ) : usersError ? (
          <div style={{ color: "#b91c1c" }}>{usersError}</div>
        ) : (
          <table style={{ width: "100%", background: "#fff", borderRadius: 12, borderCollapse: "collapse", border: uiTokens.cardBorder }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                <th style={{ padding: 12, borderRadius: "12px 0 0 0" }}>E-Mail</th>
                <th style={{ padding: 12 }}>Rolle</th>
                <th style={{ padding: 12, borderRadius: "0 12px 0 0" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 12 }}>{u.email}</td>
                  <td style={{ padding: 12 }}>{u.role}</td>
                  <td style={{ padding: 12 }}>
                    <button style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#e11d48", color: "#fff", cursor: "pointer" }} disabled>
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Weitere Admin-Funktionen als Platzhalter */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 22,
        }}
      >
        <AdminCard title="Aktivitätsprotokoll" desc="Logins & Aktionen einsehen" icon="📜" />
        <AdminCard title="Systemeinstellungen" desc="Plattform konfigurieren" icon="⚙️" />
        <AdminCard title="Supportanfragen" desc="Tickets & Feedback" icon="🛠️" />
      </div>
    </main>
  );
}

const fieldStyle: CSSProperties = {
  width: "100%",
  border: uiTokens.cardBorder,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  background: '#fff'
};

function ToggleChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        border: checked ? '1px solid #99f6e4' : '1px solid #e2e8f0',
        background: checked ? '#f0fdfa' : '#fff',
        borderRadius: 10,
        padding: '10px 12px',
        fontSize: 13,
        color: '#334155',
        cursor: 'pointer',
      }}
    >
      <input type='checkbox' checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function AdminCard({ title, desc, icon }: { title: string; desc: string; icon: string }) {
  return (
    <div
      style={{
        background: uiTokens.cardBackground,
        padding: 26,
        borderRadius: 16,
        border: uiTokens.cardBorder,
        cursor: "pointer",
        transition: "all 0.2s ease",
        boxShadow: "none",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-5px)";
        e.currentTarget.style.boxShadow = "0 16px 40px rgba(0,0,0,0.10)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.06)";
      }}
    >
      <div style={{ fontSize: 26, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 14, color: "#6b7280" }}>{desc}</div>
    </div>
  );
}
