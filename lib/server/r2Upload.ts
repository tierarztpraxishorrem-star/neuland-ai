/**
 * Upload WhatsApp media files to Cloudflare R2.
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function getR2Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials not configured");
  }
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

const BUCKET = process.env.R2_BUCKET || "tierarzt-audio";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "application/pdf": "pdf",
};

/**
 * Upload a buffer to R2 and return the storage key + public URL.
 */
export async function uploadWhatsAppMedia(
  practiceId: string,
  conversationId: string,
  messageId: string,
  buffer: ArrayBuffer,
  contentType: string
): Promise<{ key: string; url: string }> {
  const client = getR2Client();
  const ext = MIME_TO_EXT[contentType] || "bin";
  const key = `whatsapp/${practiceId}/${conversationId}/${messageId}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: new Uint8Array(buffer),
      ContentType: contentType,
    })
  );

  // R2 public URL – adjust if you have a custom domain on R2
  const endpoint = process.env.R2_ENDPOINT || "";
  const baseUrl = endpoint.replace(/\/$/, "");
  const url = `${baseUrl}/${BUCKET}/${key}`;

  return { key, url };
}
