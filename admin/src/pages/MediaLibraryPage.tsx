import { useCallback, useRef, useState } from "react";
import { Copy, Images, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assetPurposes, type AssetPurpose } from "../../../src/domain/admin";
import { useAdmin } from "../app/context";
import { can } from "../domain";
import { ConfirmAction } from "../components/panel/confirm";
import { ago } from "../components/panel/format";
import { SelectField } from "../components/panel/inputs";
import { MultiDrop } from "../components/panel/drop";
import { maxBytesOf, titleFromFileName, uploadMimeOf, withUploadType } from "../components/panel/files";
import { MediaThumb, mediaUrl } from "../components/panel/media";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/panel/page";
import { useAction } from "../components/panel/useAction";
import { useLoad } from "../useLoad";
import { errorText, uploadsUnavailable } from "./content/uploadPipeline";
import { cn } from "@/lib/utils";
import type { AssetRow } from "../panelApi";

const purposeLabels: Record<AssetPurpose, string> = {
  banner: "Banners",
  deity: "Deities",
  festival: "Festivals",
  offering: "Offerings",
  collection: "Collection covers",
};

type ImageRow = {
  key: string;
  file: File;
  label: string;
  status: "waiting" | "uploading" | "processing" | "done" | "error";
  progress: number;
  error?: string;
};

// Many images at once (files, a folder or a ZIP), two at a time.
function UploadDialog({ onDone }: { onDone: () => void }) {
  const { api, panel } = useAdmin();
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState<AssetPurpose>("banner");
  const [rows, setRowsState] = useState<ImageRow[]>([]);
  const rowsRef = useRef<ImageRow[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const commit = (next: ImageRow[]) => {
    rowsRef.current = next;
    setRowsState(next);
  };
  const update = (key: string, patch: Partial<ImageRow>) =>
    commit(rowsRef.current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const add = (files: File[]) => {
    const known = new Set(rowsRef.current.map((row) => `${row.file.name}:${row.file.size}`));
    let skipped = 0;
    const added: ImageRow[] = [];
    for (const file of files) {
      const mime = uploadMimeOf(file.name);
      if (!mime || !mime.startsWith("image/") || file.size > maxBytesOf(mime)) {
        skipped += 1;
        continue;
      }
      if (known.has(`${file.name}:${file.size}`)) continue;
      added.push({ key: `${Date.now()}-${added.length}-${file.name}`, file: withUploadType(file, mime), label: titleFromFileName(file.name), status: "waiting", progress: 0 });
    }
    if (skipped) toast.warning(`${skipped} file${skipped === 1 ? " was" : "s were"} left out (only JPEG, PNG or WebP up to 40 MB).`);
    commit([...rowsRef.current, ...added]);
  };

  const start = async () => {
    setRunning(true);
    const queue = rowsRef.current.filter((row) => row.status === "waiting" || row.status === "error").map((row) => row.key);
    const worker = async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        const row = rowsRef.current.find((item) => item.key === key)!;
        try {
          update(key, { status: "uploading", progress: 0, error: undefined });
          const slot = await panel.requestAssetUpload({
            purpose,
            label: row.label.trim() || row.file.name,
            contentType: row.file.type as "image/jpeg" | "image/png" | "image/webp",
            bytes: row.file.size,
          });
          await api.putFile(slot, row.file, (progress) => update(key, { progress }));
          update(key, { status: "processing", progress: 1 });
          await panel.processAsset({ assetId: slot.assetId, image: slot.key });
          update(key, { status: "done" });
        } catch (error) {
          update(key, { status: "error", error: errorText(error) });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    setRunning(false);
    const done = rowsRef.current.filter((row) => row.status === "done").length;
    if (done) {
      toast.success(`${done} image${done === 1 ? "" : "s"} added to the library`);
      onDone();
    }
  };
  const begin = async () => {
    setRunning(true);
    const problem = await uploadsUnavailable(api, panel);
    setRunning(false);
    if (problem) {
      setNotice(problem);
      return;
    }
    setNotice(null);
    await start();
  };

  const waiting = rows.filter((row) => row.status === "waiting" || row.status === "error").length;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return;
        setOpen(next);
        if (!next) commit(rowsRef.current.filter((row) => row.status !== "done"));
      }}
    >
      <DialogTrigger asChild>
        <Button><Upload /> Upload images</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload images</DialogTitle>
          <DialogDescription>One image, many, a folder or a ZIP. Each is uploaded to R2 and rendered for phones; names come from the file names.</DialogDescription>
        </DialogHeader>
        <SelectField id="upload-purpose" label="For" value={purpose} options={assetPurposes.map((p) => ({ value: p, label: purposeLabels[p] }))} onChange={setPurpose} />
        <MultiDrop accept="image/jpeg,image/png,image/webp" disabled={running} onFiles={add} onError={(message) => toast.error(message)}>
          <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG or WebP · up to 40 MB each · {purpose === "deity" || purpose === "offering" ? "square thumbnail" : "wide thumbnail"}</p>
        </MultiDrop>
        {notice && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">{notice}</p>}
        {rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.key} className={cn("rounded-xl border p-2", row.status === "error" && "border-destructive/40")}>
                <div className="flex items-center gap-2">
                  <Input aria-label={`Name for ${row.file.name}`} value={row.label} disabled={running || row.status === "done"} onChange={(event) => update(row.key, { label: event.target.value })} className="h-8 flex-1" />
                  <Badge variant={row.status === "error" ? "destructive" : "secondary"} className="whitespace-nowrap">
                    {row.status === "uploading" ? `${Math.round(row.progress * 100)}%` : row.status === "processing" ? "Rendering" : row.status === "done" ? "Done" : row.status === "error" ? "Failed" : "Waiting"}
                  </Badge>
                  {row.status === "waiting" && !running && (
                    <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove ${row.file.name}`} onClick={() => commit(rowsRef.current.filter((item) => item.key !== row.key))}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
                {row.status === "uploading" && <Progress value={row.progress * 100} className="mt-2 h-1" />}
                {row.error && <p className="mt-1 text-xs text-destructive">{row.error}</p>}
              </li>
            ))}
          </ul>
        )}
        <Button disabled={running || waiting === 0} onClick={() => void begin()}>
          {running ? <Loader2 className="animate-spin" /> : <Upload />}
          {running ? "Uploading…" : `Upload ${waiting} image${waiting === 1 ? "" : "s"}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function MediaLibraryPage() {
  const { panel, role } = useAdmin();
  const [purpose, setPurpose] = useState<AssetPurpose | "all">("all");
  const [reload, setReload] = useState(0);
  const load = useCallback(() => panel.listAssets(purpose === "all" ? undefined : purpose), [panel, purpose, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, error, loading } = useLoad<AssetRow[]>(load);
  const [selected, setSelected] = useState<AssetRow | null>(null);
  const remove = useAction(
    async (id: string) => {
      await panel.deleteAsset(id);
      setSelected(null);
      setReload((n) => n + 1);
    },
    { success: "Removed from the library" },
  );
  const writable = can(role, "asset.write");

  return (
    <div>
      <PageHeader
        title="Media library"
        description="Images for banners, deities, festivals, Mandir offerings and collection covers. Audio, wallpapers and videos are uploaded on each content item."
        actions={writable && <UploadDialog onDone={() => setReload((n) => n + 1)} />}
      />
      <Tabs value={purpose} onValueChange={(value) => setPurpose(value as AssetPurpose | "all")} className="mb-4">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="all">All</TabsTrigger>
          {assetPurposes.map((p) => (
            <TabsTrigger key={p} value={p}>{purposeLabels[p]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {error && <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />}
      {loading && !data && <LoadingState />}
      {data && data.length === 0 && <EmptyState icon={Images} title="No images yet" text="Upload banner, deity or festival art to use it in the editors." />}
      {data && data.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.map((asset) => (
            <button key={asset.id} type="button" onClick={() => setSelected(asset)} className="group rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="gap-0 overflow-hidden p-0 transition-shadow group-hover:shadow-md">
                <MediaThumb mediaKey={asset.media?.thumb?.key ?? asset.media?.mobile?.key} alt={asset.label} className="aspect-[4/3] w-full rounded-none" />
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium">{asset.label}</p>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="font-normal">{asset.purpose}</Badge>
                    {asset.status !== "READY" ? <Badge variant="outline">processing</Badge> : <span className="text-[11px] text-muted-foreground">{ago(asset.createdAt)}</span>}
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-display text-xl">{selected.label}</SheetTitle>
                <SheetDescription>{purposeLabels[selected.purpose]} · {ago(selected.createdAt)}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 p-4">
                <MediaThumb mediaKey={selected.media?.mobile?.key} alt={selected.label} className="aspect-[4/3] w-full" />
                {selected.warnings.length > 0 && <p className="rounded-xl bg-chart-2/10 p-3 text-sm">{selected.warnings.join(" ")}</p>}
                {Object.entries(selected.media ?? {}).map(([name, variant]) => (
                  <div key={name} className="flex items-center gap-2 rounded-xl border p-2 text-sm">
                    <Badge variant="outline">{name}</Badge>
                    <code className="min-w-0 flex-1 truncate text-xs">{variant.key}</code>
                    {variant.width && <span className="text-xs text-muted-foreground">{variant.width}×{variant.height}</span>}
                    <Button variant="ghost" size="icon" className="size-7" aria-label={`Copy ${name} key`} onClick={() => void navigator.clipboard.writeText(variant.key).then(() => toast.success("Key copied"))}>
                      <Copy />
                    </Button>
                  </div>
                ))}
                {selected.media?.mobile && mediaUrl(selected.media.mobile.key) && (
                  <a className="text-sm text-primary underline" href={mediaUrl(selected.media.mobile.key)!} target="_blank" rel="noreferrer">Open full size</a>
                )}
                {writable && (
                  <ConfirmAction
                    trigger={<Button variant="outline" className="w-full text-destructive"><Trash2 /> Remove from library</Button>}
                    title="Remove this image from the library?"
                    description="Anything already using it keeps working; the files are cleaned up after 30 days."
                    confirmLabel="Remove"
                    destructive
                    onConfirm={() => remove.run(selected.id)}
                  />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
