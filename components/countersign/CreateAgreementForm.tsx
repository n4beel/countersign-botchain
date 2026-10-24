"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  type Address,
  type Hex,
  decodeEventLog,
  isAddress,
  getAddress,
} from "viem";
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { countersignAbi } from "@/lib/botchain/abi";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import {
  hashFile,
  parseSigners,
  titleByteLength,
  validateSigners,
} from "@/lib/countersign";
import { MAX_DEADLINE, MAX_SIGNERS, MAX_TITLE_BYTES, MIN_SIGNERS } from "@/lib/limits";
import { describeError } from "@/lib/errors";

type TxStage = "idle" | "signing" | "confirming" | "confirmed" | "error";

export default function CreateAgreementForm() {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const deployment = useMemo(
    () => (isBotChainId(chainId) ? getDeployment(chainId) : undefined),
    [chainId]
  );

  // Form inputs
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
    hash: Hex;
  } | null>(null);
  const [hashing, setHashing] = useState(false);
  const [title, setTitle] = useState("");
  const [signers, setSigners] = useState<string[]>(["", ""]);
  const [deadlinePreset, setDeadlinePreset] = useState<"none" | "7d" | "30d" | "90d" | "custom">("none");
  const [customDeadline, setCustomDeadline] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // Tx states
  const [stage, setStage] = useState<TxStage>("idle");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<bigint | null>(null);

  const settledRef = useRef<Hex | null>(null);

  const { writeContractAsync } = useWriteContract();
  const {
    data: receipt,
    isSuccess: isReceiptSuccess,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash ?? undefined });

  // Handle receipt confirmation with settledRef pattern
  useEffect(() => {
    if (!txHash) return;
    if (settledRef.current === txHash) return;

    if (isReceiptSuccess && receipt) {
      settledRef.current = txHash;
      setStage("confirmed");

      // Extract agreement id from Created event
      try {
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: countersignAbi,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "Created" && decoded.args) {
              const args = decoded.args as { id?: bigint };
              if (args.id !== undefined) {
                setCreatedId(args.id);
                break;
              }
            }
          } catch {
            // Not a matching event log
          }
        }
      } catch {
        // Fallback
      }
    } else if (isReceiptError) {
      settledRef.current = txHash;
      setStage("error");
      setErrorMessage(describeError(receiptError));
    }
  }, [txHash, isReceiptSuccess, isReceiptError, receipt, receiptError]);

  // File drop handler
  const handleFileChange = useCallback(async (file: File) => {
    setHashing(true);
    try {
      const hash = await hashFile(file);
      setFileInfo({
        name: file.name,
        size: file.size,
        hash,
      });
      if (!title) {
        // Default title to filename without extension
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        if (titleByteLength(baseName) <= MAX_TITLE_BYTES) {
          setTitle(baseName);
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to compute document hash."
      );
    } finally {
      setHashing(false);
    }
  }, [title]);

  // Signer list helpers
  const handleAddSigner = useCallback(() => {
    if (signers.length < MAX_SIGNERS) {
      setSigners((prev) => [...prev, ""]);
    }
  }, [signers.length]);

  const handleRemoveSigner = useCallback((index: number) => {
    setSigners((prev) => {
      if (prev.length <= MIN_SIGNERS) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSignerChange = useCallback((index: number, val: string) => {
    setSigners((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  }, []);

  const handleAddMe = useCallback(() => {
    if (!connectedAddress) return;
    const lower = connectedAddress.toLowerCase();
    const already = signers.some((s) => s.trim().toLowerCase() === lower);
    if (already) return;

    // Fill first empty slot or append
    const emptyIdx = signers.findIndex((s) => s.trim() === "");
    if (emptyIdx !== -1) {
      handleSignerChange(emptyIdx, connectedAddress);
    } else if (signers.length < MAX_SIGNERS) {
      setSigners((prev) => [...prev, connectedAddress]);
    }
  }, [connectedAddress, signers, handleSignerChange]);

  const handleApplyPaste = useCallback(() => {
    const parsed = parseSigners(pasteText);
    if (parsed.length > 0) {
      setSigners(parsed.slice(0, MAX_SIGNERS));
      setPasteMode(false);
      setPasteText("");
    }
  }, [pasteText]);

  // Deadline calculation
  const calculatedDeadline = useMemo<bigint>(() => {
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    if (deadlinePreset === "none") return 0n;
    if (deadlinePreset === "7d") return nowSec + 7n * 86400n;
    if (deadlinePreset === "30d") return nowSec + 30n * 86400n;
    if (deadlinePreset === "90d") return nowSec + 90n * 86400n;
    if (deadlinePreset === "custom" && customDeadline) {
      const parsed = Math.floor(new Date(customDeadline).getTime() / 1000);
      if (!isNaN(parsed) && parsed > 0) return BigInt(parsed);
    }
    return 0n;
  }, [deadlinePreset, customDeadline]);

  // Form validation
  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!fileInfo) {
      errors.push("Document file is required.");
    }

    const tLen = titleByteLength(title.trim());
    if (tLen === 0) {
      errors.push("Agreement title is required.");
    } else if (tLen > MAX_TITLE_BYTES) {
      errors.push(`Title is too long (${tLen}/${MAX_TITLE_BYTES} bytes).`);
    }

    const signerVal = validateSigners(signers);
    if (!signerVal.valid) {
      errors.push(...signerVal.errors);
    }

    if (deadlinePreset === "custom") {
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      if (calculatedDeadline === 0n || calculatedDeadline <= nowSec) {
        errors.push("Custom deadline must be in the future.");
      } else if (calculatedDeadline > nowSec + MAX_DEADLINE) {
        errors.push("Custom deadline cannot exceed 1 year.");
      }
    }

    return {
      canSubmit: errors.length === 0,
      errors,
    };
  }, [fileInfo, title, signers, deadlinePreset, calculatedDeadline]);

  // Submit action
  const handleCreate = async () => {
    if (!validation.canSubmit || !fileInfo || !deployment) return;

    setStage("signing");
    setErrorMessage(null);

    try {
      const checksummedSigners = signers.map((s) => getAddress(s.trim()));

      const hash = await writeContractAsync({
        address: deployment.address,
        abi: countersignAbi,
        functionName: "create",
        args: [
          fileInfo.hash,
          checksummedSigners,
          calculatedDeadline,
          title.trim(),
        ],
      });

      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  };

  const resetForm = () => {
    setFileInfo(null);
    setTitle("");
    setSigners(["", ""]);
    setDeadlinePreset("none");
    setCustomDeadline("");
    setStage("idle");
    setTxHash(null);
    setCreatedId(null);
    setErrorMessage(null);
    settledRef.current = null;
  };

  // Render confirmed stage FIRST
  if (stage === "confirmed") {
    const agreementLink = createdId ? `/a/${createdId}` : "/mine";
    return (
      <div className="space-y-6">
        <div className="executed-banner p-5 rounded-[2px]">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[#1F7A4D]">
            <span>✓</span> Agreement Created Successfully
          </div>
          <p className="mt-1 text-[13px] text-[#1C1B33]">
            Document fingerprint has been anchored on BOT Chain. All named parties can now sign.
          </p>
        </div>

        <Panel variant="card" className="space-y-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8481A2]">
              Agreement Title
            </div>
            <div className="serif text-[20px] font-medium text-[#1C1B33] mt-0.5">
              {title}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8481A2]">
              Document SHA-256 Fingerprint
            </div>
            <div className="mono text-[12px] break-all bg-[#F6F4FB] p-2.5 rounded border border-[#CFC8E6] mt-1 text-[#1C1B33]">
              {fileInfo?.hash}
            </div>
          </div>

          <div className="pt-2 border-t border-[#CFC8E6]/60">
            <div className="text-[12px] text-[#5A5878] mb-2 font-medium">
              Share link for co-signers:
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={agreementLink}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#5B3FD0] text-white rounded text-[13px] font-medium hover:bg-[#4E34B5] transition-colors"
              >
                Open Agreement Sheet &rarr;
              </Link>
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  const url = `${window.location.origin}${agreementLink}`;
                  navigator.clipboard.writeText(url);
                }}
              >
                Copy Link
              </Button>
            </div>
            <p className="mt-3 text-[12px] italic text-[#5A5878]">
              Note: Send the document itself separately — only its fingerprint is stored on-chain.
            </p>
          </div>
        </Panel>

        <div className="text-right">
          <Button variant="ghost" size="sm" onClick={resetForm}>
            Create another agreement
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* 1. Document drop / fingerprint */}
      <div>
        <label className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-[#5A5878] mb-2">
          1. Document File to Fingerprint
        </label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileChange(file);
          }}
          className={`border-2 border-dashed rounded-[3px] p-6 text-center transition-colors ${
            fileInfo
              ? "border-[#5B3FD0] bg-[#F6F4FB]"
              : "border-[#CFC8E6] hover:border-[#5B3FD0] bg-white"
          }`}
        >
          {hashing ? (
            <div className="text-[13px] text-[#5B3FD0] flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Computing SHA-256 digest in browser...
            </div>
          ) : fileInfo ? (
            <div className="space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-[#1C1B33]">
                  📄 {fileInfo.name}
                </span>
                <span className="text-[12px] text-[#5A5878]">
                  {(fileInfo.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <div className="text-[11px] uppercase tracking-[0.05em] text-[#8481A2]">
                SHA-256 Digest (On-Chain Fingerprint):
              </div>
              <div className="mono text-[12px] break-all bg-white p-2 rounded border border-[#CFC8E6] text-[#1C1B33]">
                {fileInfo.hash}
              </div>
              <div className="text-right pt-1">
                <label className="text-[12px] text-[#5B3FD0] hover:underline cursor-pointer">
                  Replace file
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileChange(f);
                    }}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[14px] text-[#1C1B33]">
                Drop any file here, or browse
              </p>
              <p className="text-[12px] text-[#5A5878]">
                Processed purely in your browser via Web Crypto SHA-256. The file never leaves your machine.
              </p>
              <label className="inline-block mt-2 px-3 py-1.5 bg-[#F6F4FB] border border-[#CFC8E6] text-[#1C1B33] text-[12px] font-medium rounded cursor-pointer hover:bg-[#EBE7F6]">
                Browse File
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileChange(f);
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 2. Agreement Title */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor="agreement-title"
            className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#5A5878]"
          >
            2. Agreement Title
          </label>
          <span
            className={`text-[11px] ${
              titleByteLength(title) > MAX_TITLE_BYTES
                ? "text-[#A3263A] font-bold"
                : "text-[#8481A2]"
            }`}
          >
            {titleByteLength(title)} / {MAX_TITLE_BYTES} bytes
          </span>
        </div>
        <input
          id="agreement-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Founders Operating Accord"
          maxLength={MAX_TITLE_BYTES}
          className="w-full px-3.5 py-2.5 bg-white border border-[#CFC8E6] rounded-[2px] text-[14px] text-[#1C1B33] focus:outline-none focus:border-[#5B3FD0]"
        />
      </div>

      {/* 3. Signers List */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#5A5878]">
            3. Named Signers ({signers.length} of max {MAX_SIGNERS})
          </label>
          <div className="flex items-center gap-2">
            {connectedAddress && (
              <button
                type="button"
                onClick={handleAddMe}
                className="text-[11px] text-[#5B3FD0] hover:underline"
              >
                + Add me
              </button>
            )}
            <button
              type="button"
              onClick={() => setPasteMode(!pasteMode)}
              className="text-[11px] text-[#5B3FD0] hover:underline"
            >
              {pasteMode ? "Row view" : "Paste addresses"}
            </button>
          </div>
        </div>

        {pasteMode ? (
          <div className="space-y-2">
            <textarea
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste EVM addresses separated by newlines, commas, or spaces"
              className="mono w-full p-2.5 bg-white border border-[#CFC8E6] rounded text-[12px] text-[#1C1B33] focus:outline-none focus:border-[#5B3FD0]"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPasteMode(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleApplyPaste}
                disabled={!pasteText.trim()}
              >
                Apply Signers
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {signers.map((signer, idx) => {
              const isInvalid =
                signer.trim() !== "" && !isAddress(signer.trim());
              return (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[12px] font-mono text-[#8481A2] w-5 text-right">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={signer}
                    onChange={(e) => handleSignerChange(idx, e.target.value)}
                    placeholder="0x..."
                    className={`mono flex-1 px-3 py-2 bg-white border rounded-[2px] text-[13px] text-[#1C1B33] focus:outline-none ${
                      isInvalid
                        ? "border-[#A3263A]"
                        : "border-[#CFC8E6] focus:border-[#5B3FD0]"
                    }`}
                  />
                  {signers.length > MIN_SIGNERS && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSigner(idx)}
                      className="text-[#8481A2] hover:text-[#A3263A] px-2 py-1 text-[13px]"
                      title="Remove signer"
                    >
                      &times;
                    </button>
                  )}
                </div>
              );
            })}

            {signers.length < MAX_SIGNERS && (
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleAddSigner}
                  type="button"
                >
                  + Add another signer
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Deadline */}
      <div>
        <label className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-[#5A5878] mb-2">
          4. Expiration Deadline
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {(["none", "7d", "30d", "90d", "custom"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDeadlinePreset(p)}
              className={`px-3 py-1.5 rounded-[2px] text-[12px] font-medium border transition-colors ${
                deadlinePreset === p
                  ? "bg-[#5B3FD0] text-white border-[#5B3FD0]"
                  : "bg-white text-[#1C1B33] border-[#CFC8E6] hover:bg-[#F6F4FB]"
              }`}
            >
              {p === "none"
                ? "No deadline"
                : p === "7d"
                ? "7 days"
                : p === "30d"
                ? "30 days"
                : p === "90d"
                ? "90 days"
                : "Custom date"}
            </button>
          ))}
        </div>

        {deadlinePreset === "custom" && (
          <div className="mt-3">
            <input
              type="datetime-local"
              value={customDeadline}
              onChange={(e) => setCustomDeadline(e.target.value)}
              className="px-3 py-2 bg-white border border-[#CFC8E6] rounded text-[13px] text-[#1C1B33] focus:outline-none focus:border-[#5B3FD0]"
            />
          </div>
        )}
      </div>

      {/* Error display */}
      {errorMessage && (
        <div className="declined-banner p-3.5 rounded text-[13px] text-[#A3263A]">
          {errorMessage}
        </div>
      )}

      {/* Validation warnings if invalid */}
      {!validation.canSubmit && validation.errors.length > 0 && (
        <div className="text-[12px] text-[#8481A2] space-y-1">
          {validation.errors.map((err, i) => (
            <div key={i}>&bull; {err}</div>
          ))}
        </div>
      )}

      {/* Submit Button */}
      <div className="pt-2 border-t border-[#CFC8E6]/60 flex items-center justify-between">
        <span className="text-[12px] text-[#8481A2]">
          N-of-N attestation: agreement completes when all signers countersign.
        </span>
        <Button
          variant="primary"
          size="lg"
          disabled={!validation.canSubmit || stage === "signing" || stage === "confirming"}
          loading={stage === "signing" || stage === "confirming"}
          onClick={handleCreate}
        >
          {stage === "signing"
            ? "Confirm in Wallet..."
            : stage === "confirming"
            ? "Anchoring on BOT Chain..."
            : "Create Agreement"}
        </Button>
      </div>
    </div>
  );
}
