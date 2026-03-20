import { checkNsfwAndPhash } from "./nudenetClient.js";

export class ImageValidationError extends Error {
  constructor(message, { statusCode } = {}) {
    super(message);
    this.name = "ImageValidationError";
    this.statusCode = statusCode;
  }
}

export async function validateImageAgainstNudeNet(file) {
  if (!file?.buffer) {
    throw new ImageValidationError("No image buffer available");
  }

  const { ok, statusCode, data } = await checkNsfwAndPhash({
    imageBuffer: file.buffer,
    mimetype: file.mimetype,
    originalName: file.originalname,
  });

  if (!ok) {
    const msg = data?.error || data?.message || "NudeNet validation failed";
    throw new ImageValidationError(msg, { statusCode: statusCode || 502 });
  }

  const status = data?.status;
  const hash = data?.hash;

  if (status === "nsfw") return { verdict: "nsfw" };
  if (status === "duplicate") return { verdict: "duplicate", phash: hash };
  if (status === "safe") return { verdict: "safe", phash: hash };

  throw new ImageValidationError("Unexpected NudeNet response");
}

