import { getAddress, isAddress, type Address, type Hex } from "viem";
import { MIN_SIGNERS, MAX_SIGNERS } from "./limits";

export interface SignerRow {
  address: Address;
  signed: boolean;
}

export interface AgreementData {
  id: bigint;
  creator: Address;
  docHash: Hex;
  deadline: number;
  createdBlock: number;
  completedAt: number;
  signedCount: number;
  signerCount: number;
  status: number; // 0 Pending, 1 Completed, 2 Declined, 3 Expired
  declinedBy: Address;
}

/**
 * Computes the SHA-256 digest of a document (File, Blob, or Buffer) in browser or node.
 * Returns a 0x-prefixed 32-byte hex string (same digest Seal and Countersign use).
 */
export async function hashFile(
  input: Blob | ArrayBuffer | Uint8Array
): Promise<Hex> {
  let arrayBuffer: ArrayBuffer;

  if (input instanceof ArrayBuffer) {
    arrayBuffer = input;
  } else if (input instanceof Uint8Array) {
    arrayBuffer = input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength
    ) as ArrayBuffer;
  } else if (typeof input.arrayBuffer === "function") {
    arrayBuffer = await input.arrayBuffer();
  } else {
    throw new Error("Unsupported file input type");
  }

  // Use Web Crypto API
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}

/**
 * Parses a string of signer addresses separated by newlines, commas, or spaces.
 */
export function parseSigners(text: string): Address[] {
  const parts = text.split(/[\s,]+/);
  const valid: Address[] = [];
  const seen = new Set<string>();

  for (const p of parts) {
    const trimmed = p.trim();
    if (isAddress(trimmed)) {
      const checksummed = getAddress(trimmed);
      const lower = checksummed.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        valid.push(checksummed);
      }
    }
  }

  return valid;
}

export interface SignerValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a list of signers against contract rules.
 */
export function validateSigners(list: string[]): SignerValidation {
  const errors: string[] = [];

  if (list.length < MIN_SIGNERS) {
    errors.push(
      `An agreement needs at least ${MIN_SIGNERS} signers (currently ${list.length}).`
    );
  }

  if (list.length > MAX_SIGNERS) {
    errors.push(
      `Maximum signers is ${MAX_SIGNERS} (currently ${list.length}).`
    );
  }

  const seen = new Set<string>();
  list.forEach((addr, idx) => {
    const trimmed = addr.trim();
    if (!trimmed) {
      errors.push(`Row ${idx + 1}: Address cannot be blank.`);
    } else if (!isAddress(trimmed)) {
      errors.push(`Row ${idx + 1}: "${trimmed}" is not a valid EVM address.`);
    } else {
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) {
        errors.push(`Row ${idx + 1}: Duplicate address "${trimmed}".`);
      }
      seen.add(lower);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Counts number of set bits in an integer.
 */
export function popcount(bitmap: number): number {
  let count = 0;
  let n = bitmap;
  while (n > 0) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

/**
 * Returns human-readable label and status class.
 */
export function statusLabel(status: number): {
  label: string;
  kind: "pending" | "completed" | "declined" | "expired";
} {
  switch (status) {
    case 1:
      return { label: "Completed", kind: "completed" };
    case 2:
      return { label: "Declined", kind: "declined" };
    case 3:
      return { label: "Expired", kind: "expired" };
    case 0:
    default:
      return { label: "Pending", kind: "pending" };
  }
}

/**
 * Formats a deadline timestamp into a date label.
 */
export function deadlineLabel(
  deadline: number | bigint,
  nowSec?: number
): string {
  const d = Number(deadline);
  if (d === 0) return "No deadline";

  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const dateStr = new Date(d * 1000).toISOString().split("T")[0];

  if (d < now) {
    return `Lapsed on ${dateStr}`;
  }

  const remainingHours = Math.floor((d - now) / 3600);
  if (remainingHours < 48) {
    return `Expires in ${remainingHours}h (${dateStr})`;
  }
  const remainingDays = Math.floor(remainingHours / 24);
  return `Expires in ${remainingDays}d (${dateStr})`;
}

/**
 * Returns UTF-8 byte length of a string.
 */
export function titleByteLength(title: string): number {
  return new TextEncoder().encode(title).length;
}
