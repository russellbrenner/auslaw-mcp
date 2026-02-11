/**
 * AusLaw MCP - Custom error classes
 * Copyright (c) 2024 Russell Brenner
 * Licensed under the MIT License
 *
 * Provides structured error types for different failure modes.
 */

/**
 * Error thrown when an AustLII search or API call fails.
 */
export class AustLiiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "AustLiiError";
  }
}

/**
 * Error thrown when a network request fails (fetch, axios, etc.).
 */
export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * Error thrown when parsing HTML or other response content fails.
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly content?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Error thrown when OCR processing fails.
 */
export class OcrError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "OcrError";
  }
}
