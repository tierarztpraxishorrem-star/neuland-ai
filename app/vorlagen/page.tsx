'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { uiTokens } from '../../components/ui/System';

const SUPERADMIN_EMAIL = 'info@tierarztpraxis-horrem.de';

export default function VorlagenPage() {
  const [templates, setTemplates] = useState<any[]>([]);
    const [hiddenTemplateIds, setHiddenTemplateIds] = useState<string[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [userEmail, setUserEmail] = useState('');
    const [userId, setUserId] = useState('');
    const [activePracticeId, setActivePracticeId] = useState<string | null>(null);

    const [assistantLoading, setAssistantLoading] = useState(false);
    const [assistantMessage, setAssistantMessage] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [category, setCategory] = useState('clinical');
    const [scope, setScope] = useState<'private' | 'practice'>('private');
    const [wizardStep, setWizardStep] = useState(1);
    const [wizardAnswers, setWizardAnswers] = useState({
      ziel: '',
      zielgruppe: '',
      tonalitaet: '',
      abschnitte: '',
      mussEnthalten: '',
      vermeiden: '',
      outputFormat: ''
    });

    // Expert mode (owner only)
    const [content, setContent] = useState('');
    const [untersuchung, setUntersuchung] = useState('');

    // Edit state
    const [editName, setEditName] = useState('');
    const [editCategory, setEditCategory] = useState('clinical');
    const [editScope, setEditScope] = useState<'private' | 'practice'>('private');
    const [editInstruction, setEditInstruction] = useState('');
    const [editContent, setEditContent] = useState('');
    const [editUntersuchung, setEditUntersuchung] = useState('');

    const isSuperadmin = userEmail.toLowerCase() === SUPERADMIN_EMAIL;

    const loadTemplates = async () => {
      await supabase.from('templates').update({ category: 'internal' }).eq('category', 'admin');

      const { data } = await supabase
        .from('templates')
        .select('*')
        .order('created_at', { ascending: false });

      const hidden = new Set(hiddenTemplateIds);
      setTemplates(((data || []) as any[]).filter((t) => !hidden.has(t.id)));
    };

    const getAccessToken = async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || null;
    };

    useEffect(() => {
      const bootstrap = async () => {
        const { data: userData } = await supabase.auth.getUser();
        setUserEmail(userData.user?.email || '');
        setUserId(userData.user?.id || '');

        const { data: hiddenData } = await supabase.from('template_visibility_prefs').select('template_id');
        setHiddenTemplateIds((hiddenData || []).map((row: any) => row.template_id));

        const { data: memberships } = await supabase
          .from('practice_memberships')
          .select('practice_id, role, created_at')
          .order('created_at', { ascending: true });

        if (memberships && memberships.length > 0) {
          const rank: Record<string, number> = { owner: 0, admin: 1, member: 2 };
          const selected = [...memberships].sort((a: any, b: any) => {
            const ra = rank[a.role] ?? 99;
            const rb = rank[b.role] ?? 99;
            if (ra !== rb) return ra - rb;
            return String(a.created_at || '').localeCompare(String(b.created_at || ''));
          })[0];
          setActivePracticeId(selected?.practice_id || null);
        }
      };

      bootstrap();
    }, []);

    useEffect(() => {
      loadTemplates();
    }, [hiddenTemplateIds]);

    const createTemplateWithAssistant = async () => {
      if (!name.trim()) {
        alert('Bitte einen Namen eingeben.');
        return;
      }
      if (scope === 'practice' && !activePracticeId) {
        alert('Keine zugeordnete Praxis gefunden.');
        return;
      }

      setAssistantLoading(true);
      setAssistantMessage(null);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Nicht eingeloggt.');

        const res = await fetch('/api/templates/assistant', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'create',
            name: name.trim(),
            category,
            scope,
            practiceId: scope === 'practice' ? activePracticeId : null,
            answers: wizardAnswers
          })
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Vorlage konnte nicht erstellt werden.');

        setAssistantMessage('Vorlage mit VetMind erstellt. Der interne Prompt bleibt verborgen.');
        setName('');
        setScope('private');
        setWizardStep(1);
        setWizardAnswers({ ziel: '', zielgruppe: '', tonalitaet: '', abschnitte: '', mussEnthalten: '', vermeiden: '', outputFormat: '' });
        await loadTemplates();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setAssistantMessage(`VetMind-Erstellung fehlgeschlagen: ${message}`);
      } finally {
        setAssistantLoading(false);
      }
    };

    const reviseTemplateWithAssistant = async () => {
      if (!editingId || !editInstruction.trim()) {
        alert('Bitte einen Aenderungswunsch eingeben.');
        return;
      }

      setAssistantLoading(true);
      setAssistantMessage(null);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Nicht eingeloggt.');

        const res = await fetch('/api/templates/assistant', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'revise',
            templateId: editingId,
            instruction: editInstruction.trim()
          })
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Aenderung fehlgeschlagen.');

        setAssistantMessage(json?.forked
          ? 'Geteilte Vorlage wurde als eigene private Kopie erstellt und mit VetMind angepasst.'
          : 'Vorlage wurde mit VetMind aktualisiert.');
        setEditInstruction('');
        await loadTemplates();
        cancelEditTemplate();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setAssistantMessage(`VetMind-Bearbeitung fehlgeschlagen: ${message}`);
      } finally {
        setAssistantLoading(false);
      }
    };

    const saveTemplate = async () => {
      if (!isSuperadmin) return;
      if (scope === 'practice' && !activePracticeId) {
        alert('Keine zugeordnete Praxis gefunden.');
        return;
      }

      const struktur = {
        untersuchung: untersuchung.split('\n').map((s) => s.trim()).filter(Boolean)
      };

      const { error } = await supabase.from('templates').insert({
        name,
        content,
        category,
        structure: struktur,
        scope,
        practice_id: scope === 'practice' ? activePracticeId : null,
        user_id: userId
      });

      if (error) {
        alert('Fehler beim Speichern');
        return;
      }

      setName('');
      setContent('');
      setUntersuchung('');
      await loadTemplates();
    };

    const deleteTemplate = async (id: string) => {
      const { error } = await supabase.from('templates').delete().eq('id', id);
      if (!error) await loadTemplates();
    };

    const hideTemplateForMe = async (id: string) => {
      if (!userId) return;
      const { error } = await supabase
        .from('template_visibility_prefs')
        .upsert({ user_id: userId, template_id: id }, { onConflict: 'user_id,template_id' });
      if (!error) {
        setHiddenTemplateIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      }
    };

    const startEditTemplate = (t: any) => {
      setEditingId(t.id);
      setEditName(t.name || '');
      setEditCategory(t.category || 'clinical');
      setEditScope(t.scope === 'practice' ? 'practice' : 'private');
      setEditInstruction('');
      setEditContent(t.content || '');
      setEditUntersuchung((t.structure?.untersuchung || []).join('\n'));
    };

    const cancelEditTemplate = () => {
      setEditingId(null);
      setEditName('');
      setEditCategory('clinical');
      setEditScope('private');
      setEditInstruction('');
      setEditContent('');
      setEditUntersuchung('');
    };

    const saveEditedTemplate = async () => {
      if (!isSuperadmin || !editingId) return;
      if (editScope === 'practice' && !activePracticeId) {
        alert('Keine zugeordnete Praxis gefunden.');
        return;
      }

      const struktur = { untersuchung: editUntersuchung.split('\n').map((s) => s.trim()).filter(Boolean) };
      const { error } = await supabase
        .from('templates')
        .update({
          name: editName,
          category: editCategory,
          scope: editScope,
          practice_id: editScope === 'practice' ? activePracticeId : null,
          content: editContent,
          structure: struktur
        })
        .eq('id', editingId);

      if (error) {
        alert('Fehler beim Aktualisieren');
        return;
      }

      cancelEditTemplate();
      await loadTemplates();
    };

    return (
      <main style={{ padding: uiTokens.pagePadding, background: uiTokens.pageBackground, minHeight: '100vh' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ color: uiTokens.brand, margin: 0, fontSize: '32px', fontWeight: 700 }}>Vorlagen</h1>
          <div style={{ marginTop: 6, color: uiTokens.textSecondary, fontSize: 14 }}>
            VetMind-gestuetzte Vorlagenverwaltung fuer privat, Praxis und globale Inhalte.
          </div>
        </div>

        {assistantMessage && (
          <div style={{ ...card, marginBottom: 16, borderColor: '#99f6e4', color: '#0f766e', background: '#f0fdfa' }}>
            {assistantMessage}
          </div>
        )}

        <div style={card}>
          <h2 style={{ margin: 0, fontSize: 22, color: uiTokens.textPrimary }}>Neue Vorlage mit VetMind-Assistent</h2>

          <input placeholder='Name' value={name} onChange={(e) => setName(e.target.value)} style={input} />

          <select value={category} onChange={(e) => setCategory(e.target.value)} style={input}>
            <option value='clinical'>Klinisch</option>
            <option value='communication'>Kommunikation</option>
            <option value='internal'>Intern</option>
          </select>

          <select value={scope} onChange={(e) => setScope(e.target.value as 'private' | 'practice')} style={input}>
            <option value='private'>Sichtbarkeit: Nur ich</option>
            <option value='practice'>Sichtbarkeit: Meine Praxis</option>
          </select>

          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>Schritt {wizardStep} von 6</div>

          {wizardStep === 1 && <input placeholder='Was soll die Vorlage erreichen?' value={wizardAnswers.ziel} onChange={(e) => setWizardAnswers((p) => ({ ...p, ziel: e.target.value }))} style={input} />}
          {wizardStep === 2 && <input placeholder='Fuer wen ist der Output gedacht?' value={wizardAnswers.zielgruppe} onChange={(e) => setWizardAnswers((p) => ({ ...p, zielgruppe: e.target.value }))} style={input} />}
          {wizardStep === 3 && <input placeholder='Ton / Stil (klar, knapp, empathisch...)' value={wizardAnswers.tonalitaet} onChange={(e) => setWizardAnswers((p) => ({ ...p, tonalitaet: e.target.value }))} style={input} />}
          {wizardStep === 4 && <textarea placeholder='Welche Abschnitte soll die Vorlage enthalten?' value={wizardAnswers.abschnitte} onChange={(e) => setWizardAnswers((p) => ({ ...p, abschnitte: e.target.value }))} style={textarea} />}
          {wizardStep === 5 && <textarea placeholder='Was MUSS enthalten sein?' value={wizardAnswers.mussEnthalten} onChange={(e) => setWizardAnswers((p) => ({ ...p, mussEnthalten: e.target.value }))} style={textarea} />}
          {wizardStep === 6 && (
            <>
              <textarea placeholder='Was soll vermieden werden?' value={wizardAnswers.vermeiden} onChange={(e) => setWizardAnswers((p) => ({ ...p, vermeiden: e.target.value }))} style={textarea} />
              <input placeholder='Output-Format (z. B. Fliesstext, Bulletpoints)' value={wizardAnswers.outputFormat} onChange={(e) => setWizardAnswers((p) => ({ ...p, outputFormat: e.target.value }))} style={input} />
            </>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <button onClick={() => setWizardStep((s) => Math.max(1, s - 1))} style={{ ...secondaryBtn }} disabled={wizardStep === 1 || assistantLoading}>Zurueck</button>
            {wizardStep < 6 ? (
              <button onClick={() => setWizardStep((s) => Math.min(6, s + 1))} style={primaryBtn} disabled={assistantLoading}>Weiter</button>
            ) : (
              <button onClick={createTemplateWithAssistant} style={primaryBtn} disabled={assistantLoading}>{assistantLoading ? 'Wird erstellt...' : 'VetMind-Vorlage erstellen'}</button>
            )}
          </div>

          <div style={{ fontSize: 13, color: '#64748b', marginTop: 10 }}>
            Interne Prompt-Details bleiben verborgen. Anpassungen erfolgen ueber den VetMind-Aenderungswunsch.
          </div>

          {isSuperadmin && (
            <div style={{ marginTop: 16, padding: 14, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
              <h4 style={{ marginTop: 0, marginBottom: 10, color: '#0f172a' }}>Owner-Expertenmodus (optional)</h4>
              <textarea placeholder='Interner Prompt / Vorlageninhalt (nur Owner)' value={content} onChange={(e) => setContent(e.target.value)} style={textarea} />
              <textarea placeholder={'Untersuchung (eine pro Zeile)\nz. B. Allgemeinbefinden\nHerz\nLunge'} value={untersuchung} onChange={(e) => setUntersuchung(e.target.value)} style={textarea} />
              <button onClick={saveTemplate} style={{ ...primaryBtn, background: '#334155' }}>Als manuelle Vorlage speichern</button>
            </div>
          )}

        </div>

        <div style={{ marginTop: uiTokens.sectionGap, display: 'grid', gap: '12px' }}>
          {templates.map((t) => {
            const canDelete = isSuperadmin || t.user_id === userId;
            return (
              <div key={t.id} style={card}>
                {editingId === t.id ? (
                  <>
                    <h4 style={{ marginTop: 0 }}>Vorlage bearbeiten</h4>
                    {isSuperadmin && (
                      <>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} style={input} placeholder='Name' />
                        <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} style={input}>
                          <option value='clinical'>Klinisch</option>
                          <option value='communication'>Kommunikation</option>
                          <option value='internal'>Intern</option>
                        </select>
                        <select value={editScope} onChange={(e) => setEditScope(e.target.value as 'private' | 'practice')} style={input}>
                          <option value='private'>Sichtbarkeit: Nur ich</option>
                          <option value='practice'>Sichtbarkeit: Meine Praxis</option>
                        </select>
                      </>
                    )}
                    <textarea value={editInstruction} onChange={(e) => setEditInstruction(e.target.value)} style={textarea} placeholder='Aenderungswunsch (z. B. kuerzer, klarer, besitzerfreundlicher)' />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={reviseTemplateWithAssistant} style={primaryBtn} disabled={assistantLoading}>Mit VetMind bearbeiten</button>
                      {isSuperadmin && <button onClick={saveEditedTemplate} style={{ ...primaryBtn, background: '#334155' }}>Stammdaten speichern</button>}
                      <button onClick={cancelEditTemplate} style={secondaryBtn}>Abbrechen</button>
                    </div>
                    {isSuperadmin && (
                      <>
                        <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} style={textarea} placeholder='Interner Prompt (Owner)' />
                        <textarea value={editUntersuchung} onChange={(e) => setEditUntersuchung(e.target.value)} style={textarea} placeholder='Untersuchung (eine pro Zeile)' />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div>
                        <b>{t.name}</b>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {t.category} · {t.scope === 'global' ? 'global' : t.scope === 'practice' ? 'praxis' : 'privat'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => startEditTemplate(t)} style={smallBtn}>Bearbeiten</button>
                        <button onClick={() => hideTemplateForMe(t.id)} style={smallBtn}>Ausblenden</button>
                        {canDelete && <button onClick={() => deleteTemplate(t.id)} style={{ ...smallBtn, background: '#fee2e2', borderColor: '#fecaca', color: '#b91c1c' }}>Loeschen</button>}
                      </div>
                    </div>

                    <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap', marginTop: '10px', color: '#374151' }}>
                      Interner Prompt ist verborgen. Bearbeitung erfolgt ueber VetMind-Aenderungswunsch.
                    </div>

                    {t.structure?.untersuchung && (
                      <div style={{ marginTop: '10px', fontSize: '13px' }}>
                        <b>Untersuchung:</b>
                        <ul>
                          {t.structure.untersuchung.map((u: string, i: number) => (
                            <li key={i}>{u}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </main>
    );
  }

  const card = {
    background: uiTokens.cardBackground,
    padding: '20px',
    borderRadius: uiTokens.radiusCard,
    border: uiTokens.cardBorder
  };

  const input = {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: uiTokens.cardBorder,
    background: '#fff',
    marginBottom: '10px'
  };

  const textarea = {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: uiTokens.cardBorder,
    background: '#fff',
    marginBottom: '10px',
    minHeight: '100px'
  };

  const primaryBtn = {
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: uiTokens.brand,
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 14
  };

  const secondaryBtn = {
    ...primaryBtn,
    background: '#fff',
    color: uiTokens.textPrimary,
    border: uiTokens.cardBorder
  };

  const smallBtn = {
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#111827',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600
  };
