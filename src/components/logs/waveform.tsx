"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fmtDuration } from "@/lib/format";

/**
 * Bar-style waveform drawn from precomputed peaks (so seeded logs with no
 * audio file still render), with an <audio> element driving playback progress
 * when a recording exists.
 */
export function Waveform({
  peaks,
  audioUrl,
  durationS,
  className,
}: {
  peaks: number[] | null;
  audioUrl: string | null;
  durationS: number | null;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(durationS ?? 0);
  const [loadError, setLoadError] = useState(false);

  const bars = peaks && peaks.length ? peaks : fallbackPeaks(96);

  // MediaRecorder WebM has no duration header, so `el.duration` is Infinity in
  // Chrome. Fall back to the duration measured while recording.
  const effectiveDuration = (el: HTMLAudioElement) =>
    Number.isFinite(el.duration) && el.duration > 0 ? el.duration : (durationS ?? 0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      const d = effectiveDuration(el);
      if (d > 0) setProgress(Math.min(1, el.currentTime / d));
    };
    const onMeta = () => setDuration(effectiveDuration(el));
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onErr = () => {
      setPlaying(false);
      setLoadError(true);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("ended", onEnd);
    el.addEventListener("error", onErr);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("error", onErr);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, durationS]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play()
        .then(() => setPlaying(true))
        .catch((err) => {
          console.error("audio play failed", err);
          setLoadError(true);
        });
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const d = effectiveDuration(el);
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    el.currentTime = Math.max(0, Math.min(1, frac)) * d;
  };

  const playedBars = Math.floor(progress * bars.length);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {audioUrl ? <audio ref={audioRef} src={audioUrl} preload="auto" /> : null}

      <div
        className={cn("flex h-14 items-center gap-[2px]", audioUrl && "cursor-pointer")}
        onClick={audioUrl ? seek : undefined}
        role={audioUrl ? "slider" : undefined}
        aria-valuenow={Math.round(progress * 100)}
      >
        {bars.map((v, i) => (
          <span
            key={i}
            className={cn("w-[2px] flex-1 rounded-full", i < playedBars ? "bg-foreground" : "bg-foreground/35")}
            style={{ height: `${Math.max(6, Math.abs(v) * 100)}%` }}
          />
        ))}
      </div>

      {audioUrl && !loadError ? (
        <Button variant="outline" className="h-9 w-full rounded-lg" onClick={toggle}>
          {playing ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          {playing ? "Pause" : "Play Recording"}
          {duration ? <span className="ml-1 text-muted-foreground">({fmtDuration(duration)})</span> : null}
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" className="h-9 w-full rounded-lg" disabled>
                <Play data-icon="inline-start" /> Play Recording
              </Button>
            }
          />
          <TooltipContent>
            {loadError
              ? "Couldn't load the audio file"
              : durationS
                ? "No audio was stored for this log (recorded before storage was set up)"
                : "Seeded log — no audio file attached"}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function fallbackPeaks(n: number) {
  return Array.from({ length: n }, (_, i) => 0.2 + 0.6 * Math.abs(Math.sin(i / 5)));
}
