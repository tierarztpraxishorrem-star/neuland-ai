export type QuestionPriority = "high" | "medium" | "low";
export type AnamnesisStatus = "known" | "unclear" | "missing";

export const TEMPLATE_KEYS = [
  "allgemein",
  "gi",
  "lahmheit",
  "respiratorisch",
  "urogenital",
  "dermatologie",
  "neurologie",
  "onkologie",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type AnamnesisTemplateField = {
  key: string;
  label: string;
  priority: QuestionPriority;
  required?: boolean;
};

export type AnamnesisTemplateMeta = {
  label: string;
  shortDescription: string;
  keywords: string[];
};

export const ANAMNESIS_TEMPLATE_META: Record<TemplateKey, AnamnesisTemplateMeta> = {
  allgemein: {
    label: "Allgemein",
    shortDescription: "Basistemplate für unspezifische Vorstellungen",
    keywords: ["allgemein", "unspezifisch", "abgeschlagen", "kontrolle"],
  },
  gi: {
    label: "Gastrointestinaltrakt",
    shortDescription: "Template für Erbrechen, Durchfall, Übelkeit, Futterprobleme",
    keywords: ["erbrechen", "durchfall", "übelkeit", "magen", "darm", "kot"],
  },
  lahmheit: {
    label: "Lahmheit",
    shortDescription: "Template für orthopädische und bewegungsbezogene Anliegen",
    keywords: ["lahm", "lahmheit", "humpeln", "bein", "gliedmaße", "gangbild"],
  },
  respiratorisch: {
    label: "Respiratorisch",
    shortDescription: "Template für Husten, Dyspnoe, Nasenausfluss",
    keywords: ["husten", "atemnot", "dyspnoe", "nase", "nasenausfluss", "respiratorisch"],
  },
  urogenital: {
    label: "Urogenital",
    shortDescription: "Template für Harnabsatz, Pollakisurie, Hämaturie",
    keywords: ["urin", "harn", "blase", "pollakisurie", "hämaturie", "urogenital"],
  },
  dermatologie: {
    label: "Dermatologie",
    shortDescription: "Template für Juckreiz, Hautläsionen, Otitis-nahe Probleme",
    keywords: ["haut", "juckreiz", "kratzen", "ekzem", "otitis", "haarausfall"],
  },
  neurologie: {
    label: "Neurologie",
    shortDescription: "Template für Anfallsgeschehen, Ataxie, Bewusstseinsveränderungen",
    keywords: ["anfall", "neurolog", "ataxie", "krampf", "bewusstsein", "paresen"],
  },
  onkologie: {
    label: "Onkologie",
    shortDescription: "Template für Masse/Tumor und systemische Begleitsymptome",
    keywords: ["tumor", "knoten", "masse", "umfangsvermehrung", "neoplasie", "onkolog"],
  },
};

export const ANAMNESIS_TEMPLATES: Record<TemplateKey, AnamnesisTemplateField[]> = {
  allgemein: [
    { key: "dauer", label: "Dauer", priority: "high", required: true },
    { key: "verlauf", label: "Verlauf", priority: "high", required: true },
    { key: "appetit", label: "Appetit", priority: "medium" },
    { key: "verhalten", label: "Verhalten", priority: "medium" },
    { key: "trinken", label: "Trinkverhalten", priority: "medium" },
    { key: "medikation", label: "Aktuelle Medikation", priority: "low" },
    { key: "vorerkrankungen", label: "Relevante Vorerkrankungen", priority: "low" },
  ],
  gi: [
    { key: "dauer", label: "Dauer", priority: "high", required: true },
    { key: "frequenz_erbrechen", label: "Erbrechen Frequenz", priority: "high", required: true },
    { key: "inhalt_erbrechen", label: "Inhalt Erbrechen", priority: "high", required: true },
    { key: "durchfall", label: "Durchfall", priority: "high" },
    { key: "appetit", label: "Appetit", priority: "medium" },
    { key: "wasseraufnahme", label: "Wasseraufnahme", priority: "medium" },
    { key: "kotabsatz", label: "Kotabsatz", priority: "medium" },
    { key: "futterwechsel", label: "Futterwechsel / Trigger", priority: "low" },
  ],
  lahmheit: [
    { key: "dauer", label: "Dauer", priority: "high", required: true },
    { key: "gliedmasse", label: "Betroffene Gliedmaße", priority: "high", required: true },
    { key: "trauma", label: "Trauma", priority: "high" },
    { key: "schmerz", label: "Schmerz", priority: "high", required: true },
    { key: "verlauf", label: "Verlauf", priority: "medium" },
    { key: "belastung", label: "Belastungsabhängigkeit", priority: "medium" },
    { key: "neurologie_flag", label: "Neurologische Auffälligkeiten", priority: "medium" },
  ],
  respiratorisch: [
    { key: "dauer", label: "Dauer", priority: "high", required: true },
    { key: "husten_frequenz", label: "Hustenfrequenz", priority: "high", required: true },
    { key: "atemnot", label: "Atemnot / Dyspnoe", priority: "high", required: true },
    { key: "nasenausfluss", label: "Nasenausfluss", priority: "medium" },
    { key: "leistung", label: "Belastbarkeit", priority: "medium" },
    { key: "fieber", label: "Fieber", priority: "medium" },
    { key: "appetit", label: "Appetit", priority: "low" },
  ],
  urogenital: [
    { key: "dauer", label: "Dauer", priority: "high", required: true },
    { key: "urinabsatz", label: "Urinabsatz", priority: "high", required: true },
    { key: "pollakisurie", label: "Pollakisurie", priority: "high" },
    { key: "haematurie", label: "Hämaturie", priority: "high" },
    { key: "dysurie", label: "Dysurie / Strangurie", priority: "high" },
    { key: "wasseraufnahme", label: "Wasseraufnahme", priority: "medium" },
    { key: "allgemeinbefinden", label: "Allgemeinbefinden", priority: "medium" },
  ],
  dermatologie: [
    { key: "dauer", label: "Dauer", priority: "high", required: true },
    { key: "lokalisation", label: "Lokalisation", priority: "high", required: true },
    { key: "juckreiz", label: "Juckreiz", priority: "high", required: true },
    { key: "hautlaesion", label: "Art der Hautläsion", priority: "high" },
    { key: "otitis", label: "Begleitende Otitis", priority: "medium" },
    { key: "parasitenprophylaxe", label: "Parasitenprophylaxe", priority: "medium" },
    { key: "futterumstellung", label: "Futter-/Umweltänderung", priority: "low" },
  ],
  neurologie: [
    { key: "dauer", label: "Dauer", priority: "high", required: true },
    { key: "anfallsart", label: "Anfalls-/Episodenart", priority: "high", required: true },
    { key: "bewusstsein", label: "Bewusstseinslage", priority: "high" },
    { key: "frequenz", label: "Frequenz", priority: "high" },
    { key: "trigger", label: "Trigger", priority: "medium" },
    { key: "postiktal", label: "Postiktales Verhalten", priority: "medium" },
    { key: "ataxie", label: "Ataxie/Paresen", priority: "medium" },
  ],
  onkologie: [
    { key: "dauer", label: "Dauer", priority: "high", required: true },
    { key: "lokalisation_mass", label: "Lokalisation Masse", priority: "high", required: true },
    { key: "groesse_verlauf", label: "Größe/Verlauf", priority: "high", required: true },
    { key: "schmerz", label: "Schmerz", priority: "high" },
    { key: "gewicht", label: "Gewichtsverlauf", priority: "medium" },
    { key: "appetit", label: "Appetit", priority: "medium" },
    { key: "allgemeinbefinden", label: "Allgemeinbefinden", priority: "medium" },
  ],
};

export const TEMPLATE_MATCH_RULES: Array<{ template: TemplateKey; keywords: string[] }> = TEMPLATE_KEYS.map((key) => ({
  template: key,
  keywords: ANAMNESIS_TEMPLATE_META[key].keywords,
}));

export function mapChiefComplaintToTemplate(chiefComplaint: string): TemplateKey {
  const normalized = (chiefComplaint || "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "allgemein";

  if (TEMPLATE_KEYS.includes(normalized as TemplateKey)) {
    return normalized as TemplateKey;
  }

  let bestTemplate: TemplateKey = "allgemein";
  let bestScore = 0;

  for (const rule of TEMPLATE_MATCH_RULES) {
    const score = rule.keywords.reduce((acc, keyword) => {
      return normalized.includes(keyword.toLowerCase()) ? acc + 1 : acc;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestTemplate = rule.template;
    }
  }

  return bestTemplate;
}

export function getTemplateFields(templateKey: TemplateKey) {
  return ANAMNESIS_TEMPLATES[templateKey];
}

export type StructuredBucket = {
  label: string;
  value: string;
};

export type StructuredSection = {
  section: string;
  items: StructuredBucket[];
};

export type AnamnesisStateEntry = {
  status: AnamnesisStatus;
  value?: string;
};

export type AnamnesisState = {
  [key: string]: AnamnesisStateEntry;
};

export type AnamnesisQuestion = {
  text: string;
  priority: QuestionPriority;
  category: string;
  key?: string;
  reason?: string;
};

export type LiveAnamnesisAnalysis = {
  templateKey: TemplateKey;
  state: AnamnesisState;
  structuredAnamnesis: StructuredSection[];
  missingPoints: string[];
  nextQuestions: AnamnesisQuestion[];
  isComplete: boolean;
  completionText: string;
};

type NarrativeOptions = {
  includeMissing?: boolean;
  omitFieldKeys?: string[];
};

export type FinalNotes = {
  vorerkrankungen: string;
  medikation: string;
};

function defaultStateForTemplate(templateKey: TemplateKey): AnamnesisState {
  return ANAMNESIS_TEMPLATES[templateKey].reduce<AnamnesisState>((acc, field) => {
    acc[field.key] = { status: "missing" };
    return acc;
  }, {});
}

function stateToStructured(templateKey: TemplateKey, state: AnamnesisState): StructuredSection[] {
  const fields = ANAMNESIS_TEMPLATES[templateKey];
  const sectionName = ANAMNESIS_TEMPLATE_META[templateKey].label;
  return [
    {
      section: sectionName,
      items: fields.map((field) => {
        const entry = state[field.key];
        if (!entry || entry.status === "missing") {
          return { label: field.label, value: "nicht erhoben" };
        }
        if (entry.status === "unclear") {
          return { label: field.label, value: entry.value || "unklar" };
        }
        return { label: field.label, value: entry.value || "bekannt" };
      }),
    },
  ];
}

function sentenceFromField(label: string, entry?: AnamnesisStateEntry, options?: NarrativeOptions) {
  if (!entry || entry.status === "missing") {
    if (!options?.includeMissing) return "";
    return `${label}: nicht erhoben.`;
  }

  if (entry.status === "unclear") {
    const value = entry.value?.trim();
    return value ? `${label}: ${value} (genauere Angabe ausstehend).` : `${label}: unklar.`;
  }

  const value = entry.value?.trim();
  if (!value || value.toLowerCase() === "bekannt" || value.toLowerCase() === "erwaehnt" || value.toLowerCase() === "erhoben") {
    return `${label}: erhoben.`;
  }

  return `${label}: ${value}.`;
}

function getStateValueText(state: AnamnesisState, key: string) {
  const entry = state[key];
  if (!entry || entry.status === "missing") return "nicht erhoben";
  if (entry.status === "unclear") return entry.value?.trim() || "unklar";
  return entry.value?.trim() || "erhoben";
}

export function extractFinalNotes(analysis: Pick<LiveAnamnesisAnalysis, "state">): FinalNotes {
  return {
    vorerkrankungen: getStateValueText(analysis.state, "vorerkrankungen"),
    medikation: getStateValueText(analysis.state, "medikation"),
  };
}

export function formatAnalysisNarrative(
  analysis: Pick<LiveAnamnesisAnalysis, "templateKey" | "state">,
  options?: NarrativeOptions,
) {
  const fields = ANAMNESIS_TEMPLATES[analysis.templateKey];
  const omit = new Set((options?.omitFieldKeys || []).map((key) => key.trim()).filter(Boolean));
  const sentences = fields
    .filter((field) => !omit.has(field.key))
    .map((field) => sentenceFromField(field.label, analysis.state[field.key], options))
    .filter(Boolean);

  if (!sentences.length) return "Es liegen noch keine strukturierten Angaben vor.";
  return sentences.join(" ");
}

export const EMPTY_ANALYSIS: LiveAnamnesisAnalysis = {
  templateKey: "allgemein",
  state: defaultStateForTemplate("allgemein"),
  structuredAnamnesis: stateToStructured("allgemein", defaultStateForTemplate("allgemein")),
  missingPoints: [],
  nextQuestions: [],
  isComplete: false,
  completionText: "",
};

function normalizeState(inputState: unknown, templateKey: TemplateKey): AnamnesisState {
  const templateFields = ANAMNESIS_TEMPLATES[templateKey];
  const defaultState = defaultStateForTemplate(templateKey);
  if (!inputState || typeof inputState !== "object") return defaultState;

  for (const field of templateFields) {
    const raw = (inputState as Record<string, unknown>)[field.key];
    if (!raw || typeof raw !== "object") continue;
    const status = (raw as Record<string, unknown>).status;
    const value = (raw as Record<string, unknown>).value;
    if (status === "known" || status === "unclear" || status === "missing") {
      defaultState[field.key] = {
        status,
        value: typeof value === "string" ? value.trim() : undefined,
      };
    }
  }

  return defaultState;
}

export function normalizeAnalysis(input: Partial<LiveAnamnesisAnalysis> | null | undefined): LiveAnamnesisAnalysis {
  const templateKey =
    input?.templateKey && TEMPLATE_KEYS.includes(input.templateKey as TemplateKey)
      ? (input.templateKey as TemplateKey)
      : "allgemein";

  const safeState = normalizeState(input?.state, templateKey);

  const safeStructured = Array.isArray(input?.structuredAnamnesis)
    ? input!.structuredAnamnesis
        .filter((section) => section && typeof section.section === "string")
        .map((section) => ({
          section: section.section,
          items: Array.isArray(section.items)
            ? section.items
                .filter((item) => item && typeof item.label === "string" && typeof item.value === "string")
                .slice(0, 30)
            : [],
        }))
        .slice(0, 10)
    : [];

  const safeMissing = Array.isArray(input?.missingPoints)
    ? input!.missingPoints.filter((item) => typeof item === "string" && item.trim()).slice(0, 30)
    : [];

  const safeQuestions = Array.isArray(input?.nextQuestions)
    ? (input!.nextQuestions as unknown[])
        .map((item) => {
          if (typeof item === "string") {
            return { text: item.trim(), priority: "medium" as QuestionPriority, category: templateKey };
          }
          if (!item || typeof item !== "object") return null;
          const text = typeof (item as AnamnesisQuestion).text === "string" ? (item as AnamnesisQuestion).text.trim() : "";
          const priority = (item as AnamnesisQuestion).priority;
          const category = typeof (item as AnamnesisQuestion).category === "string" ? (item as AnamnesisQuestion).category : templateKey;
          const key = typeof (item as AnamnesisQuestion).key === "string" ? (item as AnamnesisQuestion).key : undefined;
          const reason = typeof (item as AnamnesisQuestion).reason === "string" ? (item as AnamnesisQuestion).reason?.trim() : undefined;
          if (!text) return null;
          return {
            text,
            priority: priority === "high" || priority === "medium" || priority === "low" ? priority : "medium",
            category,
            key,
            reason,
          };
        })
        .filter((item): item is AnamnesisQuestion => Boolean(item))
        .slice(0, 12)
    : [];

  const safeIsComplete = Boolean(input?.isComplete);
  const safeCompletionText = typeof input?.completionText === "string" ? input.completionText.trim() : "";

  return {
    templateKey,
    state: safeState,
    structuredAnamnesis: safeStructured.length ? safeStructured : stateToStructured(templateKey, safeState),
    missingPoints: safeMissing,
    nextQuestions: safeQuestions,
    isComplete: safeIsComplete,
    completionText: safeCompletionText,
  };
}

export function formatAnalysisForCaseResult(analysis: LiveAnamnesisAnalysis) {
  const templateLabel = ANAMNESIS_TEMPLATE_META[analysis.templateKey]?.label || analysis.templateKey;
  const fields = ANAMNESIS_TEMPLATES[analysis.templateKey] || [];

  const narrative = formatAnalysisNarrative(analysis, {
    includeMissing: false,
    omitFieldKeys: ["vorerkrankungen", "medikation"],
  });
  const finalNotes = extractFinalNotes(analysis);

  // Build detailed field table
  const knownFields = fields
    .filter((f) => analysis.state[f.key]?.status === "known")
    .map((f) => {
      const val = analysis.state[f.key]?.value?.trim();
      const display = val && val.toLowerCase() !== "erwaehnt" && val.toLowerCase() !== "bekannt" && val.toLowerCase() !== "erhoben"
        ? val : "erhoben";
      return `- **${f.label}**: ${display}`;
    });

  const unclearFields = fields
    .filter((f) => analysis.state[f.key]?.status === "unclear")
    .map((f) => {
      const val = analysis.state[f.key]?.value?.trim();
      return `- **${f.label}**: ${val || "unklar"}`;
    });

  const missingFields = fields
    .filter((f) => !analysis.state[f.key] || analysis.state[f.key]?.status === "missing")
    .map((f) => `- ${f.label}`);

  const questions = analysis.nextQuestions.length
    ? analysis.nextQuestions.map((item) => `- [${item.priority}] ${item.text}`).join("\n")
    : "";

  const completion = analysis.isComplete
    ? analysis.completionText || "Anamnese vollständig."
    : "Noch nicht abgeschlossen.";

  const total = fields.length;
  const known = knownFields.length;
  const pct = total > 0 ? Math.round(((known + unclearFields.length * 0.5) / total) * 100) : 0;

  const sections: string[] = [
    `# Live-Anamnese – ${templateLabel}`,
    "",
    `**Vollständigkeit: ${pct}%** (${known} erhoben, ${unclearFields.length} unklar, ${missingFields.length} fehlend)`,
    "",
    "## Zusammenfassung",
    narrative,
  ];

  if (knownFields.length) {
    sections.push("", "## Erhobene Befunde", knownFields.join("\n"));
  }

  if (unclearFields.length) {
    sections.push("", "## Unklare Angaben", unclearFields.join("\n"));
  }

  if (finalNotes.vorerkrankungen !== "nicht erhoben") {
    sections.push("", "## Vorerkrankungen", finalNotes.vorerkrankungen);
  }

  if (finalNotes.medikation !== "nicht erhoben") {
    sections.push("", "## Aktuelle Medikation", finalNotes.medikation);
  }

  if (questions) {
    sections.push("", "## Empfohlene nächste Fragen", questions);
  }

  if (missingFields.length) {
    sections.push("", "## Fehlende Angaben", missingFields.join("\n"));
  }

  sections.push("", "## Status", completion);

  return sections.join("\n");
}