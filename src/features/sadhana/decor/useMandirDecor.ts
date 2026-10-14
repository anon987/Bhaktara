import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, ImageSourcePropType } from "react-native";
import { useApp } from "../../../app/providers/AppProvider";
import { DecorItem, decorFor } from "../../../domain/mandirDecor";
import { Deity } from "../../../domain/models";
import {
  RewardedAdPresenter,
  rewardedAdPresenter,
} from "../../../services/ads/rewardedGate";
import { resolveMediaUrl } from "../../../services/media/config";
import { remoteConfig } from "../../../services/remoteConfig";
import type { RemoteConfigService } from "../../../services/remoteConfig/defaults";
import type { LocalState } from "../../../services/storage/localStore";
import { bundledDecor, bundledMurti } from "./bundled";
import {
  chosen,
  flowersFor,
  isLocked,
  MandirDecor,
  mergeDecor,
  murtiFor,
  NO_LIGHT,
  rewardedAdsOn,
  storeUnlock,
  watchAdToUnlock,
} from "./decor";

type Choices = LocalState["mandir"];

const mergeAll = (remote: DecorItem[]) =>
  mergeDecor(bundledDecor, remote, resolveMediaUrl);
// A temple only on the CDN (no bundled copy) shows the default mandir while
// its image loads, never an empty sanctum.
const defaultTemple = bundledDecor.find((item) => item.kind === "temple");
function withDefaultTemple(items: MandirDecor[]): MandirDecor[] {
  if (!defaultTemple) return items;
  return items.map((item) =>
    item.kind === "temple" && !item.placeholder && isRemote(item.image)
      ? { ...item, placeholder: defaultTemple.image }
      : item,
  );
}
const isRemote = (source: ImageSourcePropType | undefined) =>
  !!source && typeof source === "object" && "uri" in source && !!source.uri;
function prefetchSource(source: ImageSourcePropType | undefined) {
  if (source && isRemote(source))
    Image.prefetch((source as { uri: string }).uri).catch(() => undefined);
}
// Download the CDN images ahead (temples first: they fill the screen), so
// they are on the phone before they are shown.
function prefetchDecor(items: MandirDecor[]) {
  const order = ["temple", "light", "bell", "flower"];
  [...items]
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .forEach((item) => prefetchSource(item.image));
}

// Called from the Sadhana screen: fetch the published decor and the deity's
// murti and download their images before the Prayer screen is opened.
export function usePrefetchMandirDecor(deity: Deity | undefined) {
  const { getMandirDecor } = useApp();
  useEffect(() => {
    let active = true;
    getMandirDecor()
      .then((remote) => {
        if (active) prefetchDecor(mergeAll(remote));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [getMandirDecor]);
  useEffect(
    () =>
      prefetchSource(murtiFor(deity, resolveMediaUrl, bundledMurti)?.source),
    [deity],
  );
}

// The Prayer screen's mandir: the bundled decor merged with what the admin
// has published, the devotee's saved temple, light and bell, and unlocking
// with a rewarded ad (none needed while rewarded ads are switched off).
export function useMandirDecor(
  deity: Deity | undefined,
  {
    presenter = rewardedAdPresenter,
    config = remoteConfig,
  }: {
    presenter?: RewardedAdPresenter;
    config?: Pick<RemoteConfigService, "getBoolean">;
  } = {},
) {
  const { local, update, getMandirDecor } = useApp();
  const [remote, setRemote] = useState<DecorItem[]>([]);
  useEffect(() => {
    let active = true;
    getMandirDecor()
      .then((items) => {
        if (active) setRemote(items);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [getMandirDecor]);
  const items = useMemo(() => withDefaultTemple(mergeAll(remote)), [remote]);
  useEffect(() => prefetchDecor(items), [items]);

  // Read once per visit: Remote Config only changes between app starts.
  const [adsOn] = useState(() => rewardedAdsOn(config));
  // Single-use unlocks last for this visit.
  const [visit, setVisit] = useState<ReadonlySet<string>>(new Set());
  const saved = local.mandir;
  const locked = useCallback(
    (item: Pick<MandirDecor, "id" | "unlock">) =>
      isLocked(item, { adsOn, unlocked: saved.unlocked, visit }),
    [adsOn, saved.unlocked, visit],
  );

  const deityId = deity?.id;
  const temples = useMemo(
    () => decorFor(items, "temple", deityId),
    [items, deityId],
  );
  const lights = useMemo(
    () => decorFor(items, "light", deityId),
    [items, deityId],
  );
  const bells = useMemo(
    () => decorFor(items, "bell", deityId),
    [items, deityId],
  );
  const flowers = useMemo(() => flowersFor(items, deityId), [items, deityId]);
  const murti = useMemo(
    () => murtiFor(deity, resolveMediaUrl, bundledMurti),
    [deity],
  );
  useEffect(() => prefetchSource(murti?.source), [murti]);

  const temple = chosen(temples, saved.templeId, locked);
  const light =
    saved.lightId === NO_LIGHT ? null : chosen(lights, saved.lightId, locked);
  const bell = chosen(bells, saved.bellId, locked);

  const save = useCallback(
    (patch: Partial<Choices>) =>
      update((state) => ({ ...state, mandir: { ...state.mandir, ...patch } })),
    [update],
  );

  // One rewarded ad for the item. REWARDED: kept for good on this device;
  // REWARDED_SINGLE_USE: this visit (temples, lights, bells) or this one
  // offering (flowers). Resolves false when the ad was closed early.
  const unlock = useCallback(
    async (item: MandirDecor): Promise<boolean> => {
      if (!locked(item)) return true;
      const ok = await watchAdToUnlock(presenter);
      if (!ok) return false;
      if (item.unlock === "REWARDED")
        update((state) => ({
          ...state,
          mandir: {
            ...state.mandir,
            unlocked: storeUnlock(item, state.mandir.unlocked),
          },
        }));
      else if (item.kind !== "flower")
        setVisit((ids) => new Set([...ids, item.id]));
      return true;
    },
    [locked, presenter, update],
  );

  return {
    adsOn,
    temples,
    lights,
    bells,
    flowers,
    murti,
    temple,
    light,
    bell,
    locked,
    unlock,
    chooseTemple: (id: string) => save({ templeId: id }),
    chooseLight: (id: string | null) => save({ lightId: id ?? NO_LIGHT }),
    chooseBell: (id: string) => save({ bellId: id }),
  };
}
export type MandirDecorState = ReturnType<typeof useMandirDecor>;
