import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();

    const transcription = await openai.audio.transcriptions.create({
      file: new File([arrayBuffer], "audio.webm", { type: "audio/webm" }),
      model: "gpt-4o-mini-transcribe",
    });

    return Response.json({
      text: transcription.text,
    });

  } catch (error) {
    console.error("❌ Transcription Error:", error);
    return Response.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
