import { useCallback, useState } from "react";
import { Copy, Images, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assetPurposes, type AssetPurpose } from "../../../src/domain/admin";
import { useAdmin } from "../app/context";
import { can } from "../domain";
import { ConfirmAction } from "../components/panel/confirm";
import { ago } from "../components/panel/format";
import { SelectField } from "../components/panel/inputs";
import { FileDrop, MediaThumb, mediaUrl, useAssetUpload } from "../components/panel/media";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/panel/page";
import { useAction } from "../components/panel/useAction";
import { useLoad } from "../useLoad";
import type { AssetRow } from "../panelApi";

const purposeLabels: Record<AssetPurpose, string> = {
  banner: "Banners",
  deity: "Deities",
  festival: "Festivals",
  offering: "Offerings",
  collection: "Collection covers",
};

function UploadDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState<AssetPurpose>("banner");
  const [label, setLabel] = useState("");
  const upload = useAssetUpload(purpose);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Upload /> Upload image</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload an image</DialogTitle>
          <DialogDescription>Uploaded straight to R2 and rendered for phones by the media processor.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="upload-purpose" label="For" value={purpose} options={assetPurposes.map((p) => ({ value: p, label: purposeLabels[p] }))} onChange={setPurpose} />
          <div className="space-y-2">
            <Label htmlFor="upload-label">Name</Label>
            <Input id="upload-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Diwali banner" />
          </div>
        </div>
        <FileDrop
          accept="image/jpeg,image/png,image/webp"
          busy={upload.busy}
          progress={upload.progress}
          onFile={async (file) => {
            const result = await upload.run(file, label.trim() || file.name.replace(/\.[^.]+$/, ""));
            if (result) {
              setOpen(false);
              setLabel("");
              onDone();
            }
          }}
        >
          <p className="text-xs text-muted-foreground">JPEG, PNG or WebP · up to 40 MB · {purpose === "deity" || purpose === "offering" ? "square thumbnail" : "wide thumbnail"}</p>
        </FileDrop>
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
