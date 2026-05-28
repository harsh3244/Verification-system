import { extractOcrText } from "./ocr.js";
import { detectFaceInImage } from "./faceDetection.js";
import { analyzeImageQuality, evaluateScreening } from "./scoring.js";
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/+esm";


const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs";

const state = {
  file: null,
  previewUrl: null,
  analyzing: false,
  mockCase: null
};

const overlay = document.getElementById("verificationOverlay");
const closeModalBtn = document.getElementById("closeModalBtn");
const openFromScriptBtn = document.getElementById("openFromScriptBtn");
const fullNameInput = document.getElementById("fullNameInput");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const previewImage = document.getElementById("previewImage");
const analyzeBtn = document.getElementById("analyzeBtn");
const resetBtn = document.getElementById("resetBtn");
const statusMessage = document.getElementById("statusMessage");
const verdictText = document.getElementById("verdictText");
const confidenceBadge = document.getElementById("confidenceBadge");
const resultFacts = document.getElementById("resultFacts");
const reasonsList = document.getElementById("reasonsList");

function setStatus(message, tone) {
  statusMessage.textContent = message || "";
  statusMessage.classList.remove("warn", "error");
  if (tone) {
    statusMessage.classList.add(tone);
  }
}

function clearResultUI() {
  verdictText.textContent = "Waiting for analysis";
  confidenceBadge.textContent = "Pending";
  resultFacts.innerHTML = "";
  reasonsList.innerHTML = "";
}

function revokePreviewUrl() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }
}

function resetState() {
  state.file = null;
  state.analyzing = false;
  revokePreviewUrl();
  previewImage.src = "";
  previewImage.classList.add("hidden");
  fileInput.value = "";
  clearResultUI();
  setStatus("");
}

function updatePreview(file) {
  if (file.type === "application/pdf") {
    previewImage.src = "";
    previewImage.classList.add("hidden");
    return;
  }

  revokePreviewUrl();
  state.previewUrl = URL.createObjectURL(file);
  previewImage.src = state.previewUrl;
  previewImage.classList.remove("hidden");
}

function validateFile(file) {
  if (!file) {
    return "Please upload a document image.";
  }

  if (!ACCEPTED_TYPES.has(file.type)) {
    return "Only JPG, PNG, WEBP, and PDF are allowed.";
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return "Image must be 10MB or smaller.";
  }

  return null;
}

function setFile(file) {
  const validationError = validateFile(file);
  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  state.file = file;
  updatePreview(file);
  setStatus("Image ready for analysis.");
}

function openVerificationModal() {
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
}

function closeVerificationModal() {
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  resetState();
}

function li(text) {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timerId));
}

async function convertPdfFirstPageToImage(pdfFile) {
  const pdfArrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const page = await pdfDoc.getPage(1);

  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  await page.render({ canvasContext: context, viewport }).promise;

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((generatedBlob) => {
      if (generatedBlob) {
        resolve(generatedBlob);
      } else {
        reject(new Error("Could not convert PDF page to image."));
      }
    }, "image/png");
  });

  return new File([blob], "pdf-first-page.png", { type: "image/png" });
}

function renderResult(result) {
  verdictText.textContent = result.finalDecision;
  confidenceBadge.textContent = result.finalDecision;

  // Keep full scoring in memory, but do not expose internals in UI.
  resultFacts.innerHTML = "";
  reasonsList.innerHTML = "";
  reasonsList.appendChild(li("System analyzed all weighted checks internally."));
  reasonsList.appendChild(li("Final output is limited to Verified or Unverified."));
}

async function analyzeCurrentImage() {
  if (state.analyzing) {
    return;
  }

  const fileError = validateFile(state.file);
  if (fileError) {
    setStatus(fileError, "error");
    return;
  }

  const enteredName = fullNameInput.value.trim();
  if (enteredName.length < 2) {
    setStatus("Enter full name before analysis.", "warn");
    return;
  }

  state.analyzing = true;
  analyzeBtn.disabled = true;
  setStatus("Analyzing image in browser memory only...");

  try {
    const analysisFile =
      state.file.type === "application/pdf"
        ? await withTimeout(
            convertPdfFirstPageToImage(state.file),
            12000,
            "PDF conversion timed out"
          )
        : state.file;

    if (state.file.type === "application/pdf") {
      updatePreview(analysisFile);
    }

    // Run OCR, face, and quality checks in parallel to keep UI responsive.
    const [ocrResult, faceResult, qualityResult] = await Promise.allSettled([
      withTimeout(extractOcrText(analysisFile), 25000, "OCR timed out"),
      withTimeout(detectFaceInImage(analysisFile), 8000, "Face detection timed out"),
      withTimeout(analyzeImageQuality(analysisFile), 8000, "Image quality analysis timed out")
    ]);

    const ocr =
      ocrResult.status === "fulfilled"
        ? ocrResult.value
        : { text: "", lines: [], normalizedText: "", confidence: 0 };

    const face =
      faceResult.status === "fulfilled"
        ? faceResult.value
        : {
            status: "uncertain",
            confidence: null,
            provider: "fallback",
            reason: "Face detection unavailable in this run."
          };

    const quality =
      qualityResult.status === "fulfilled"
        ? qualityResult.value
        : {
            blurScore: 0,
            glare: false,
            lowResolution: false,
            photoRegionLikely: false,
            skinLikeRatio: 0,
            portraitEdgeRatio: 0,
            darkPixelRatio: 0,
            brightness: 0,
            acceptable: false,
            reasons: ["Image quality analysis failed."]
          };

    const screening = evaluateScreening({
      text: ocr.text,
      lines: ocr.lines,
      enteredName,
      faceStatus: face.status,
      quality,
      mockCase: state.mockCase
    });

    if (ocrResult.status !== "fulfilled") {
      screening.reasons.push("OCR is slow or unavailable, so confidence is reduced.");
    }
    if (faceResult.status !== "fulfilled") {
      screening.reasons.push("Face detection did not finish, marked as uncertain.");
    }

    renderResult(screening);
    setStatus("Analysis completed. Review the heuristic result.");
  } catch {
    setStatus("Analysis failed in this browser. Try another image or browser.", "error");
  } finally {
    state.analyzing = false;
    analyzeBtn.disabled = false;
  }
}

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("drag-active");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("drag-active");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("drag-active");
  const file = event.dataTransfer?.files?.[0] || null;
  if (file) {
    setFile(file);
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0] || null;
  if (file) {
    setFile(file);
  }
});

overlay.addEventListener("click", (event) => {
  if (event.target === overlay) {
    closeVerificationModal();
  }
});

closeModalBtn.addEventListener("click", closeVerificationModal);
openFromScriptBtn.addEventListener("click", openVerificationModal);
analyzeBtn.addEventListener("click", analyzeCurrentImage);
resetBtn.addEventListener("click", resetState);

// Expose embed hooks for plain HTML integration.
window.openVerificationModal = openVerificationModal;
window.closeVerificationModal = closeVerificationModal;
window.setVerificationMockCase = (mockCaseId) => {
  state.mockCase = mockCaseId || null;
};
