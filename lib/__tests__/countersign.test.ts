import { describe, expect, it } from "vitest";
import {
  deadlineLabel,
  hashFile,
  parseSigners,
  popcount,
  statusLabel,
  titleByteLength,
  validateSigners,
} from "../countersign";

describe("hashFile", () => {
  it("computes standard SHA-256 with 0x prefix", async () => {
    // "hello world" in UTF-8
    const data = new TextEncoder().encode("hello world");
    const hash = await hashFile(data);
    // sha256("hello world") = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
    expect(hash).toBe(
      "0xb94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    );
  });
});

describe("parseSigners", () => {
  it("parses and deduplicates valid addresses", () => {
    const text = `
      0x1111111111111111111111111111111111111111, 0x2222222222222222222222222222222222222222
      0x1111111111111111111111111111111111111111
      0x3333333333333333333333333333333333333333
      invalid_address
    `;
    const signers = parseSigners(text);
    expect(signers).toHaveLength(3);
    expect(signers[0]).toBe("0x1111111111111111111111111111111111111111");
    expect(signers[1]).toBe("0x2222222222222222222222222222222222222222");
    expect(signers[2]).toBe("0x3333333333333333333333333333333333333333");
  });
});

describe("validateSigners", () => {
  it("accepts valid list of 2 signers", () => {
    const list = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
    ];
    const res = validateSigners(list);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("detects too few signers", () => {
    const res = validateSigners(["0x1111111111111111111111111111111111111111"]);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("at least 2 signers");
  });

  it("detects duplicates and invalid entries", () => {
    const list = [
      "0x1111111111111111111111111111111111111111",
      "invalid-address",
      "0x1111111111111111111111111111111111111111",
    ];
    const res = validateSigners(list);
    expect(res.valid).toBe(false);
    expect(res.errors).toHaveLength(2);
    expect(res.errors[0]).toContain("Row 2");
    expect(res.errors[1]).toContain("Row 3: Duplicate address");
  });
});

describe("popcount", () => {
  it("counts set bits accurately", () => {
    expect(popcount(0)).toBe(0);
    expect(popcount(1)).toBe(1);
    expect(popcount(7)).toBe(3);
    expect(popcount(0b101010)).toBe(3);
    expect(popcount(0xfffff)).toBe(20);
  });
});

describe("statusLabel", () => {
  it("maps status codes to labels", () => {
    expect(statusLabel(0)).toEqual({ label: "Pending", kind: "pending" });
    expect(statusLabel(1)).toEqual({ label: "Completed", kind: "completed" });
    expect(statusLabel(2)).toEqual({ label: "Declined", kind: "declined" });
    expect(statusLabel(3)).toEqual({ label: "Expired", kind: "expired" });
  });
});

describe("deadlineLabel", () => {
  it("formats no deadline", () => {
    expect(deadlineLabel(0)).toBe("No deadline");
  });

  it("formats future deadline in hours", () => {
    const now = 1000000;
    const deadline = now + 12 * 3600;
    const label = deadlineLabel(deadline, now);
    expect(label).toContain("Expires in 12h");
  });

  it("formats past deadline as lapsed", () => {
    const now = 1000000;
    const deadline = now - 3600;
    const label = deadlineLabel(deadline, now);
    expect(label).toContain("Lapsed on");
  });
});

describe("titleByteLength", () => {
  it("measures byte length properly", () => {
    expect(titleByteLength("Hello")).toBe(5);
    expect(titleByteLength("Hello 🤝")).toBe(10); // emoji is 4 bytes
  });
});
