import { createWorker } from "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm";

function normalizeText(input) {
  return (input || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s:/-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeLines(text) {
  return (text || "")
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

export async function extractOcrText(file) {
  let worker;
  try {
    // Prefer English + Hindi when available from Tesseract's default language source.
    worker = await createWorker("eng+hin", 1);
  } catch {
    // Fallback to English-only OCR if Hindi data is missing.
    worker = await createWorker("eng", 1);
  }

  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(file);
    const text = data?.text || "";

    return {
      text,
      normalizedText: normalizeText(text),
      lines: normalizeLines(text),
      confidence: Math.round(data?.confidence || 0)
    };
  } finally {
    await worker.terminate();
  }
}
