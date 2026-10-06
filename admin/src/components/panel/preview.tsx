import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, ImageIcon, Music2, Pause, Play, PlayCircle, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { MediaVariant, MediaVariantName } from "../../../../src/domain/media";
import type { ContentType } from "../../domain";
import { MediaThumb, mediaUrl } from "./media";

export type MediaSet = Partial<Record<MediaVariantName, MediaVariant>>;

export const audioTypes: ContentType[] = ["BHAJAN", "AARTI", "MANTRA", "CHALISA", "RINGTONE"];
export const isAudio = (type: ContentType | undefined) => !!type && audioTypes.includes(type);

// Ringtones play their downloadable MP3; devotional audio its stream (M4A).
export const audioVariant = (type: ContentType, media?: MediaSet) =>
  type === "RINGTONE" ? (media?.file ?? media?.stream) : (media?.stream ?? media?.file);

export const clock = (seconds: number | null | undefined) => {
  if (seconds == null || !Number.isFinite(seconds)) return "–:––";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
};

const bytes = (n?: number) =>
  n == null ? null : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

// Only one sound plays at a time anywhere in the panel.
let playingNow: HTMLAudioElement | null = null;

export function AudioPlayer({
  mediaKey,
  title,
  duration,
  compact,
  iconOnly,
  className,
}: {
  mediaKey?: string | null;
  title: string;
  duration?: number | null;
  compact?: boolean;
  // Just the play button (table rows).
  iconOnly?: boolean;
  className?: string;
}) {
  const url = mediaUrl(mediaKey);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState<number | null>(duration ?? null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const element = audio.current;
    return () => element?.pause();
  }, []);

  const toggle = async () => {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    if (playingNow && playingNow !== element) playingNow.pause();
    playingNow = element;
    setLoading(true);
    try {
      await element.play();
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const unavailable = !url || failed;
  const label = unavailable
    ? failed
      ? "The audio could not be loaded"
      : "No audio yet"
    : `${playing ? "Pause" : "Play"} ${title}`;

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Button
        type="button"
        size="icon"
        variant={unavailable ? "outline" : "default"}
        className={cn("shrink-0 rounded-full", iconOnly ? "size-8" : compact ? "size-9" : "size-11")}
        disabled={unavailable}
        aria-label={label}
        title={label}
        onClick={() => void toggle()}
      >
        {playing ? <Pause className="fill-current" /> : <Play className={cn("fill-current", !unavailable && "translate-x-px")} />}
      </Button>
      {!iconOnly && <div className="min-w-0 flex-1">
        <input
          type="range"
          aria-label={`Position in ${title}`}
          min={0}
          max={length ?? 0}
          step={0.1}
          value={Math.min(time, length ?? 0)}
          disabled={unavailable || !length}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (audio.current) audio.current.currentTime = value;
            setTime(value);
          }}
          className="h-1.5 w-full cursor-pointer accent-primary disabled:cursor-default disabled:opacity-40"
        />
        <div className="mt-0.5 flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{loading ? "Loading…" : unavailable ? label : clock(time)}</span>
          <span>{clock(length)}</span>
        </div>
      </div>}
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setTime(0);
          }}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value)) setLength(value);
          }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

// Full-size image with a switch between the stored sizes.
export function ImageViewer({
  title,
  media,
  order = ["full", "mobile", "thumb"],
  children,
}: {
  title: string;
  media?: MediaSet;
  order?: MediaVariantName[];
  children: ReactNode;
}) {
  const sizes = order.filter((name) => media?.[name]);
  const [size, setSize] = useState<MediaVariantName | undefined>(sizes[0]);
  const chosen = size && media?.[size];
  const url = mediaUrl(chosen?.key);
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          <DialogDescription>
            {chosen
              ? [size, chosen.width && chosen.height ? `${chosen.width}×${chosen.height}` : null, bytes(chosen.bytes)].filter(Boolean).join(" · ")
              : "No image yet"}
          </DialogDescription>
        </DialogHeader>
        {sizes.length > 1 && (
          <ToggleGroup type="single" variant="outline" value={size} onValueChange={(value) => value && setSize(value as MediaVariantName)} className="justify-start">
            {sizes.map((name) => (
              <ToggleGroupItem key={name} value={name} className="px-3 capitalize">{name}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <div className="grid place-items-center rounded-xl bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:20px_20px] p-2">
          {url ? (
            <img src={url} alt={title} className="max-h-[70dvh] w-auto rounded-lg object-contain shadow-lg" />
          ) : (
            <Empty icon={ImageIcon} text="No image to show yet." />
          )}
        </div>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
            Open in a new tab <ExternalLink className="size-3.5" />
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Status videos (9:16) with the browser's own controls.
export function VideoViewer({ title, media, children }: { title: string; media?: MediaSet; children: ReactNode }) {
  const url = mediaUrl(media?.video720?.key);
  const poster = mediaUrl(media?.poster?.key ?? media?.thumb?.key) ?? undefined;
  const video = media?.video720;
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          <DialogDescription>
            {video
              ? [video.width && video.height ? `${video.width}×${video.height}` : "720p", clock(video.durationSeconds), bytes(video.bytes)].filter(Boolean).join(" · ")
              : "No video yet"}
          </DialogDescription>
        </DialogHeader>
        <div className="mx-auto aspect-[9/16] max-h-[70dvh] w-full overflow-hidden rounded-xl bg-black">
          {url ? (
            <video src={url} poster={poster} controls autoPlay playsInline className="size-full object-contain" onPlay={() => playingNow?.pause()} />
          ) : (
            <Empty icon={Video} text="No video to show yet." dark />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Empty({ icon: Icon, text, dark }: { icon: typeof Video; text: string; dark?: boolean }) {
  return (
    <div className={cn("grid size-full min-h-48 place-items-center gap-2 p-8 text-center text-sm", dark ? "text-white/70" : "text-muted-foreground")}>
      <div className="grid place-items-center gap-2">
        <Icon className="size-8 opacity-60" />
        {text}
      </div>
    </div>
  );
}

// A wallpaper tile or status-video tile that opens its viewer.
export function VisualTile({
  type,
  title,
  media,
  className,
}: {
  type: ContentType;
  title: string;
  media?: MediaSet;
  className?: string;
}) {
  const isVideo = type === "STATUS";
  const key = isVideo ? (media?.poster?.key ?? media?.thumb?.key) : (media?.mobile?.key ?? media?.thumb?.key);
  const tile = (
    <button
      type="button"
      aria-label={`${isVideo ? "Play" : "View"} ${title}`}
      className={cn("group relative block w-full overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <MediaThumb mediaKey={key} alt="" className="size-full rounded-none transition-transform duration-300 group-hover:scale-[1.03]" />
      {isVideo && (
        <span className="absolute inset-0 grid place-items-center bg-gradient-to-t from-black/45 via-transparent to-transparent">
          <PlayCircle className="size-12 text-white drop-shadow-lg transition-transform group-hover:scale-110" strokeWidth={1.5} />
        </span>
      )}
      {isVideo && media?.video720?.durationSeconds && (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] tabular-nums text-white">
          {clock(media.video720.durationSeconds)}
        </span>
      )}
    </button>
  );
  return isVideo ? (
    <VideoViewer title={title} media={media}>{tile}</VideoViewer>
  ) : (
    <ImageViewer title={title} media={media}>{tile}</ImageViewer>
  );
}

// The editor's preview panel: what this item looks and sounds like now.
export function ContentPreview({
  type,
  title,
  media,
  duration,
}: {
  type: ContentType;
  title: string;
  media?: MediaSet;
  duration?: number | null;
}) {
  const noBase = !import.meta.env.VITE_MEDIA_BASE_URL;
  return (
    <section className="panel space-y-4" aria-labelledby="preview-heading">
      <h2 id="preview-heading">Preview</h2>
      {isAudio(type) ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <MediaThumb mediaKey={media?.thumb?.key} alt="" className="size-16 shrink-0" />
            <div className="min-w-0">
              <p className="truncate font-medium">{title || "Untitled"}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Music2 className="size-3" /> {type === "RINGTONE" ? "Ringtone (MP3)" : "Stream (M4A)"}
              </p>
            </div>
          </div>
          <AudioPlayer mediaKey={audioVariant(type, media)?.key} title={title || "this item"} duration={duration ?? audioVariant(type, media)?.durationSeconds} />
        </div>
      ) : (
        <VisualTile type={type} title={title || "Untitled"} media={media} className="mx-auto aspect-[9/16] max-w-[220px]" />
      )}
      {noBase && <p className="hint">Previews need VITE_MEDIA_BASE_URL in the admin environment.</p>}
    </section>
  );
}
