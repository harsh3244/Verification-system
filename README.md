# Aadhaar Document Screening Demo

This is a fully client-side verification demo built with plain HTML, CSS, and JavaScript. It screens an uploaded document in the browser using local OCR, local face detection, and lightweight heuristics to produce a demo verdict.

Important: this is a screening demo only. It is not official Aadhaar verification and should not be presented as a legal or government identity check.

## What It Does

The app opens as a modal widget that can be embedded into any regular web page. A user enters their name, uploads an image or PDF, and the browser analyzes the file locally.

The current flow is:

1. User opens the verification popup.
2. User enters the full name printed on the document.
3. User uploads a JPG, PNG, WEBP, or PDF file.
4. The app runs OCR, face detection, and image-quality checks in the browser.
5. A weighted heuristic score is calculated and mapped to a final demo verdict.

## Main Features

- Modal popup with overlay and responsive layout.
- Drag-and-drop upload plus file picker support.
- PDF support through first-page conversion before analysis.
- Local OCR using Tesseract.js with English + Hindi fallback.
- Local face detection using the browser FaceDetector API when available.
- Image-quality heuristics for blur, glare, brightness, and resolution.
- Fuzzy keyword matching for Aadhaar-related text.
- Fuzzy name matching against OCR output.
- 12-digit number detection with masked display.
- Weighted scoring with a 0-100 confidence-style output.
- Clear demo verdicts such as Verified, Needs Manual Review, or Not Verified.

## How The Analysis Works

The logic is split across a few small files:

- [script.js](script.js) coordinates upload handling, PDF conversion, OCR, face detection, and result rendering.
- [ocr.js](ocr.js) wraps Tesseract.js and normalizes extracted text and lines.
- [faceDetection.js](faceDetection.js) uses the browser FaceDetector API, then falls back to an uncertain status if the API is unavailable.
- [scoring.js](scoring.js) performs keyword detection, name matching, number detection, image-quality analysis, and final verdict generation.

The final output is intentionally conservative. If any of the core signals are weak or unavailable, the result can downgrade to manual review or unverified instead of forcing a positive match.

## Tech Stack

- Plain HTML for the UI shell.
- Plain CSS for layout and styling.
- Plain JavaScript modules for behavior.
- Tesseract.js for OCR.
- PDF.js for PDF-to-image conversion.
- Native browser FaceDetector API when supported.

## Local Setup

Run the static server:

```bash
npm run dev
```

Then open:

```text
http://localhost:5500
```

For the alternate port:

```bash
npm start
```

## Live Demo

The project is hosted on GitHub Pages here:

https://harsh3244.github.io/Verification-system/

## Embedding

You can embed the widget into any HTML page and open it from a button or script call.

```html
<button onclick="openVerificationModal()">Verify Aadhaar</button>
```

The global functions exposed by the app are:

- `openVerificationModal()`
- `closeVerificationModal()`

## Repository Structure

```text
index.html
styles.css
script.js
ocr.js
faceDetection.js
scoring.js
eng.traineddata
hin.traineddata
demo/
public/
```

## Data And Safety Notes

- Files are processed in browser memory only.
- No API key is required by default.
- No permanent document storage is implemented.
- Full Aadhaar numbers are not shown back in the UI.
- The widget limits uploads to JPG, PNG, WEBP, and PDF files up to 10 MB.

## Known Limitations

- Verdicts are heuristic and can produce false positives or false negatives.
- Face detection depends on browser support for the FaceDetector API.
- OCR quality depends on image clarity, lighting, and scan quality.
- This project should be treated as a demo or prototype, not a compliance-grade identity system.

## License

See [LICENSE](LICENSE) for the project license.
