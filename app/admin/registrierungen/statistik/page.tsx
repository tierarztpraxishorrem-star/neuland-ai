'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import { supabase } from '../../../../lib/supabase';

// ───────────────────────── Types ─────────────────────────

type DayCount = { date: string; count: number };
type NameCount = { name: string; count: number };
type TimeCount = { time: string; count: number };

type RegStats = {
  gesamt: number;
  zeitraum: number;
  tiereZeitraum: number;
  proTag: DayCount[];
  tierarten: NameCount[];
  topRassen: NameCount[];
  versicherung: {
    quote: number;
    versichert: number;
    gesamt: number;
    versicherer: NameCount[];
    abtretungen: number;
    direktabrechnung: number;
  };
  aufmerksam: NameCount[];
  haustierarzt: { quote: number; mitArzt: number; gesamt: number };
  herkunft: NameCount[];
  terminzeiten: TimeCount[];
  status: Record<string, number>;
};

// ───────────────────────── Constants ─────────────────────────

const BRAND = '#0f6b74';
const BRAND_LIGHT = '#14b8a6';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const GRAY = '#94a3b8';

const PIE_COLORS = [BRAND, BRAND_LIGHT, GREEN, AMBER, '#8b5cf6', '#ec4899', '#f97316', '#06b6d4', '#84cc16', '#6366f1'];

const PERIOD_OPTIONS: { label: string; days: number }[] = [
  { label: '7 Tage', days: 7 },
  { label: '30 Tage', days: 30 },
  { label: '90 Tage', days: 90 },
  { label: '1 Jahr', days: 365 },
];

// ───────────────────────── Page ─────────────────────────

export default function RegistrierungStatistikPage() {
  const [stats, setStats] = useState<RegStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Bitte einloggen.');
      const res = await fetch(`/api/admin/registration-stats?days=${d}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fehler beim Laden.');
      setStats(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  const shortDate = (d: string) => {
    const parts = d.split('-');
    return `${parts[2]}.${parts[1]}.`;
  };

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafb', padding: '24px 16px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: BRAND, margin: 0 }}>Registrierungs-Statistik</h1>
            <div style={{ fontSize: 13, color: GRAY, marginTop: 4 }}>
              Auswertung aller Neukundenregistrierungen
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 10,
                  border: days === p.days ? `2px solid ${BRAND}` : '1px solid #e5e7eb',
                  background: days === p.days ? BRAND : '#fff',
                  color: days === p.days ? '#fff' : '#334155',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
            <Link href="/admin/registrierungen" style={{ padding: '7px 14px', borderRadius: 10, background: '#f1f5f9', color: '#334155', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
              Registrierungen
            </Link>
          </div>
        </div>

        {error && (
          <div style={{ padding: 14, borderRadius: 12, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 14, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading && !stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ ...cardStyle, height: 100 }}>
                <div style={{ width: '60%', height: 14, background: '#e2e8f0', borderRadius: 6, marginBottom: 12 }} />
                <div style={{ width: '40%', height: 28, background: '#e2e8f0', borderRadius: 6 }} />
              </div>
            ))}
          </div>
        )}

        {stats && (
          <>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
              <KpiCard label="Registrierungen" value={stats.zeitraum} sub={`Gesamt: ${stats.gesamt}`} />
              <KpiCard label="Tiere registriert" value={stats.tiereZeitraum} />
              <KpiCard label="Versicherungsquote" value={`${stats.versicherung.quote}%`} sub={`${stats.versicherung.versichert} von ${stats.versicherung.gesamt}`} isText />
              <KpiCard label="Haustierarzt-Quote" value={`${stats.haustierarzt.quote}%`} sub={`${stats.haustierarzt.mitArzt} von ${stats.haustierarzt.gesamt}`} isText />
              <KpiCard label="Abtretungen" value={stats.versicherung.abtretungen} sub={`${stats.versicherung.direktabrechnung} Direktabr.`} />
            </div>

            {/* Registrierungen pro Tag */}
            <SectionCard title="Registrierungen im Zeitverlauf">
              {stats.proTag.length === 0 ? (
                <div style={{ color: GRAY, fontSize: 13 }}>Keine Daten im Zeitraum.</div>
              ) : (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={stats.proTag} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: GRAY }} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: GRAY }} />
                      <Tooltip
                        formatter={(v) => [v, 'Registrierungen']}
                        labelFormatter={(l) => `Datum: ${l}`}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13 }}
                      />
                      <Bar dataKey="count" fill={BRAND} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>

            {/* 2-Column: Tierarten + Aufmerksam */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 16 }}>

              {/* Tierarten */}
              <SectionCard title="Tierarten-Verteilung">
                {stats.tierarten.length === 0 ? (
                  <div style={{ color: GRAY, fontSize: 13 }}>Keine Daten.</div>
                ) : (
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ width: 180, height: 180 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={stats.tierarten}
                            dataKey="count"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={false}
                            labelLine={false}
                            style={{ fontSize: 11 }}
                          >
                            {stats.tierarten.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      {stats.tierarten.map((t, i) => (
                        <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                            <span style={{ color: '#334155' }}>{t.name}</span>
                          </span>
                          <span style={{ fontWeight: 700, color: BRAND }}>{t.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* Aufmerksam geworden */}
              <SectionCard title="Wie aufmerksam geworden?">
                {stats.aufmerksam.length === 0 ? (
                  <div style={{ color: GRAY, fontSize: 13 }}>Keine Daten.</div>
                ) : (
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ width: 180, height: 180 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={stats.aufmerksam}
                            dataKey="count"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={false}
                            labelLine={false}
                            style={{ fontSize: 11 }}
                          >
                            {stats.aufmerksam.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      {stats.aufmerksam.map((t, i) => (
                        <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                            <span style={{ color: '#334155' }}>{t.name}</span>
                          </span>
                          <span style={{ fontWeight: 700, color: BRAND }}>{t.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>

            {/* 2-Column: Versicherer + Top-Rassen */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 16 }}>

              {/* Versicherer */}
              <SectionCard title="Versicherungsanbieter">
                {stats.versicherung.versicherer.length === 0 ? (
                  <div style={{ color: GRAY, fontSize: 13 }}>Keine versicherten Tiere im Zeitraum.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {stats.versicherung.versicherer.map((v) => {
                      const max = stats.versicherung.versicherer[0]?.count || 1;
                      return (
                        <div key={v.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#334155', marginBottom: 3 }}>
                            <span style={{ fontWeight: 600 }}>{v.name}</span>
                            <span style={{ fontWeight: 700, color: BRAND }}>{v.count}</span>
                          </div>
                          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999 }}>
                            <div style={{ width: `${Math.max(3, (v.count / max) * 100)}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${BRAND} 0%, ${BRAND_LIGHT} 100%)` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>

              {/* Top-Rassen */}
              <SectionCard title="Top 10 Rassen">
                {stats.topRassen.length === 0 ? (
                  <div style={{ color: GRAY, fontSize: 13 }}>Keine Rassen-Daten.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {stats.topRassen.map((r, i) => {
                      const max = stats.topRassen[0]?.count || 1;
                      return (
                        <div key={r.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#334155', marginBottom: 3 }}>
                            <span>
                              <span style={{ color: GRAY, marginRight: 6 }}>{i + 1}.</span>
                              <span style={{ fontWeight: 600 }}>{r.name}</span>
                            </span>
                            <span style={{ fontWeight: 700, color: BRAND }}>{r.count}</span>
                          </div>
                          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999 }}>
                            <div style={{ width: `${Math.max(3, (r.count / max) * 100)}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${GREEN} 0%, ${BRAND_LIGHT} 100%)` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* 2-Column: Herkunft + Terminzeiten */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 16 }}>

              {/* Regionale Herkunft */}
              <SectionCard title="Regionale Herkunft (Top 10)">
                {stats.herkunft.length === 0 ? (
                  <div style={{ color: GRAY, fontSize: 13 }}>Keine PLZ-Daten.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {stats.herkunft.map((h) => {
                      const max = stats.herkunft[0]?.count || 1;
                      return (
                        <div key={h.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#334155', marginBottom: 3 }}>
                            <span style={{ fontWeight: 600 }}>{h.name}</span>
                            <span style={{ fontWeight: 700, color: BRAND }}>{h.count}</span>
                          </div>
                          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999 }}>
                            <div style={{ width: `${Math.max(3, (h.count / max) * 100)}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${AMBER} 0%, ${GREEN} 100%)` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>

              {/* Terminzeiten */}
              <SectionCard title="Beliebteste Terminzeiten">
                {stats.terminzeiten.length === 0 ? (
                  <div style={{ color: GRAY, fontSize: 13 }}>Keine Termindaten.</div>
                ) : (
                  <div style={{ width: '100%', height: 240 }}>
                    <ResponsiveContainer>
                      <BarChart data={stats.terminzeiten} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="time" tick={{ fontSize: 10, fill: GRAY }} interval={0} angle={-45} textAnchor="end" height={60} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: GRAY }} />
                        <Tooltip
                          formatter={(v) => [v, 'Termine']}
                          contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13 }}
                        />
                        <Bar dataKey="count" fill={BRAND_LIGHT} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Status */}
            <SectionCard title="Bearbeitungsstatus">
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {Object.entries(stats.status).map(([key, count]) => {
                  const labels: Record<string, string> = { pending: 'Offen', processed: 'Bearbeitet', archived: 'Archiviert' };
                  const colors: Record<string, string> = { pending: AMBER, processed: GREEN, archived: GRAY };
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 999, background: colors[key] || GRAY }} />
                      <span style={{ fontSize: 14, color: '#334155' }}>{labels[key] || key}</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: BRAND }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </main>
  );
}

// ───────────────────────── Components ─────────────────────────

function KpiCard({ label, value, sub, isText }: { label: string; value: string | number; sub?: string; isText?: boolean }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: GRAY, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: isText ? 24 : 32, fontWeight: 700, color: BRAND, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: GRAY, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

// ───────────────────────── Styles ─────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #e5e7eb',
  padding: 18,
};
