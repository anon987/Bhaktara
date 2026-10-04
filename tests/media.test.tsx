import React from "react";
import { Image } from "react-native";
import { act, render } from "@testing-library/react-native";
import {
  buildMediaKey,
  mediaSchema,
  mediaUrl,
  parseMediaBaseUrl,
} from "../src/domain/media";
import { DevotionalArt } from "../src/components/DevotionalArt";

// Stands in for a build with EXPO_PUBLIC_MEDIA_BASE_URL set.
jest.mock("../src/services/media/config", () => {
  const { mediaUrl } = jest.requireActual("../src/domain/media");
  return {
    resolveMediaUrl: (key: string) =>
      mediaUrl("https://media-dev.example.com", key),
  };
});

const base = "https://media-dev.example.com";

test("keys resolve against the CDN base; placeholders and unsafe keys never do", () => {
  expect(mediaUrl(base, "wallpaper/wp-1/mobile.3f9a1c2e.webp")).toBe(
    `${base}/wallpaper/wp-1/mobile.3f9a1c2e.webp`,
  );
  expect(mediaUrl(base, "deity/hanuman/thumb.0a1b2c3d.webp")).toContain(
    "/deity/hanuman/",
  );
  expect(mediaUrl(base, "folder/a b.webp")).toBe(`${base}/folder/a%20b.webp`);
  expect(mediaUrl(null, "wallpaper/wp-1/mobile.3f9a1c2e.webp")).toBeNull();
  expect(mediaUrl(base, "placeholder/shiva")).toBeNull();
  for (const key of [
    "https://evil.example/x.webp",
    "/absolute.webp",
    "a/../b.webp",
    "a//b.webp",
    "a/b.webp?x=1",
  ])
    expect(mediaUrl(base, key)).toBeNull();
});

test("the media base must be a clean HTTPS origin, except local test hosts", () => {
  expect(parseMediaBaseUrl(undefined)).toBeNull();
  expect(parseMediaBaseUrl("https://media.example.com/")).toBe(
    "https://media.example.com",
  );
  expect(parseMediaBaseUrl("https://cdn.example.com/media//")).toBe(
    "https://cdn.example.com/media",
  );
  expect(parseMediaBaseUrl("http://127.0.0.1:8770")).toBe(
    "http://127.0.0.1:8770",
  );
  for (const value of [
    "http://media.example.com",
    "https://user:pass@media.example.com",
    "https://media.example.com?token=1",
    "ftp://media.example.com",
  ])
    expect(() => parseMediaBaseUrl(value)).toThrow();
});

test("keys are content-addressed slugs in the documented layout", () => {
  expect(
    buildMediaKey({
      type: "WALLPAPER",
      id: "wp_0142",
      variant: "mobile",
      hash: "3f9a1c2e9b8d7c6a",
      ext: "webp",
    }),
  ).toBe("wallpaper/wp_0142/mobile.3f9a1c2e.webp");
  for (const id of ["../x", "Has Space", "", "a/b"])
    expect(() =>
      buildMediaKey({
        type: "wallpaper",
        id,
        variant: "thumb",
        hash: "3f9a1c2e",
        ext: "webp",
      }),
    ).toThrow();
});

test("media documents require a thumb and reject URLs in any variant", () => {
  expect(
    mediaSchema.safeParse({
      thumb: {
        key: "bhajan/b-1/thumb.0a1b2c3d.webp",
        bytes: 10,
        mime: "image/webp",
      },
      stream: { key: "bhajan/b-1/stream.0a1b2c3d.m4a", durationSeconds: 60 },
    }).success,
  ).toBe(true);
  expect(mediaSchema.safeParse({ stream: { key: "a/b.m4a" } }).success).toBe(
    false,
  );
  expect(
    mediaSchema.safeParse({
      thumb: { key: "a/b.webp" },
      full: { key: "https://example.com/full.jpg" },
    }).success,
  ).toBe(false);
});

test("art loads CDN keys from the configured base and falls back on failure", () => {
  const remote = render(
    <DevotionalArt assetKey="wallpaper/wp-1/mobile.3f9a1c2e.webp" />,
  );
  const image = remote.UNSAFE_getByType(Image);
  expect(image.props.source).toEqual({
    uri: `${base}/wallpaper/wp-1/mobile.3f9a1c2e.webp`,
  });
  act(() => image.props.onError());
  expect(remote.UNSAFE_queryByType(Image)).toBeNull();
  // Placeholder keys always use the bundled symbolic art.
  const local = render(<DevotionalArt assetKey="placeholder/shiva" />);
  expect(local.UNSAFE_queryByType(Image)).toBeNull();
});
