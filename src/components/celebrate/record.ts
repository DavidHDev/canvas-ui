"use client";

const CANDIDATES = [
  "video/mp4;codecs=avc1.4d002a",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export const extensionFor = (mime: string) =>
  mime.startsWith("video/mp4") ? "mp4" : "webm";

export function recordCanvas(
  canvas: HTMLCanvasElement,
  mimeType: string,
  durationMs: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let stream: MediaStream;
    let recorder: MediaRecorder;
    try {
      stream = canvas.captureStream(60);
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 12_000_000,
      });
    } catch {
      reject(new Error("This browser can't record the canvas."));
      return;
    }

    const chunks: BlobPart[] = [];
    const cleanup = () => stream.getTracks().forEach((track) => track.stop());

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error("Recording failed."));
    };
    recorder.onstop = () => {
      cleanup();
      resolve(new Blob(chunks, { type: mimeType }));
    };

    recorder.start();
    setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, durationMs);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
