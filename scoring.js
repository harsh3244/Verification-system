const AADHAAR_KEYWORDS = [
  "aadhaar",
  "aadhar",
  "government of india",
  "unique identification authority",
  "unique identification authority of india",
  "uidai",
  "भारत सरकार",
  "भारत्त सरकार",
  "आधार",
  "dob",
  "male",
  "female"
];

const GOVERNMENT_KEYWORDS = [
  "government of india",
  "govt of india",
  "unique identification authority",
  "भारत सरकार",
  "भारत्त सरकार"
];

const NAME_LABELS = ["name", "नाम"];

const WEIGHTS = {
  aadhaarKeywords: 25,
  governmentText: 15,
  faceDetected: 15,
  nameMatch: 20,
  numberPattern: 10,
  layoutHeuristic: 10,
  imageQuality: 5
};

function normalizeText(input) {
  return (input || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s:/-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function levenshtein(a, b) {
  if (a === b) {
    return 0;
  }

  if (!a.length) {
    return b.length;
  }

  if (!b.length) {
    return a.length;
  }

  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

function fuzzySimilarity(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 100;
  }

  const maxLen = Math.max(a.length, b.length);
  const editDistance = levenshtein(a, b);
  return Math.max(0, Math.round((1 - editDistance / maxLen) * 100));
}

function phraseDetected(lines, phrase, threshold = 83) {
  const normalizedPhrase = normalizeText(phrase);
  return lines.some((line) => {
    if (line.includes(normalizedPhrase)) {
      return true;
    }

    if (fuzzySimilarity(line, normalizedPhrase) >= threshold) {
      return true;
    }

    const tokens = line.split(" ");
    const phraseTokenCount = normalizedPhrase.split(" ").length;
    for (let i = 0; i < tokens.length; i += 1) {
      const window = tokens.slice(i, i + phraseTokenCount + 1).join(" ");
      if (fuzzySimilarity(window, normalizedPhrase) >= threshold + 2) {
        return true;
      }
    }
    return false;
  });
}

function detectKeywordSignals(lines) {
  // Fuzzy phrase detection handles typical OCR misspellings and spacing noise.
  const aadhaarHits = AADHAAR_KEYWORDS.filter((keyword) => phraseDetected(lines, keyword));
  const governmentHits = GOVERNMENT_KEYWORDS.filter((keyword) => phraseDetected(lines, keyword));

  return {
    aadhaarKeywordDetected: aadhaarHits.length > 0,
    governmentTextDetected: governmentHits.length > 0,
    aadhaarHits,
    governmentHits
  };
}

function looksLikeName(line) {
  const text = normalizeText(line);
  if (!text || /\d/.test(text) || text.length < 4 || text.length > 48) {
    return false;
  }
  const tokens = text.split(" ");
  return tokens.length >= 2 && tokens.length <= 5;
}

function extractNameCandidates(lines) {
  const out = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (NAME_LABELS.some((label) => line.includes(label))) {
      const inline = line.split(":").slice(1).join(":").trim();
      if (looksLikeName(inline)) {
        out.add(inline);
      }
      if (looksLikeName(lines[i + 1] || "")) {
        out.add(lines[i + 1]);
      }
    }

    if (looksLikeName(line)) {
      out.add(line);
    }
  }
  return [...out];
}

function compareName(enteredName, lines) {
  const candidates = extractNameCandidates(lines);
  if (!candidates.length) {
    return { score: 0, status: "mismatch", extractedName: null };
  }

  const best = candidates
    .map((candidate) => ({ candidate, score: fuzzySimilarity(enteredName, candidate) }))
    .sort((a, b) => b.score - a.score)[0];

  const status = best.score >= 92 ? "exact" : best.score >= 70 ? "probable" : "mismatch";
  return {
    score: best.score,
    status,
    extractedName: best.candidate
  };
}

function maskNumber(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length !== 12) {
    return null;
  }
  return `XXXX-XXXX-${digits.slice(-4)}`;
}

function detectNumberPattern(text) {
  const rawText = text || "";

  // First pass: exact grouped-digit pattern.
  const directMatch = rawText.match(/\b(?:\d{4}[\s-]?){2}\d{4}\b/i);
  if (directMatch) {
    return {
      detected: true,
      masked: maskNumber(directMatch[0])
    };
  }

  // OCR-tolerant pass: normalize common digit confusions and re-check.
  const normalized = rawText
    .replace(/[OoQ]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8");

  const digitStream = normalized.replace(/\D/g, "");
  const likely12Digit = digitStream.match(/\d{12}/);

  if (!likely12Digit) {
    return { detected: false, masked: null };
  }

  return {
    detected: true,
    masked: maskNumber(likely12Digit[0])
  };
}

function computeVariance(values) {
  if (!values.length) {
    return 0;
  }
  const mean = values.reduce((sum, n) => sum + n, 0) / values.length;
  return values.reduce((sum, n) => sum + (n - mean) ** 2, 0) / values.length;
}

export async function analyzeImageQuality(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const maxWidth = 1200;
  const ratio = Math.min(1, maxWidth / bitmap.width);
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (typeof bitmap.close === "function") {
    bitmap.close();
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let brightnessTotal = 0;
  let glarePixels = 0;
  const edgeValues = [];

  const width = canvas.width;
  const height = canvas.height;
  const gray = new Uint8Array(width * height);

  // Build grayscale and brightness stats in one pass.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = imageData[idx];
      const g = imageData[idx + 1];
      const b = imageData[idx + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      gray[y * width + x] = lum;
      brightnessTotal += lum;
      if (lum >= 245) {
        glarePixels += 1;
      }
    }
  }

  // Edge variance is used as a blur proxy without adding heavy CV dependencies.
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const i = y * width + x;
      const delta =
        Math.abs(gray[i] - gray[i + 1]) + Math.abs(gray[i] - gray[i + width]);
      edgeValues.push(delta);
    }
  }

  const avgBrightness = brightnessTotal / (width * height);
  const edgeVariance = computeVariance(edgeValues);
  const blurScore = Math.max(0, Math.min(100, Math.round(Math.sqrt(edgeVariance) * 0.8)));
  const glare = glarePixels / (width * height) > 0.08 || avgBrightness > 220;
  const lowResolution = width < 900 || height < 500;

  // Heuristic portrait-region check for Aadhaar front side layout.
  // Use a tighter inner window to avoid border/text leakage.
  const photoLeft = Math.floor(width * 0.11);
  const photoRight = Math.floor(width * 0.30);
  const photoTop = Math.floor(height * 0.34);
  const photoBottom = Math.floor(height * 0.74);
  const portraitRegionValues = [];
  let portraitEdgeCount = 0;
  let portraitPixels = 0;
  let skinLikePixels = 0;
  let darkPortraitPixels = 0;

  for (let y = photoTop; y < photoBottom; y += 1) {
    for (let x = photoLeft; x < photoRight; x += 1) {
      const grayIndex = y * width + x;
      const lum = gray[grayIndex];
      portraitRegionValues.push(lum);

      // Count local edges in portrait region.
      if (x + 1 < photoRight && y + 1 < photoBottom) {
        const localDelta =
          Math.abs(lum - gray[grayIndex + 1]) + Math.abs(lum - gray[grayIndex + width]);
        if (localDelta >= 28) {
          portraitEdgeCount += 1;
        }
      }

      // Simple skin-likelihood check in YCbCr space.
      const px = grayIndex * 4;
      const r = imageData[px];
      const g = imageData[px + 1];
      const b = imageData[px + 2];
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 178) {
        skinLikePixels += 1;
      }

      if (lum < 170) {
        darkPortraitPixels += 1;
      }

      portraitPixels += 1;
    }
  }

  const portraitVariance = computeVariance(portraitRegionValues);
  const portraitStdDev = Math.sqrt(portraitVariance);
  const portraitEdgeRatio = portraitPixels ? portraitEdgeCount / portraitPixels : 0;
  const skinLikeRatio = portraitPixels ? skinLikePixels / portraitPixels : 0;
  const darkPixelRatio = portraitPixels ? darkPortraitPixels / portraitPixels : 0;
  const photoRegionLikely =
    portraitStdDev >= 12 &&
    portraitEdgeRatio >= 0.06 &&
    (skinLikeRatio >= 0.01 || darkPixelRatio >= 0.12);

  const reasons = [];
  if (blurScore < 30) {
    reasons.push("Image appears blurry.");
  }
  if (glare) {
    reasons.push("Glare or overexposure detected.");
  }
  if (lowResolution) {
    reasons.push("Resolution is low for dependable screening.");
  }
  if (avgBrightness < 75) {
    reasons.push("Image is underexposed.");
  }
  if (!photoRegionLikely) {
    reasons.push("Portrait region appears weak or missing.");
  }

  return {
    blurScore,
    glare,
    lowResolution,
    photoRegionLikely,
    skinLikeRatio,
    portraitEdgeRatio,
    darkPixelRatio,
    brightness: Math.round(avgBrightness),
    acceptable: blurScore >= 30 && !glare && !lowResolution && avgBrightness >= 75,
    reasons
  };
}

function evaluateLayout(lines, face, quality) {
  const topText = lines.slice(0, 5).join(" ");
  let layoutScore = 0;

  if (
    topText.includes("aadhaar") ||
    topText.includes("government of india") ||
    topText.includes("भारत सरकार") ||
    topText.includes("uidai")
  ) {
    layoutScore += 45;
  }
  if (face === true) {
    layoutScore += 30;
  } else if (face === "uncertain") {
    layoutScore += 10;
  }
  if (!quality.lowResolution && quality.blurScore >= 32) {
    layoutScore += 15;
  }
  if (lines.length >= 4) {
    layoutScore += 10;
  }

  return {
    idLikeLayoutDetected: layoutScore >= 52,
    score: Math.min(100, layoutScore)
  };
}

function verdictFromScore(score) {
  if (score >= 80) {
    return "Likely Aadhaar-like";
  }
  if (score >= 60) {
    return "Possibly Aadhaar-like";
  }
  if (score >= 40) {
    return "Unclear";
  }
  return "Not Aadhaar-like";
}

function buildScoreBreakdown(result) {
  const points = {
    aadhaarKeywords: result.keywordSignals.aadhaarKeywordDetected ? WEIGHTS.aadhaarKeywords : 0,
    governmentText: result.keywordSignals.governmentTextDetected ? WEIGHTS.governmentText : 0,
    faceDetected: result.faceStatus === true ? WEIGHTS.faceDetected : 0,
    nameMatch: Math.round((Math.min(result.nameMatch.score, 100) / 100) * WEIGHTS.nameMatch),
    numberPattern: result.numberPattern.detected ? WEIGHTS.numberPattern : 0,
    layoutHeuristic: Math.round((Math.min(result.layout.score, 100) / 100) * WEIGHTS.layoutHeuristic),
    imageQuality: result.quality.acceptable ? WEIGHTS.imageQuality : 0
  };

  const total =
    points.aadhaarKeywords +
    points.governmentText +
    points.faceDetected +
    points.nameMatch +
    points.numberPattern +
    points.layoutHeuristic +
    points.imageQuality;

  return { points, total, max: 100 };
}

function deriveVerificationStatus(result) {
  const allCriticalChecksPass =
    result.keywordSignals.aadhaarKeywordDetected &&
    result.keywordSignals.governmentTextDetected &&
    result.numberPattern.detected &&
    result.faceStatus === true &&
    result.nameMatch.score >= 80 &&
    result.layout.idLikeLayoutDetected &&
    result.quality.acceptable;

  if (result.confidence >= 85 && allCriticalChecksPass) {
    return "Verified (Heuristic Demo)";
  }

  if (result.confidence >= 60) {
    return "Needs Manual Review";
  }

  return "Not Verified";
}

function deriveFinalDecision(result) {
  const keywordSignal =
    result.keywordSignals.aadhaarKeywordDetected || result.keywordSignals.governmentTextDetected;

  const identityFieldSignal =
    result.keywordSignals.aadhaarHits.some((hit) => {
      const token = normalizeText(hit);
      return token.includes("dob") || token.includes("male") || token.includes("female");
    }) ||
    result.keywordSignals.governmentHits.length > 0;

  // Supporting signals: allow browser limitations (e.g., uncertain face detection) and OCR noise.
  let supportCount = 0;
  if (result.faceStatus !== false) {
    supportCount += 1;
  }
  if (result.layout.idLikeLayoutDetected) {
    supportCount += 1;
  }
  if (!result.quality.glare && !result.quality.lowResolution && result.quality.blurScore >= 20) {
    supportCount += 1;
  }

  const strongCore =
    result.numberPattern.detected &&
    result.nameMatch.score >= 55 &&
    keywordSignal;

  // Reduce false "Verified" on photo-missing cards by requiring strong photo evidence.
  const faceOrPhotoCheck =
    (result.faceStatus === true && result.quality.photoRegionLikely) ||
    (result.faceStatus === "uncertain" &&
      result.quality.photoRegionLikely &&
      (result.quality.skinLikeRatio >= 0.01 || result.quality.darkPixelRatio >= 0.12) &&
      result.quality.portraitEdgeRatio >= 0.06);

  const verified =
    strongCore &&
    result.confidence >= 50 &&
    (supportCount >= 2 || identityFieldSignal) &&
    faceOrPhotoCheck;

  return verified ? "Verified" : "Unverified";
}

function applyMockCase(result, mockCase) {
  if (!mockCase) {
    return result;
  }

  const cloned = structuredClone(result);

  if (mockCase === "clear-aadhaar-like") {
    cloned.quality.blurScore = Math.max(cloned.quality.blurScore, 42);
    cloned.quality.glare = false;
    cloned.quality.lowResolution = false;
  }

  if (mockCase === "blurred-image") {
    cloned.quality.blurScore = 14;
    cloned.quality.acceptable = false;
    cloned.quality.reasons.push("Mock case: severe blur applied.");
  }

  if (mockCase === "wrong-document") {
    cloned.keywordSignals.aadhaarKeywordDetected = false;
    cloned.keywordSignals.governmentTextDetected = false;
    cloned.keywordSignals.aadhaarHits = [];
    cloned.keywordSignals.governmentHits = [];
    cloned.numberPattern.detected = false;
    cloned.numberPattern.masked = null;
    cloned.layout.idLikeLayoutDetected = false;
    cloned.layout.score = 20;
  }

  if (mockCase === "no-face") {
    cloned.faceStatus = false;
  }

  if (mockCase === "name-mismatch") {
    cloned.nameMatch.score = Math.min(cloned.nameMatch.score, 28);
    cloned.nameMatch.status = "mismatch";
  }

  return cloned;
}

export function evaluateScreening(input) {
  const lines = (input.lines || []).map((line) => normalizeText(line)).filter(Boolean);
  const keywordSignals = detectKeywordSignals(lines);
  const nameMatch = compareName(input.enteredName, lines);
  const numberPattern = detectNumberPattern(input.text || "");
  const quality = input.quality;
  const faceStatus = input.faceStatus;
  const layout = evaluateLayout(lines, faceStatus, quality);

  let total = 0;
  if (keywordSignals.aadhaarKeywordDetected) {
    total += WEIGHTS.aadhaarKeywords;
  }
  if (keywordSignals.governmentTextDetected) {
    total += WEIGHTS.governmentText;
  }
  if (faceStatus === true) {
    total += WEIGHTS.faceDetected;
  }
  if (numberPattern.detected) {
    total += WEIGHTS.numberPattern;
  }
  total += Math.round((Math.min(nameMatch.score, 100) / 100) * WEIGHTS.nameMatch);
  total += Math.round((Math.min(layout.score, 100) / 100) * WEIGHTS.layoutHeuristic);
  total += quality.acceptable ? WEIGHTS.imageQuality : 0;

  const base = {
    verdict: verdictFromScore(total),
    confidence: Math.max(0, Math.min(100, total)),
    nameMatch,
    faceStatus,
    keywordSignals,
    numberPattern,
    quality,
    layout
  };

  const result = applyMockCase(base, input.mockCase);

  const scoreBreakdown = buildScoreBreakdown(result);
  result.scoreBreakdown = scoreBreakdown;
  result.confidence = Math.max(0, Math.min(100, scoreBreakdown.total));
  result.verdict = verdictFromScore(result.confidence);
  result.verificationStatus = deriveVerificationStatus(result);
  result.finalDecision = deriveFinalDecision(result);

  result.reasons = [
    `Final decision: ${result.finalDecision}.`,
    `Verification status: ${result.verificationStatus}.`,
    result.keywordSignals.aadhaarKeywordDetected
      ? `Aadhaar keywords found: ${result.keywordSignals.aadhaarHits.slice(0, 3).join(", ") || "yes"}.`
      : "Aadhaar-specific keywords not confidently found.",
    result.keywordSignals.governmentTextDetected
      ? `Government text found: ${result.keywordSignals.governmentHits.slice(0, 2).join(", ") || "yes"}.`
      : "Government header text not found.",
    `Name match ${result.nameMatch.score}% (${result.nameMatch.status}).`,
    result.faceStatus === true
      ? "Face detected in image."
      : result.faceStatus === false
        ? "No face detected."
        : "Face detection uncertain in this browser.",
    result.numberPattern.detected
      ? `12-digit pattern detected and masked as ${result.numberPattern.masked}.`
      : "No 12-digit Aadhaar-like pattern detected.",
    result.layout.idLikeLayoutDetected
      ? "Layout appears ID-like."
      : "Layout heuristics are weak.",
    ...result.quality.reasons
  ];

  return result;
}
