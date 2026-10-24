import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { countersignAbi } from "@/lib/botchain/abi";
import { hashFile, popcount } from "@/lib/countersign";
import { MAX_PAGE, MAX_SIGNERS, MAX_TITLE_BYTES, MIN_SIGNERS } from "@/lib/limits";

const PORT = 8610;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968 as const;

const MNEMONIC = "test test test test test test test test test test test junk";
const accounts = Array.from({ length: 6 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let node: ChildProcess;
let publicClient: PublicClient;
let wallets: any[];
let countersignAddress: Address;

function revertDetails(
  err: unknown
): { errorName?: string; args?: readonly unknown[] } | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const found = err.walk(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      Boolean((e as { data?: { errorName?: string } }).data?.errorName)
  ) as { data?: { errorName?: string; args?: readonly unknown[] } } | null;
  return found?.data;
}

beforeAll(async () => {
  node = spawn(
    "anvil",
    ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"],
    {
      stdio: ["ignore", "ignore", "inherit"],
    }
  );

  publicClient = createPublicClient({ chain: local, transport: http() }) as PublicClient;
  wallets = accounts.map((acc) =>
    createWalletClient({ account: acc, chain: local, transport: http() })
  );

  for (let i = 0; ; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Deploy Countersign contract
  const artifact = JSON.parse(
    readFileSync("contracts/out/Countersign.sol/Countersign.json", "utf8")
  ) as { abi: any; bytecode: { object: Hex } };

  const deployHash = await wallets[0].deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [],
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: deployHash,
  });
  countersignAddress = receipt.contractAddress!;
}, 30000);

afterAll(() => {
  if (node && !node.killed) {
    node.kill();
  }
});

describe("Countersign integration on Anvil", () => {
  it("computes matching SHA-256 digest from sample-agreement.txt", async () => {
    const fileBytes = readFileSync("public/sample-agreement.txt");
    const digest = await hashFile(fileBytes);
    // Matches sha256sum output
    expect(digest).toBe(
      "0xb486e176034c4748982e98494b3777aa955150194932a0eba1004520fd7291e4"
    );
  });

  it("checks constants match limits.ts", async () => {
    const minS = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "MIN_SIGNERS",
    });
    expect(minS).toBe(BigInt(MIN_SIGNERS));

    const maxS = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "MAX_SIGNERS",
    });
    expect(maxS).toBe(BigInt(MAX_SIGNERS));

    const maxTitle = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "MAX_TITLE_BYTES",
    });
    expect(maxTitle).toBe(BigInt(MAX_TITLE_BYTES));

    const maxPage = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "MAX_PAGE",
    });
    expect(maxPage).toBe(BigInt(MAX_PAGE));
  });

  it("create -> sign each -> Completed event", async () => {
    const creator = wallets[0];
    const alice = wallets[1];
    const bob = wallets[2];
    const signers = [alice.account.address, bob.account.address];
    const docHash = "0xb486e176034c4748982e98494b3777aa955150194932a0eba1004520fd7291e4" as Hex;

    // Create agreement
    const createHash = await creator.writeContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "create",
      args: [docHash, signers, 0n, "Master Agreement"],
    });
    const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
    expect(createReceipt.status).toBe("success");

    const ag1 = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "agreementOf",
      args: [1n],
    });
    expect(ag1.id).toBe(1n);
    expect(ag1.signerCount).toBe(2);
    expect(ag1.signedCount).toBe(0);
    expect(ag1.status).toBe(0); // Pending

    // Alice signs
    const sign1Hash = await alice.writeContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "sign",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: sign1Hash });

    const agAfter1 = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "agreementOf",
      args: [1n],
    });
    expect(agAfter1.signedCount).toBe(1);
    expect(agAfter1.status).toBe(0); // Still Pending

    // Bob signs (final signature -> completes)
    const sign2Hash = await bob.writeContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "sign",
      args: [1n],
    });
    const sign2Receipt = await publicClient.waitForTransactionReceipt({ hash: sign2Hash });
    expect(sign2Receipt.status).toBe("success");

    // Check completed
    const agFinal = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "agreementOf",
      args: [1n],
    });
    expect(agFinal.signedCount).toBe(2);
    expect(agFinal.status).toBe(1); // Completed
    expect(agFinal.completedAt).toBeGreaterThan(0n);

    // Verify signersOf
    const signersState = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "signersOf",
      args: [1n],
    });
    expect(signersState[0]).toEqual([alice.account.address, bob.account.address]);
    expect(signersState[1]).toEqual([true, true]);
  });

  it("decline path: blocks completion permanently", async () => {
    const creator = wallets[0];
    const alice = wallets[1];
    const charlie = wallets[3];
    const signers = [alice.account.address, charlie.account.address];
    const docHash = "0x1122334455667788990011223344556677889900112233445566778899001122" as Hex;

    const hash = await creator.writeContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "create",
      args: [docHash, signers, 0n, "Contested Proposal"],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    // Alice signs
    const signHash = await alice.writeContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "sign",
      args: [2n],
    });
    await publicClient.waitForTransactionReceipt({ hash: signHash });

    // Charlie declines
    const declineHash = await charlie.writeContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "decline",
      args: [2n],
    });
    await publicClient.waitForTransactionReceipt({ hash: declineHash });

    const ag = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "agreementOf",
      args: [2n],
    });
    expect(ag.status).toBe(2); // Declined
    expect(ag.declinedBy.toLowerCase()).toBe(charlie.account.address.toLowerCase());

    // Alice cannot sign again, reverts
    try {
      await alice.writeContract({
        address: countersignAddress,
        abi: countersignAbi,
        functionName: "sign",
        args: [2n],
      });
      expect.fail("Should have reverted");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("AlreadySigned");
    }
  });

  it("deadline path: expires agreement when time passes", async () => {
    const creator = wallets[0];
    const alice = wallets[1];
    const bob = wallets[2];
    const signers = [alice.account.address, bob.account.address];
    const docHash = "0xaaabbbcccdddeeefff000111222333444555666777888999aaabbbcccdddeee0" as Hex;

    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 3600n; // 1 hour

    const hash = await creator.writeContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "create",
      args: [docHash, signers, deadline, "Time Limited Agreement"],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    // Fast-forward past deadline
    await (publicClient.request as any)({
      method: "evm_increaseTime",
      params: [7200], // 2 hours
    });
    await (publicClient.request as any)({ method: "evm_mine" });

    // Status is now expired
    const ag = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "agreementOf",
      args: [3n],
    });
    expect(ag.status).toBe(3); // Expired

    // Signing reverts PastDeadline
    try {
      await alice.writeContract({
        address: countersignAddress,
        abi: countersignAbi,
        functionName: "sign",
        args: [3n],
      });
      expect.fail("Should have reverted");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("PastDeadline");
    }
  });

  it("verifier lists multiple agreements referencing the same docHash", async () => {
    const creator = wallets[0];
    const alice = wallets[1];
    const bob = wallets[2];
    const signers = [alice.account.address, bob.account.address];
    // Use the sample agreement docHash again!
    const sharedHash = "0xb486e176034c4748982e98494b3777aa955150194932a0eba1004520fd7291e4" as Hex;

    const hash = await creator.writeContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "create",
      args: [sharedHash, signers, 0n, "Second Agreement On Same Document"],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const docAgreements = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "agreementsForDoc",
      args: [sharedHash, 0n, 10n],
    });

    expect(docAgreements.length).toBe(2);
    expect(docAgreements[0].id).toBe(4n); // newest first
    expect(docAgreements[1].id).toBe(1n);
  });

  it("popcount consistency with bitmap and signedCount", async () => {
    const ag = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "agreementOf",
      args: [1n],
    });
    const signersState = await publicClient.readContract({
      address: countersignAddress,
      abi: countersignAbi,
      functionName: "signersOf",
      args: [1n],
    });

    let manualPopcount = 0;
    for (const s of signersState[1]) {
      if (s) manualPopcount++;
    }

    expect(ag.signedCount).toBe(manualPopcount);
    expect(popcount(3)).toBe(2); // 2 of 2 signers signed
  });

  it("reverts on custom errors with expected args", async () => {
    const alice = wallets[1];
    const stranger = wallets[5];

    // NotASigner
    try {
      await stranger.writeContract({
        address: countersignAddress,
        abi: countersignAbi,
        functionName: "sign",
        args: [1n],
      });
      expect.fail("Should have reverted");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("NotASigner");
    }

    // NoSuchAgreement
    try {
      await alice.writeContract({
        address: countersignAddress,
        abi: countersignAbi,
        functionName: "sign",
        args: [9999n],
      });
      expect.fail("Should have reverted");
    } catch (err) {
      expect(revertDetails(err)?.errorName).toBe("NoSuchAgreement");
    }
  });
});
