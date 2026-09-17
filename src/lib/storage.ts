import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Audio storage. Vercel Blob in production (BLOB_READ_WRITE_TOKEN is injected
 * when you attach a Blob store); the local filesystem otherwise so `npm run dev`
 * works with zero cloud setup.
 */
export async function storeAudio(buf: Buffer, mime: string): Promise<string> {
  const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
  const name = `recordings/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(name, buf, { access: "public", contentType: mime, addRandomSuffix: false });
    return blob.url;
  }

  const dir = path.join(process.cwd(), "public", "uploads", "recordings");
  await mkdir(dir, { recursive: true });
  const file = path.join(process.cwd(), "public", "uploads", name);
  await writeFile(file, buf);
  return `/uploads/${name}`;
}
