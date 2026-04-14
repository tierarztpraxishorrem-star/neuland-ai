'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DIAMOND_QUESTIONS } from '@/lib/diamond/questions';
import { calculateDiamondProfile, toPersistedScores } from '@/lib/diamond/scoring';
import { DIAMOND_SCALE_OPTIONS, type DiamondAnswerMap, type DiamondAnswerValue } from '@/lib/diamond/types';
import DiamondChart from './DiamondChart';
import DiamondInterpretation from './DiamondInterpretation';

type PersistedDiamondProfile = {
  answers_json: DiamondAnswerMap | null;
  completed: boolean | null;
  result_json: {
    dominant?: { cluster: string; label: string; percent: number } | null;
    topThree?: Array<{ cluster: string; label: string; percent: number }>;
    summaryText?: string;
  } | null;
  created_at?: string;
  updated_at?: string;
};

const PAGE_SIZE = 5;

export default function DiamondQuiz() {
  const [answers, setAnswers] = useState<DiamondAnswerMap>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [isFinalized, setIsFinalized] = useState(false);

  const totalPages = Math.ceil(DIAMOND_QUESTIONS.length / PAGE_SIZE);

  const pageQuestions = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return DIAMOND_QUESTIONS.slice(start, start + PAGE_SIZE);
  }, [currentPage]);

  const result = useMemo(() => calculateDiamondProfile(answers), [answers]);
  const unansweredIds = DIAMOND_QUESTIONS.filter((question) => !answers[question.id]).map((question) => question.id);
  const isComplete = unansweredIds.length === 0;

  useEffect(() => {
    const loadExistingProfile = async () => {
      setLoadingProfile(true);
      try {
        const localFinalized = typeof window !== 'undefined' && window.localStorage.getItem('personal_diamond_finalized_v1') === '1';
        if (localFinalized) {
          setIsFinalized(true);
          setStatusText('Fragebogen abgeschlossen. Dein Profil ist final gespeichert.');
        }

        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) {
          setLoadingProfile(false);
          return;
        }

        const { data, error } = await supabase
          .from('personal_diamond_profiles')
          .select('answers_json, completed, result_json, created_at, updated_at')
          .eq('user_id', authData.user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          setStatusText(`Hinweis: Profilspeicher derzeit nicht verfügbar (${error.message}).`);
        }

        const profile = data as PersistedDiamondProfile | null;
        if (profile?.answers_json && typeof profile.answers_json === 'object') {
          setAnswers(profile.answers_json);
        }

        if (profile?.result_json && typeof profile.result_json === 'object') {
          setStatusText((prev) => {
            if (prev) return prev;
            const summary = profile.result_json?.summaryText;
            return summary ? `Letztes Ergebnis geladen: ${summary}` : 'Gespeichertes Ergebnis geladen.';
          });
        }

        if (profile?.completed) {
          setIsFinalized(true);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('personal_diamond_finalized_v1', '1');
          }
          setStatusText('Fragebogen abgeschlossen. Dein Profil ist final gespeichert.');
        }
      } finally {
        setLoadingProfile(false);
      }
    };

    loadExistingProfile();
  }, []);

  const setAnswer = (questionId: string, value: DiamondAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const saveProfile = async (complete: boolean) => {
    if (complete) {
      setIsFinalized(true);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('personal_diamond_finalized_v1', '1');
      }
    }

    setSaving(true);
    setStatusText('Speichere Profil ...');
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setStatusText('Bitte zuerst einloggen.');
        return;
      }

      const now = new Date().toISOString();
      const topThree = result.topThree.map((entry) => ({
        cluster: entry.cluster,
        label: entry.label,
        percent: entry.percent,
      }));
      const resultJson = {
        dominant: result.dominant
          ? {
              cluster: result.dominant.cluster,
              label: result.dominant.label,
              percent: result.dominant.percent,
            }
          : null,
        topThree,
        summaryText: result.summaryText,
        completionPercent: result.completionPercent,
        totalAnswered: result.totalAnswered,
      };

      const { error } = await supabase.from('personal_diamond_profiles').upsert(
        {
          user_id: authData.user.id,
          answers_json: answers,
          result_json: resultJson,
          scores_json: toPersistedScores(result.scores),
          dominant_cluster: result.dominant?.cluster || null,
          top_values_json: topThree,
          summary_text: result.summaryText,
          completed: complete,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      );

      if (error) {
        setStatusText(`Speichern fehlgeschlagen: ${error.message}`);
      } else {
        setStatusText(complete ? 'Profil vollständig gespeichert.' : 'Zwischenstand gespeichert.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loadingProfile) {
    return <div style={{ padding: '18px', color: '#64748b' }}>Profil wird geladen ...</div>;
  }

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      {!isFinalized ? (
        <section
          style={{
            border: '1px solid #dbe5e6',
            background: '#ffffff',
            borderRadius: '16px',
            padding: '18px',
            display: 'grid',
            gap: '14px',
          }}
        >
          <div style={{ display: 'grid', gap: '6px' }}>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '22px' }}>Werte-Fragebogen</h2>
            <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5 }}>
              Beantworte 40 Fragen auf einer 6-stufigen Skala. Dein Profil wird live berechnet.
            </p>
          </div>

          <div style={{ display: 'grid', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#334155' }}>
              <span>Fortschritt</span>
              <span>{result.totalAnswered} / {DIAMOND_QUESTIONS.length} ({result.completionPercent}%)</span>
            </div>
            <div style={{ background: '#e2e8f0', borderRadius: '999px', height: '10px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${result.completionPercent}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #0f6b74 0%, #22c55e 100%)',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', display: 'grid', gap: '12px' }}>
            {pageQuestions.map((question, index) => {
              const absoluteIndex = currentPage * PAGE_SIZE + index + 1;
              const currentValue = answers[question.id];

              return (
                <div key={question.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
                    {absoluteIndex}. {question.text}
                  </div>

                  <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                    {DIAMOND_SCALE_OPTIONS.map((option) => {
                      const selected = currentValue === option.value;
                      return (
                        <button
                          key={option.value}
                          onClick={() => setAnswer(question.id, option.value)}
                          style={{
                            border: selected ? '2px solid #0f6b74' : '1px solid #cbd5e1',
                            background: selected ? '#ecfeff' : '#ffffff',
                            color: '#0f172a',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            fontWeight: selected ? 700 : 500,
                            fontSize: '14px',
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
              disabled={currentPage === 0}
              style={{
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                borderRadius: '10px',
                padding: '10px 14px',
                cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 0 ? 0.5 : 1,
                fontWeight: 600,
              }}
            >
              Zurück
            </button>

            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
              disabled={currentPage >= totalPages - 1}
              style={{
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                borderRadius: '10px',
                padding: '10px 14px',
                cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage >= totalPages - 1 ? 0.5 : 1,
                fontWeight: 600,
              }}
            >
              Weiter
            </button>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => saveProfile(false)}
                disabled={saving}
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                }}
              >
                Zwischenstand speichern
              </button>

              <button
                onClick={() => saveProfile(true)}
                disabled={saving || !isComplete}
                style={{
                  border: 'none',
                  background: '#0f6b74',
                  color: '#ffffff',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  cursor: saving || !isComplete ? 'not-allowed' : 'pointer',
                  opacity: saving || !isComplete ? 0.6 : 1,
                  fontWeight: 700,
                }}
              >
                Profil berechnen und speichern
              </button>
            </div>
          </div>

          <div style={{ color: '#64748b', fontSize: '13px' }}>
            Seite {currentPage + 1} von {totalPages}. {statusText || (isComplete ? 'Alle Fragen beantwortet.' : `${unansweredIds.length} Fragen sind noch offen.`)}
          </div>
        </section>
      ) : (
        <section
          style={{
            border: '1px solid #dbe5e6',
            background: '#ffffff',
            borderRadius: '16px',
            padding: '18px',
          }}
        >
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '22px' }}>Fragebogen abgeschlossen</h2>
          <p style={{ margin: '8px 0 0', color: '#64748b', lineHeight: 1.5 }}>
            Dein persönlicher Diamant ist final berechnet und gespeichert. Der Fragebogen ist geschlossen.
          </p>
        </section>
      )}

      {isFinalized ? (
        <>
          <DiamondChart scores={result.scores} topClusterKeys={result.topThree.map((item) => item.cluster)} />
          <DiamondInterpretation dominant={result.dominant} topThree={result.topThree} scores={result.scores} summaryText={result.summaryText} />
        </>
      ) : (
        <section
          style={{
            border: '1px solid #dbe5e6',
            background: '#ffffff',
            borderRadius: '16px',
            padding: '18px',
            display: 'grid',
            gap: '8px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Ergebnis wird nach finaler Berechnung freigeschaltet</h3>
          <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5 }}>
            Der persönliche Diamant und die Interpretation werden erst gezeigt, wenn du auf „Profil berechnen und speichern“ klickst.
            So bleibt deine Bewertung unbeeinflusst und der Fragebogen wird danach geschlossen.
          </p>
        </section>
      )}
    </div>
  );
}
