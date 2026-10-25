/**
 * Local stack runner and seeder for Countersign.
 *
 * Spawns anvil on port 8710 with chain id 968, deploys Countersign,
 * and seeds the 6 scenarios from 10-countersign.md §5:
 * (1) 3 signers, 2 signed, account 0 pending
 * (2) completed 2-signer agreement (on sample-agreement.txt hash)
 * (3) declined by account 2
 * (4) expired (deadline passed)
 * (5) 20-signer agreement, 11 signed
 * (6) a second agreement on the same document hash as (2) for the verifier
 *
 * Usage:
 *   node scripts/local-stack.mjs
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

const PORT = 8710;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const MNEMONIC = "test test test test test test test test test test test junk";

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

const realNow = Math.floor(Date.now() / 1000);
const TOTAL_WARP = 1200;
const startTimestamp = realNow - TOTAL_WARP;

console.log(`Starting anvil on port ${PORT} (timestamp: ${startTimestamp})...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "25",
    "--timestamp",
    String(startTimestamp),
    "--block-time",
    "1",
    "--silent",
  ],
  {
    detached: true,
    stdio: "ignore",
  }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });

const accounts = Array.from({ length: 25 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);
const wallets = accounts.map((acc) =>
  createWalletClient({ account: acc, chain: local, transport: http() })
);

// Wait for anvil
for (let i = 0; ; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    if (i > 100) {
      console.error(`anvil never answered on ${RPC}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

console.log(`Anvil online at ${RPC}`);

// Deploy Countersign
const artifact = JSON.parse(
  readFileSync("contracts/out/Countersign.sol/Countersign.json", "utf8")
);

const deployHash = await wallets[0].deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args: [],
});

const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployHash });
const contractAddress = deployReceipt.contractAddress;
const deployBlock = deployReceipt.blockNumber;

console.log(`Countersign deployed to ${contractAddress} at block ${deployBlock}`);

// Compute sample document hash
const sampleBytes = readFileSync("public/sample-agreement.txt");
const sampleHash = `0x${createHash("sha256").update(sampleBytes).digest("hex")}`;
console.log(`Sample agreement SHA-256 hash: ${sampleHash}`);

// Helper to create and sign
async function createAgreement(creatorIdx, docHash, signers, deadline, title) {
  const hash = await wallets[creatorIdx].writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "create",
    args: [docHash, signers, BigInt(deadline), title],
  });
  await pub.waitForTransactionReceipt({ hash });
  const count = await pub.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "agreementCount",
  });
  return count;
}

async function signAgreement(signerIdx, id) {
  const hash = await wallets[signerIdx].writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "sign",
    args: [id],
  });
  await pub.waitForTransactionReceipt({ hash });
}

async function declineAgreement(signerIdx, id) {
  const hash = await wallets[signerIdx].writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "decline",
    args: [id],
  });
  await pub.waitForTransactionReceipt({ hash });
}

console.log("Seeding scenarios...");

// Scenario 1: 3 signers (0, 1, 2), 2 signed (1 and 2), account 0 pending
const id1 = await createAgreement(
  0,
  "0x1111111111111111111111111111111111111111111111111111111111111111",
  [accounts[0].address, accounts[1].address, accounts[2].address],
  0,
  "Founders Operating Accord"
);
await signAgreement(1, id1);
await signAgreement(2, id1);
console.log(`Scenario 1: Agreement #${id1} (Account 0 pending)`);

// Scenario 2: Completed 2-signer agreement on sample-agreement.txt hash
const id2 = await createAgreement(
  0,
  sampleHash,
  [accounts[1].address, accounts[2].address],
  0,
  "Commercial Lease Agreement"
);
await signAgreement(1, id2);
await signAgreement(2, id2);
console.log(`Scenario 2: Agreement #${id2} (Completed on sampleHash)`);

// Scenario 3: Declined by account 2
const id3 = await createAgreement(
  0,
  "0x3333333333333333333333333333333333333333333333333333333333333333",
  [accounts[0].address, accounts[1].address, accounts[2].address],
  0,
  "IP Transfer Assignment"
);
await signAgreement(1, id3);
await declineAgreement(2, id3);
console.log(`Scenario 3: Agreement #${id3} (Declined by Account 2)`);

// Scenario 4: Expired (deadline passed)
const block = await pub.getBlock();
// Set deadline to 600s after startTimestamp (which is in the past once we warp TOTAL_WARP)
const shortDeadline = block.timestamp + 600n; // 10 minutes
const id4 = await createAgreement(
  0,
  "0x4444444444444444444444444444444444444444444444444444444444444444",
  [accounts[1].address, accounts[3].address],
  shortDeadline,
  "Urgent Term Sheet"
);
// Fast-forward past deadline by TOTAL_WARP
await pub.request({ method: "evm_increaseTime", params: [TOTAL_WARP] });
await pub.request({ method: "evm_mine" });
console.log(`Scenario 4: Agreement #${id4} (Expired)`);

// Scenario 5: 20-signer agreement, 11 signed
const twentySigners = accounts.slice(0, 20).map((a) => a.address);
const id5 = await createAgreement(
  0,
  "0x5555555555555555555555555555555555555555555555555555555555555555",
  twentySigners,
  0,
  "Consortium Charter Agreement"
);
for (let i = 0; i < 11; i++) {
  await signAgreement(i, id5);
}
console.log(`Scenario 5: Agreement #${id5} (20 signers, 11 signed)`);

// Scenario 6: Second agreement on the same document hash as Scenario 2 for verifier
const id6 = await createAgreement(
  0,
  sampleHash,
  [accounts[0].address, accounts[3].address, accounts[4].address],
  0,
  "Counterpart Commercial Addendum"
);
await signAgreement(0, id6);
console.log(`Scenario 6: Agreement #${id6} (Second agreement on sampleHash)`);

// Assert final chain time is within 2 minutes of real time
const finalBlock = await pub.getBlock();
const finalTime = Number(finalBlock.timestamp);
const nowSec = Math.floor(Date.now() / 1000);
const diffSec = Math.abs(finalTime - nowSec);
console.log(`Final chain timestamp: ${finalTime} (real: ${nowSec}, diff: ${diffSec}s)`);
if (diffSec > 120) {
  throw new Error(`Chain time ${finalTime} differs from real time by ${diffSec}s (max 120s allowed)`);
}

// Write .env.local
const envContent = [
  "# Auto-generated by scripts/local-stack.mjs for Countersign",
  "NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet",
  `NEXT_PUBLIC_BOHR_RPC=${RPC}`,
  "NEXT_PUBLIC_CHAIN_ID=968",
  `NEXT_PUBLIC_RPC_URL_968=${RPC}`,
  `NEXT_PUBLIC_CONTRACT_968=${contractAddress}`,
  `NEXT_PUBLIC_DEPLOY_BLOCK_968=${deployBlock > 1n ? deployBlock - 1n : 1n}`,
  "",
].join("\n");

writeFileSync(".env.local", envContent);
console.log("Wrote .env.local successfully.");
console.log("\n========================================================");
console.log(`Countersign Local Stack Running on ${RPC}`);
console.log("========================================================");
console.log("Account Role Table:");
console.log("--------------------------------------------------------");
console.log(`Acc 0: ${accounts[0].address} (Creator; pending signer #1; signed #5, #6)`);
console.log(`Acc 1: ${accounts[1].address} (Signer #1, #2, #3, #4, #5)`);
console.log(`Acc 2: ${accounts[2].address} (Signer #1, #2; Decliner #3)`);
console.log(`Acc 3: ${accounts[3].address} (Signer #4, #5, #6)`);
console.log(`Acc 4: ${accounts[4].address} (Signer #6)`);
console.log("Acc 5..19: Signers #5");
console.log("--------------------------------------------------------");
console.log("Local stack ready!");
process.exit(0);
