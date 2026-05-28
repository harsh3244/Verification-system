# Aadhaar Document Screening Demo (Static)

This project is now a pure HTML/CSS/JavaScript popup demo.

- No React
- No Next.js
- No TSX components
- No paid OCR/vision API required

Important disclaimer:

Demo screening only. This is not official Aadhaar verification.

## Files

```text
index.html
styles.css
script.js
ocr.js
faceDetection.js
scoring.js
eng.traineddata
hin.traineddata
```

## Run locally

```bash
npm run dev
```

Then open:

```text
http://localhost:5500
```

## Embedding usage

Use the popup in any normal HTML page:

```html
<button onclick="openVerificationModal()">Verify Aadhaar</button>
```

The global APIs exposed by `script.js` are:

- `openVerificationModal()`
- `closeVerificationModal()`

## Functional coverage

- Modal popup with overlay, close button, and mobile responsive layout.
- Drag/drop and file picker upload.
- Name input and Analyze action.
- Local OCR via `tesseract.js` in browser.
- Local face detection via browser `FaceDetector` API with `uncertain` fallback.
- Fuzzy Aadhaar keyword detection.
- Fuzzy name match percentage.
- 12-digit number pattern detection with masking (`XXXX-XXXX-1234`).
- Image quality checks: blur, brightness, glare, and resolution.
- Weighted score (total 100) and verdict bands.
- Reasons list and confidence output.
- Mock case handling:
  - clear Aadhaar-like image
  - blurred image
  - wrong document
  - no face
  - name mismatch

## Security guardrails

- File type restricted to JPG/PNG/WEBP.
- Max size: 5MB.
- No permanent image storage.
- In-memory analysis only.
- No full Aadhaar number shown.
- No API key required by default.
