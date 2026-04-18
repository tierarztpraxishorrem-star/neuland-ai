import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function getR2() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error('R2 not configured');
  return new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });
}

const BUCKET = process.env.R2_BUCKET || 'tierarzt-audio';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files.length) {
      return NextResponse.json({ error: 'Keine Dateien hochgeladen.' }, { status: 400 });
    }

    if (files.length > 20) {
      return NextResponse.json({ error: 'Maximal 20 Dateien erlaubt.' }, { status: 400 });
    }

    const client = getR2();
    const sessionId = crypto.randomUUID();
    const results: { key: string; name: string; type: string; size: number }[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `Datei "${file.name}" ist zu groß (max. 20 MB).` }, { status: 400 });
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: `Dateityp "${file.type}" nicht erlaubt. Erlaubt: Bilder, PDF, Word.` }, { status: 400 });
      }

      const ext = file.name.split('.').pop() || 'bin';
      const key = `registrations/vorbefunde/${sessionId}/${crypto.randomUUID()}.${ext}`;
      const buffer = await file.arrayBuffer();

      await client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: new Uint8Array(buffer),
        ContentType: file.type,
        Metadata: { original_name: file.name },
      }));

      results.push({ key, name: file.name, type: file.type, size: file.size });
    }

    return NextResponse.json({ ok: true, sessionId, files: results });
  } catch (err) {
    console.error('[registration/upload]', err);
    return NextResponse.json({ error: 'Fehler beim Hochladen.' }, { status: 500 });
  }
}
