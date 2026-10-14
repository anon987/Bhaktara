import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { PROFILE_PHOTO_MAX_BYTES, ProfileResult } from "../../domain/account";
import type { AccountRepository } from "../../repositories/accountRepository";
import { photoTransport, PhotoTransport } from "./photoTransport";

// The devotee's own photo: picked or taken, cropped square, resized to at
// most 512 px JPEG on the device, then uploaded to a signed URL (doc 21,
// src/domain/account.ts).

export const PHOTO_SIZE = 512;

export type PickedPhoto = { uri: string; width: number; height: number };
export type PickResult =
  | { kind: "picked"; photo: PickedPhoto }
  | { kind: "cancelled" }
  | { kind: "denied" };

export async function pickPhoto(
  source: "library" | "camera",
): Promise<PickResult> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  // The system photo picker needs no permission on new Android versions;
  // only a refused camera stops us.
  if (source === "camera" && !permission.granted) return { kind: "denied" };
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({
          ...options,
          cameraType: ImagePicker.CameraType.front,
        })
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return { kind: "cancelled" };
  return {
    kind: "picked",
    photo: { uri: asset.uri, width: asset.width, height: asset.height },
  };
}

// Centre square crop (the crop screen may be skipped on some phones), then
// at most 512 px, JPEG.
export async function preparePhoto(photo: PickedPhoto): Promise<string> {
  const side = Math.min(photo.width, photo.height);
  let context = ImageManipulator.manipulate(photo.uri);
  if (side > 0 && photo.width !== photo.height)
    context = context.crop({
      originX: Math.floor((photo.width - side) / 2),
      originY: Math.floor((photo.height - side) / 2),
      width: side,
      height: side,
    });
  if (side === 0 || side > PHOTO_SIZE)
    context = context.resize({ width: PHOTO_SIZE, height: PHOTO_SIZE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.82,
  });
  return saved.uri;
}

export type UploadStep = "preparing" | "uploading" | "saving";
export class PhotoUploadError extends Error {
  constructor(
    readonly step: UploadStep | "tooLarge",
    message: string,
  ) {
    super(message);
  }
}

// requestProfilePhotoUpload → PUT the file → updateProfile({ photoKey }).
export async function uploadProfilePhoto(
  uri: string,
  {
    callables,
    transport = photoTransport,
    onStep,
  }: {
    callables: Pick<
      AccountRepository,
      "requestProfilePhotoUpload" | "updateProfile"
    >;
    transport?: PhotoTransport;
    onStep?: (step: UploadStep) => void;
  },
): Promise<ProfileResult> {
  onStep?.("preparing");
  const bytes = await transport.size(uri);
  if (bytes > PROFILE_PHOTO_MAX_BYTES)
    throw new PhotoUploadError("tooLarge", "photo too large");
  onStep?.("uploading");
  const upload = await callables.requestProfilePhotoUpload({
    contentType: "image/jpeg",
    bytes,
  });
  const response = await transport.put(upload.uploadUrl, uri, upload.headers);
  if (response.status < 200 || response.status >= 300) {
    if (__DEV__)
      console.warn(
        "[profile] photo upload refused",
        response.status,
        response.body.slice(0, 400),
      );
    throw new PhotoUploadError("uploading", `upload failed ${response.status}`);
  }
  onStep?.("saving");
  return callables.updateProfile({ photoKey: upload.key });
}
