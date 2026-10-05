import { useCallback, useRef, useState, type ReactNode } from "react";
import { ImageIcon, ImagePlus, Loader2, UploadCloud } from "lucide-react";
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
import type { AssetPurpose } from "../../../../src/domain/admin";
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

const imageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageType = (typeof imageTypes)[number];

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

// Upload an image to the asset library: slot → PUT to R2 → processor.
export function useAssetUpload(purpose: AssetPurpose) {
  const { api, panel } = useAdmin();
  const [progress, setProgress] = useState<number | null>(null);
  const action = useCallback(
    async (file: File, label: string) => {
      if (!imageTypes.includes(file.type as ImageType))
        throw Object.assign(new Error("Use a JPEG, PNG or WebP image."), { code: "invalid-argument" });
      setProgress(0);
      try {
        const slot = await panel.requestAssetUpload({
          purpose,
          label,
          contentType: file.type as ImageType,
          bytes: file.size,
        });
        await api.putFile(slot, file, setProgress);
        setProgress(1);
        return await panel.processAsset({ assetId: slot.assetId, image: slot.key });
      } finally {
        setProgress(null);
      }
    },
    [api, panel, purpose],
  );
  const upload = useAction(action, { success: "Image uploaded and processed" });
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
