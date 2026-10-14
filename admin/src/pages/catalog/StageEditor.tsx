import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ImageIcon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { offerPlaceBoxes, offerPlaceLabels, type OfferPlace, type TempleStage } from "../../../../src/domain/admin";
import { defaultStage } from "../../../../src/domain/mandirDecor";
import { useAdmin } from "../../app/context";
import { NumberField, SelectField } from "../../components/panel/inputs";
import { mediaUrl } from "../../components/panel/media";
import { clampStage, dragStage, stageStyle, type StageHandle } from "./stage";

// Shared previews for Mandir decor: a transparent murti on a checkerboard,
// a murti stood in a temple's stage, and a special offering at its place on
// the murti. Images need VITE_MEDIA_BASE_URL;
// without it the boxes still show (and can still be edited).

const checkerboard: CSSProperties = {
  backgroundColor: "#fff",
  backgroundImage:
    "linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

type Option = { value: string; label: string; key: string; stage?: TempleStage };
const keyOf = (art: unknown) => (art as { mobile?: { key?: string } } | undefined)?.mobile?.key;

// Deities that have a murti, for previews.
export function useMurtiOptions() {
  const { panel } = useAdmin();
  const [options, setOptions] = useState<Option[]>([]);
  useEffect(() => {
    let active = true;
    panel
      .listCatalog<{ name?: { en?: string }; murtiArt?: unknown; sortOrder?: number }>("deity")
      .then((rows) => {
        if (!active) return;
        setOptions(
          rows
            .filter((row) => keyOf(row.data.murtiArt))
            .sort((a, b) => (a.data.sortOrder ?? 0) - (b.data.sortOrder ?? 0))
            .map((row) => ({ value: row.id, label: row.data.name?.en ?? row.id, key: keyOf(row.data.murtiArt)! })),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [panel]);
  return options;
}

// Temples (Mandir offerings of kind temple) with an image, for previews.
export function useTempleOptions() {
  const { panel } = useAdmin();
  const [options, setOptions] = useState<Option[]>([]);
  useEffect(() => {
    let active = true;
    panel
      .listCatalog<{ name?: { en?: string }; kind?: string; art?: unknown; stage?: TempleStage; sortOrder?: number }>("mandirOffering")
      .then((rows) => {
        if (!active) return;
        setOptions(
          rows
            .filter((row) => row.data.kind === "temple" && keyOf(row.data.art))
            .sort((a, b) => (a.data.sortOrder ?? 0) - (b.data.sortOrder ?? 0))
            .map((row) => ({ value: row.id, label: row.data.name?.en ?? row.id, key: keyOf(row.data.art)!, stage: row.data.stage })),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [panel]);
  return options;
}

function Picture({ mediaKey, alt, className, onSize }: { mediaKey?: string; alt: string; className?: string; onSize?: (ratio: number) => void }) {
  const url = mediaUrl(mediaKey);
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  return (
    <img
      src={url}
      alt={alt}
      draggable={false}
      className={className}
      onError={() => setFailed(true)}
      onLoad={(event) => {
        const image = event.currentTarget;
        if (image.naturalWidth && image.naturalHeight) onSize?.(image.naturalWidth / image.naturalHeight);
      }}
    />
  );
}

// The murti alone, on a checkerboard so its transparency is visible.
export function MurtiPreview({ mediaKey, alt, className }: { mediaKey?: string; alt: string; className?: string }) {
  return (
    <div
      style={checkerboard}
      className={cn("relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border", className)}
      data-testid="murti-checkerboard"
    >
      {mediaUrl(mediaKey) ? (
        <Picture mediaKey={mediaKey} alt={alt} className="size-full object-contain" />
      ) : (
        <ImageIcon className="size-1/4 text-muted-foreground/60" aria-hidden />
      )}
    </div>
  );
}

// The murti fitted into the stage box, feet on its bottom edge.
function Murti({ mediaKey, alt }: { mediaKey?: string; alt: string }) {
  return mediaUrl(mediaKey) ? (
    <Picture mediaKey={mediaKey} alt={alt} className="pointer-events-none size-full object-contain object-bottom" />
  ) : (
    <div className="pointer-events-none grid size-full place-items-end justify-center pb-1 text-[10px] font-medium text-primary">Deity</div>
  );
}

// A temple with a murti stood in its stage (read-only).
export function TemplePreview({
  templeKey,
  stage,
  murtiKey,
  alt,
  className,
}: {
  templeKey?: string;
  stage?: TempleStage;
  murtiKey?: string;
  alt: string;
  className?: string;
}) {
  const [ratio, setRatio] = useState(5 / 6);
  return (
    <div className={cn("relative w-full overflow-hidden rounded-xl border bg-muted/40", className)} style={{ aspectRatio: ratio }}>
      <Picture mediaKey={templeKey} alt={alt} className="absolute inset-0 size-full object-fill" onSize={setRatio} />
      <div className="absolute" style={stageStyle(stage ?? defaultStage)}>
        <Murti mediaKey={murtiKey} alt="" />
      </div>
    </div>
  );
}

const handles: { id: Exclude<StageHandle, "move">; className: string; label: string }[] = [
  { id: "nw", className: "-left-1.5 -top-1.5 cursor-nwse-resize", label: "top left" },
  { id: "ne", className: "-right-1.5 -top-1.5 cursor-nesw-resize", label: "top right" },
  { id: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize", label: "bottom left" },
  { id: "se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize", label: "bottom right" },
];
const pct = (value: number) => Math.round(value * 1000) / 10;

// Temple stage editor: drag the box to where the deity stands, drag a corner
// to resize it, or type the numbers. Arrow keys nudge the box (Shift: 5 %).
export function StageEditor({
  templeKey,
  value,
  onChange,
}: {
  templeKey?: string;
  value: TempleStage | null;
  onChange: (stage: TempleStage | null) => void;
}) {
  const stage = value ?? defaultStage;
  const murtis = useMurtiOptions();
  const [murtiId, setMurtiId] = useState("");
  const murti = murtis.find((option) => option.value === murtiId) ?? murtis[0];
  const [ratio, setRatio] = useState(5 / 6);
  const frame = useRef<HTMLDivElement>(null);

  const startDrag = (handle: StageHandle) => (event: ReactPointerEvent) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY, stage };
    const move = (next: PointerEvent) =>
      onChange(dragStage(start.stage, handle, (next.clientX - start.x) / rect.width, (next.clientY - start.y) / rect.height));
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  const setField = (field: keyof TempleStage) => (percent: number) => {
    if (!Number.isFinite(percent)) return;
    onChange(clampStage({ ...stage, [field]: percent / 100 }));
  };

  return (
    <div className="space-y-3">
      <div
        ref={frame}
        className="relative mx-auto w-full max-w-sm touch-none select-none overflow-hidden rounded-xl border bg-muted/40"
        style={{ aspectRatio: ratio }}
      >
        <Picture mediaKey={templeKey} alt="Temple" className="absolute inset-0 size-full object-fill" onSize={setRatio} />
        {!mediaUrl(templeKey) && (
          <p className="absolute inset-x-0 top-2 text-center text-xs text-muted-foreground">
            {templeKey ? "Image preview needs the media address" : "Choose the temple image first"}
          </p>
        )}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Where the deity stands"
          aria-valuetext={`left ${pct(stage.x)}%, top ${pct(stage.y)}%, ${pct(stage.width)}% wide, ${pct(stage.height)}% tall`}
          aria-valuenow={pct(stage.x)}
          className="absolute cursor-move rounded-sm border-2 border-dashed border-primary bg-primary/10 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={stageStyle(stage)}
          onPointerDown={startDrag("move")}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 0.05 : 0.01;
            const delta: Record<string, [number, number]> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            };
            const d = delta[event.key];
            if (!d) return;
            event.preventDefault();
            onChange(dragStage(stage, "move", d[0], d[1]));
          }}
        >
          <Murti mediaKey={murti?.key} alt={murti ? `${murti.label} murti` : ""} />
          {handles.map((handle) => (
            <span
              key={handle.id}
              aria-hidden
              title={`Resize from the ${handle.label}`}
              onPointerDown={startDrag(handle.id)}
              className={cn("absolute size-3 rounded-full border-2 border-background bg-primary shadow", handle.className)}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumberField id="stage-x" label="Left %" value={pct(stage.x)} min={0} max={95} step={0.5} onChange={setField("x")} />
        <NumberField id="stage-y" label="Top %" value={pct(stage.y)} min={0} max={95} step={0.5} onChange={setField("y")} />
        <NumberField id="stage-width" label="Width %" value={pct(stage.width)} min={5} max={100} step={0.5} onChange={setField("width")} />
        <NumberField id="stage-height" label="Height %" value={pct(stage.height)} min={5} max={100} step={0.5} onChange={setField("height")} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {murtis.length > 0 && (
          <div className="min-w-48 flex-1">
            <SelectField id="stage-murti" label="Preview with" value={murti?.value ?? ""} options={murtis} onChange={setMurtiId} />
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)} disabled={!value}>
          <RotateCcw /> Centre default
        </Button>
      </div>
      {!value && <p className="text-xs text-muted-foreground">Not set: the app uses the centred default shown here.</p>}
    </div>
  );
}

// Where the murti stands in the offering preview: room above for a chhatra
// and below for the altar.
const previewMurtiBox: TempleStage = { x: 0.22, y: 0.3, width: 0.56, height: 0.48 };

// A special offering drawn at its place on a deity's murti (offerAt): the
// mukut on the head, a garland round the neck, the chhatra above, at the
// feet, or a diya or bhog on the altar in front. The offering's own deities
// are previewed first; another can be chosen.
export function OfferPlacePreview({
  place,
  itemKey,
  itemLabel,
  deityIds,
}: {
  place: OfferPlace;
  itemKey?: string;
  itemLabel: string;
  deityIds: string[];
}) {
  const murtis = useMurtiOptions();
  const [murtiId, setMurtiId] = useState("");
  const murti =
    murtis.find((option) => option.value === murtiId) ??
    murtis.find((option) => deityIds.includes(option.value)) ??
    murtis[0];
  const label = offerPlaceLabels[place];
  return (
    <div className="space-y-2">
      <div
        style={checkerboard}
        className="relative mx-auto aspect-[3/4] w-full max-w-56 overflow-hidden rounded-xl border"
        data-testid="offer-place-preview"
      >
        <div className="absolute" style={stageStyle(previewMurtiBox)}>
          <Murti mediaKey={murti?.key} alt={murti ? `${murti.label} murti` : ""} />
          <div
            className="absolute"
            style={stageStyle(offerPlaceBoxes[place])}
            data-testid="offer-place-item"
            data-place={place}
          >
            {mediaUrl(itemKey) ? (
              <Picture mediaKey={itemKey} alt={itemLabel} className="pointer-events-none size-full object-contain" />
            ) : (
              <span className="grid size-full place-items-center rounded-md border-2 border-dashed border-primary bg-primary/10 text-center text-[10px] font-medium leading-tight text-primary">
                {label.en} · {label.hi}
              </span>
            )}
          </div>
        </div>
      </div>
      {murtis.length > 1 && (
        <SelectField id="offer-place-murti" label="Preview with" value={murti?.value ?? ""} options={murtis} onChange={setMurtiId} />
      )}
    </div>
  );
}
