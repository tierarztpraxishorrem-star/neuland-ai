import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export async function POST(req: Request) {
  try {
    console.log("📥 Upload gestartet");

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.log("❌ Kein File erhalten");
      return Response.json({ error: "Kein File erhalten." }, { status: 400 });
    }

    console.log("📦 Dateiname:", file.name);
    console.log("📏 Dateigröße (Bytes):", file.size);

    if (file.size > 5_000_000) {
      console.log("⚠️ Datei sehr groß – mögliches Problem");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    console.log("🧠 Buffer erstellt");

    const client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });

    const fileName = `audio-${Date.now()}.webm`;
    console.log("☁️ Upload zu R2 startet...");

    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: fileName,
        Body: buffer,
        ContentType: file.type,
      })
    );

    console.log("✅ Upload erfolgreich:", fileName);
    const publicUrl = `https://pub-14794881d3f446c2b026b4c2d9715c0a.r2.dev/${fileName}`;

    return Response.json({ url: publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    console.error("[api/upload] Fehler:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
