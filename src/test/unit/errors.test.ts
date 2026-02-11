import { describe, it, expect } from "vitest";
import { AustLiiError, NetworkError, ParseError, OcrError } from "../../errors.js";

describe("Custom error classes", () => {
  describe("AustLiiError", () => {
    it("should have correct name", () => {
      const err = new AustLiiError("search failed");
      expect(err.name).toBe("AustLiiError");
      expect(err.message).toBe("search failed");
      expect(err).toBeInstanceOf(Error);
    });

    it("should store statusCode", () => {
      const err = new AustLiiError("not found", 404);
      expect(err.statusCode).toBe(404);
    });

    it("should store cause", () => {
      const cause = new Error("network timeout");
      const err = new AustLiiError("search failed", 500, cause);
      expect(err.cause).toBe(cause);
    });
  });

  describe("NetworkError", () => {
    it("should store url", () => {
      const err = new NetworkError("timeout", "https://example.com");
      expect(err.name).toBe("NetworkError");
      expect(err.url).toBe("https://example.com");
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("ParseError", () => {
    it("should store partial content", () => {
      const err = new ParseError("invalid html", "<html>broken");
      expect(err.name).toBe("ParseError");
      expect(err.content).toBe("<html>broken");
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("OcrError", () => {
    it("should store filePath", () => {
      const err = new OcrError("tesseract crashed", "/tmp/doc.pdf");
      expect(err.name).toBe("OcrError");
      expect(err.filePath).toBe("/tmp/doc.pdf");
      expect(err).toBeInstanceOf(Error);
    });
  });
});
