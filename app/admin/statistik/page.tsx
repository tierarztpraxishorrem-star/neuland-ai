'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import { supabase } from '../../../lib/supabase';
import { uiTokens } from '../../../components/ui/System';

// ───────────────────────── Types ─────────────────────────

type DayCount = { date: string; count: number };

type Stats = {
  practiceId: string;
  updatedAt: string;
  days: number;
  konsultationen: {
    heute: number;
    zeitraum: number;
    trend: number;
    proTag: DayCount[];
  };
  team: {
    proMitarbeiter: {
      userId: string;
      name: string;
      konsultationen: number;
      patientenbriefe: number;
      durchschnittMinuten: number;
    }[];
  };
  vorlagen: {
    nutzungsrate: number;
    top5: { name: string; count: number }[];
    ohneVorlage: number;
  };
  zeit: {
    durchschnittMinutenProFall: number;
    gesparteStunden: number;
    gesparteMinuten: number;
    patientenbriefeErstellt: number;
    verteilungNachDauer: { bucket: string; count: number }[];
  };
  vetmind: {
    chatsGesamt: number;
    chatsZeitraum: number;
    proTag: DayCount[];
    aktivNutzer: number;
  };
  qualitaet: {
    vollstaendig: number;
    fehlendePflichtfelder: number;
    ohnePatientenbrief: number;
    score: number;
  };
};

// ───────────────────────── Constants ─────────────────────────

const BRAND = '#0f6b74';
const BRAND_LIGHT = '#14b8a6';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const GRAY = '#94a3b8';

const PERIOD_OPTIONS: { label: string; days: number }[] = [
  { label: 'Heute', days: 1 },
  { label: '7 Tage', days: 7 },
  { label: '30 Tage', days: 30 },
  { label: '90 Tage', days: 90 },
];

const PIE_COLORS = [BRAND, BRAND_LIGHT, GREEN, AMBER, GRAY];

// ───────────────────────── Page ─────────────────────────

export default function AdminStatistikPage() {
  const [stats, setStats] = useState<Stats | null>(null);
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
      const res = await fetch(`/api/admin/stats?days=${d}`, {
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

  const handlePeriod = (d: number) => {
    setDays(d);
  };

  // Short date label for charts
  const shortDate = (d: string) => {
    const parts = d.split('-');
    return `${parts[2]}.${parts[1]}.`;
  };

  return (
    <main style={{ minHeight: '100vh', background: uiTokens.pageBackground, padding: '24px 16px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: BRAND, margin: 0 }}>Admin Statistik</h1>
            <div style={{ fontSize: 13, color: GRAY, marginTop: 4 }}>
              KPIs, Trends, Team-Produktivität, VetMind
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => handlePeriod(p.days)}
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
            <button
              type="button"
              onClick={() => load(days)}
              style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, color: BRAND, fontWeight: 600 }}
            >
              🔄
            </button>
            <Link href="/admin" style={{ padding: '7px 14px', borderRadius: 10, background: '#f1f5f9', color: '#334155', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
              ← Admin
            </Link>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{ padding: 14, borderRadius: 12, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 14, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* ── Loading Skeletons ── */}
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
            {/* ── KPI Cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
              <KpiCard
                label="Konsultationen"
                value={stats.konsultationen.zeitraum}
                sub={`Heute: ${stats.konsultationen.heute}`}
                trend={stats.konsultationen.trend}
              />
              <KpiCard
                label="VetMind Chats"
                value={stats.vetmind.chatsZeitraum}
                sub={`${stats.vetmind.aktivNutzer} aktive Nutzer`}
              />
              <KpiCard
                label="Gesparte Zeit"
                value={`${stats.zeit.gesparteStunden}h ${stats.zeit.gesparteMinuten}m`}
                sub={`Ø ${stats.zeit.durchschnittMinutenProFall} min/Fall`}
                isText
              />
              <KpiCard
                label="Patientenbriefe"
                value={stats.zeit.patientenbriefeErstellt}
                sub={`${stats.vorlagen.nutzungsrate}% nutzen Vorlagen`}
              />
            </div>

            {/* ── Konsultationen pro Tag ── */}
            <SectionCard title="Konsultationen im Zeitverlauf">
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={stats.konsultationen.proTag} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: GRAY }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: GRAY }} />
                    <Tooltip
                      formatter={(v) => [v, 'Konsultationen']}
                      labelFormatter={(l) => `Datum: ${l}`}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13 }}
                    />
                    <Bar dataKey="count" fill={BRAND} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            {/* ── 2-Column: Team + Vorlagen ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 16 }}>

              {/* Team */}
              <SectionCard title="Team-Produktivität">
                {stats.team.proMitarbeiter.length === 0 ? (
                  <div style={{ color: GRAY, fontSize: 13 }}>Keine Daten im Zeitraum.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {stats.team.proMitarbeiter.map((m) => {
                      const max = stats.team.proMitarbeiter[0]?.konsultationen || 1;
                      return (
                        <div key={m.userId}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#334155', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600 }}>{m.name}</span>
                            <span>{m.konsultationen} Kons. · {m.patientenbriefe} Briefe · Ø {m.durchschnittMinuten}m</span>
                          </div>
                          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999 }}>
                            <div style={{ width: `${Math.max(3, (m.konsultationen / max) * 100)}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${BRAND} 0%, ${BRAND_LIGHT} 100%)` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>

              {/* Vorlagen */}
              <SectionCard title="Vorlagen-Nutzung">
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ width: 160, height: 160 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Mit Vorlage', value: stats.vorlagen.nutzungsrate },
                            { name: 'Ohne Vorlage', value: 100 - stats.vorlagen.nutzungsrate },
                          ]}
                          dataKey="value"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          startAngle={90}
                          endAngle={-270}
                        >
                          <Cell fill={BRAND} />
                          <Cell fill="#e2e8f0" />
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ textAlign: 'center', marginTop: -85, fontSize: 22, fontWeight: 700, color: BRAND }}>
                      {stats.vorlagen.nutzungsrate}%
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <div style={{ fontSize: 12, color: GRAY, marginBottom: 8 }}>Top-Vorlagen</div>
                    {stats.vorlagen.top5.length === 0 ? (
                      <div style={{ fontSize: 13, color: GRAY }}>Keine Daten.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {stats.vorlagen.top5.map((t, i) => (
                          <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span style={{ width: 8, height: 8, borderRadius: 999, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                              <span style={{ color: '#334155' }}>{t.name}</span>
                            </span>
                            <span style={{ fontWeight: 700, color: BRAND }}>{t.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: AMBER, marginTop: 8 }}>
                      {stats.vorlagen.ohneVorlage} Fälle ohne Vorlage
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* ── 2-Column: VetMind + Zeiteffizienz ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 16 }}>

              {/* VetMind */}
              <SectionCard title="VetMind-Nutzung">
                <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                  <MiniStat label="Chats gesamt" value={String(stats.vetmind.chatsGesamt)} />
                  <MiniStat label="Im Zeitraum" value={String(stats.vetmind.chatsZeitraum)} />
                  <MiniStat label="Aktive Nutzer" value={String(stats.vetmind.aktivNutzer)} />
                </div>
                <div style={{ width: '100%', height: 180 }}>
                  <ResponsiveContainer>
                    <AreaChart data={stats.vetmind.proTag} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradVetmind" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={BRAND_LIGHT} stopOpacity={0.4} />
                          <stop offset="95%" stopColor={BRAND_LIGHT} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: GRAY }} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: GRAY }} />
                      <Tooltip
                        formatter={(v) => [v, 'VetMind Chats']}
                        labelFormatter={(l) => `Datum: ${l}`}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
                      />
                      <Area type="monotone" dataKey="count" stroke={BRAND_LIGHT} fill="url(#gradVetmind)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              {/* Zeiteffizienz */}
              <SectionCard title="Zeiteffizienz">
                <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                  <MiniStat label="Ø pro Fall" value={`${stats.zeit.durchschnittMinutenProFall} min`} />
                  <MiniStat label="Gespart" value={`${stats.zeit.gesparteStunden}h ${stats.zeit.gesparteMinuten}m`} />
                  <MiniStat label="Briefe" value={String(stats.zeit.patientenbriefeErstellt)} />
                </div>
                <div style={{ width: '100%', height: 180 }}>
                  <ResponsiveContainer>
                    <BarChart data={stats.zeit.verteilungNachDauer} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: GRAY }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: GRAY }} />
                      <Tooltip
                        formatter={(v) => [v, 'Fälle']}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        <Cell fill={GREEN} />
                        <Cell fill={AMBER} />
                        <Cell fill={RED} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            </div>

            {/* ── Datenqualität ── */}
            <SectionCard title="Datenqualität">
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: 110, height: 110 }}>
                  <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={stats.qualitaet.score >= 70 ? GREEN : stats.qualitaet.score >= 40 ? AMBER : RED}
                      strokeWidth="3"
                      strokeDasharray={`${stats.qualitaet.score}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
                    {stats.qualitaet.score}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <QualityRow icon="✓" label="Vollständig" value={stats.qualitaet.vollstaendig} color={GREEN} />
                  <QualityRow icon="⚠" label="Fehlende Pflichtfelder" value={stats.qualitaet.fehlendePflichtfelder} color={AMBER} />
                  <QualityRow icon="✉" label="Ohne Patientenbrief" value={stats.qualitaet.ohnePatientenbrief} color={RED} />
                </div>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </main>
  );
}

// ───────────────────────── Components ─────────────────────────

function KpiCard({ label, value, sub, trend, isText }: { label: string; value: string | number; sub?: string; trend?: number; isText?: boolean }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: GRAY, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: isText ? 24 : 32, fontWeight: 700, color: BRAND, lineHeight: 1.1 }}>{value}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        {sub && <span style={{ fontSize: 12, color: GRAY }}>{sub}</span>}
        {trend !== undefined && trend !== 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: trend > 0 ? '#22c55e' : '#ef4444' }}>
            {trend > 0 ? '▲' : '▼'} {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: GRAY }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: BRAND }}>{value}</div>
    </div>
  );
}

function QualityRow({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
      <span style={{ color, fontWeight: 700 }}>{icon}</span>
      <span style={{ color: '#334155' }}>{label}:</span>
      <span style={{ fontWeight: 700, color: '#0f172a' }}>{value}</span>
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
