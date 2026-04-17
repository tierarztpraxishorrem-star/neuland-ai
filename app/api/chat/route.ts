export const maxDuration = 300; // long transcripts need time for generation

import { NextResponse } from "next/server";
import { privacyConfig, PUBLIC_CHAT_CHANNEL } from "../../../lib/privacyConfig";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatRequestBody = {
  messages?: Array<Partial<ChatMessage>>;
  context?: unknown;
  consentAccepted?: boolean;
  channel?: string;
  mode?: "safe_documentation" | "clinical_support";
};

const MAX_CONTEXT_CHARS = 60000;
const MAX_MESSAGE_CHARS = 120000; // long transcripts can be 50k+ chars
const MAX_MESSAGES = 20;
const PRIMARY_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-5";
const FALLBACK_MODEL = process.env.OPENAI_CHAT_FALLBACK_MODEL || "gpt-4.1";
const UNCERTAINTY_NOTE =
  "Die Einschaetzung basiert ausschliesslich auf den vorliegenden Informationen und kann unvollstaendig sein.";

const sanitizeText = (value: unknown, limit: number) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
};

const sanitizeMessages = (messages: ChatRequestBody["messages"]) => {
  if (!Array.isArray(messages)) return [] as ChatMessage[];
  return messages
    .filter((message): message is Partial<ChatMessage> => typeof message === "object" && message !== null)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
      content: sanitizeText(message.content, MAX_MESSAGE_CHARS),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_MESSAGES);
};

const containsLiteratureRequest = (value: string) =>
  /\b(studie|studien|literatur|quelle|quellen|leitlinie|guideline|pubmed|paper|evidenz)\b/i.test(value);

const enforceLiteraturePolicy = (text: string, allowLiterature: boolean) => {
  if (allowLiterature) return text;

  const lines = text.split("\n");
  const filtered: string[] = [];
  let inSourcesBlock = false;

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    if (trimmed.startsWith("quellen")) {
      inSourcesBlock = true;
      continue;
    }

    if (inSourcesBlock) {
      if (!trimmed) {
        inSourcesBlock = false;
      }
      continue;
    }

    filtered.push(line);
  }

  return filtered.join("\n").trim();
};

const isClinicalResponse = (outputText: string) => {
  const output = outputText.toLowerCase();
  const clinicalMarkers = [
    "differentialdiagnos",
    "diagnostischer plan",
    "therapieplan",
    "klinische kerneinschaetzung",
    "managementplan",
    "dosierung",
    "mg/kg",
    "prognose",
  ];
  return clinicalMarkers.filter((w) => output.includes(w)).length >= 2;
};

const shouldMarkAsPossibleConsideration = (inputText: string, outputText: string) => {
  if (!isClinicalResponse(outputText)) return false;

  const input = inputText.toLowerCase();
  const output = outputText.toLowerCase();

  const signalWords = [
    "diagnose",
    "differential",
    "therapie",
    "operation",
    "medikation",
    "prognose",
    "verdacht",
    "wahrscheinlich",
  ];

  const hasClinicalInferenceSignal = signalWords.some((w) => output.includes(w));
  if (!hasClinicalInferenceSignal) return false;

  const outputTerms = new Set(
    output
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 7),
  );

  let unseenTerms = 0;
  for (const term of outputTerms) {
    if (!input.includes(term)) unseenTerms += 1;
    if (unseenTerms >= 4) return true;
  }

  return false;
};

const validateOutput = ({
  mode,
  inputText,
  outputText,
  allowLiterature,
}: {
  mode: "safe_documentation" | "clinical_support";
  inputText: string;
  outputText: string;
  allowLiterature: boolean;
}) => {
  let next = enforceLiteraturePolicy(outputText, allowLiterature);

  const shouldMark = shouldMarkAsPossibleConsideration(inputText, next);
  if (shouldMark) {
    const marker = "Moegliche Ueberlegung (nicht gesichert):";
    if (!next.startsWith(marker)) {
      next = `${marker}\n${next}`;
    }
  }

  if (mode === "safe_documentation" && shouldMark) {
    next = `${markerForSafeMode()}\n${next}`;
  }

  return next.trim();
};

const markerForSafeMode = () =>
  "Hinweis: Es wurden potenziell ueber den Input hinausgehende Inhalte erkannt und als moegliche Ueberlegung gekennzeichnet.";

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequestBody;
  const channel = sanitizeText(body.channel, 64);
  const consentAccepted = body.consentAccepted === true;
  const mode = body.mode === "safe_documentation" ? "safe_documentation" : "clinical_support";

  if (privacyConfig.consentRequired && channel === PUBLIC_CHAT_CHANNEL && !consentAccepted) {
    return NextResponse.json(
      { error: "Consent erforderlich: Bitte Zustimmung zur Datenverarbeitung erteilen." },
      { status: 403 },
    );
  }

  const messages = sanitizeMessages(body.messages);
  const context = sanitizeText(body.context, MAX_CONTEXT_CHARS);
  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const allowLiterature = containsLiteratureRequest(latestUserMessage);
  const mergedInput = `${context}\n${messages.map((m) => `${m.role}: ${m.content}`).join("\n")}`;
  const hasClearData = context.trim().length >= 80 || messages.filter((m) => m.role === "user").length >= 2;
  let isUncertain = mode === "clinical_support" || !hasClearData;
  const hasExternalKnowledge = mode === "clinical_support";

  if (messages.length === 0) {
    return NextResponse.json({ error: "Keine gueltigen Nachrichten uebergeben." }, { status: 400 });
  }

  const systemPrompt = `
Du bist VetMind – der interne KI-Assistent einer Tierarztpraxis. Du unterstuetzt das gesamte Team (Tieraerzte, TFAs, Praxismanagement) bei allen Aufgaben.

ERKENNE AUTOMATISCH DEN AUFGABENTYP und passe dein Verhalten an:

─── KLINISCHE FRAGEN (Patienten, Diagnosen, Therapien, Befunde) ───
Wenn ein klinischer Fall, Patient oder medizinische Fragestellung vorliegt:
- Antworte auf Diplomate-/Professoren-Niveau (ECVIM/ACVIM).
- Priorisiere Differentialdiagnosen nach Wahrscheinlichkeit und Gefaehrlichkeit.
- Benenne Red Flags und naechste Schritte zuerst.
- Trenne klar zwischen gesichert, wahrscheinlich und spekulativ.
- Weise auf Informationsluecken hin.
- Keine erfundenen Quellen oder Studien.
- Bei Dosierungen nur konservative, klinisch belastbare Angaben.
- Nutze dieses Format nur bei klinischen Fragen:
  1) Klinische Kerneinschaetzung
  2) Differentialdiagnosen
  3) Diagnostischer Plan
  4) Therapie-/Managementplan
  5) Unsicherheiten
  6) Quellen (nur wenn angefragt)

─── KOMMUNIKATION (E-Mails, Briefe, Besitzerkommunikation) ───
Wenn nach Texten, E-Mails, Briefen oder Besitzerkommunikation gefragt wird:
- Schreibe professionell, empathisch und klar.
- Passe Tonalitaet an: formell fuer Ueberweisungen, warm fuer Besitzer.
- Liefere direkt verwendbare Texte.

─── PRAXISORGANISATION (Dienstplaene, Ablaeufe, SOPs, HR) ───
Wenn nach internen Ablaeufen, Organisation oder Management gefragt wird:
- Antworte pragmatisch und strukturiert.
- Gib konkrete, umsetzbare Vorschlaege.

─── ALLGEMEINE FRAGEN ───
Bei allen anderen Fragen:
- Antworte hilfreich, praezise und ohne unnoetige Formalitaeten.
- Kein starres Format – passe die Antwortstruktur an die Frage an.
- Sei ein kompetenter Assistent, kein Formular-Automat.

AKTUELLER MODUS: ${mode}
- Wenn MODE = safe_documentation: nur strukturieren, keine neuen Interpretationen.
- Wenn MODE = clinical_support: vorsichtige Interpretation erlaubt.

UEBERGREIFENDE REGELN:
- Treffe keine Annahmen, die nicht im Input stehen.
- Erfinde keine Quellen, Studien oder Links.
- Praezise, knapp, fachlich dicht – keine Floskeln.
- Antworte auf Deutsch.

KONTEXT:
${context || "Kein Kontext vorhanden"}
`;

  const callOpenAI = async (model: string) =>
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        // Privacy-by-default: ask OpenAI not to store this request/response payload.
        store: false,
        stream: true,
        input: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        ],
        temperature: 0.15,
        max_output_tokens: 12000,
      }),
    });

  let activeModel = PRIMARY_MODEL;
  let response = await callOpenAI(activeModel);

  if (!response.ok && activeModel !== FALLBACK_MODEL) {
    const primaryError = await response.text();
    const fallbackResponse = await callOpenAI(FALLBACK_MODEL);
    if (fallbackResponse.ok && fallbackResponse.body) {
      response = fallbackResponse;
      activeModel = FALLBACK_MODEL;
    } else {
      const fallbackError = await fallbackResponse.text();
      return NextResponse.json(
        { error: `Primary model failed (${PRIMARY_MODEL}): ${primaryError}; fallback failed (${FALLBACK_MODEL}): ${fallbackError}` },
        { status: 500 },
      );
    }
  }

  if (!response.ok || !response.body) {
    const error = await response.text();
    return NextResponse.json({ error }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();
      let fullReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);

        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;

          // ✅ WICHTIG: nur echte Daten verarbeiten
          if (!line.startsWith("data:")) continue;

          const json = line.replace("data: ", "").trim();

          if (json === "[DONE]") continue;

          try {
            const parsed = JSON.parse(json);

            let text = "";

// neuer responses API Pfad
if (parsed.type === "response.output_text.delta") {
  text = parsed.delta;
}

// fallback (alte Struktur)
if (!text) {
  text =
    parsed?.output?.[0]?.content?.[0]?.text ||
    parsed?.delta?.content ||
    "";
}

            if (text) {
              fullReply += text;
            }
          } catch {
            // ignore Fehler
          }
        }
      }

      fullReply = validateOutput({
        mode,
        inputText: mergedInput,
        outputText: fullReply,
        allowLiterature,
      });

      // Uncertainty note only for actual clinical responses
      if (isClinicalResponse(fullReply) && (!hasClearData || mode === "clinical_support")) {
        if (!fullReply.includes(UNCERTAINTY_NOTE)) {
          fullReply = `${fullReply}\n\n${UNCERTAINTY_NOTE}`;
        }
      }

      isUncertain = isUncertain || fullReply.includes("Moegliche Ueberlegung");

      // Emit finalized, validated output once to avoid leaking unvalidated chunks.
      controller.enqueue(encoder.encode(fullReply));

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "x-ai-mode": mode,
      "x-ai-is-uncertain": String(isUncertain),
      "x-ai-has-external-knowledge": String(hasExternalKnowledge),
    },
  });
}