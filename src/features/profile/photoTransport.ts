import { File } from "expo-file-system";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";

// The photo file goes to the signed URL natively, straight from disk, so the
// request carries exactly the signed Content-Type, Content-Length and
// Cache-Control. (A JS Blob body through fetch was refused by R2 with
// SignatureDoesNotMatch on Android.)
export type PhotoTransport = {
  size: (uri: string) => Promise<number>;
  put: (
    url: string,
    uri: string,
    headers: Record<string, string>,
  ) => Promise<{ status: number; body: string }>;
};

export const photoTransport: PhotoTransport = {
  size: async (uri) => new File(uri).size ?? 0,
  put: async (url, uri, headers) => {
    const result = await uploadAsync(url, uri, {
      httpMethod: "PUT",
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers,
    });
    return { status: result.status, body: result.body };
  },
};
