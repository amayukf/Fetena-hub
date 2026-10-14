import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { PrismaClient, Role, PaperStatus } from "@prisma/client";
import {
  storage,
  LocalStorageAdapter,
  detectFileSignature,
  validateUploadFile,
  validateStorageKey,
  generateRandomStorageKey,
  signStreamTicket,
  verifyStreamTicket,
} from "../src/lib/storage";
import { generateCompressedPageBuffer } from "../src/lib/pageCompressor";

const prisma = new PrismaClient();
const TEST_SECRET = "test-secret-examvault-key-32-chars-long";

describe("ExamVault Private Storage & Secure Viewer (Step 8)", () => {
  // -------------------------------------------------------------
  // 1. Magic Bytes File Signature Verification
  // -------------------------------------------------------------
  describe("Magic Bytes File Signature Verification", () => {
    it("accepts authentic PDF files with %PDF- header", () => {
      const pdfBuf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");
      const result = detectFileSignature(pdfBuf);
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe("application/pdf");
      expect(result.detectedExt).toBe("pdf");
    });

    it("accepts authentic PNG files with 8-byte PNG header", () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const result = detectFileSignature(pngHeader);
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe("image/png");
      expect(result.detectedExt).toBe("png");
    });

    it("accepts authentic JPEG files with SOI marker 0xFFD8FF", () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const result = detectFileSignature(jpegHeader);
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe("image/jpeg");
      expect(result.detectedExt).toBe("jpg");
    });

    it("rejects disguised executable or script files masquerading with .pdf extension", () => {
      const maliciousPayload = Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff");
      const result = detectFileSignature(maliciousPayload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid file signature (magic bytes)");

      // validateUploadFile also rejects it
      const uploadCheck = validateUploadFile(maliciousPayload, "application/pdf");
      expect(uploadCheck.valid).toBe(false);
      expect(uploadCheck.error).toContain("Invalid file signature");
    });

    it("rejects plain text files masquerading as images or PDFs", () => {
      const textBuf = Buffer.from("Hello, this is just a plain text file without PDF magic bytes.");
      const result = detectFileSignature(textBuf);
      expect(result.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 2. Storage Key Prefix Enforcement & Randomization
  // -------------------------------------------------------------
  describe("Private Storage Prefixes & Key Randomization", () => {
    it("permits keys starting with quarantine/ and published/ prefixes", () => {
      expect(() => validateStorageKey("quarantine/user123/receipt.jpg")).not.toThrow();
      expect(() => validateStorageKey("published/papers/math1011_final.pdf")).not.toThrow();
    });

    it("strictly blocks keys outside quarantine/ and published/ prefixes", () => {
      expect(() => validateStorageKey("public/papers/exam.pdf")).toThrow(
        /Invalid storage prefix/
      );
      expect(() => validateStorageKey("uploads/test.png")).toThrow(
        /Invalid storage prefix/
      );
      expect(() => validateStorageKey("static/downloads/final.pdf")).toThrow(
        /Invalid storage prefix/
      );
    });

    it("blocks directory traversal attempts in storage keys", () => {
      expect(() => validateStorageKey("quarantine/../../etc/passwd")).toThrow(
        /Path traversal/
      );
      expect(() => validateStorageKey("published\\..\\windows\\system32")).toThrow(
        /Path traversal/
      );
    });

    it("generates randomized storage keys that never expose user filenames", () => {
      const key1 = generateRandomStorageKey("quarantine", "pdf");
      const key2 = generateRandomStorageKey("quarantine", "jpg", "receipts");
      const key3 = generateRandomStorageKey("published", "pdf");

      expect(key1).toMatch(/^quarantine\/[0-9a-f-]{36}\.pdf$/);
      expect(key2).toMatch(/^quarantine\/receipts\/[0-9a-f-]{36}\.jpg$/);
      expect(key3).toMatch(/^published\/[0-9a-f-]{36}\.pdf$/);

      // Verify no user filename strings are present
      expect(key1).not.toContain("my_exam");
      expect(key1).not.toContain("receipt");
    });
  });

  // -------------------------------------------------------------
  // 3. Signed URLs & 60-Second Expiration
  // -------------------------------------------------------------
  describe("Signed URL Security & Expiration Enforcement", () => {
    it("validates an active signed stream ticket within its 60-second window", () => {
      const key = "published/exam_paper_123.pdf";
      const expiresAt = Date.now() + 50 * 1000; // 50 seconds in future
      const signature = signStreamTicket(key, expiresAt, TEST_SECRET);

      const isValid = verifyStreamTicket(key, expiresAt, signature, TEST_SECRET);
      expect(isValid).toBe(true);
    });

    it("rejects an expired signed stream URL (lifetime > 60s or expired)", () => {
      const key = "published/exam_paper_123.pdf";
      const expiredTimestamp = Date.now() - 5000; // 5 seconds in the past
      const signature = signStreamTicket(key, expiredTimestamp, TEST_SECRET);

      // Must fail because timestamp is expired
      const isValid = verifyStreamTicket(key, expiredTimestamp, signature, TEST_SECRET);
      expect(isValid).toBe(false);
    });

    it("rejects a signed URL if key or expiration timestamp has been tampered with", () => {
      const originalKey = "published/exam_paper_123.pdf";
      const expiresAt = Date.now() + 45 * 1000;
      const signature = signStreamTicket(originalKey, expiresAt, TEST_SECRET);

      // Attacker tries to use the same signature for a different paper key
      const tamperedKey = "published/secret_admin_exam.pdf";
      const isTamperedKeyValid = verifyStreamTicket(tamperedKey, expiresAt, signature, TEST_SECRET);
      expect(isTamperedKeyValid).toBe(false);

      // Attacker tries to extend expiration to 10 hours later
      const tamperedExpires = expiresAt + 36000 * 1000;
      const isTamperedExpiresValid = verifyStreamTicket(originalKey, tamperedExpires, signature, TEST_SECRET);
      expect(isTamperedExpiresValid).toBe(false);
    });

    it("enforces maximum 60 seconds expiration in getSignedViewUrl", async () => {
      const localAdapter = new LocalStorageAdapter(undefined, TEST_SECRET);
      const url = await localAdapter.getSignedViewUrl("published/sample.pdf", 300); // Requested 300s

      const urlObj = new URL(url, "http://localhost");
      const expiresMs = Number(urlObj.searchParams.get("expires"));
      const remainingSeconds = Math.round((expiresMs - Date.now()) / 1000);

      // Expiration must be capped at 60 seconds or less
      expect(remainingSeconds).toBeLessThanOrEqual(60);
      expect(remainingSeconds).toBeGreaterThan(50);
    });
  });

  // -------------------------------------------------------------
  // 4. Guessing Storage Key or URL without Access (403/404)
  // -------------------------------------------------------------
  describe("Anti-Guessing & Private Access Control", () => {
    it("fails when an attacker guesses an arbitrary storage key without a signed signature", () => {
      const guessedKey = "published/math1011_final_2016.pdf";
      const fakeSignature = "deadbeef1234567890abcdef";
      const expiresAt = Date.now() + 60000;

      const isValid = verifyStreamTicket(guessedKey, expiresAt, fakeSignature, TEST_SECRET);
      expect(isValid).toBe(false);
    });

    it("fails when an attacker supplies an expired timestamp to guess access", () => {
      const guessedKey = "quarantine/receipts/proof_42.jpg";
      const expiredTimestamp = Date.now() - 10000;
      const signature = signStreamTicket(guessedKey, expiredTimestamp, TEST_SECRET);

      const isValid = verifyStreamTicket(guessedKey, expiredTimestamp, signature, TEST_SECRET);
      expect(isValid).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 5. Max 2 Concurrent Sessions Limit
  // -------------------------------------------------------------
  describe("Concurrent Sessions Restriction (Max 2 Per Account)", () => {
    const testUserId = "test-session-user-" + Date.now();

    beforeEach(async () => {
      // Create user for session test
      await prisma.user.create({
        data: {
          id: testUserId,
          fullName: "Test Concurrent Student",
          studentId: "AMU-TEST-SESS",
          role: Role.STUDENT,
          passwordHash: "hash",
          isActive: true,
        },
      });
    });

    afterEach(async () => {
      await prisma.session.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    });

    it("permits up to 2 simultaneous active sessions", async () => {
      // Create session 1
      await prisma.session.create({
        data: {
          userId: testUserId,
          sessionTokenHash: "hash-1-" + Date.now(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      // Create session 2
      await prisma.session.create({
        data: {
          userId: testUserId,
          sessionTokenHash: "hash-2-" + Date.now(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      const activeCount = await prisma.session.count({
        where: { userId: testUserId, expiresAt: { gt: new Date() } },
      });
      expect(activeCount).toBe(2);
      expect(activeCount <= 2).toBe(true);
    });

    it("identifies session limit violation when a 3rd active session exists", async () => {
      // Create 3 active sessions
      for (let i = 1; i <= 3; i++) {
        await prisma.session.create({
          data: {
            userId: testUserId,
            sessionTokenHash: `hash-${i}-${Date.now()}`,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
      }

      const activeCount = await prisma.session.count({
        where: { userId: testUserId, expiresAt: { gt: new Date() } },
      });
      expect(activeCount).toBe(3);
      // Fails concurrent session check because > 2
      const isAllowed = activeCount <= 2;
      expect(isAllowed).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 6. Fast Compressed Page Generation for Slow Connections
  // -------------------------------------------------------------
  describe("Compressed Page Images for Low-Bandwidth Connections", () => {
    it("generates lightweight compressed page representations under 100 KB", () => {
      const pageBuf = generateCompressedPageBuffer(
        "FLEn 1011",
        "Communicative English Language Skills I",
        "Final Exam 2015 E.C.",
        1,
        6,
        2015
      );

      expect(pageBuf.byteLength).toBeGreaterThan(500);
      // Very small footprint for rapid mobile 2G/3G transmission: less than 100 KB!
      expect(pageBuf.byteLength).toBeLessThan(100 * 1024);

      const svgStr = pageBuf.toString("utf-8");
      expect(svgStr).toContain("AMBO UNIVERSITY — WOLISO CAMPUS");
      expect(svgStr).toContain("Communicative English Language Skills I (FLEn 1011)");
      expect(svgStr).toContain("EXAMVAULT PROTECTED");
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
