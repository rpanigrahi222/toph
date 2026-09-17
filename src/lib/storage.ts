import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Audio storage. Vercel Blob when BLOB_READ_WRITE_TOKEN is set (attach a Blob
 * store in the Vercel dashboard); the local filesystem for `npm run dev`.
 *
 * Returns null when there is nowhere durable to put the file (e.g. Vercel
 * without a Blob store — its filesystem is read-only). The log is still saved;
 * it just won't have playback.
 */
export async function storeAudio(buf: Buffer, mime: string): Promise<string | null> {
  const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
  const name = `recordings/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import("@vercel/blob");
      const blob = await put(name, buf, { access: "public", contentType: mime, addRandomSuffix: false });
      return blob.url;
    }

    if (process.env.VERCEL) {
      console.warn("storeAudio: no BLOB_READ_WRITE_TOKEN on Vercel — skipping audio upload");
      return null;
    }

    const dir = path.join(process.cwd(), "public", "uploads", "recordings");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(process.cwd(), "public", "uploads", name), buf);
    return `/uploads/${name}`;
  } catch (err) {
    console.error("storeAudio failed; saving log without audio", err);
    return null;
  }
}
