# Handover: Countersign (`countersign-botchain`)

**Date:** 2026-10-25  
**Project:** 10 of 15 (Batch 2)  
**Slug:** `countersign`  
**Archetype:** J · Sheet (Lilac `#E3DEF2`, Paper `#FFFFFF`, Violet `#5B3FD0`, Fonts: `Newsreader`, `Schibsted Grotesk`, `Noto Sans Mono`)

---

## 1. Deliverables Summary

### Contract Layer (`contracts/src/Countersign.sol`)
- **Implements N-of-N attestation**:
  - `create(bytes32 docHash, address[] calldata signers, uint64 deadline, string calldata title)`
  - `sign(uint256 id)`
  - `decline(uint256 id)`
  - `agreementOf(uint256 id)`
  - `signersOf(uint256 id)`
  - `hasSigned(uint256 id, address signer)`
  - `agreementsFor(address who, uint256 offset, uint256 count)`
  - `agreementsForDoc(bytes32 docHash, uint256 offset, uint256 count)`
  - `agreementCount()`
- **Safety properties**:
  - Storage packed across 3 main slots plus signers list and bitmap.
  - Invariant `popcount(signedBitmap) == signedCount` verified via fuzz tests.
  - Zero balance maintained: rejects native value, holds no funds.
  - Duplicate checks strictly bounded between 2 and 20 signers with $O(n^2)$ comparisons.

### Test Suites
- **Foundry (`contracts/test/Countersign.t.sol`)**:
  - 17 test cases covering all creation bounds, signing sequences, completion, decline, expiry, doc indexing, fuzz tests (256 runs), and gas ceilings.
- **Unit Tests (`lib/__tests__/`)**:
  - 63 unit tests across `countersign.test.ts`, `errors.test.ts`, `contract-limits.test.ts`, `wallet.test.ts`, `amount.test.ts`, `chain.test.ts`, `active-chain.test.ts`, `wagmi-chains.test.ts`, `deployment.test.ts`, and `hook-deps.test.ts`.
- **Integration Tests (`test/integration/countersign.test.ts`)**:
  - 12 integration tests verifying deployment, contract interaction on local Anvil (port 8610, chain 968), and end-to-end attestation lifecycle.

### Frontend Application
- **Pages**:
  - `/`: Document dropzone, title, dynamic signers with `Add me`, deadline selector, agreement creator with settled-ref pattern (`stage === "confirmed"` FIRST).
  - `/a/[id]`: The legal sheet, hero signature block with ruled lines, sign/decline modal, marginalia column with live status, and "Check a file" verification box.
  - `/verify`: Standalone file drop verifier querying on-chain agreements by SHA-256 fingerprint.
  - `/mine`: Filtered agreements grouped into "Waiting for your signature", "Pending other parties", and "Finalized".
- **Design Archetype J · Sheet**:
  - Lilac ground `#E3DEF2`, white paper sheet `#FFFFFF` (max 720–920px), royal violet `#5B3FD0`, Newsreader serif document headings, Schibsted Grotesk UI, Noto Sans Mono fingerprints.
  - Top connect control integrated into sheet header; no top navigation bar; paper marginalia column; ruled signature lines.
  - Zero distinctness conflicts across all 25 compared projects (`check-distinct.py` passes with 0 errors).

---

## 2. Verification Gates

1. **Contracts (Forge Test)**:
   ```bash
   cd contracts && forge build --force && forge test -vv
   ```
   *Result:* 17 passed tests, 0 failures, 256 fuzz runs passed.

2. **TypeScript Compilation**:
   ```bash
   npm run typecheck
   ```
   *Result:* 0 errors.

3. **Frontend Unit & Lint Tests**:
   ```bash
   npm test
   ```
   *Result:* 10 test files passed, 63 tests passed, hook-deps passed.

4. **Integration Tests**:
   ```bash
   npm run test:integration
   ```
   *Result:* 2 test files passed, 12 tests passed on port 8610 (chain 968).

5. **Next.js Production Build**:
   ```bash
   npm run build
   ```
   *Result:* Compiled successfully with static & dynamic routes (`/`, `/a/[id]`, `/mine`, `/verify`).

6. **Distinctness Gate**:
   ```bash
   python3 ../scripts/check-distinct.py countersign
   ```
   *Result:* 25 projects compared; 0 pair/file problem(s). Exits with code 0.

---

## 3. Local Stack

To run the local stack with 6 pre-seeded scenarios (account 0 pending, completed lease on sample text, declined accord, expired agreement, 20-signer consortium, and counterpart doc verifier):
```bash
node scripts/local-stack.mjs
Accessible at `http://localhost:3000`.

---

## Feedback round 1

All findings from `docs/specs/FEEDBACK-countersign.md` resolved.

### Item Status
1. **Item 1: Agreement page crash on `/a/[id]` (`s.toLowerCase is not a function`)** — **FIXED**
   - Implemented `decodeSigners(data)` helper in `lib/countersign.ts` to decode the `(address[] signers, bool[] signed)` tuple returned by `signersOf(id)`.
   - Updated `components/countersign/AgreementSheet.tsx` to use `decodeSigners` and consume the `signed` array directly, eliminating N redundant `hasSigned` RPC calls.
   - Added unit tests in `lib/__tests__/countersign.test.ts` verifying tuple decoding on valid data and empty responses.
   - Verified that all agreement pages (`/a/1` through `/a/6`) render cleanly with zero errors.

2. **Item 2: Local stack environment configuration & chain time alignment** — **FIXED**
   - Updated `scripts/local-stack.mjs` to write `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet` and `NEXT_PUBLIC_BOHR_RPC=http://127.0.0.1:8710` to `.env.local`.
   - Configured anvil `--timestamp` to `realNow - 1200`, warped 1200s for Scenario 4, and asserted final chain time is within 120s of real time (measured diff: 0s).
   - Added formatted account role table to local stack output.

3. **Item 3: Real Browser Walkthrough** — **FIXED**
   - Conducted real browser walkthrough across all routes using headless Chrome and `mock-wallet.js`.
   - Verified 0 console errors and 0 hydration warnings.

### Browser Walkthrough Results

| Route | Status | Role Tested | Observations / State Reached |
|---|---|---|---|
| `/` | **PASS** | Account 0 (Creator) | New agreement sheet renders cleanly; connect control functional; file drop and signer inputs operational |
| `/a/1` | **PASS** | Account 0 (Signer) | Rendered signature block for 3 signers; Account 0 displayed "You" badge and "Sign Document" button; executed signature successfully; 0 console errors |
| `/a/2` | **PASS** | Account 1 / Stranger | Executed agreement banner rendered; checkmarks on all signers; block anchor recorded |
| `/a/3` | **PASS** | Account 2 (Decliner) | Declined banner displayed; Account 2 struck-through line rendered; decline state confirmed |
| `/a/4` | **PASS** | Stranger / Signer | Expired agreement rendered; Lapsed deadline banner and "did not sign" labels visible |
| `/a/5` | **PASS** | Signers 0..10 | 20-signer consortium agreement rendered smoothly without label overlap; 11 signed, 9 awaiting |
| `/a/6` | **PASS** | Account 0 | Second agreement on sampleHash rendered cleanly |
| `/verify` | **PASS** | Disconnected | Document verifier renders without wallet; file drop and manual hash input active |
| `/mine` | **PASS** | Account 0 | My agreements lists agreements partitioned by signature state for connected wallet |

## Feedback round 2

- **Item 1 (Local-stack autonomous mining):** Added `"--block-time", "1"` to Anvil startup args in `scripts/local-stack.mjs`. Seeding continues to complete cleanly with the final timestamp difference within ~2 minutes of real time (`diff: 1s`).
  - Command run to confirm blocks advance on their own:
    ```bash
    b1=$(cast block-number --rpc-url http://127.0.0.1:8710); sleep 3; b2=$(cast block-number --rpc-url http://127.0.0.1:8710); echo "$b1 -> $b2"
    ```
    Output: `108 -> 111` (+3 blocks produced automatically in 3 seconds).
- **Item 2 (Timestamp mislabelled as block in executed banner):** In `components/countersign/AgreementSheet.tsx`, replaced `"Anchored at block {completedAt}"` with `"Anchored on {completedDate}"` displaying a human-readable date (`new Date(Number(completedAt) * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })`).
- **Item 3 (Housekeeping):**
  - Removed tracked `AGENTS.md` and 0-byte `public/favicon.ico` via `git rm`.
  - Added `AGENTS.md` to `.gitignore`.
  - Added dedicated 192x192 PNG `app/icon.png` in project brand styling (`#5B3FD0`).
  - Configured `icons: { icon: "/icon.png" }` in `metadata` in `app/layout.tsx` so browsers request `/icon.png` directly and never request `/favicon.ico`.


