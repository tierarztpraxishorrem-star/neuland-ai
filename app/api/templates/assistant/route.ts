import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const getOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return new OpenAI({ apiKey });
};

type Scope = 'private' | 'practice';
const SUPERADMIN_EMAIL = 'info@tierarztpraxis-horrem.de';

type CreatePayload = {
  action: 'create';
  name: string;
  category: string;
  scope: Scope;
  practiceId?: string | null;
  answers: {
    ziel?: string;
    zielgruppe?: string;
    tonalitaet?: string;
    abschnitte?: string;
    mussEnthalten?: string;
    vermeiden?: string;
    outputFormat?: string;
  };
};

type RevisePayload = {
  action: 'revise';
  templateId: string;
  instruction: string;
};

type Payload = CreatePayload | RevisePayload;

const extractJson = (text: string) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Keine valide JSON-Antwort erhalten.');
  }
  return JSON.parse(text.slice(start, end + 1));
};

const composeTemplate = async (input: {
  name: string;
  category: string;
  answers: Record<string, string | undefined>;
  instruction?: string;
  currentCompiledPrompt?: string;
}) => {
  const answersText = Object.entries(input.answers)
    .map(([k, v]) => `${k}: ${(v || '').trim() || '-'}`)
    .join('\n');

  const userPrompt = [
    `Vorlagenname: ${input.name}`,
    `Kategorie: ${input.category}`,
    'Nutzerantworten:',
    answersText,
    input.currentCompiledPrompt ? `Aktueller interner Prompt:\n${input.currentCompiledPrompt}` : '',
    input.instruction ? `Aenderungswunsch: ${input.instruction}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  const systemPrompt = [
    'Du bist ein Prompt-Architekt fuer veterinärmedizinische Dokumentationsvorlagen.',
    'Erzeuge ein robustes, alltagstaugliches Prompt-Design fuer nicht-prompt-affine Nutzer.',
    'Wichtig: Gib genau ein JSON-Objekt zurueck, ohne Markdown.',
    'JSON-Schema:',
    '{',
    '  "compiledPrompt": "string",',
    '  "designBrief": "string",',
    '  "structure": { "untersuchung": ["string"] }',
    '}',
    'Regeln:',
    '- compiledPrompt muss direkt fuer ein LLM nutzbar sein.',
    '- compiledPrompt soll klare Abschnitte, Regeln, Qualitaetskriterien enthalten.',
    '- designBrief kurz (max 8 Saetze), fachlich.',
    '- structure.untersuchung nur falls sinnvoll, sonst leeres Array.'
  ].join('\n');

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.25,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  const content = completion.choices[0]?.message?.content || '';
  const parsed = extractJson(content);

  return {
    compiledPrompt: String(parsed.compiledPrompt || '').trim(),
    designBrief: String(parsed.designBrief || '').trim(),
    structure: parsed.structure && Array.isArray(parsed.structure.untersuchung)
      ? { untersuchung: parsed.structure.untersuchung.map((x: unknown) => String(x)) }
      : { untersuchung: [] }
  };
};

const getSupabaseForUser = (token: string) =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = getSupabaseForUser(token);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const payload = (await req.json()) as Payload;
    const isSuperadmin = (user.email || '').toLowerCase() === SUPERADMIN_EMAIL;

    if (payload.action === 'create') {
      const name = payload.name?.trim();
      if (!name) return Response.json({ error: 'Name fehlt.' }, { status: 400 });

      if (payload.scope === 'practice' && !payload.practiceId) {
        return Response.json({ error: 'practiceId fehlt fuer Praxis-Scope.' }, { status: 400 });
      }

      const composed = await composeTemplate({
        name,
        category: payload.category,
        answers: payload.answers
      });

      if (!composed.compiledPrompt) {
        return Response.json({ error: 'Prompt konnte nicht erzeugt werden.' }, { status: 500 });
      }

      const { data: createdTemplate, error: templateError } = await supabase
        .from('templates')
        .insert({
          name,
          category: payload.category,
          content: composed.compiledPrompt,
          structure: composed.structure,
          user_id: user.id,
          scope: payload.scope,
          practice_id: payload.scope === 'practice' ? payload.practiceId : null
        })
        .select('id, name, category, scope, practice_id, created_at')
        .single();

      if (templateError || !createdTemplate) {
        return Response.json({ error: templateError?.message || 'Vorlage konnte nicht gespeichert werden.' }, { status: 400 });
      }

      const { error: intentError } = await supabase
        .from('template_intents')
        .insert({
          template_id: createdTemplate.id,
          user_id: user.id,
          category: payload.category,
          scope: payload.scope,
          practice_id: payload.scope === 'practice' ? payload.practiceId : null,
          wizard_answers: payload.answers,
          design_brief: composed.designBrief
        });

      if (intentError) {
        return Response.json({ error: intentError.message }, { status: 400 });
      }

      return Response.json({
        template: createdTemplate,
        designBrief: composed.designBrief
      });
    }

    const instruction = payload.instruction?.trim();
    if (!instruction) {
      return Response.json({ error: 'Aenderungswunsch fehlt.' }, { status: 400 });
    }

    const { data: existingTemplate, error: existingTemplateError } = await supabase
      .from('templates')
      .select('id, name, category, scope, practice_id, user_id, content, structure')
      .eq('id', payload.templateId)
      .maybeSingle();

    if (existingTemplateError || !existingTemplate) {
      return Response.json({ error: 'Vorlage nicht gefunden oder keine Berechtigung.' }, { status: 404 });
    }

    const canEditInPlace = isSuperadmin || existingTemplate.user_id === user.id;

    const { data: intentData } = await supabase
      .from('template_intents')
      .select('wizard_answers')
      .eq('template_id', existingTemplate.id)
      .maybeSingle();

    const answers = (intentData?.wizard_answers || {}) as Record<string, string>;

    const composed = await composeTemplate({
      name: existingTemplate.name,
      category: existingTemplate.category,
      answers,
      instruction,
      currentCompiledPrompt: existingTemplate.content || ''
    });

    if (canEditInPlace) {
      const { error: updateTemplateError } = await supabase
        .from('templates')
        .update({
          content: composed.compiledPrompt,
          structure: composed.structure
        })
        .eq('id', existingTemplate.id)
        .eq('user_id', existingTemplate.user_id);

      if (updateTemplateError) {
        return Response.json({ error: updateTemplateError.message }, { status: 400 });
      }

      const { error: updateIntentError } = await supabase
        .from('template_intents')
        .update({
          design_brief: composed.designBrief
        })
        .eq('template_id', existingTemplate.id)
        .eq('user_id', existingTemplate.user_id);

      if (updateIntentError) {
        return Response.json({ error: updateIntentError.message }, { status: 400 });
      }

      return Response.json({
        templateId: existingTemplate.id,
        designBrief: composed.designBrief,
        forked: false
      });
    }

    const copyName = `${existingTemplate.name} (Kopie)`;

    const { data: copiedTemplate, error: copiedTemplateError } = await supabase
      .from('templates')
      .insert({
        name: copyName,
        category: existingTemplate.category,
        content: composed.compiledPrompt,
        structure: composed.structure,
        user_id: user.id,
        scope: 'private',
        practice_id: null
      })
      .select('id')
      .single();

    if (copiedTemplateError || !copiedTemplate) {
      return Response.json({ error: copiedTemplateError?.message || 'Kopie konnte nicht erzeugt werden.' }, { status: 400 });
    }

    const { error: copiedIntentError } = await supabase
      .from('template_intents')
      .insert({
        template_id: copiedTemplate.id,
        user_id: user.id,
        category: existingTemplate.category,
        scope: 'private',
        practice_id: null,
        wizard_answers: {
          sourceTemplateId: existingTemplate.id,
          deriveMode: 'copy_on_write'
        },
        design_brief: composed.designBrief
      });

    if (copiedIntentError) {
      return Response.json({ error: copiedIntentError.message }, { status: 400 });
    }

    return Response.json({
      templateId: copiedTemplate.id,
      designBrief: composed.designBrief,
      forked: true
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('OPENAI_API_KEY')) {
      return Response.json({ error: 'OPENAI_API_KEY fehlt' }, { status: 500 });
    }
    return Response.json({ error: 'Template-Assistant fehlgeschlagen' }, { status: 500 });
  }
}
