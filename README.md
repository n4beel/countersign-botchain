# Countersign

Everyone signs the same document hash. Bilateral and multi-party document attestation on BOT Chain.

Part of the BOT Chain application ecosystem. Built for human-readable, immutable on-chain document signing without off-chain custody or legal ambiguity.

---

## What It Does

Countersign records immutable N-of-N attestation for arbitrary documents:
1. **Client-Side SHA-256 Digest**: In the browser, documents are fingerprinted via standard Web Crypto SHA-256. The file never leaves the user's computer.
2. **On-Chain Agreement Anchor**: The creator names between 2 and 20 signers, optionally sets an expiration deadline, and submits the 32-byte hash to the `Countersign` contract.
3. **Autonomous Signing**: Each named party signs independently from their wallet (`msg.sender`). An internal 32-bit bitmap and counter record participation.
4. **Instant Completion**: When the final party signs (`signedCount == signerCount`), the agreement automatically transitions to `Completed` (`status = 1`) with block timestamp recorded.
5. **Declining & Deadlines**: Any named party who hasn't signed can explicitly decline the agreement, voiding it permanently. If a deadline is set and lapses before completion, the agreement expires.

---

## What It Deliberately Cannot Do

- **No funds or custody**: Countersign is a zero-balance contract. It holds no tokens, accepts no BOT, and processes no financial payouts.
- **No off-chain file storage**: Countersign never touches the document bytes, metadata, or external URLs. Only the 32-byte cryptographic hash is preserved on-chain.
- **No party modification**: The signer list is immutable upon creation. No parties can be added, removed, or substituted.
- **No deadline extension**: Deadlines cannot be changed or postponed after creation.
- **No admin or pause backdoors**: The contract is unowned, non-upgradeable, and without administrative veto power.
- **No forged signatures**: Only `msg.sender` matching an exact listed slot can cast a signature or decline.

---

## Gas Characteristics

Measured across Foundry tests on EVM:
- **`create` (5 signers, indexed)**: ~673k gas (target ceiling: < 750k gas; accounts for 3 storage slots, signers array, signer slot mappings, per-user indexing, and docHash indexing).
- **`sign` (intermediate party)**: ~35k gas (target ceiling: < 70k gas).
- **`sign` (final completing party)**: ~52k gas (target ceiling: < 90k gas; sets `completedAt` timestamp and emits `Completed` event).
- **`decline`**: ~36k gas.

---

## Design Archetype: J · Sheet

Countersign is designed as a physical legal document on a desk:
- **Ground (`--bg-base: #E3DEF2`)**: Lilac desk ground with a subtle top vignette.
- **Sheet (`--bg-surface: #FFFFFF`)**: Centered A4-proportioned paper sheet with soft shadows and a thin violet top rule.
- **Inks**:
  - Primary text: Deep ink `#1C1B33` (contrast 15.6:1 AAA on white, 12.1:1 AAA on lilac).
  - Secondary text: Muted ink `#5A5878` (contrast 6.2:1 AA on white).
  - Accent: Royal violet `#5B3FD0` (contrast 6.6:1 AA on white).
  - Done: Forest green `#1F7A4D` (contrast 5.4:1 AA on white).
  - Declined: Crimson `#A3263A` (contrast 6.7:1 AA on white).
- **Typography**:
  - `Newsreader`: Document titles and headings.
  - `Schibsted Grotesk`: Interface labels and metadata.
  - `Noto Sans Mono`: SHA-256 fingerprints and addresses.
- **Signature Block**: One row per signer with a ruled signature line, awaiting placeholders in small caps, address timestamps with checkmarks on signed rows, and inline wallet signing actions.
- **Marginalia**: Right-hand 180px column for document status, countdowns, and creator block anchors.

---

## Contrast Report

| Foreground | Background | Ratio | Rating |
|---|---|---|---|
| Deep Ink `#1C1B33` | White Sheet `#FFFFFF` | 15.6:1 | AAA |
| Deep Ink `#1C1B33` | Lilac Desk `#E3DEF2` | 12.1:1 | AAA |
| Royal Violet `#5B3FD0` | White Sheet `#FFFFFF` | 6.6:1 | AA / AAA Large |
| White Ink `#FFFFFF` | Royal Violet `#5B3FD0` | 6.6:1 | AA / AAA Large |
| Muted Text `#5A5878` | White Sheet `#FFFFFF` | 6.2:1 | AA |
| Forest Green `#1F7A4D` | White Sheet `#FFFFFF` | 5.4:1 | AA |
| Crimson Text `#A3263A` | White Sheet `#FFFFFF` | 6.7:1 | AA |

---

## Honest Limits

- **Attestation vs. Legal Force**: Countersign establishes that particular cryptographic keys signed a SHA-256 digest at a particular block height. It does not enforce legal validity, jurisdictional compliance, or verify real-world legal identities outside wallet ownership.
- **Timestamp Drift**: Block timestamps are set by validators and may drift by up to 15 seconds. Deadlines should not be relied upon for sub-minute precision.
- **Offline Document Delivery**: The parties must communicate the underlying file through independent channels (email, secure chat, or storage). Countersign only attests to its SHA-256 fingerprint.
