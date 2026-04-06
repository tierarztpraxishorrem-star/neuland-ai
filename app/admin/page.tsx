"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "../../lib/supabase";

type UserRow = {
  id: string;
  email: string;
  role?: string;
};

type PracticeSettingsRow = {
  id: number;
  practice_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_data_url: string | null;
};


export default function AdminPage() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  // Statistik
  const [caseCount, setCaseCount] = useState<number | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [practiceName, setPracticeName] = useState("");
  const [practiceAddress, setPracticeAddress] = useState("");
  const [practicePhone, setPracticePhone] = useState("");
  const [practiceEmail, setPracticeEmail] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");

  // Statistik: Fälle zählen
  useEffect(() => {
    if (!user) return;
    supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .then(res => {
        setCaseCount(res.count ?? 0);
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const loadPracticeSettings = async () => {
      setSettingsLoading(true);
      const { data } = await supabase
        .from("practice_settings")
        .select("id, practice_name, address, phone, email, logo_data_url")
        .limit(1)
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
  }, [user]);

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
          id: 1,
          practice_name: practiceName || null,
          address: practiceAddress || null,
          phone: practicePhone || null,
          email: practiceEmail || null,
          logo_data_url: logoDataUrl || null
        },
        { onConflict: "id" }
      );

    if (error) {
      setSettingsMessage("Speichern fehlgeschlagen.");
      setSavingSettings(false);
      return;
    }

    setSettingsMessage("Praxisdaten gespeichert.");
    setSavingSettings(false);
  };

  // Check if logged in
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
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
      .then((res: any) => {
        if (res?.data?.users) {
          setUsers(
            res.data.users.map((u: any) => ({
              id: u.id,
              email: u.email,
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
    return <div style={{ padding: 40 }}>Lade...</div>;
  }

  if (!user) {
    return <div style={{ padding: 40 }}>Nicht eingeloggt.</div>;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f4f7f8 0%, #eef3f4 100%)",
        padding: 40,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 28, color: "#0F6B74", marginBottom: 24 }}>
        Admin Bereich
      </h1>

      {/* STATISTIK */}
      <section style={{
        marginBottom: 40,
        display: 'flex',
        gap: 32,
        flexWrap: 'wrap',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          minWidth: 220,
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: 15, color: '#6b7280', marginBottom: 6 }}>Aufnahmen / Fälle</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0F6B74' }}>{caseCount === null ? '...' : caseCount}</div>
        </div>
        <div style={{
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          minWidth: 220,
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: 15, color: '#6b7280', marginBottom: 6 }}>Eingesparte Zeit</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0F6B74' }}>{caseCount === null ? '...' : `${caseCount * 15} min`}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            (bei 15 Minuten pro Fall)
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Praxisdaten fuer PDF</h2>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 18,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
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

      {/* Benutzerverwaltung */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Benutzerverwaltung 👥</h2>
        {usersLoading ? (
          <div>Lade Benutzer...</div>
        ) : usersError ? (
          <div style={{ color: "#b91c1c" }}>{usersError}</div>
        ) : (
          <table style={{ width: "100%", background: "#fff", borderRadius: 12, borderCollapse: "collapse", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
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
  border: "1px solid #dbe2e8",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14
};

function AdminCard({ title, desc, icon }: { title: string; desc: string; icon: string }) {
  return (
    <div
      style={{
        background: "#fff",
        padding: 26,
        borderRadius: 18,
        border: "1px solid #e5e7eb",
        cursor: "pointer",
        transition: "all 0.2s ease",
        boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
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
