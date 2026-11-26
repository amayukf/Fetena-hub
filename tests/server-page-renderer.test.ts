import { describe, expect, it } from "vitest";
import {
  getDocumentPageCount,
  renderWatermarkedPage,
} from "../src/lib/serverPageRenderer";
import { createOnePagePdf } from "./pdfFixture";

describe("server-rendered paper pages", () => {
  it("renders the real PDF page and embeds the requesting user's watermark", async () => {
    const pdf = createOnePagePdf();
    const watermarkDate = "2026-05-10";
    const first = await renderWatermarkedPage(pdf, 1, {
      fullName: "Student One",
      studentId: "AMU-1001",
      date: watermarkDate,
    });
    const second = await renderWatermarkedPage(pdf, 1, {
      fullName: "Student Two",
      studentId: "AMU-1002",
      date: watermarkDate,
    });

    expect(await getDocumentPageCount(pdf)).toBe(1);
    expect(first.pageCount).toBe(1);
    expect(first.image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(second.image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(first.image.equals(second.image)).toBe(false);
  });

  it("renders smaller WebP pages when requested for fast mobile viewing", async () => {
    const pdf = createOnePagePdf();
    const watermark = {
      fullName: "Student One",
      studentId: "AMU-1001",
      date: "2026-05-10",
    };
    const pngResult = await renderWatermarkedPage(pdf, 1, watermark, "png");
    const webpResult = await renderWatermarkedPage(pdf, 1, watermark, "webp");

    expect(webpResult.pageCount).toBe(1);
    expect(webpResult.image.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(webpResult.image.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(webpResult.image.length).toBeLessThan(pngResult.image.length);
  });

  it("rejects page numbers beyond the source document", async () => {
    await expect(renderWatermarkedPage(createOnePagePdf(), 2, {
      fullName: "Student One",
      studentId: "AMU-1001",
      date: "2026-05-10",
    })).rejects.toThrow(RangeError);
  });
});
