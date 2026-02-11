import { describe, it, expect } from "vitest";
import { LogLevel, logger } from "../../utils/logger.js";

describe("LogLevel enum", () => {
  it("should define correct level values", () => {
    expect(LogLevel.DEBUG).toBe(0);
    expect(LogLevel.INFO).toBe(1);
    expect(LogLevel.WARN).toBe(2);
    expect(LogLevel.ERROR).toBe(3);
  });
});

describe("logger singleton", () => {
  it("should be defined", () => {
    expect(logger).toBeDefined();
  });

  it("should have all log methods", () => {
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("should not throw when called", () => {
    expect(() => logger.debug("test debug")).not.toThrow();
    expect(() => logger.info("test info")).not.toThrow();
    expect(() => logger.warn("test warn")).not.toThrow();
    expect(() => logger.error("test error")).not.toThrow();
    expect(() => logger.error("test error", new Error("cause"))).not.toThrow();
    expect(() => logger.info("test meta", { key: "value" })).not.toThrow();
  });
});
