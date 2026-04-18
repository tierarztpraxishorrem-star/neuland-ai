export const maxDuration = 60; // live analysis should be fast, but avoid premature timeout

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
const MAX_NEXT_QUESTIONS = 6;

const SYSTEM_PROMPT = `Du bist ein erfahrener Anamnese-Assistent für tiermedizinische Fachangestellte (TFA) in der Kleintierpraxis.
Du analysierst ein Live-Transkript und extrahierst strukturierte Informationen anhand eines Templates.

Für jeden Template-Punkt:
- known: Klar benannt im Transkript. WICHTIG: Extrahiere den KONKRETEN Wert aus dem Transkript als "value".
  Beispiele: "seit 3 Tagen", "2x taeglich", "wässrig, gelblich", "linke Hintergliedmaße", "Metacam 0.5 mg 1x taeglich"
  NICHT: "erwaehnt", "bekannt", "vorhanden" – diese Woerter sind verboten als value bei "known".
- unclear: Im Transkript angedeutet, aber Detailtiefe reicht nicht. Beschreibe was unklar ist.
- missing: Nicht im Transkript erwaehnt.

Fragen-Regeln:
- Generiere 4-6 gezielte Rueckfragen. Decke sowohl Template-Felder als auch klinisch relevante Nachfragen ab.
- Priorisiere: required-Felder zuerst, dann high, dann medium.
- WICHTIG: Gehe auf den KONTEXT ein! Wenn z.B. Erbrechen erwaehnt wird, frage nach:
  - Wie sieht das Erbrochene aus (Farbe, Konsistenz, Blut, Schaum)?
  - Koennte das Tier etwas Ungewoehnliches gefressen haben (Fremdkoerper, Gift, Muell)?
  - Wurde anders gefuettert als sonst?
  - Wann war der letzte Kotabsatz und wie sah er aus?
  - Gibt es weitere Symptome (Durchfall, Fieber, Mattigkeit)?
- Wenn Lahmheit erwaehnt wird, frage nach Trauma, Schwellung, Waerme, Belastung.
- Wenn Juckreiz erwaehnt wird, frage nach Parasitenprophylaxe, Futteraenderung, andere Tiere betroffen.
- Formuliere die Fragen so, dass eine TFA sie direkt dem Tierbesitzer stellen kann – freundlich, verstaendlich, nicht zu fachsprachlich.
- Gib pro Frage einen "key" (Template-Feldname oder "context_followup") und eine "reason" an.
- Keine Diagnosen, keine Therapievorschlaege.

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
    const isContextFollowup = questionKey === "context_followup";
    const stateStatus = questionKey && !isContextFollowup ? options.state?.[questionKey]?.status : undefined;
    if (questionKey && !isContextFollowup && blockedKeySet.has(questionKey)) continue;
    if (stateStatus === "known") continue;

    const isBlocked = options.blockedTexts.some((existing) => areQuestionsSimilar(existing, questionText));
    const isDuplicate = result.some((existing) => areQuestionsSimilar(existing.text, questionText));
    const isDuplicateKey = questionKey && !isContextFollowup
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

    if (questionKey && !isContextFollowup) blockedKeySet.add(questionKey);

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

function extractContext(text: string, keywords: string[], windowChars = 80): string {
  const lower = normalizeForSearch(text);
  for (const kw of keywords) {
    const kwNorm = normalizeForSearch(kw);
    const idx = lower.indexOf(kwNorm);
    if (idx < 0) continue;
    const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, idx - windowChars)) + 1);
    const end = Math.min(text.length, text.indexOf(' ', idx + kwNorm.length + windowChars));
    const snippet = text.slice(start, end > start ? end : undefined).trim();
    if (snippet.length > 120) return snippet.slice(0, 120).trim() + '…';
    return snippet;
  }
  return '';
}

function detectWithContext(text: string, keywords: string[]): { found: boolean; value: string } {
  const found = containsAny(text, keywords);
  if (!found) return { found: false, value: '' };
  const ctx = extractContext(text, keywords);
  return { found: true, value: ctx || 'erhoben' };
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
        state[field.key] = { status: "unclear", value: "Erbrechen erwähnt, Häufigkeit unklar" };
      } else {
        state[field.key] = { status: "missing" };
      }
      continue;
    }

    if (field.key === "inhalt_erbrechen") {
      const contentKw = ["blut", "schaum", "futter", "gelb", "gruen", "grün", "galle", "schleim", "brocken", "fluessig", "flüssig"];
      const { found, value } = detectWithContext(transcript, contentKw);
      if (found) {
        state[field.key] = { status: "known", value };
      } else if (detectByKeywords(text, ["erbrechen", "uebergeben", "übergeben", "vomitus", "kotzen", "spucken"])) {
        state[field.key] = { status: "unclear", value: "Erbrechen erwähnt, Inhalt nicht beschrieben" };
      } else {
        state[field.key] = { status: "missing" };
      }
      continue;
    }

    if (field.key === "durchfall") {
      const dKw = ["durchfall", "diarrhoe", "diarrhö", "weicher kot", "wässrig", "waessrig", "breiig", "duenner kot", "dünner kot"];
      const { found, value } = detectWithContext(transcript, dKw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "appetit") {
      const kw = ["appetit", "frisst", "frisst nicht", "isst", "futteraufnahme", "inappet", "maekelig", "mäkelig", "fresslust"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "wasseraufnahme") {
      const kw = ["wasseraufnahme", "trinkt", "durst", "polydipsie", "viel trinken", "wenig trinken", "trinkmenge"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "gliedmasse") {
      const locKw = ["vorne", "hinten", "links", "rechts", "pfote", "gliedmass", "gliedma", "vorderbein", "hinterbein", "vordergliedmasse", "hintergliedmasse"];
      const { found, value } = detectWithContext(transcript, locKw);
      if (found) {
        state[field.key] = { status: "known", value };
      } else if (detectByKeywords(text, ["lahm", "humpeln", "schont", "entlastet"])) {
        state[field.key] = { status: "unclear", value: "Lahmheit erwähnt, Lokalisation unklar" };
      } else {
        state[field.key] = { status: "missing" };
      }
      continue;
    }

    if (field.key === "trauma") {
      const kw = ["trauma", "unfall", "sprung", "gestuerzt", "gestürzt", "angestoßen", "angestossen", "verletzt", "sturz", "stolpern"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "schmerz") {
      const kw = ["schmerz", "jault", "empfindlich", "schmerzhaft", "schont", "wehrt sich", "beruehrungsempfindlich", "berührungsempfindlich"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "verlauf") {
      const kw = ["besser", "schlechter", "gleich", "zunehmend", "abnehmend", "progredient", "schubweise", "intermittierend", "konstant"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "verhalten") {
      const kw = ["matt", "schlapp", "aktiv", "verhalten", "ruhig", "unruhig", "apathisch", "lethargisch", "nervoes", "nervös"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "trinken") {
      const kw = ["trinkt", "durst", "wasseraufnahme", "polydipsie", "trinkmenge", "viel trinken", "wenig trinken"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "medikation") {
      const kw = ["medikation", "medikament", "tablette", "gabe", "spritze", "tropfen", "praeparat", "präparat", "antibiot", "schmerzmittel"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "vorerkrankungen") {
      const kw = ["vorerkrank", "chronisch", "frueher", "früher", "operation", "op", "diagnose", "bekannt seit", "langjaehrig", "langjährig"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "husten_frequenz") {
      const freq = detectFrequency(transcript);
      if (freq) {
        state[field.key] = { status: "known", value: freq };
      } else if (detectByKeywords(text, ["husten", "hustet", "wuergen", "würgen", "raeuspern", "räuspern"])) {
        state[field.key] = { status: "unclear", value: "Husten erwähnt, Häufigkeit unklar" };
      } else {
        state[field.key] = { status: "missing" };
      }
      continue;
    }

    if (field.key === "atemnot") {
      const kw = ["atemnot", "dyspnoe", "schnelle atmung", "kurzatmig", "maulatmung", "bauchatmung", "atemarbeit", "hecheln in ruhe"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "nasenausfluss") {
      const kw = ["nasenausfluss", "nase laeuft", "sekret", "nasensekret", "schnupfen", "einseitig", "beidseitig", "eitrig"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "urinabsatz") {
      const kw = ["urin", "harn", "pinkeln", "urinabsatz", "harnabsatz", "pieseln", "wasserlassen"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "pollakisurie") {
      const kw = ["pollakisurie", "haeufig urin", "häufig urin", "staendig raus", "ständig raus", "kleine mengen", "oft pinkeln", "dauernd hocken"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "haematurie") {
      const kw = ["haematurie", "hämaturie", "blut im urin", "roter urin", "rosa urin", "blutiger urin"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "dysurie") {
      const kw = ["dysurie", "strangurie", "presst", "schmerz beim urin", "presst beim pinkeln", "jammert beim urinieren", "pressen", "tröpfeln"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "juckreiz") {
      const kw = ["juckreiz", "kratzt", "leckt", "beisst sich", "beißt sich", "scheuert", "reibt sich", "knabbert", "pfotenlecken"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "lokalisation" || field.key === "lokalisation_mass") {
      const kw = ["links", "rechts", "hals", "bauch", "brust", "pfote", "kopf", "ruecken", "rücken", "flanke", "axilla", "leiste", "thorax", "abdomen"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "anfallsart") {
      const kw = ["anfall", "krampf", "episod", "zuckung", "kollaps", "weggetreten", "tonisch", "klonisch", "muskelzucken"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "bewusstsein") {
      const kw = ["bewusst", "apathisch", "ansprechbar", "desorientiert", "nicht ansprechbar", "somnolent", "stupor", "bewusstlos"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "frequenz") {
      const freq = detectFrequency(transcript);
      state[field.key] = freq ? { status: "known", value: freq } : { status: "missing" };
      continue;
    }

    if (field.key === "ataxie") {
      const kw = ["ataxie", "taumelt", "paresen", "unsicherer gang", "schwankt", "koordinationsstoerung", "koordinationsstörung", "wegknicken"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "groesse_verlauf") {
      const kw = ["groesser", "größer", "kleiner", "wachstum", "gleich gross", "gleich groß", "zunahme", "abnahme", "rasch gewachsen", "langsam gewachsen"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "gewicht") {
      const kw = ["gewicht", "abgenommen", "zugenommen", "gewichtsverlust", "gewichtszunahme", "mager", "abgemagert"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "allgemeinbefinden") {
      const kw = ["allgemeinbefinden", "matt", "schlapp", "fit", "lethargisch", "munter", "abgeschlagen", "normalzustand"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "kotabsatz") {
      const kw = ["kot", "stuhlgang", "kotabsatz", "konsistenz", "fest", "breiig", "wässrig", "waessrig", "schwarz", "blutig"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "futterwechsel") {
      const kw = ["futterwechsel", "neues futter", "futter umgestellt", "futterumstellung", "anderes futter", "leckerli", "tisch", "muell", "müll", "fremdkoerper", "fremdkörper"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "belastung") {
      const kw = ["belastung", "spaziergang", "laufen", "treppen", "bewegung", "ruhe", "morgens schlechter", "abends schlechter", "nach bewegung"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "neurologie_flag") {
      const kw = ["neurologisch", "zucken", "zittern", "krampf", "paresen", "ataxie", "bewusstlos", "ohnmacht", "anfall", "taumeln"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "leistung") {
      const kw = ["leistung", "belastbar", "schnell muede", "schnell müde", "kurzatmig", "schlapp bei bewegung", "kondition", "schwaecher", "schwächer"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "fieber") {
      const kw = ["fieber", "temperatur", "warm", "39", "40", "41", "erhoeht", "erhöht", "gemessen", "temperatur gemessen"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "hautlaesion") {
      const kw = ["roetung", "rötung", "krusten", "schuppen", "naessen", "nässen", "papel", "pustel", "alopezie", "haarausfall", "wund", "erosion", "ulcus"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "otitis") {
      const kw = ["ohr", "otitis", "ohrenschmalz", "kopfschuetteln", "kopfschütteln", "ohr kratzen", "ohren", "geruch ohr"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "parasitenprophylaxe") {
      const kw = ["parasit", "floh", "zecke", "wurm", "entwurm", "spot-on", "prophylaxe", "frontline", "bravecto", "nexgard", "simparica"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "futterumstellung") {
      const kw = ["futterwechsel", "futterumstellung", "neues futter", "diaet", "diät", "allergie", "hypoallergen", "eliminationsdiaet", "eliminationsdiät", "umzug", "umgebung"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "trigger") {
      const kw = ["trigger", "ausloser", "auslöser", "stress", "futteraufnahme", "aufregung", "geraeusch", "geräusch", "gewitter", "silvestertag"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
      continue;
    }

    if (field.key === "postiktal") {
      const kw = ["postiktal", "danach", "nach dem anfall", "normal danach", "desorientiert danach", "muede danach", "müde danach", "frisst danach", "trinkt danach"];
      const { found, value } = detectWithContext(transcript, kw);
      state[field.key] = found ? { status: "known", value } : { status: "missing" };
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
    futterwechsel: "Gab es kürzlich einen Futterwechsel oder hat das Tier etwas Ungewöhnliches aufgenommen?",
    parasitenprophylaxe: "Ist die Parasitenprophylaxe aktuell (Flöhe, Zecken, Würmer)?",
    futterumstellung: "Gab es kürzlich eine Futterumstellung oder Veränderung in der Umgebung?",
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

type ContextRule = {
  triggerKeywords: string[];
  questions: Array<{ text: string; priority: QuestionPriority; reason: string; key: string }>;
};

const CONTEXT_BONUS_QUESTIONS: ContextRule[] = [
  {
    triggerKeywords: ["erbrechen", "uebergeben", "übergeben", "vomitus", "kotzen", "spucken", "erbricht"],
    questions: [
      { text: "Wie sah das Erbrochene aus – eher Futter, Schaum, Schleim oder war Blut dabei?", priority: "high", reason: "Erbrechen erwähnt: Aussehen des Erbrochenen wichtig für Einordnung.", key: "inhalt_erbrechen" },
      { text: "Könnte Ihr Tier etwas Ungewöhnliches gefressen haben – z.B. Spielzeug, Knochen, Müll oder etwas vom Boden draußen?", priority: "high", reason: "Fremdkörperaufnahme ist ein häufiger Grund für Erbrechen.", key: "context_followup" },
      { text: "Haben Sie in letzter Zeit das Futter gewechselt oder etwas anderes als sonst gefüttert?", priority: "medium", reason: "Futterwechsel kann Erbrechen auslösen.", key: "futterwechsel" },
      { text: "Wann war der letzte Kotabsatz und wie sah er aus?", priority: "medium", reason: "Letzter Kotabsatz gibt Hinweis auf GI-Passage.", key: "kotabsatz" },
      { text: "Sind Ihnen noch weitere Symptome aufgefallen – z.B. Durchfall, Fieber oder Mattigkeit?", priority: "medium", reason: "Begleitsymptome wichtig für Gesamtbild.", key: "context_followup" },
    ],
  },
  {
    triggerKeywords: ["durchfall", "diarrhoe", "diarrhö", "weicher kot", "breiig"],
    questions: [
      { text: "Wie sieht der Kot aus – wässrig, breiig, schleimig oder ist Blut dabei?", priority: "high", reason: "Kotbeschaffenheit wichtig für Einordnung.", key: "context_followup" },
      { text: "Könnte das Tier etwas Ungewöhnliches gefressen haben?", priority: "high", reason: "Fremdkörper/Giftstoffe können Durchfall verursachen.", key: "context_followup" },
      { text: "Haben Sie kürzlich das Futter gewechselt?", priority: "medium", reason: "Futterwechsel häufige Durchfallursache.", key: "futterwechsel" },
      { text: "Frisst und trinkt Ihr Tier noch normal?", priority: "medium", reason: "Appetit und Wasseraufnahme wichtig bei Durchfall.", key: "appetit" },
    ],
  },
  {
    triggerKeywords: ["lahm", "humpeln", "humpelt", "schont", "entlastet", "lahmheit"],
    questions: [
      { text: "Gab es ein Ereignis – z.B. einen Sprung, Sturz oder Zusammenstoß?", priority: "high", reason: "Trauma als Ursache abklären.", key: "trauma" },
      { text: "Ist eine Schwellung, Wärme oder Verdickung an der betroffenen Stelle zu sehen?", priority: "medium", reason: "Lokale Entzündungszeichen wichtig.", key: "context_followup" },
      { text: "Ist die Lahmheit morgens schlimmer oder nach Belastung?", priority: "medium", reason: "Belastungsabhängigkeit hilft bei Einordnung.", key: "belastung" },
    ],
  },
  {
    triggerKeywords: ["juckreiz", "kratzt", "leckt sich", "beisst sich", "beißt sich", "scheuert"],
    questions: [
      { text: "Ist die Parasitenprophylaxe aktuell – also Floh- und Zeckenschutz?", priority: "high", reason: "Parasitenbefall häufigste Juckreiz-Ursache.", key: "parasitenprophylaxe" },
      { text: "Gab es kürzlich eine Futterumstellung oder neue Leckerlis?", priority: "medium", reason: "Futtermittelallergie abklären.", key: "futterumstellung" },
      { text: "Sind andere Tiere im Haushalt auch betroffen?", priority: "medium", reason: "Ansteckende Ursachen eingrenzen.", key: "context_followup" },
    ],
  },
  {
    triggerKeywords: ["husten", "hustet", "atemnot", "dyspnoe", "hecheln"],
    questions: [
      { text: "Tritt der Husten eher bei Aufregung, nachts oder nach Belastung auf?", priority: "high", reason: "Zeitliches Muster hilft bei Einordnung.", key: "context_followup" },
      { text: "Klingt der Husten eher trocken oder feucht/produktiv?", priority: "medium", reason: "Art des Hustens gibt diagnostische Hinweise.", key: "context_followup" },
      { text: "Ist die Belastbarkeit eingeschränkt – wird das Tier schneller müde?", priority: "medium", reason: "Leistungseinschränkung wichtig bei respiratorischen Problemen.", key: "leistung" },
    ],
  },
  {
    triggerKeywords: ["anfall", "krampf", "zuckung", "epilep", "kollaps"],
    questions: [
      { text: "Wie lange dauern die Episoden ungefähr?", priority: "high", reason: "Anfallsdauer ist klinisch relevant.", key: "context_followup" },
      { text: "Wie verhält sich das Tier danach – sofort wieder normal oder verwirrt/müde?", priority: "high", reason: "Postiktale Phase gibt Hinweis auf Schwere.", key: "postiktal" },
      { text: "Gibt es einen erkennbaren Auslöser – Stress, Aufregung, bestimmte Geräusche?", priority: "medium", reason: "Trigger identifizieren hilft bei Einordnung.", key: "trigger" },
    ],
  },
];

function buildContextBonusQuestions(transcript: string, templateKey: TemplateKey): AnamnesisQuestion[] {
  const bonus: AnamnesisQuestion[] = [];
  for (const rule of CONTEXT_BONUS_QUESTIONS) {
    if (!containsAny(transcript, rule.triggerKeywords)) continue;
    for (const q of rule.questions) {
      bonus.push({
        text: q.text,
        priority: q.priority,
        category: templateKey,
        key: q.key,
        reason: q.reason,
      });
    }
  }
  return bonus;
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

  // Add context-aware bonus questions based on detected symptoms
  const bonusQuestions = buildContextBonusQuestions(transcript, templateKey);
  const combinedPool = [...questionPool, ...bonusQuestions];

  const nextQuestions = filterUniqueQuestions(combinedPool, {
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
    "Bereits verwendete Feld-Keys für Fragen (nicht wiederverwenden):",
    askedKeyBlock,
    "",
    "Bereits offene Feld-Keys für Fragen (nicht doppeln):",
    openKeyBlock,
    "",
    "WICHTIG - Regeln für das value-Feld bei status=known:",
    "- Extrahiere den KONKRETEN Wert woertlich oder zusammengefasst aus dem Transkript.",
    '- Richtig: "seit 3 Tagen", "2x taeglich morgens und abends", "wässrig, gelblich", "linke Hintergliedmaße"',
    '- FALSCH: "erwaehnt", "bekannt", "vorhanden", "genannt" – diese Woerter NIEMALS als value verwenden.',
    "- Wenn ein Punkt klar benannt wurde, fasse den relevanten Inhalt zusammen.",
    "",
    "Fragen-Regeln:",
    "- Generiere 4-6 Rueckfragen insgesamt.",
    "- Decke SOWOHL fehlende Template-Felder ALS AUCH kontextbezogene Nachfragen ab.",
    "- Kontextbezogen heisst: Wenn z.B. Erbrechen erwaehnt wird, frage gezielt nach Aussehen des Erbrochenen, Fremdkoerperaufnahme, Futterwechsel, letzer Kotabsatz, weitere Symptome.",
    "- Für kontextbezogene Fragen die nicht zu einem Template-Feld passen: key='context_followup' verwenden.",
    "- Formuliere alle Fragen so, dass eine TFA sie freundlich und verstaendlich dem Tierbesitzer stellen kann.",
    "- Keine Diagnose, keine Therapieempfehlungen.",
    "- Prioritaet high/medium/low angeben.",
    "- category mit Template-Key füllen.",
    "- key mit Feld-Key füllen (oder 'context_followup' für Kontextfragen).",
    "- reason als kurze Begruendung pro Rueckfrage.",
    "- Keine Wiederholungen bereits gestellter/offener Fragen.",
    "- Wenn ausreichend: nextQuestions leer lassen, isComplete=true.",
    "- Rueckgabe ausschliesslich als valides JSON mit genau diesen Schluesseln:",
    '{"state":{"key":{"status":"known|unclear|missing","value":"konkreter Wert"}},"nextQuestions":[{"text":"...","priority":"high|medium|low","category":"...","key":"...","reason":"..."}],"isComplete":false,"completionText":""}',
    "",
    "TRANSKRIPT:",
    transcript,
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      store: false,
      temperature: 0,
      max_output_tokens: 2400,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: inputPrompt },
      ],
    }),
  }).finally(() => clearTimeout(timeout));

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