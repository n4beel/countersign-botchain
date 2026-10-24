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
npm run dev
```
Accessible at `http://localhost:3000`.
