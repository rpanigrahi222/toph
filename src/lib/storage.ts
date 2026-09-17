import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Audio storage. Vercel Blob when a store is attached; the local filesystem
 * for `npm run dev`.
 *
 * Blob auth comes in two flavours and the SDK resolves both from env:
 *  - OIDC (current default when you attach a store): BLOB_STORE_ID + the
 *    identity token Vercel injects into every function invocation.
 *  - Legacy read-write token: BLOB_READ_WRITE_TOKEN.
 *
 * Recordings are uploaded as *private* blobs (a worker's voice shouldn't sit
 * on a public URL) and streamed to the browser through /api/audio/[logId].
 * If the store happens to be public-only, we fall back to a public upload.
 *
 * Returns null when there is nowhere durable to put the file (e.g. Vercel
 * without a Blob store — its filesystem is read-only). The log is still saved;
 * it just won't have playback.
 */
export function hasBlobStore() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export async function storeAudio(buf: Buffer, mime: string): Promise<string | null> {
  const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
  const name = `recordings/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    if (hasBlobStore()) {
      const { put } = await import("@vercel/blob");
      try {
        const blob = await put(name, buf, { access: "private", contentType: mime, addRandomSuffix: false });
        return blob.url;
      } catch (err) {
        if (!/private access on a public store/i.test(String(err))) throw err;
        const blob = await put(name, buf, { access: "public", contentType: mime, addRandomSuffix: false });
        return blob.url;
      }
    }

    if (process.env.VERCEL) {
      console.warn("storeAudio: no Blob store attached (BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN) — skipping audio upload");
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

/**
 * The URL the browser should use to play a log's audio. Local files are
 * served straight from /public; Blob files go through our streaming route so
 * private blobs work and the Blob URL never reaches the client.
 */
export function playbackUrl(logId: string, audioUrl: string | null): string | null {
  if (!audioUrl) return null;
  if (audioUrl.startsWith("/")) return audioUrl;
  return `/api/audio/${logId}`;
}

/**
 * Fetch a stored recording as a Response suitable for an <audio> element.
 * Tries private access first, then falls back to the public URL.
 */
export async function fetchAudio(audioUrl: string, mime: string | null): Promise<Response> {
  const { get } = await import("@vercel/blob");
  try {
    const res = await get(audioUrl, { access: "private" });
    if (res && res.stream) {
      return new Response(res.stream, {
        status: 200,
        headers: {
          "content-type": res.blob.contentType ?? mime ?? "audio/webm",
          "content-length": String(res.blob.size ?? ""),
          "cache-control": "private, max-age=3600",
          "accept-ranges": "none",
        },
      });
    }
  } catch (err) {
    console.warn("private blob read failed, trying public URL", err);
  }
  // Public store (legacy token) — the URL itself is fetchable.
  const upstream = await fetch(audioUrl);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? mime ?? "audio/webm",
      "cache-control": "private, max-age=3600",
    },
  });
}
