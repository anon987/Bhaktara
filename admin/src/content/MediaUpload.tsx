import { useId, useState } from "react";
import type { UploadSlot } from "../api";
import { useAdmin } from "../app/context";
import { UploadMime, uploadKinds } from "../domain";
import { readableError, ReadableError } from "../errors";
import { ErrorNotice } from "../ui";

const accepted = Object.keys(uploadKinds) as UploadMime[];
const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

// Doc 22 §A4 steps 1–3: ask requestUploadUrl for a presigned staging/ slot,
// then PUT the original straight to R2. Step 4 (processMedia renders the
// variants and fills the media keys) is not built yet.
export function MediaUpload({ contentId }: { contentId: string }) {
  const { api } = useAdmin();
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<ReadableError | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState<UploadSlot | null>(null);

  const choose = (chosen: File | null) => {
    setFile(chosen);
    setError(null);
    setUploaded(null);
    setProblem(null);
    if (!chosen) return;
    const kind = uploadKinds[chosen.type as UploadMime];
    if (!kind)
      setProblem(
        `${chosen.type || "This file type"} is not accepted. Use PNG, JPEG, WebP, MP3, WAV, AAC, M4A or MP4.`,
      );
    else if (chosen.size > kind.maxBytes)
      setProblem(`The file is larger than ${megabytes(kind.maxBytes)}.`);
  };

  const upload = async () => {
    if (!file || problem) return;
    setError(null);
    setProgress(0);
    try {
      const slot = await api.requestUploadUrl({
        contentId,
        contentType: file.type as UploadMime,
        bytes: file.size,
      });
      await api.putFile(slot, file, setProgress);
      setUploaded(slot);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setProgress(null);
    }
  };

  return (
    <section className="panel" aria-labelledby="upload-heading">
      <h2 id="upload-heading">Upload original</h2>
      <p className="muted">
        Uploads go to the staging area. Rendering variants (processMedia) is not
        available yet, so media keys are still entered above once the media
        pipeline has published them.
      </p>
      <div className="field">
        <label htmlFor={inputId}>File</label>
        <input
          id={inputId}
          type="file"
          accept={accepted.join(",")}
          aria-describedby={problem ? `${inputId}-problem` : undefined}
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />
        {problem && (
          <p className="field-error" id={`${inputId}-problem`}>
            {problem}
          </p>
        )}
      </div>
      <div className="actions">
        <button
          type="button"
          disabled={!file || !!problem || progress !== null}
          onClick={upload}
        >
          {progress !== null ? "Uploading…" : "Upload"}
        </button>
        {progress !== null && (
          <progress max={1} value={progress} aria-label="Upload progress">
            {Math.round(progress * 100)}%
          </progress>
        )}
      </div>
      <ErrorNotice error={error} />
      <p role="status" className="ok">
        {uploaded && (
          <>
            Uploaded to <code>{uploaded.key}</code>.
          </>
        )}
      </p>
    </section>
  );
}
