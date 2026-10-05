import { useState } from "react";
import { CheckCircle2, FileAudio, FileImage, FileVideo, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UploadSlot } from "../api";
import { useAdmin } from "../app/context";
import { ContentType, UploadMime, uploadKinds } from "../domain";
import {
  mediaInputRules,
  mediaTypeForContent,
  type MediaInputRole,
} from "../../../src/domain/mediaProcessing";
import { readableError, ReadableError } from "../errors";
import { ErrorNotice } from "../ui";
import { FileDrop } from "../components/panel/media";

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;
const roleIcons: Record<MediaInputRole, typeof FileAudio> = { audio: FileAudio, image: FileImage, video: FileVideo };
const roleLabels: Record<MediaInputRole, string> = { audio: "Audio master", image: "Image", video: "Video" };
const acceptFor = (role: MediaInputRole) =>
  (Object.keys(uploadKinds) as UploadMime[]).filter((mime) => mime.startsWith(role)).join(",");

// Doc 22 §A4: upload each original straight to R2 staging (presigned PUT,
// with progress), then processMedia renders every variant on Cloud Run and
// writes the keys onto the item. The item must be a DRAFT.
export function MediaUpload({
  contentId,
  type,
  onProcessed,
}: {
  contentId: string;
  type: ContentType;
  onProcessed: () => void;
}) {
  const { api, panel } = useAdmin();
  const rule = mediaInputRules[mediaTypeForContent(type)];
  const roles = [...rule.required, ...rule.optional];
  const [slots, setSlots] = useState<Partial<Record<MediaInputRole, UploadSlot & { name: string }>>>({});
  const [progress, setProgress] = useState<{ role: MediaInputRole; value: number } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<ReadableError | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const upload = async (role: MediaInputRole, file: File) => {
    setError(null);
    setResult(null);
    const kind = uploadKinds[file.type as UploadMime];
    if (!kind || !file.type.startsWith(role)) {
      setError({ kind: "invalid", title: "Wrong file type", message: `Choose a ${role} file (${acceptFor(role).replaceAll(`${role}/`, "").replaceAll(",", ", ")}).`, problems: [] });
      return;
    }
    if (file.size > kind.maxBytes) {
      setError({ kind: "invalid", title: "File too large", message: `The limit is ${megabytes(kind.maxBytes)}.`, problems: [] });
      return;
    }
    setProgress({ role, value: 0 });
    try {
      const slot = await api.requestUploadUrl({ contentId, contentType: file.type as UploadMime, bytes: file.size });
      await api.putFile(slot, file, (value) => setProgress({ role, value }));
      setSlots((current) => ({ ...current, [role]: { ...slot, name: file.name } }));
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setProgress(null);
    }
  };

  const ready = rule.required.every((role) => slots[role]);
  const render = async () => {
    setProcessing(true);
    setError(null);
    try {
      const inputs = Object.fromEntries(
        roles.filter((role) => slots[role]).map((role) => [role, slots[role]!.key]),
      );
      const processed = await panel.processMedia({ contentId, inputs });
      setResult(
        `Rendered ${Object.keys(processed.media).join(", ")}${processed.warnings.length ? ` · ${processed.warnings.join("; ")}` : ""}.`,
      );
      setSlots({});
      onProcessed();
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <section className="panel space-y-4" aria-labelledby="upload-heading">
      <div>
        <h2 id="upload-heading">Media</h2>
        <p className="muted">
          Upload the originals; the processor renders every size the app needs. Needs: {rule.required.join(" + ")}
          {rule.optional.length > 0 && ` (optional: ${rule.optional.join(", ")})`}.
        </p>
      </div>
      {roles.map((role) => {
        const Icon = roleIcons[role];
        const slot = slots[role];
        return (
          <div key={role} className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Icon className="size-4 text-primary" /> {roleLabels[role]}
              {rule.required.includes(role) ? "" : " (optional)"}
            </p>
            {slot ? (
              <p className="flex items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
                <CheckCircle2 className="size-4 text-chart-4" />
                <span className="truncate">{slot.name}</span>
                <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setSlots((current) => ({ ...current, [role]: undefined }))}>
                  Replace
                </Button>
              </p>
            ) : (
              <FileDrop
                accept={acceptFor(role)}
                busy={progress?.role === role || processing}
                progress={progress?.role === role ? progress.value : null}
                onFile={(file) => void upload(role, file)}
              >
                <p className="text-xs text-muted-foreground">{acceptFor(role).replaceAll(`${role}/`, "").replaceAll(",", " · ")}</p>
              </FileDrop>
            )}
          </div>
        );
      })}
      <Button type="button" className="w-full" disabled={!ready || processing || progress !== null} onClick={() => void render()}>
        <Wand2 /> {processing ? "Rendering on the server… (up to a few minutes)" : "Render media"}
      </Button>
      <ErrorNotice error={error} />
      <p role="status" className="ok">{result}</p>
    </section>
  );
}
