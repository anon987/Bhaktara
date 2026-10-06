import { useRef, useState, type ReactNode } from "react";
import { FileArchive, FolderOpen, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { expandZips, filesFromDrop } from "./files";

// A drop area for one file, many files, a whole folder or a .zip. Folders
// are walked and ZIPs unpacked in the browser before onFiles is called.
export function MultiDrop({
  accept,
  disabled,
  onFiles,
  onError,
  children,
}: {
  accept: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onError?: (message: string) => void;
  children?: ReactNode;
}) {
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);

  const take = async (read: () => Promise<File[]>) => {
    setReading(true);
    try {
      onFiles(await read());
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "The files could not be read.");
    } finally {
      setReading(false);
    }
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (!disabled) void take(() => filesFromDrop(event.dataTransfer));
      }}
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
        over ? "border-primary bg-primary/5" : "border-border bg-muted/30",
        disabled && "opacity-60",
      )}
    >
      <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
        {reading ? <Loader2 className="size-7 animate-spin" /> : <UploadCloud className="size-7" />}
      </div>
      <div>
        <p className="font-medium">{reading ? "Reading files…" : "Drop files, a folder or a ZIP here"}</p>
        {children}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="outline" disabled={disabled || reading} onClick={() => filesInput.current?.click()}>
          <FileArchive /> Choose files or ZIP
        </Button>
        <Button type="button" variant="outline" disabled={disabled || reading} onClick={() => folderInput.current?.click()}>
          <FolderOpen /> Choose a folder
        </Button>
      </div>
      <input
        ref={filesInput}
        type="file"
        multiple
        hidden
        accept={`${accept},.zip,application/zip`}
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])];
          event.target.value = "";
          if (picked.length) void take(() => expandZips(picked));
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        // Non-standard but supported by Chrome, Edge, Firefox and Safari.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])];
          event.target.value = "";
          if (picked.length) void take(() => expandZips(picked));
        }}
      />
    </div>
  );
}
