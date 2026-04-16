import { NextResponse } from "next/server";
import OpenAI from "openai";

const ALLOWED_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);
const MAX_TEXT_LENGTH = 4096;
const MIN_SPEED = 0.25;
const MAX_SPEED = 4.0;

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API-Key ist nicht konfiguriert." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null) as
      | { text?: unknown; voice?: unknown; speed?: unknown }
      | null;

    if (!body) {
      return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "Bitte Text eingeben." }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Text ist zu lang (max. ${MAX_TEXT_LENGTH} Zeichen).` },
        { status: 400 }
      );
    }

    const voice = typeof body.voice === "string" && ALLOWED_VOICES.has(body.voice)
      ? body.voice
      : "nova";

    const rawSpeed = typeof body.speed === "number" ? body.speed : 1.0;
    const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, rawSpeed));

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const mp3 = await openai.audio.speech.create({
      model: "tts-1-hd",
      voice: voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
      input: text,
      speed,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buffer.length),
        "Content-Disposition": 'attachment; filename="vetmind-audio.mp3"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    console.error("[api/tts] Fehler:", error);
    return NextResponse.json(
      { error: `Sprachgenerierung fehlgeschlagen: ${message}` },
      { status: 500 }
    );
  }
}
