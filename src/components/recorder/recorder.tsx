"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DeepgramClient } from "@deepgram/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Keyboard, Loader2, Mic, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LANGUAGES, activityLabel, languageLabel } from "@/lib/format";
import type { LogDetail } from "@/lib/queries";
import type { User } from "@/db/schema";
import { cn } from "@/lib/utils";

type Phase = "idle" | "connecting" | "recording" | "processing" | "done" | "error";

type TokenResponse = { accessToken: string; expiresIn: number; keyterms: string[] };

const PROMPTS: Record<string, string> = {
  en: "Say what you did, where, and with what — e.g. “Sprayed Roundup on Field A from 6 to 10 this morning, 32 ounces an acre.”",
  es: "Di qué hiciste, dónde y con qué — p. ej. “Apliqué Roundup en el campo A de 6 a 10, 32 onzas por acre.”",
  fr: "Dites ce que vous avez fait, où et avec quoi — p. ex. « J'ai pulvérisé du Roundup sur la parcelle A de 6h à 10h. »",
  de: "Sag, was du gemacht hast, wo und womit — z. B. „Roundup auf Feld A gespritzt, 6 bis 10 Uhr.“",
  pt: "Diga o que fez, onde e com o quê — ex. “Apliquei Roundup no campo A das 6 às 10.”",
  hi: "बताइए आपने क्या किया, कहाँ और किससे — जैसे “फ़ील्ड A पर सुबह 6 से 10 तक राउंडअप छिड़का।”",
  ja: "何を、どこで、何を使ってしたか話してください — 例「朝6時から10時までフィールドAにラウンドアップを散布しました」",
};

export function Recorder({ workers }: { workers: User[] }) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [language, setLanguage] = useState("multi");
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [finals, setFinals] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [detected, setDetected] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [result, setResult] = useState<{ log: LogDetail; via: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [typeMode, setTypeMode] = useState(false);

  // Refs mirror the transcript state so stop() reads the latest values after
  // Deepgram flushes its final segment.
  const finalsRef = useRef<string[]>([]);
  const interimRef = useRef("");

  // Mutable session state (not rendered).
  const session = useRef<{
    conn?: Awaited<ReturnType<DeepgramClient["listen"]["v1"]["connect"]>>;
    stream?: MediaStream;
    recorder?: MediaRecorder;
    chunks: Blob[];
    mime: string;
    peaks: number[];
    audioCtx?: AudioContext;
    raf?: number;
    startedAt: number;
    timer?: number;
  }>({ chunks: [], mime: "audio/webm", peaks: [], startedAt: 0 });

  useEffect(() => () => void teardown(), []);

  async function teardown() {
    const s = session.current;
    if (s.timer) window.clearInterval(s.timer);
    if (s.raf) cancelAnimationFrame(s.raf);
    try {
      if (s.recorder && s.recorder.state !== "inactive") s.recorder.stop();
    } catch {}
    s.stream?.getTracks().forEach((t) => t.stop());
    try {
      s.conn?.close();
    } catch {}
    await s.audioCtx?.close().catch(() => {});
    session.current = { chunks: [], mime: s.mime, peaks: [], startedAt: 0 };
  }

  async function start() {
    setError(null);
    setResult(null);
    finalsRef.current = [];
    interimRef.current = "";
    setFinals([]);
    setInterim("");
    setDetected(new Set());
    setElapsed(0);
    setPhase("connecting");

    try {
      // 1. Short-lived token + farm vocabulary from our server.
      const tokRes = await fetch("/api/deepgram/token");
      if (!tokRes.ok) {
        const j = await tokRes.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not get a Deepgram token");
      }
      const tok = (await tokRes.json()) as TokenResponse;

      // 2. Mic.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = pickMime();
      const s = session.current;
      s.stream = stream;
      s.mime = mime;
      s.chunks = [];
      s.peaks = [];

      // 3. Deepgram live connection (browser auth via Sec-WebSocket-Protocol, handled by the SDK).
      const dg = new DeepgramClient({ accessToken: tok.accessToken });
      const conn = await dg.listen.v1.connect({
        model: "nova-3",
        language,
        interim_results: "true",
        smart_format: "true",
        punctuate: "true",
        endpointing: 300,
        utterance_end_ms: 1200,
        vad_events: "true",
        // Keyterm prompting biases Nova-3 toward our product/field vocabulary.
        // Supported on English and multilingual streams.
        ...(language === "en" || language === "multi" ? { keyterm: tok.keyterms } : {}),
      });

      conn.on("message", (msg) => {
        if (msg.type !== "Results") return;
        const alt = msg.channel?.alternatives?.[0];
        if (!alt) return;
        const text = alt.transcript?.trim();
        if (alt.languages?.length) {
          setDetected((prev) => {
            const n = new Set(prev);
            alt.languages!.forEach((l) => n.add(l));
            return n;
          });
        }
        if (!text) return;
        if (msg.is_final) {
          finalsRef.current = [...finalsRef.current, text];
          interimRef.current = "";
          setFinals(finalsRef.current);
          setInterim("");
        } else {
          interimRef.current = text;
          setInterim(text);
        }
      });
      conn.on("error", (e) => {
        console.error("deepgram ws error", e);
        setError("Transcription connection error. You can still type the log below.");
      });
      conn.on("close", () => {
        // Normal on stop; only surface if we were mid-recording.
        if (session.current.recorder?.state === "recording") {
          setError("Transcription connection closed unexpectedly.");
        }
      });

      conn.connect();
      await conn.waitForOpen();
      s.conn = conn;

      // 4. Stream mic → Deepgram, and keep chunks for playback.
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          s.chunks.push(e.data);
          try {
            conn.sendMedia(e.data);
          } catch {}
        }
      };
      recorder.start(250);
      s.recorder = recorder;

      // 5. Level meter + peaks for the waveform.
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      s.audioCtx = ctx;
      const buf = new Uint8Array(analyser.fftSize);
      let lastSample = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        setLevel(rms);
        const now = performance.now();
        if (now - lastSample > 100) {
          s.peaks.push(Math.min(1, rms * 3));
          lastSample = now;
        }
        s.raf = requestAnimationFrame(tick);
      };
      tick();

      s.startedAt = Date.now();
      s.timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - s.startedAt) / 1000)), 250);
      setPhase("recording");
    } catch (e) {
      console.error(e);
      await teardown();
      setError(e instanceof Error ? e.message : "Could not start recording");
      setPhase("error");
    }
  }

  async function stop() {
    const s = session.current;
    if (phase !== "recording") return;
    setPhase("processing");

    // Flush: stop the recorder, tell Deepgram we're done, give it a beat to
    // emit the final segment, then tear everything down.
    const durationS = (Date.now() - s.startedAt) / 1000;
    if (s.timer) window.clearInterval(s.timer);
    if (s.raf) cancelAnimationFrame(s.raf);
    const stopped = new Promise<void>((resolve) => {
      if (!s.recorder || s.recorder.state === "inactive") return resolve();
      s.recorder.onstop = () => resolve();
      s.recorder.stop();
    });
    await stopped;
    try {
      s.conn?.sendCloseStream({ type: "CloseStream" });
    } catch {}
    await new Promise((r) => setTimeout(r, 900));

    const transcript = [...finalsRef.current, interimRef.current].filter(Boolean).join(" ").trim();
    const audio = new Blob(s.chunks, { type: s.mime });
    const peaks = downsample(s.peaks, 96);
    await teardown();

    if (!transcript) {
      setError("No speech was transcribed. Try again, or type the log.");
      setPhase("error");
      return;
    }
    await submit(transcript, audio, durationS, peaks);
  }

  async function submit(transcript: string, audio: Blob | null, durationS: number, peaks: number[]) {
    setPhase("processing");
    try {
      const fd = new FormData();
      fd.set("transcript", transcript);
      fd.set("language", language);
      if (workerId) fd.set("workerId", workerId);
      fd.set("durationS", String(durationS));
      fd.set("peaks", JSON.stringify(peaks));
      if (audio) fd.set("audio", audio, "recording");
      const res = await fetch("/api/logs/ingest", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Ingest failed");
      const j = (await res.json()) as { log: LogDetail; via: string };
      setResult(j);
      setPhase("done");
      qc.invalidateQueries({ queryKey: ["logs"] });
      toast.success("Log created", { description: j.log.summary ?? undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save log");
      setPhase("error");
    }
  }

  const liveText = [...finals, interim].filter(Boolean).join(" ");
  const detectedList = [...detected].filter((l) => l !== "multi");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
      {/* Main recorder card */}
      <div className="rounded-xl border border-border bg-white p-6">
        {/* Controls row */}
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-[12px]">
            <span className="text-muted-foreground">Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={phase === "recording" || phase === "connecting"}
              className="h-9 min-w-[200px] rounded-md border border-border bg-white px-2 text-[13px]"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                  {l.code !== "multi" && l.native !== l.label ? ` · ${l.native}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px]">
            <span className="text-muted-foreground">Recording as</span>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              disabled={phase === "recording" || phase === "connecting"}
              className="h-9 min-w-[180px] rounded-md border border-border bg-white px-2 text-[13px]"
            >
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <div className="ml-auto flex items-center gap-2">
            {phase === "recording" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-medium text-red-700">
                <span className="size-2 animate-pulse rounded-full bg-red-500" /> REC {fmtElapsed(elapsed)}
              </span>
            ) : null}
            {detectedList.length ? (
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[12px] font-medium text-sky-700">
                Detected: {detectedList.map(languageLabel).join(", ")}
              </span>
            ) : null}
          </div>
        </div>

        {/* Big mic */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <button
            onClick={phase === "recording" ? stop : start}
            disabled={phase === "connecting" || phase === "processing"}
            className={cn(
              "relative flex size-28 items-center justify-center rounded-full border-4 transition-all",
              phase === "recording"
                ? "border-red-200 bg-red-500 text-white shadow-[0_0_0_var(--ring-w)_rgba(239,68,68,0.15)]"
                : "border-emerald-100 bg-emerald-600 text-white hover:bg-emerald-700",
              (phase === "connecting" || phase === "processing") && "opacity-60",
            )}
            style={{ "--ring-w": `${Math.round(level * 60)}px` } as React.CSSProperties}
            aria-label={phase === "recording" ? "Stop recording" : "Start recording"}
          >
            {phase === "connecting" || phase === "processing" ? (
              <Loader2 className="size-10 animate-spin" />
            ) : phase === "recording" ? (
              <Square className="size-9 fill-current" />
            ) : (
              <Mic className="size-10" />
            )}
          </button>
          <div className="text-[13px] text-muted-foreground">
            {phase === "idle" && "Tap to start. The transcript streams live as you speak."}
            {phase === "connecting" && "Connecting to Deepgram…"}
            {phase === "recording" && "Listening — tap the square to finish."}
            {phase === "processing" && "Transcribing the last words, then extracting the log…"}
            {phase === "done" && "Saved. Record another, or open the dashboard."}
            {phase === "error" && (error ?? "Something went wrong.")}
          </div>
        </div>

        {/* Prompt hint */}
        <p className="mx-auto mt-6 max-w-xl text-center text-[12px] text-muted-foreground">
          {PROMPTS[language] ?? PROMPTS.en}
        </p>

        {/* Live transcript */}
        <div className="mt-6 min-h-[120px] rounded-lg border border-border bg-muted/30 px-4 py-3 text-[15px] leading-relaxed">
          {liveText ? (
            <>
              <span>{finals.join(" ")}</span>
              {interim ? <span className="text-muted-foreground"> {interim}</span> : null}
            </>
          ) : (
            <span className="text-muted-foreground/60">Transcript will appear here…</span>
          )}
        </div>

        {/* Typed fallback */}
        <div className="mt-4">
          <button
            onClick={() => setTypeMode((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <Keyboard className="size-3.5" /> {typeMode ? "Hide" : "No mic? Type a log instead"}
          </button>
          {typeMode ? (
            <form
              className="mt-2 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) submit(typed.trim(), null, 0, []);
              }}
            >
              <textarea
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                rows={3}
                placeholder="Apliqué atrazina en el campo B esta mañana de 7 a 9…"
                className="w-full rounded-md border border-border px-3 py-2 text-[13px]"
              />
              <Button type="submit" size="sm" className="self-end" disabled={phase === "processing" || !typed.trim()}>
                Extract & save <ArrowRight data-icon="inline-end" />
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {/* Result / how it works */}
      <div className="flex flex-col gap-4">
        {result ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-700">Log created</div>
            <div className="mt-2 text-[15px] font-semibold">
              {activityLabel(result.log.activityType)} · {result.log.fieldCode}
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">{result.log.summary}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
              <div>
                <dt className="text-muted-foreground">Confidence</dt>
                <dd className="font-medium">{Math.round((result.log.confidence ?? 0) * 100)}%</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Language</dt>
                <dd className="font-medium">{languageLabel(result.log.languageDetected)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Products</dt>
                <dd className="font-medium">{result.log.applications.map((a) => a.productName).join(", ") || "None"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium capitalize">{result.log.status}</dd>
              </div>
            </dl>
            {result.log.needsReview ? (
              <p className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-[12px] text-amber-900">{result.log.reviewReason}</p>
            ) : null}
            {result.via === "heuristic" ? (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Extracted with the keyword fallback — set ANTHROPIC_API_KEY for LLM extraction.
              </p>
            ) : null}
            <Button className="mt-4 w-full" render={<Link href="/" />}>
              Open on dashboard <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-white p-5 text-[13px]">
            <div className="font-semibold">How it works</div>
            <ol className="mt-3 flex flex-col gap-3 text-muted-foreground">
              <Step n={1} title="Mic → Deepgram Nova-3" desc="Audio streams over a WebSocket with a 60-second token minted server-side. Interim results render as you speak." />
              <Step n={2} title="Any language" desc="Auto-detect handles code-switching across 10 languages; pick one explicitly for the rest." />
              <Step n={3} title="Transcript → structured log" desc="Claude extracts activity, field, products and rates, translates to English, and scores its own confidence." />
              <Step n={4} title="Low confidence → flagged" desc="Rambling or off-topic logs land in the dashboard as “needs review” with a reason, never silently wrong." />
            </ol>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Sparkles className="size-3.5" />
              Vocabulary boost: product names & field codes from this farm are sent as Nova-3 keyterms.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
        {n}
      </span>
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-[12px]">{desc}</div>
      </div>
    </li>
  );
}

function pickMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "audio/webm";
}

function downsample(arr: number[], n: number) {
  if (arr.length <= n) return arr;
  const out: number[] = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) {
    const slice = arr.slice(Math.floor(i * step), Math.floor((i + 1) * step));
    out.push(Math.max(...slice));
  }
  return out;
}

function fmtElapsed(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
