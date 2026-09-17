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

  const bars = peaks && peaks.length ? peaks : fallbackPeaks(96);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => el.duration && setProgress(el.currentTime / el.duration);
    const onMeta = () => Number.isFinite(el.duration) && setDuration(el.duration);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
    };
  }, [audioUrl]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play();
      setPlaying(true);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    el.currentTime = Math.max(0, Math.min(1, frac)) * el.duration;
  };

  const playedBars = Math.floor(progress * bars.length);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {audioUrl ? <audio ref={audioRef} src={audioUrl} preload="metadata" /> : null}

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

      {audioUrl ? (
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
          <TooltipContent>Seeded log — no audio file attached</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function fallbackPeaks(n: number) {
  return Array.from({ length: n }, (_, i) => 0.2 + 0.6 * Math.abs(Math.sin(i / 5)));
}
