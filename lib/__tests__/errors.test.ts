import { describe, expect, it } from "vitest";
import { describeError, isUserRejection, shortAddress } from "../errors";

describe("shortAddress", () => {
  it("formats address with ellipsis", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe(
      "0x1234…5678"
    );
  });

  it("returns short address unchanged", () => {
    expect(shortAddress("0x123")).toBe("0x123");
  });
});

describe("isUserRejection", () => {
  it("identifies rejection patterns", () => {
    expect(isUserRejection(new Error("User rejected the request."))).toBe(true);
    expect(isUserRejection(new Error("User denied transaction signature"))).toBe(true);
    expect(isUserRejection({ code: 4001, message: "User denied" })).toBe(true);
    expect(isUserRejection(new Error("RPC timeout"))).toBe(false);
  });
});

describe("describeError", () => {
  it("translates user rejection", () => {
    expect(describeError(new Error("User rejected the request."))).toBe(
      "Transaction cancelled in wallet."
    );
  });

  it("translates NotASigner", () => {
    const err = {
      data: {
        errorName: "NotASigner",
        args: [1n, "0x1234567890abcdef1234567890abcdef12345678"],
      },
    };
    expect(describeError(err)).toBe(
      "0x1234…5678 isn't named on this agreement."
    );
  });

  it("translates AlreadySigned", () => {
    const err = { data: { errorName: "AlreadySigned", args: [1n, "0x123"] } };
    expect(describeError(err)).toBe("You've already signed this.");
  });

  it("translates PastDeadline", () => {
    const err = { data: { errorName: "PastDeadline", args: [1n, 1760000000n] } };
    expect(describeError(err)).toBe("The deadline passed on 2025-10-09.");
  });

  it("translates NotPending", () => {
    const err = { data: { errorName: "NotPending", args: [1n, 1] } };
    expect(describeError(err)).toBe("This agreement is already completed.");
  });

  it("translates DuplicateSigner", () => {
    const err = { data: { errorName: "DuplicateSigner", args: [0n, 2n] } };
    expect(describeError(err)).toBe("Parties 1 and 3 are the same wallet.");
  });

  it("translates BadSignerCount", () => {
    const err = { data: { errorName: "BadSignerCount", args: [1n] } };
    expect(describeError(err)).toBe(
      "An agreement needs between two and twenty parties; you've added 1."
    );
  });

  it("translates BadDeadline", () => {
    const err = { data: { errorName: "BadDeadline", args: [] } };
    expect(describeError(err)).toBe("Choose a deadline within a year, or none.");
  });

  it("translates EmptyDocument", () => {
    const err = { data: { errorName: "EmptyDocument", args: [] } };
    expect(describeError(err)).toBe("Add a document first.");
  });

  it("translates BadSigner", () => {
    const err = { data: { errorName: "BadSigner", args: [1n] } };
    expect(describeError(err)).toBe("Invalid signer address at position 2.");
  });

  it("translates TitleTooLong", () => {
    const err = { data: { errorName: "TitleTooLong", args: [85n, 80n] } };
    expect(describeError(err)).toBe("Title exceeds 80 bytes.");
  });

  it("translates NoSuchAgreement", () => {
    const err = { data: { errorName: "NoSuchAgreement", args: [99n] } };
    expect(describeError(err)).toBe("Agreement not found.");
  });
});
