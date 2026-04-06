const ASSEMBLY_API_URL = "https://api.assemblyai.com/v2";
const DEFAULT_POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 80;
const CORRECTION_MIN_LENGTH = 300;

const MEDICAL_WORD_BOOST = [
  "Gallenblasenschlamm",
  "Leukozytose",
  "Anamnese",
  "Ultraschall",
  "Differentialdiagnose",
  "Pankreatitis",
  "Hepatopathie",
  "Harnblase",
  "Magensonde",
  "Rassepraedisposition"
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeText = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

async function uploadToAssembly(file: File, apiKey: string) {
  const uploadRes = await fetch(`${ASSEMBLY_API_URL}/upload`, {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/octet-stream"
    },
    body: Buffer.from(await file.arrayBuffer())
  });

  if (!uploadRes.ok) {
    const detail = await uploadRes.text();
    throw new Error(`Assembly upload failed: ${detail || uploadRes.statusText}`);
  }

  const uploadJson = await uploadRes.json();
  const uploadUrl = sanitizeText(uploadJson?.upload_url);
  if (!uploadUrl) {
    throw new Error("Assembly upload did not return upload_url");
  }

  return uploadUrl;
}

async function createAssemblyTranscript(uploadUrl: string, apiKey: string) {
  const transcriptRes = await fetch(`${ASSEMBLY_API_URL}/transcript`, {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      audio_url: uploadUrl,
      punctuate: true,
      format_text: true,
      language_code: "de",
      speech_model: "best",
      word_boost: MEDICAL_WORD_BOOST,
      boost_param: "high"
    })
  });

  if (!transcriptRes.ok) {
    const detail = await transcriptRes.text();
    throw new Error(`Assembly transcript creation failed: ${detail || transcriptRes.statusText}`);
  }

  const transcriptJson = await transcriptRes.json();
  const transcriptId = sanitizeText(transcriptJson?.id);
  if (!transcriptId) {
    throw new Error("Assembly transcript creation did not return transcript id");
  }

  return transcriptId;
}

async function pollAssemblyTranscript(transcriptId: string, apiKey: string) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const pollRes = await fetch(`${ASSEMBLY_API_URL}/transcript/${transcriptId}`, {
      method: "GET",
      headers: {
        authorization: apiKey
      },
      cache: "no-store"
    });

    if (!pollRes.ok) {
      const detail = await pollRes.text();
      throw new Error(`Assembly polling failed: ${detail || pollRes.statusText}`);
    }

    const pollJson = await pollRes.json();
    const status = sanitizeText(pollJson?.status);

    if (status === "completed") {
      return sanitizeText(pollJson?.text);
    }

    if (status === "error") {
      throw new Error(`Assembly transcription error: ${sanitizeText(pollJson?.error) || "unknown"}`);
    }

    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  throw new Error("Assembly transcription timed out");
}

async function maybeCorrectTranscript(rawText: string) {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey || rawText.length < CORRECTION_MIN_LENGTH) {
    return {
      text: rawText,
      corrected: false
    };
  }

  const correctionPrompt = [
    "Korrigiere den folgenden medizinischen Transkriptions-Text.",
    "Regeln:",
    "- Nur Schreibfehler, medizinische Begriffe und Satzzeichen korrigieren.",
    "- Keine neuen Inhalte hinzufuegen.",
    "- Nichts interpretieren.",
    "- Keine Informationen weglassen.",
    "- Nur den korrigierten Text ausgeben, ohne Erklaerung.",
    "",
    "TEXT:",
    rawText
  ].join("\n");

  try {
    const correctionRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: correctionPrompt
          }
        ],
        temperature: 0.0,
        max_output_tokens: 2000
      })
    });

    if (!correctionRes.ok) {
      return {
        text: rawText,
        corrected: false
      };
    }

    const correctionJson = await correctionRes.json();
    const correctedText = sanitizeText(correctionJson?.output_text);

    return {
      text: correctedText || rawText,
      corrected: Boolean(correctedText)
    };
  } catch {
    return {
      text: rawText,
      corrected: false
    };
  }
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "ASSEMBLYAI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const uploadUrl = await uploadToAssembly(file, apiKey);
    const transcriptId = await createAssemblyTranscript(uploadUrl, apiKey);
    const rawText = await pollAssemblyTranscript(transcriptId, apiKey);

    const { text, corrected } = await maybeCorrectTranscript(rawText);

    return Response.json({
      text,
      rawText,
      corrected,
      provider: "assemblyai"
    });
  } catch (error: any) {
    console.error("Transcription pipeline error:", error);
    return Response.json(
      { error: error?.message || "Transcription failed" },
      { status: 500 }
    );
  }
}
