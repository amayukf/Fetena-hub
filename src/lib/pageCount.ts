/**
 * Shared page-count heuristic for uploaded exam papers.
 *
 * We cannot parse PDFs in this process, and the previous implementation simply
 * persisted a hard-coded `6` as if it were real metadata. Estimate from the byte
 * size instead (scanned A4 pages average roughly 90 KB in this pipeline) and
 * clamp to a believable range.
 *
 * Lives in `src/lib` rather than the server module so the admin UI and the API
 * derive the same number from the same rule.
 */
export const BYTES_PER_SCANNED_PAGE = 90_000;
export const MAX_ESTIMATED_PAGES = 60;

export function estimatePageCount(fileSizeBytes: unknown, fallback = 6): number {
  const size = Number(fileSizeBytes);
  if (!Number.isFinite(size) || size <= 0) return fallback;
  return Math.min(MAX_ESTIMATED_PAGES, Math.max(1, Math.round(size / BYTES_PER_SCANNED_PAGE)));
}
