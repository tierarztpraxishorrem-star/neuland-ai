import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function GET() {
  try {
    const client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });

    const fileName = `audio-${Date.now()}.webm`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: fileName,
      ContentType: "audio/webm",
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });
    const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://pub-14794881d3f446c2b026b4c2d9715c0a.r2.dev';
    const publicUrl = `${r2PublicUrl}/${fileName}`;

    return Response.json({ uploadUrl: signedUrl, fileUrl: publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    console.error("[api/upload-url] Fehler:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
