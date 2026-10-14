import { useCallback, useRef, useState, type ReactNode } from "react";
import { BellRing, ImageIcon, ImagePlus, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { MediaVariant } from "../../../../src/domain/media";
import {
  assetAudioTypes,
  assetImageTypes,
  AUDIO_ASSET_MAX_BYTES,
  isAudioAsset,
  type AssetContentType,
  type AssetPurpose,
} from "../../../../src/domain/admin";
import { useAdmin } from "../../app/context";
import type { AssetRow } from "../../panelApi";
import { useAction } from "./useAction";

// Public media base (the r2.dev address in dev; a Bhaktara domain later).
const mediaBase = (import.meta.env.VITE_MEDIA_BASE_URL as string | undefined)?.replace(/\/$/, "");
export const mediaUrl = (key: string | undefined | null) =>
  key && mediaBase && !key.startsWith("placeholder/") ? `${mediaBase}/${key}` : null;

export function MediaThumb({
  mediaKey,
  alt,
  className,
}: {
  mediaKey?: string | null;
  alt: string;
  className?: string;
}) {
  const url = mediaUrl(mediaKey);
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("relative grid place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-accent to-secondary", className)}>
      {url && !failed ? (
        <img src={url} alt={alt} className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <ImageIcon className="size-1/3 text-muted-foreground/60" aria-hidden />
      )}
    </div>
  );
}

const imageTypes = assetImageTypes;
// Browsers disagree on an M4A's type (audio/x-m4a, audio/aac…): go by the name.
export const audioTypeOf = (file: File) =>
  /\.m4a$/i.test(file.name) ? "audio/mp4" : /\.mp3$/i.test(file.name) ? "audio/mpeg" : null;

// Drag-and-drop (or click) file selection with upload progress.
export function FileDrop({
  accept,
  busy,
  progress,
  onFile,
  children,
}: {
  accept: string;
  busy: boolean;
  progress: number | null;
  onFile: (file: File) => void;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files[0];
        if (file && !busy) onFile(file);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
        over ? "border-primary bg-primary/5" : "border-border bg-muted/30",
      )}
    >
      {busy ? <Loader2 className="size-8 animate-spin text-primary" /> : <UploadCloud className="size-8 text-primary" />}
      <div className="space-y-1">
        <p className="font-medium">{busy ? "Uploading…" : "Drop a file here"}</p>
        {children}
      </div>
      {progress !== null && <Progress value={progress * 100} className="h-2 w-full max-w-xs" />}
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        Choose file
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label="Choose file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

const invalid = (message: string) => Object.assign(new Error(message), { code: "invalid-argument" });

// Upload to the asset library: slot → PUT to R2 → processor for images;
// sounds (M4A or MP3, at most 1 MB) are stored as uploaded.
export function useAssetUpload(purpose: AssetPurpose) {
  const { api, panel } = useAdmin();
  const [progress, setProgress] = useState<number | null>(null);
  const audio = isAudioAsset(purpose);
  const action = useCallback(
    async (file: File, label: string) => {
      let contentType: AssetContentType;
      if (audio) {
        const type = audioTypeOf(file);
        if (!type) throw invalid("Use an M4A or MP3 sound.");
        if (file.size > AUDIO_ASSET_MAX_BYTES) throw invalid("The sound is larger than 1 MB. Keep bell sounds short.");
        contentType = type;
      } else {
        if (!(imageTypes as readonly string[]).includes(file.type)) throw invalid("Use a JPEG, PNG or WebP image.");
        contentType = file.type as AssetContentType;
      }
      setProgress(0);
      try {
        const slot = await panel.requestAssetUpload({ purpose, label, contentType, bytes: file.size });
        // The presigned PUT expects exactly the declared type.
        const body = file.type === contentType ? file : new File([file], file.name, { type: contentType });
        await api.putFile(slot, body, setProgress);
        setProgress(1);
        return await panel.processAsset(
          audio ? { assetId: slot.assetId, audio: slot.key } : { assetId: slot.assetId, image: slot.key },
        );
      } finally {
        setProgress(null);
      }
    },
    [api, panel, purpose, audio],
  );
  const upload = useAction(action, { success: audio ? "Sound uploaded" : "Image uploaded and processed" });
  return { ...upload, progress };
}

export type PickedArt = { mobile: MediaVariant; thumb?: MediaVariant };
const artOf = (media: Record<string, MediaVariant> | null): PickedArt | null => {
  if (!media) return null;
  const mobile = media.mobile ?? media.full ?? Object.values(media)[0];
  if (!mobile) return null;
  return { mobile, ...(media.thumb ? { thumb: media.thumb } : {}) };
};

// Choose an image from the library, or upload a new one, for an editor field.
export function AssetPicker({
  purpose,
  value,
  onChange,
  label = "Image",
}: {
  purpose: AssetPurpose;
  value: PickedArt | null | undefined;
  onChange: (art: PickedArt | null) => void;
  label?: string;
}) {
  const { panel } = useAdmin();
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<AssetRow[] | null>(null);
  const [name, setName] = useState("");
  const upload = useAssetUpload(purpose);
  const load = useCallback(() => {
    panel.listAssets(purpose).then(setAssets, () => setAssets([]));
  }, [panel, purpose]);
  return (
    <div className="flex items-center gap-4">
      <MediaThumb mediaKey={value?.thumb?.key ?? value?.mobile.key} alt={label} className="size-20 shrink-0" />
      <div className="flex flex-wrap gap-2">
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) load();
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <ImagePlus /> {value ? "Change" : "Choose"} {label.toLowerCase()}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Choose {label.toLowerCase()}</DialogTitle>
              <DialogDescription>Pick from the library or upload a new image.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Input placeholder="Name for the new image" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <FileDrop
              accept={imageTypes.join(",")}
              busy={upload.busy}
              progress={upload.progress}
              onFile={async (file) => {
                const result = await upload.run(file, name.trim() || file.name.replace(/\.[^.]+$/, ""));
                const art = result && artOf(result.media);
                if (art) {
                  onChange(art);
                  setOpen(false);
                } else load();
              }}
            >
              <p className="text-xs text-muted-foreground">JPEG, PNG or WebP · rendered for phones automatically</p>
            </FileDrop>
            <ScrollArea className="h-64">
              {assets === null ? (
                <p className="p-4 text-sm text-muted-foreground">Loading library…</p>
              ) : assets.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No images for this purpose yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3 p-1 sm:grid-cols-4">
                  {assets
                    .filter((asset) => asset.status === "READY")
                    .map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        className="group space-y-1 rounded-xl p-1 text-left outline-none ring-ring focus-visible:ring-2"
                        onClick={() => {
                          const art = artOf(asset.media);
                          if (art) onChange(art);
                          setOpen(false);
                        }}
                      >
                        <MediaThumb
                          mediaKey={asset.media?.thumb?.key ?? artOf(asset.media)?.mobile.key}
                          alt={asset.label}
                          className="aspect-square w-full transition-transform group-hover:scale-[1.02]"
                        />
                        <p className="truncate text-xs">{asset.label}</p>
                      </button>
                    ))}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export type PickedSound = { audio: MediaVariant };

// Choose a sound (a bell's ring) from the library, or upload one, and play it.
export function SoundPicker({
  value,
  onChange,
  label = "Sound",
}: {
  value: PickedSound | null | undefined;
  onChange: (sound: PickedSound | null) => void;
  label?: string;
}) {
  const { panel } = useAdmin();
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<AssetRow[] | null>(null);
  const [name, setName] = useState("");
  const upload = useAssetUpload("sound");
  const load = useCallback(() => {
    panel.listAssets("sound").then(setAssets, () => setAssets([]));
  }, [panel]);
  const url = mediaUrl(value?.audio.key);
  const ready = (assets ?? []).filter((asset) => asset.status === "READY" && asset.media?.file);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <BellRing className="size-5" aria-hidden />
        </div>
        {value ? (
          url ? (
            <audio controls preload="none" src={url} className="h-10 min-w-0 flex-1" aria-label={`Play ${label.toLowerCase()}`} />
          ) : (
            <code className="min-w-0 flex-1 truncate text-xs">{value.audio.key}</code>
          )
        ) : (
          <p className="flex-1 text-sm text-muted-foreground">No sound yet</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) load();
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <BellRing /> {value ? "Change" : "Choose"} {label.toLowerCase()}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Choose {label.toLowerCase()}</DialogTitle>
              <DialogDescription>Pick from the library or upload a new sound. It is stored exactly as uploaded.</DialogDescription>
            </DialogHeader>
            <Input placeholder="Name for the new sound" value={name} onChange={(event) => setName(event.target.value)} />
            <FileDrop
              accept={[...assetAudioTypes, ".m4a", ".mp3"].join(",")}
              busy={upload.busy}
              progress={upload.progress}
              onFile={async (file) => {
                const result = await upload.run(file, name.trim() || file.name.replace(/\.[^.]+$/, ""));
                const audio = result?.media.file;
                if (audio) {
                  onChange({ audio });
                  setOpen(false);
                } else load();
              }}
            >
              <p className="text-xs text-muted-foreground">M4A or MP3 · at most 1 MB · a short ring of 1 to 4 seconds</p>
            </FileDrop>
            <ScrollArea className="h-56">
              {assets === null ? (
                <p className="p-4 text-sm text-muted-foreground">Loading library…</p>
              ) : ready.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No sounds in the library yet.</p>
              ) : (
                <ul className="space-y-2 p-1">
                  {ready.map((asset) => {
                    const audio = asset.media!.file;
                    const src = mediaUrl(audio.key);
                    return (
                      <li key={asset.id} className="flex items-center gap-2 rounded-xl border p-2">
                        <span className="min-w-0 flex-1 truncate text-sm">{asset.label}</span>
                        {src && <audio controls preload="none" src={src} className="h-8 w-40" aria-label={`Play ${asset.label}`} />}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            onChange({ audio });
                            setOpen(false);
                          }}
                        >
                          Use
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
