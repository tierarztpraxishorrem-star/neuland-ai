import {
  ANAMNESIS_TEMPLATES,
  AnamnesisQuestion,
  AnamnesisState,
  TEMPLATE_KEYS,
  mapChiefComplaintToTemplate,
  normalizeAnalysis,
  QuestionPriority,
  TemplateKey,
} from "../../../../lib/liveAnamnesis";

const PRIMARY_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-5";
const FALLBACK_MODEL = process.env.OPENAI_CHAT_FALLBACK_MODEL || "gpt-4.1";
const MAX_NEXT_QUESTIONS = 3;

const SYSTEM_PROMPT = `Du bist ein Anamnese-Assistent fuer Tieraerzte und tiermedizinische Fachangestellte.
Du arbeitest strikt anhand eines vorgegebenen Anamnese-Templates.

Fuer jeden Punkt musst du entscheiden:
- known (klar beantwortet)
- unclear (erwaehnt, aber unvollstaendig)
- missing (nicht erwaehnt)

Nur fuer unclear oder missing:
-> generiere gezielte, kurze Rueckfragen.

Regeln:
- Keine Diagnosen
- Maximal 3 Fragen
- Priorisiere medizinisch wichtige Punkte zuerst
- Keine doppelten Fragen

Rueckgabe ausschliesslich als valides JSON.`;

type AnalysisResponse = {
  templateKey?: TemplateKey;
  state?: AnamnesisState;
  structuredAnamnesis?: Array<{
    section: string;
    items: Array<{ label: string; value: string }>;
  }>;
  missingPoints?: string[];
  nextQuestions?: AnamnesisQuestion[];
  isComplete?: boolean;
  completionText?: string;
};

type QuestionFilterOptions = {
  blockedTexts: string[];
  blockedKeys: string[];
  state?: AnamnesisState;
};

function normalizeQuestion(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function areQuestionsSimilar(a: string, b: string) {
  const na = normalizeQuestion(a);
  const nb = normalizeQuestion(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const tokensA = na.split(" ").filter((token) => token.length > 2);
  const tokensB = nb.split(" ").filter((token) => token.length > 2);
  if (!tokensA.length || !tokensB.length) return false;

  const setA = new Set(tokensA);
  const overlap = tokensB.filter((token) => setA.has(token)).length;
  const minLen = Math.min(tokensA.length, tokensB.length);
  return minLen > 0 && overlap / minLen >= 0.7;
}

function filterUniqueQuestions(input: AnamnesisQuestion[], options: QuestionFilterOptions) {
  const result: AnamnesisQuestion[] = [];
  const blockedKeySet = new Set(
    options.blockedKeys
      .map((key) => key.trim())
      .filter(Boolean),
  );

  for (const raw of input) {
    const questionText = raw?.text?.trim();
    if (!questionText) continue;

    const questionKey = typeof raw.key === "string" ? raw.key.trim() : "";
    const stateStatus = questionKey ? options.state?.[questionKey]?.status : undefined;
    if (questionKey && blockedKeySet.has(questionKey)) continue;
    if (stateStatus === "known") continue;

    const isBlocked = options.blockedTexts.some((existing) => areQuestionsSimilar(existing, questionText));
    const isDuplicate = result.some((existing) => areQuestionsSimilar(existing.text, questionText));
    const isDuplicateKey = questionKey
      ? result.some((existing) => (existing.key || "").trim() === questionKey)
      : false;
    if (isBlocked || isDuplicate || isDuplicateKey) continue;

    const priority: QuestionPriority =
      raw.priority === "high" || raw.priority === "medium" || raw.priority === "low"
        ? raw.priority
        : "medium";

    result.push({
      text: questionText,
      priority,
      category: raw.category || "allgemein",
      key: questionKey || undefined,
      reason: typeof raw.reason === "string" ? raw.reason.trim() : undefined,
    });

    if (questionKey) blockedKeySet.add(questionKey);

    if (result.length >= MAX_NEXT_QUESTIONS) break;
  }

  return result;
}

function containsAny(text: string, terms: string[]) {
  const normalizedText = normalizeForSearch(text);
  return terms.some((term) => normalizedText.includes(normalizeForSearch(term)));
}

function detectDuration(text: string) {
  const direct = text.match(/seit\s+\d+\s*(tag|tagen|woche|wochen|monat|monaten|stunde|stunden)/i);
  if (direct?.[0]) return direct[0];
  const soft = text.match(/(heute|gestern|vor\s+\d+\s+tagen)/i);
  return soft?.[0] || "";
}

function detectFrequency(text: string) {
  const direct = text.match(/\b\d+\s*x\s*(pro\s*)?(tag|taeglich|täglich|woche|woechentlich|wöchentlich)\b/i);
  if (direct?.[0]) return direct[0];
  const soft = text.match(/(mehrmals\s+taeglich|mehrmals\s+täglich|einmal\s+taeglich|einmal\s+täglich|haeufig|häufig)/i);
  return soft?.[0] || "";
}

function detectByKeywords(text: string, keywords: string[]) {
  return containsAny(text, keywords);
}

function buildTemplateState(templateKey: TemplateKey, transcript: string) {
  const text = transcript.toLowerCase();
  const state: AnamnesisState = {};

  for (const field of ANAMNESIS_TEMPLATES[templateKey]) {
    if (field.key === "dauer") {
      const value = detectDuration(transcript);
      state[field.key] = value ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "frequenz_erbrechen") {
      const value = detectFrequency(transcript);
      if (value) {
        state[field.key] = { status: "known", value };
      } else if (detectByKeywords(text, ["erbrechen", "uebergeben", "übergeben", "vomitus", "kotzen", "spucken"])) {
        state[field.key] = { status: "unclear", value: "Erbrechen erwaehnt" };
      } else {
        state[field.key] = { status: "missing" };
      }
      continue;
    }

    if (field.key === "inhalt_erbrechen") {
      if (detectByKeywords(text, ["blut", "schaum", "futter", "gelb", "gruen", "grün", "galle", "schleim", "brocken", "fluessig", "flüssig"])) {
        state[field.key] = { status: "known", value: "Inhalt beschrieben" };
      } else if (detectByKeywords(text, ["erbrechen", "uebergeben", "übergeben", "vomitus", "kotzen", "spucken"])) {
        state[field.key] = { status: "unclear", value: "Inhalt unklar" };
      } else {
        state[field.key] = { status: "missing" };
      }
      continue;
    }

    if (field.key === "durchfall") {
      if (detectByKeywords(text, ["durchfall", "diarrhoe", "diarrhö", "weicher kot", "wässrig", "waessrig", "breiig", "duenner kot", "dünner kot"])) {
        state[field.key] = { status: "known", value: "erwaehnt" };
      } else {
        state[field.key] = { status: "missing" };
      }
      continue;
    }

    if (field.key === "appetit") {
      state[field.key] = detectByKeywords(text, ["appetit", "frisst", "frisst nicht", "isst", "futteraufnahme", "inappet", "maekelig", "mäkelig", "fresslust"])
        ? { status: "known", value: "erwaehnt" }
        : { status: "missing" };
      continue;
    }

    if (field.key === "wasseraufnahme") {
      state[field.key] = detectByKeywords(text, ["wasseraufnahme", "trinkt", "durst", "polydipsie", "viel trinken", "wenig trinken", "trinkmenge"])
        ? { status: "known", value: "erwaehnt" }
        : { status: "missing" };
      continue;
    }

    if (field.key === "gliedmasse") {
      if (detectByKeywords(text, ["vorne", "hinten", "links", "rechts", "pfote", "gliedmass", "gliedma", "vorderbein", "hinterbein", "vordergliedmasse", "hintergliedmasse"])) {
        state[field.key] = { status: "known", value: "lokalisation erwaehnt" };
      } else if (detectByKeywords(text, ["lahm", "humpeln", "schont", "entlastet"])) {
        state[field.key] = { status: "unclear", value: "Lokalisation unklar" };
      } else {
        state[field.key] = { status: "missing" };
      }
      continue;
    }

    if (field.key === "trauma") {
      state[field.key] = detectByKeywords(text, ["trauma", "unfall", "sprung", "gestuerzt", "gestürzt", "angestoßen", "angestossen", "verletzt", "sturz", "stolpern"])
        ? { status: "known", value: "erwaehnt" }
        : { status: "missing" };
      continue;
    }

    if (field.key === "schmerz") {
      state[field.key] = detectByKeywords(text, ["schmerz", "jault", "empfindlich", "schmerzhaft", "schont", "wehrt sich", "beruehrungsempfindlich", "berührungsempfindlich"])
        ? { status: "known", value: "erwaehnt" }
        : { status: "missing" };
      continue;
    }

    if (field.key === "verlauf") {
      state[field.key] = detectByKeywords(text, ["besser", "schlechter", "gleich", "zunehmend", "abnehmend", "progredient", "schubweise", "intermittierend", "konstant"])
        ? { status: "known", value: "erwaehnt" }
        : { status: "missing" };
      continue;
    }

    if (field.key === "verhalten") {
      state[field.key] = detectByKeywords(text, ["matt", "schlapp", "aktiv", "verhalten", "ruhig", "unruhig", "apathisch", "lethargisch", "nervoes", "nervös"])
        ? { status: "known", value: "erwaehnt" }
        : { status: "missing" };
      continue;
    }

    if (field.key === "trinken") {
      state[field.key] = detectByKeywords(text, ["trinkt", "durst", "wasseraufnahme", "polydipsie", "trinkmenge", "viel trinken", "wenig trinken"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "medikation") {
      state[field.key] = detectByKeywords(text, ["medikation", "medikament", "tablette", "gabe", "spritze", "tropfen", "praeparat", "präparat", "antibiot", "schmerzmittel"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "vorerkrankungen") {
      state[field.key] = detectByKeywords(text, ["vorerkrank", "chronisch", "frueher", "früher", "operation", "op", "diagnose", "bekannt seit", "langjaehrig", "langjährig"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "husten_frequenz") {
      const freq = detectFrequency(transcript);
      if (freq) {
        state[field.key] = { status: "known", value: freq };
      } else if (detectByKeywords(text, ["husten", "hustet", "wuergen", "würgen", "raeuspern", "räuspern"])) {
        state[field.key] = { status: "unclear", value: "Husten erwaehnt" };
      } else {
        state[field.key] = { status: "missing" };
      }
      continue;
    }

    if (field.key === "atemnot") {
      state[field.key] = detectByKeywords(text, ["atemnot", "dyspnoe", "schnelle atmung", "kurzatmig", "kurzatmig", "maulatmung", "bauchatmung", "atemarbeit", "hecheln in ruhe"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "nasenausfluss") {
      state[field.key] = detectByKeywords(text, ["nasenausfluss", "nase laeuft", "sekret", "nasensekret", "schnupfen", "einseitig", "beidseitig", "klar", "eitrig"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "urinabsatz") {
      state[field.key] = detectByKeywords(text, ["urin", "harn", "pinkeln", "urinabsatz", "harnabsatz", "pieseln", "wasserlassen", "larn", "löst sich"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "pollakisurie") {
      state[field.key] = detectByKeywords(text, ["pollakisurie", "haeufig urin", "häufig urin", "staendig raus", "ständig raus", "kleine mengen", "oft pinkeln", "dauernd hocken"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "haematurie") {
      state[field.key] = detectByKeywords(text, ["haematurie", "hämaturie", "blut im urin", "roter urin", "rosa urin", "blutiger urin"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "dysurie") {
      state[field.key] = detectByKeywords(text, ["dysurie", "strangurie", "presst", "schmerz beim urin", "presst beim pinkeln", "jammert beim urinieren", "pressen", "tröpfeln"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "juckreiz") {
      state[field.key] = detectByKeywords(text, ["juckreiz", "kratzt", "leckt", "beisst sich", "beißt sich", "scheuert", "reibt sich", "knabbert", "pfotenlecken"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "lokalisation" || field.key === "lokalisation_mass") {
      state[field.key] = detectByKeywords(text, ["links", "rechts", "hals", "bauch", "brust", "pfote", "kopf", "ruecken", "rücken", "flanke", "axilla", "leiste", "thorax", "abdomen"]) ? { status: "known", value: "lokalisation erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "anfallsart") {
      state[field.key] = detectByKeywords(text, ["anfall", "krampf", "episod", "zuckung", "kollaps", "weggetreten", "tonisch", "klonisch", "muskelzucken"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "bewusstsein") {
      state[field.key] = detectByKeywords(text, ["bewusst", "apathisch", "ansprechbar", "desorientiert", "nicht ansprechbar", "somnolent", "stupor", "bewusstlos"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "frequenz") {
      const freq = detectFrequency(transcript);
      state[field.key] = freq ? { status: "known", value: freq } : { status: "missing" };
      continue;
    }

    if (field.key === "ataxie") {
      state[field.key] = detectByKeywords(text, ["ataxie", "taumelt", "paresen", "unsicherer gang", "schwankt", "koordinationsstoerung", "koordinationsstörung", "wegknicken"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "groesse_verlauf") {
      state[field.key] = detectByKeywords(text, ["groesser", "größer", "kleiner", "wachstum", "gleich gross", "gleich groß", "zunahme", "abnahme", "rasch gewachsen", "langsam gewachsen"]) ? { status: "known", value: "veraenderung erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "gewicht") {
      state[field.key] = detectByKeywords(text, ["gewicht", "abgenommen", "zugenommen", "gewichtsverlust", "gewichtszunahme", "mager", "abgemagert"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    if (field.key === "allgemeinbefinden") {
      state[field.key] = detectByKeywords(text, ["allgemeinbefinden", "matt", "schlapp", "fit", "lethargisch", "munter", "abgeschlagen", "normalzustand"]) ? { status: "known", value: "erwaehnt" } : { status: "missing" };
      continue;
    }

    state[field.key] = { status: "missing" };
  }

  return state;
}

function buildMissingPointsFromState(templateKey: TemplateKey, state: AnamnesisState) {
  return ANAMNESIS_TEMPLATES[templateKey]
    .filter((field) => {
      const status = state[field.key]?.status || "missing";
      return status === "missing" || status === "unclear";
    })
    .map((field) => field.label)
    .slice(0, 20);
}

function buildQuestionForField(templateKey: TemplateKey, fieldKey: string, fieldLabel: string, priority: QuestionPriority): AnamnesisQuestion {
  const map: Record<string, string> = {
    dauer: "Seit wann besteht das Problem genau?",
    verlauf: "Wie hat sich das Problem im Verlauf entwickelt?",
    appetit: "Wie ist der Appetit aktuell?",
    verhalten: "Wie ist das Verhalten im Vergleich zu normal?",
    frequenz_erbrechen: "Wie häufig erbricht das Tier pro Tag?",
    inhalt_erbrechen: "Wie sieht das Erbrochene aus (Farbe, Futter, Schaum, Blut)?",
    durchfall: "Gibt es Durchfall oder Veränderungen beim Kot?",
    kotabsatz: "Wie ist der Kotabsatz (Menge, Konsistenz, Häufigkeit)?",
    wasseraufnahme: "Wie ist die Wasseraufnahme aktuell?",
    trinken: "Wie ist das Trinkverhalten aktuell?",
    medikation: "Welche Medikation wird aktuell gegeben?",
    vorerkrankungen: "Welche relevanten Vorerkrankungen sind bekannt?",
    gliedmasse: "Welche Gliedmaße ist betroffen?",
    belastung: "Ist die Symptomatik belastungsabhängig?",
    neurologie_flag: "Gab es neurologische Auffälligkeiten?",
    husten_frequenz: "Wie häufig hustet das Tier (pro Tag/Nacht)?",
    atemnot: "Besteht Atemnot oder erhöhte Atemarbeit?",
    nasenausfluss: "Gibt es Nasenausfluss und wie sieht er aus?",
    leistung: "Wie ist die Belastbarkeit im Vergleich zu normal?",
    fieber: "Wurde Fieber gemessen oder vermutet?",
    urinabsatz: "Wie häufig und in welcher Menge wird Urin abgesetzt?",
    pollakisurie: "Besteht Pollakisurie (häufiges Absetzen kleiner Mengen)?",
    haematurie: "Ist Blut im Urin aufgefallen?",
    dysurie: "Bestehen Schmerzen oder Pressen beim Urinabsatz?",
    lokalisation: "Wo sind die Hautveränderungen lokalisiert?",
    juckreiz: "Wie stark ist der Juckreiz und wann tritt er auf?",
    hautlaesion: "Wie sehen die Hautläsionen aus (Rötung, Krusten, Nässen)?",
    otitis: "Gibt es Hinweise auf eine begleitende Otitis?",
    anfallsart: "Wie genau sehen die Episoden/Anfälle aus?",
    bewusstsein: "Wie ist die Bewusstseinslage während der Episoden?",
    frequenz: "Wie häufig treten die Episoden auf?",
    trigger: "Gibt es erkennbare Trigger für die Episoden?",
    postiktal: "Wie verhält sich das Tier nach den Episoden?",
    ataxie: "Bestehen Ataxie oder Paresen zwischen den Episoden?",
    lokalisation_mass: "Wo ist die Masse lokalisiert?",
    groesse_verlauf: "Wie hat sich Größe oder Form der Masse verändert?",
    gewicht: "Wie ist der Gewichtsverlauf?",
    allgemeinbefinden: "Wie ist das Allgemeinbefinden aktuell?",
    trauma: "Gab es ein Trauma, einen Sprung oder einen Unfall?",
    schmerz: "Sind Schmerzen aufgefallen und wann treten sie auf?",
  };

  return {
    text: map[fieldKey] || `Können Sie ${fieldLabel.toLowerCase()} genauer beschreiben?`,
    priority,
    category: templateKey,
    key: fieldKey,
  };
}

function buildQuestionReason(fieldLabel: string, status: "missing" | "unclear", required?: boolean) {
  if (status === "unclear") {
    return `${fieldLabel}: bereits erwähnt, aber noch unklar.`;
  }
  if (required) {
    return `${fieldLabel}: Pflichtfeld im gewählten Template fehlt.`;
  }
  return `${fieldLabel}: im Transkript bisher nicht erwähnt.`;
}

function buildHeuristicAnalysis(
  transcript: string,
  chiefComplaint: string,
  askedQuestions: string[],
  existingOpenQuestions: string[],
  askedQuestionKeys: string[],
  existingOpenQuestionKeys: string[],
): AnalysisResponse {
  const templateKey = mapChiefComplaintToTemplate(chiefComplaint);
  const blockedQuestions = [...askedQuestions, ...existingOpenQuestions];
  const blockedQuestionKeys = [...askedQuestionKeys, ...existingOpenQuestionKeys];
  const state = buildTemplateState(templateKey, transcript);
  const missingPoints = buildMissingPointsFromState(templateKey, state);

  const questionPool = ANAMNESIS_TEMPLATES[templateKey]
    .filter((field) => {
      const status = state[field.key]?.status || "missing";
      return status === "missing" || status === "unclear";
    })
    .map((field) => {
      const status = state[field.key]?.status || "missing";
      const reasonStatus: "missing" | "unclear" = status === "unclear" ? "unclear" : "missing";
      const question = buildQuestionForField(templateKey, field.key, field.label, field.priority);
      return {
        ...question,
        reason: buildQuestionReason(field.label, reasonStatus, field.required),
      };
    });

  const nextQuestions = filterUniqueQuestions(questionPool, {
    blockedTexts: blockedQuestions,
    blockedKeys: blockedQuestionKeys,
    state,
  });
  const isComplete = nextQuestions.length === 0 && missingPoints.length === 0;
  const completionText = isComplete ? "Fertig - keine weiteren Fragen erforderlich." : "";

  return {
    templateKey,
    state,
    missingPoints,
    nextQuestions,
    isComplete,
    completionText,
  };
}

function tryParseAnalysisJson(text: string): AnalysisResponse | null {
  try {
    return JSON.parse(text) as AnalysisResponse;
  } catch {
    // continue
  }

  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]) as AnalysisResponse;
    } catch {
      // continue
    }
  }

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as AnalysisResponse;
    } catch {
      // continue
    }
  }

  return null;
}

function finalizeWithAskedQuestions(
  analysis: AnalysisResponse,
  askedQuestions: string[],
  existingOpenQuestions: string[],
  askedQuestionKeys: string[],
  existingOpenQuestionKeys: string[],
  state: AnamnesisState,
): AnalysisResponse {
  const filteredQuestions = filterUniqueQuestions(
    Array.isArray(analysis.nextQuestions) ? analysis.nextQuestions : [],
    {
      blockedTexts: [...askedQuestions, ...existingOpenQuestions],
      blockedKeys: [...askedQuestionKeys, ...existingOpenQuestionKeys],
      state,
    },
  );

  const hasMissingPoints = Array.isArray(analysis.missingPoints) && analysis.missingPoints.length > 0;
  const isComplete = Boolean(analysis.isComplete) || (!hasMissingPoints && filteredQuestions.length === 0);
  const completionText = isComplete
    ? analysis.completionText?.trim() || "Fertig - keine weiteren Fragen erforderlich."
    : analysis.completionText?.trim() || "";

  return {
    ...analysis,
    nextQuestions: filteredQuestions,
    isComplete,
    completionText,
  };
}

async function callModel(
  apiKey: string,
  model: string,
  transcript: string,
  templateKey: TemplateKey,
  askedQuestions: string[],
  existingOpenQuestions: string[],
  askedQuestionKeys: string[],
  existingOpenQuestionKeys: string[],
  currentState: AnamnesisState,
) {
  const askedBlock = askedQuestions.length
    ? askedQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
    : "Keine.";

  const openBlock = existingOpenQuestions.length
    ? existingOpenQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
    : "Keine.";

  const askedKeyBlock = askedQuestionKeys.length
    ? askedQuestionKeys.map((key, i) => `${i + 1}. ${key}`).join("\n")
    : "Keine.";

  const openKeyBlock = existingOpenQuestionKeys.length
    ? existingOpenQuestionKeys.map((key, i) => `${i + 1}. ${key}`).join("\n")
    : "Keine.";

  const inputPrompt = [
    "Analysiere den folgenden Live-Transkriptionsstand einer tiermedizinischen Anamnese.",
    "",
    `Template-Key: ${templateKey}`,
    "",
    "Template-Felder:",
    JSON.stringify(ANAMNESIS_TEMPLATES[templateKey], null, 2),
    "",
    "Aktueller State:",
    JSON.stringify(currentState, null, 2),
    "",
    "Bereits gestellte Fragen (nicht wiederholen):",
    askedBlock,
    "",
    "Bereits offene/angezeigte Fragen (nicht doppeln):",
    openBlock,
    "",
    "Bereits verwendete Feld-Keys fuer Fragen (nicht wiederverwenden):",
    askedKeyBlock,
    "",
    "Bereits offene Feld-Keys fuer Fragen (nicht doppeln):",
    openKeyBlock,
    "",
    "Wichtig:",
    "- Keine Diagnose.",
    "- Keine Therapieempfehlungen.",
    "- Fuer jeden Punkt im Template: known, unclear oder missing setzen.",
    "- Nur fuer unclear oder missing Rueckfragen generieren.",
    "- Maximal 3 Rueckfragen.",
    "- Prioritaet high/medium/low angeben.",
    "- category mit Template-Key fuellen.",
    "- key mit Feld-Key fuellen (Pflicht).",
    "- reason als kurze Begruendung pro Rueckfrage mitgeben (z.B. fehlend/unklar + Feldname).",
    "- Keine Wiederholungen bereits gestellter/offener Fragen.",
    "- Wenn ausreichend: nextQuestions leer lassen, isComplete=true und completionText='Fertig - keine weiteren Fragen erforderlich.' setzen.",
    "- Rueckgabe ausschliesslich als valides JSON mit genau diesen Schluesseln:",
    '{"state":{"key":{"status":"known|unclear|missing","value":"optional"}},"nextQuestions":[{"text":"...","priority":"high|medium|low","category":"...","key":"...","reason":"..."}],"isComplete":false,"completionText":""}',
    "",
    "TRANSKRIPT:",
    transcript,
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      temperature: 0,
      max_output_tokens: 1200,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: inputPrompt },
      ],
    }),
  });

  const payload = (await res.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
    error?: { message?: string };
  };

  const text =
    payload.output_text || payload.output?.[0]?.content?.map((c) => c.text || "").join("") || "";

  return {
    ok: res.ok,
    text,
    error: payload.error?.message || "",
  };
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY fehlt" }, { status: 500 });
    }

    const body = await req.json();
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
    const chiefComplaint = typeof body?.chiefComplaint === "string" ? body.chiefComplaint.trim() : "";
    const requestedTemplate = typeof body?.templateOverride === "string" ? body.templateOverride.trim() : "";
    const templateKey = TEMPLATE_KEYS.includes(requestedTemplate as TemplateKey)
      ? (requestedTemplate as TemplateKey)
      : mapChiefComplaintToTemplate(chiefComplaint);
    const askedQuestions = Array.isArray(body?.askedQuestions)
      ? body.askedQuestions.filter((q: unknown) => typeof q === "string").map((q: string) => q.trim()).filter(Boolean)
      : [];
    const existingOpenQuestions = Array.isArray(body?.existingOpenQuestions)
      ? body.existingOpenQuestions
          .filter((q: unknown) => typeof q === "string")
          .map((q: string) => q.trim())
          .filter(Boolean)
      : [];
    const askedQuestionKeys = Array.isArray(body?.askedQuestionKeys)
      ? body.askedQuestionKeys
          .filter((key: unknown) => typeof key === "string")
          .map((key: string) => key.trim())
          .filter(Boolean)
      : [];
    const existingOpenQuestionKeys = Array.isArray(body?.existingOpenQuestionKeys)
      ? body.existingOpenQuestionKeys
          .filter((key: unknown) => typeof key === "string")
          .map((key: string) => key.trim())
          .filter(Boolean)
      : [];
    const currentState = normalizeAnalysis({
      templateKey,
      state: body?.currentState as AnamnesisState,
    }).state;

    if (!transcript) {
      return Response.json({ error: "transcript fehlt" }, { status: 400 });
    }

    let usedModel = PRIMARY_MODEL;
    let completion = await callModel(
      apiKey,
      usedModel,
      transcript,
      templateKey,
      askedQuestions,
      existingOpenQuestions,
      askedQuestionKeys,
      existingOpenQuestionKeys,
      currentState,
    );

    if (!completion.ok && usedModel !== FALLBACK_MODEL) {
      const fallback = await callModel(
        apiKey,
        FALLBACK_MODEL,
        transcript,
        templateKey,
        askedQuestions,
        existingOpenQuestions,
        askedQuestionKeys,
        existingOpenQuestionKeys,
        currentState,
      );
      if (fallback.ok && fallback.text.trim()) {
        completion = fallback;
        usedModel = FALLBACK_MODEL;
      } else {
        const heuristic = normalizeAnalysis({
          templateKey,
          ...buildHeuristicAnalysis(
            transcript,
            chiefComplaint,
            askedQuestions,
            existingOpenQuestions,
            askedQuestionKeys,
            existingOpenQuestionKeys,
          ),
        });
        return Response.json({
          ...heuristic,
          model: "heuristic-fallback",
          analyzedAt: new Date().toISOString(),
          fallbackReason: `Primary (${PRIMARY_MODEL}): ${completion.error}; Fallback (${FALLBACK_MODEL}): ${fallback.error}`,
        });
      }
    }

    if (!completion.text.trim()) {
      const heuristic = normalizeAnalysis({
        templateKey,
        ...buildHeuristicAnalysis(
          transcript,
          chiefComplaint,
          askedQuestions,
          existingOpenQuestions,
          askedQuestionKeys,
          existingOpenQuestionKeys,
        ),
      });
      return Response.json({
        ...heuristic,
        model: "heuristic-fallback",
        analyzedAt: new Date().toISOString(),
        fallbackReason: "Leere Modellantwort bei Analyse",
      });
    }

    const parsed = tryParseAnalysisJson(completion.text);

    if (!parsed) {
      const heuristic = normalizeAnalysis({
        templateKey,
        ...buildHeuristicAnalysis(
          transcript,
          chiefComplaint,
          askedQuestions,
          existingOpenQuestions,
          askedQuestionKeys,
          existingOpenQuestionKeys,
        ),
      });
      return Response.json({
        ...heuristic,
        model: "heuristic-fallback",
        analyzedAt: new Date().toISOString(),
        fallbackReason: "Antwort konnte nicht als JSON gelesen werden",
      });
    }

    const heuristicBase = buildHeuristicAnalysis(
      transcript,
      chiefComplaint,
      askedQuestions,
      existingOpenQuestions,
      askedQuestionKeys,
      existingOpenQuestionKeys,
    );
    const mergedState =
      parsed.state && typeof parsed.state === "object"
        ? (parsed.state as AnamnesisState)
        : heuristicBase.state || currentState;

    const normalized = normalizeAnalysis(
      finalizeWithAskedQuestions(
        {
          templateKey,
          ...parsed,
          state: mergedState,
          missingPoints:
            Array.isArray(parsed.missingPoints) && parsed.missingPoints.length
              ? parsed.missingPoints
              : heuristicBase.missingPoints,
        },
        askedQuestions,
        existingOpenQuestions,
        askedQuestionKeys,
        existingOpenQuestionKeys,
        mergedState,
      ),
    );

    const canonicalMissingPoints = buildMissingPointsFromState(templateKey, normalized.state);
    const canonicalIsComplete = canonicalMissingPoints.length === 0 && normalized.nextQuestions.length === 0;
    const canonicalCompletionText = canonicalIsComplete
      ? (normalized.completionText || "Fertig - keine weiteren Fragen erforderlich.")
      : "";

    return Response.json({
      ...normalized,
      missingPoints: canonicalMissingPoints,
      isComplete: canonicalIsComplete,
      completionText: canonicalCompletionText,
      model: usedModel,
      analyzedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("live anamnesis analysis error", error);
    return Response.json({ error: "Analyse fehlgeschlagen" }, { status: 500 });
  }
}