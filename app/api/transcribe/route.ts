export const maxDuration = 300; // 5 min – AssemblyAI polling for long audio needs time
export const runtime = 'nodejs';

const ASSEMBLY_API_URL = "https://api.assemblyai.com/v2";
const OPENAI_FILE_SIZE_LIMIT_MB = 24; // OpenAI Whisper/transcribe hard limit is 25 MB
const DEFAULT_POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 130; // ~260s max polling – fits within 300s maxDuration
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

async function transcribeWithOpenAI(file: File, apiKey: string) {
  const body = new FormData();
  body.append("file", file, file.name || `live-${Date.now()}.webm`);
  body.append("model", "gpt-4o-mini-transcribe");
  body.append("language", "de");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI live transcription failed: ${detail || res.statusText}`);
  }

  const json = await res.json();
  return sanitizeText(json?.text);
}

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

  // Estimate tokens needed: ~1 token per 4 chars, with headroom
  const estimatedTokens = Math.ceil(rawText.length / 3.5);
  const correctionTokens = Math.min(Math.max(estimatedTokens, 2000), 16000);

  const correctionPrompt = [
    "Korrigiere den folgenden Transkriptions-Text.",
    "Regeln:",
    "- Schreibfehler, Fachbegriffe (medizinisch, technisch, organisatorisch) und Satzzeichen korrigieren.",
    "- Sprecherpausen, Fuellwoerter (aehm, also, quasi) und Wiederholungen behutsam glaetten.",
    "- Keine neuen Inhalte hinzufuegen.",
    "- Nichts interpretieren oder weglassen.",
    "- Den VOLLSTAENDIGEN Text ausgeben, nichts kuerzen.",
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
        max_output_tokens: correctionTokens
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
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const audioUrl = sanitizeText(formData.get("audio_url"));
    const mode = sanitizeText(formData.get("mode"));
    const isLiveMode = mode.toLowerCase() === "live";

    if (!file && !audioUrl) {
      return Response.json({ error: "No file or audio_url provided" }, { status: 400 });
    }

    // --- Path A: pre-uploaded file via URL (large files bypass Vercel body limit) ---
    if (audioUrl) {
      console.log(`[transcribe] Using pre-uploaded audio_url`);

      const assemblyKey = process.env.ASSEMBLYAI_API_KEY;
      if (!assemblyKey) {
        return Response.json(
          { error: "ASSEMBLYAI_API_KEY is not configured" },
          { status: 500 }
        );
      }

      // AssemblyAI accepts any public URL directly – no need to re-upload
      const transcriptId = await createAssemblyTranscript(audioUrl, assemblyKey);
      const rawText = await pollAssemblyTranscript(transcriptId, assemblyKey);
      const { text, corrected } = await maybeCorrectTranscript(rawText);

      return Response.json({
        text,
        rawText,
        corrected,
        provider: "assemblyai-url"
      });
    }

    // --- Path B: file sent in request body (small files only, <4.5 MB Vercel limit) ---
    const fileSizeMB = file!.size / (1024 * 1024);
    const openAiKey = process.env.OPENAI_API_KEY;

    // Fast path for live mode to avoid queue backlog and delayed transcript updates.
    // Skip OpenAI if file exceeds their 25 MB limit – go straight to AssemblyAI.
    if (isLiveMode && openAiKey && fileSizeMB <= OPENAI_FILE_SIZE_LIMIT_MB) {
      try {
        const text = await transcribeWithOpenAI(file!, openAiKey);
        return Response.json({
          text,
          rawText: text,
          corrected: false,
          provider: "openai-live",
        });
      } catch (error) {
        console.warn("OpenAI live transcription failed, falling back to AssemblyAI", error);
      }
    }

    const assemblyKey = process.env.ASSEMBLYAI_API_KEY;
    if (!assemblyKey) {
      return Response.json(
        { error: "ASSEMBLYAI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const uploadUrl = await uploadToAssembly(file!, assemblyKey);
    const transcriptId = await createAssemblyTranscript(uploadUrl, assemblyKey);
    const rawText = await pollAssemblyTranscript(transcriptId, assemblyKey);

    const { text, corrected } = await maybeCorrectTranscript(rawText);

    return Response.json({
      text,
      rawText,
      corrected,
      provider: "assemblyai"
    });
  } catch (error: unknown) {
    console.error("Transcription pipeline error:", error);
    const message = error instanceof Error ? error.message : "Transcription failed";
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
