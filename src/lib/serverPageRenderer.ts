import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { detectFileSignature } from "./storage";

const MAX_PAGE_WIDTH = 1800;
const MAX_PAGE_HEIGHT = 2400;
const PDF_RENDER_SCALE = 1.5;

export interface PageWatermark {
  fullName: string;
  studentId: string;
  date: string;
}

function documentKind(data: Uint8Array): "application/pdf" | "image/jpeg" | "image/png" {
  const signature = detectFileSignature(data);
  if (!signature.valid || !signature.detectedMime) {
    throw new Error(signature.error || "Unsupported document format.");
  }
  return signature.detectedMime;
}

export async function getDocumentPageCount(data: Uint8Array): Promise<number> {
  const kind = documentKind(data);
  if (kind !== "application/pdf") return 1;

  const task = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
  });
  try {
    const document = await task.promise;
    return document.numPages;
  } finally {
    await task.destroy();
  }
}

function addWatermark(
  context: SKRSContext2D,
  width: number,
  height: number,
  watermark: PageWatermark
): void {
  const text = `${watermark.fullName}  |  ${watermark.studentId}  |  ${watermark.date}`;
  const fontSize = Math.max(14, Math.round(width / 75));
  const stepX = Math.max(260, Math.round(width / 2.7));
  const stepY = Math.max(150, Math.round(height / 5));

  context.save();
  context.fillStyle = "rgba(128, 20, 35, 0.22)";
  context.font = `bold ${fontSize}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let y = -height; y <= height * 2; y += stepY) {
    for (let x = -width; x <= width * 2; x += stepX) {
      context.save();
      context.translate(x, y);
      context.rotate(-Math.PI / 6);
      context.fillText(text, 0, 0, width * 0.85);
      context.restore();
    }
  }
  context.restore();
}

export async function renderDocumentPage(
  data: Uint8Array,
  pageNumber: number
): Promise<{ image: Buffer; pageCount: number }> {
  const kind = documentKind(data);

  if (kind !== "application/pdf") {
    if (pageNumber !== 1) {
      throw new RangeError("Page number is outside the document.");
    }
    const source = await loadImage(Buffer.from(data));
    const scale = Math.min(
      1,
      MAX_PAGE_WIDTH / source.width,
      MAX_PAGE_HEIGHT / source.height
    );
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    return { image: await canvas.encode("png"), pageCount: 1 };
  }

  const task = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
  });
  try {
    const document = await task.promise;
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > document.numPages) {
      throw new RangeError("Page number is outside the document.");
    }

    const page = await document.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const scale = Math.min(
      1,
      MAX_PAGE_WIDTH / baseViewport.width,
      MAX_PAGE_HEIGHT / baseViewport.height
    );
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE * scale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    await page.render({
      canvas: null,
      // PDF.js and Skia use separate canvas type declarations for this shared runtime context.
      canvasContext: context as unknown as NonNullable<Parameters<typeof page.render>[0]["canvasContext"]>,
      viewport,
    }).promise;

    return { image: await canvas.encode("png"), pageCount: document.numPages };
  } finally {
    await task.destroy();
  }
}

export async function applyWatermarkToPage(
  image: Uint8Array,
  watermark: PageWatermark
): Promise<Buffer> {
  const source = await loadImage(Buffer.from(image));
  const canvas = createCanvas(source.width, source.height);
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0);
  addWatermark(context, source.width, source.height, watermark);
  return canvas.encode("png");
}

export async function renderWatermarkedPage(
  data: Uint8Array,
  pageNumber: number,
  watermark: PageWatermark
): Promise<{ image: Buffer; pageCount: number }> {
  const rendered = await renderDocumentPage(data, pageNumber);
  return { ...rendered, image: await applyWatermarkToPage(rendered.image, watermark) };
}
