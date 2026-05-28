export async function detectFaceInImage(file) {
  // Use native browser face detection so no external API/model call is required.
  if (typeof window === "undefined" || typeof window.FaceDetector !== "function") {
    return {
      status: "uncertain",
      confidence: null,
      provider: "fallback",
      reason: "FaceDetector API is not available in this browser."
    };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const detector = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: true });
    const faces = await detector.detect(bitmap);

    return {
      status: faces.length > 0,
      confidence: faces.length > 0 ? 85 : 0,
      provider: "face-detector-api",
      reason: faces.length > 0 ? "Face detected in image." : "No face detected in image."
    };
  } catch {
    // Keep result conservative instead of forcing a true/false photo decision.
    return {
      status: "uncertain",
      confidence: null,
      provider: "fallback",
      reason: "Face detection failed locally and is marked uncertain."
    };
  } finally {
    if (bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }
  }
}
