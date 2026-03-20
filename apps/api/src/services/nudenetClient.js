const DEFAULT_TIMEOUT_MS = Number(process.env.NUDENET_TIMEOUT_MS || "20000");

function getNudeNetBaseUrl() {
  return process.env.NUDENET_URL || "http://localhost:5000";
}

export async function checkNsfwAndPhash({ imageBuffer, mimetype, originalName, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const nudenetUrl = `${getNudeNetBaseUrl()}/check`;

  const form = new FormData();
  form.append(
    "image",
    new Blob([imageBuffer], { type: mimetype }),
    // Flask only uses filename for the extension; keep it stable/deterministic
    originalName || "upload"
  );

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(nudenetUrl, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      // Keep data null; route will fall back to generic errors.
    }

    return { ok: res.ok, statusCode: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

