import { BaseError, ContractFunctionRevertedError } from "viem";

export interface RevertDetails {
  errorName?: string;
  args?: readonly unknown[];
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Traverses an error to extract the custom revert error name and arguments.
 */
export function extractRevert(err: unknown): RevertDetails | undefined {
  if (typeof err !== "object" || err === null) return undefined;

  // Direct property check
  if (
    "data" in err &&
    (err as any).data &&
    typeof (err as any).data === "object" &&
    (err as any).data.errorName
  ) {
    return {
      errorName: (err as any).data.errorName,
      args: (err as any).data.args,
    };
  }
  if ("errorName" in err && typeof (err as any).errorName === "string") {
    return {
      errorName: (err as any).errorName,
      args: (err as any).args,
    };
  }

  // If it's a viem BaseError, use walk
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => {
      if (e instanceof ContractFunctionRevertedError) return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "data" in e &&
        Boolean((e as any).data?.errorName)
      )
        return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "errorName" in e &&
        Boolean((e as any).errorName)
      )
        return true;
      return false;
    });

    if (reverted) {
      const errorObj = reverted as any;
      if (errorObj.data?.errorName) {
        return {
          errorName: errorObj.data.errorName,
          args: errorObj.data.args,
        };
      }
      if (errorObj.errorName) {
        return {
          errorName: errorObj.errorName,
          args: errorObj.args,
        };
      }
    }
  }

  return undefined;
}

/**
 * Checks whether an error represents the user rejecting the prompt in their wallet.
 */
export function isUserRejection(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("User rejected") ||
    msg.includes("User denied") ||
    msg.includes("user rejected") ||
    msg.includes("ACTION_REJECTED") ||
    (typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: number }).code === 4001)
  );
}

/**
 * Translates contract and client errors into formal, clear sentences (§4.4).
 */
export function describeError(err: unknown): string {
  if (isUserRejection(err)) {
    return "Transaction cancelled in wallet.";
  }

  const rev = extractRevert(err);
  if (rev?.errorName) {
    switch (rev.errorName) {
      case "NotASigner": {
        const caller = rev.args?.[1];
        const short = typeof caller === "string" ? shortAddress(caller) : "This wallet";
        return `${short} isn't named on this agreement.`;
      }
      case "AlreadySigned":
        return "You've already signed this.";
      case "PastDeadline": {
        const t = rev.args?.[1];
        if (t !== undefined) {
          const date = new Date(Number(t) * 1000).toISOString().split("T")[0];
          return `The deadline passed on ${date}.`;
        }
        return "The deadline has passed.";
      }
      case "NotPending": {
        const status = rev.args?.[1];
        const statusName =
          status === 1 ? "completed" : status === 2 ? "declined" : status === 3 ? "lapsed" : "decided";
        return `This agreement is already ${statusName}.`;
      }
      case "DuplicateSigner": {
        const i = rev.args?.[0];
        const j = rev.args?.[1];
        if (i !== undefined && j !== undefined) {
          return `Parties ${Number(i) + 1} and ${Number(j) + 1} are the same wallet.`;
        }
        return "Signer list contains duplicate wallet addresses.";
      }
      case "BadSignerCount": {
        const n = rev.args?.[0];
        return `An agreement needs between two and twenty parties; you've added ${n !== undefined ? n : "0"}.`;
      }
      case "BadDeadline":
        return "Choose a deadline within a year, or none.";
      case "EmptyDocument":
        return "Add a document first.";
      case "BadSigner": {
        const idx = rev.args?.[0];
        return `Invalid signer address at position ${idx !== undefined ? Number(idx) + 1 : 1}.`;
      }
      case "TitleTooLong": {
        const max = rev.args?.[1];
        return `Title exceeds ${max !== undefined ? max : 80} bytes.`;
      }
      case "NoSuchAgreement":
        return "Agreement not found.";
      default:
        return `Contract error: ${rev.errorName}`;
    }
  }

  if (err instanceof Error) {
    return err.message;
  }
  return "An unexpected error occurred.";
}
