"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import BotChainGate from "@/components/botchain/BotChainGate";
import { countersignAbi } from "@/lib/botchain/abi";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import {
  deadlineLabel,
  decodeSigners,
  hashFile,
  statusLabel,
} from "@/lib/countersign";
import { describeError } from "@/lib/errors";

interface AgreementSheetProps {
  id: bigint;
}

type ActionStage = "idle" | "signing" | "confirming" | "confirmed" | "error";

export default function AgreementSheet({ id }: AgreementSheetProps) {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const deployment = useMemo(
    () => (isBotChainId(chainId) ? getDeployment(chainId) : undefined),
    [chainId]
  );

  // File checking state
  const [checkFile, setCheckFile] = useState<{
    name: string;
    hash: Hex;
    match: boolean;
  } | null>(null);
  const [isCheckingFile, setIsCheckingFile] = useState(false);

  // Action states
  const [actionType, setActionType] = useState<"sign" | "decline" | null>(null);
  const [stage, setStage] = useState<ActionStage>("idle");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);

  const settledRef = useRef<Hex | null>(null);

  // Read agreement
  const {
    data: agreementData,
    isLoading: isAgreementLoading,
    error: agreementError,
    refetch: refetchAgreement,
  } = useReadContract({
    address: deployment?.address,
    abi: countersignAbi,
    functionName: "agreementOf",
    args: [id],
    query: { enabled: !!deployment && id > 0n },
  });

  // Read signers
  const {
    data: signersData,
    isLoading: isSignersLoading,
    refetch: refetchSigners,
  } = useReadContract({
    address: deployment?.address,
    abi: countersignAbi,
    functionName: "signersOf",
    args: [id],
    query: { enabled: !!deployment && id > 0n },
  });

  const { signers, signed } = useMemo(
    () => decodeSigners(signersData),
    [signersData]
  );

  // Action hooks
  const { writeContractAsync } = useWriteContract();
  const {
    data: receipt,
    isSuccess: isReceiptSuccess,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash ?? undefined });

  // Handle tx confirmation with settledRef
  useEffect(() => {
    if (!txHash) return;
    if (settledRef.current === txHash) return;

    if (isReceiptSuccess && receipt) {
      settledRef.current = txHash;
      setStage("confirmed");
      refetchAgreement();
      refetchSigners();
    } else if (isReceiptError) {
      settledRef.current = txHash;
      setStage("error");
      setErrorMessage(describeError(receiptError));
    }
  }, [
    txHash,
    isReceiptSuccess,
    isReceiptError,
    receipt,
    receiptError,
    refetchAgreement,
    refetchSigners,
  ]);

  // File drop handler for checker
  const handleCheckFile = useCallback(
    async (file: File) => {
      if (!agreementData) return;
      setIsCheckingFile(true);
      try {
        const hash = await hashFile(file);
        const expected = agreementData.docHash.toLowerCase();
        setCheckFile({
          name: file.name,
          hash,
          match: hash.toLowerCase() === expected,
        });
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to hash document"
        );
      } finally {
        setIsCheckingFile(false);
      }
    },
    [agreementData]
  );

  // Perform Sign
  const handleSign = async () => {
    if (!deployment) return;
    setActionType("sign");
    setStage("signing");
    setErrorMessage(null);

    try {
      const hash = await writeContractAsync({
        address: deployment.address,
        abi: countersignAbi,
        functionName: "sign",
        args: [id],
      });
      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  };

  // Perform Decline
  const handleDecline = async () => {
    if (!deployment) return;
    setActionType("decline");
    setStage("signing");
    setErrorMessage(null);
    setShowDeclineConfirm(false);

    try {
      const hash = await writeContractAsync({
        address: deployment.address,
        abi: countersignAbi,
        functionName: "decline",
        args: [id],
      });
      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("error");
      setErrorMessage(describeError(err));
    }
  };

  if (isAgreementLoading || isSignersLoading) {
    return (
      <div className="py-12 text-center text-[#5A5878]">
        <div className="w-6 h-6 border-2 border-[#5B3FD0] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[13px]">Reading agreement from BOT Chain...</p>
      </div>
    );
  }

  if (agreementError || !agreementData || agreementData.createdBlock === 0) {
    return (
      <div className="py-10 text-center space-y-4">
        <div className="text-[18px] serif text-[#1C1B33]">
          Agreement #{id.toString()} not found
        </div>
        <p className="text-[13px] text-[#5A5878] max-w-md mx-auto">
          No agreement exists with this ID on BOT Chain. Check the identifier or create a new agreement.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-[#5B3FD0] text-white rounded text-[13px] font-medium"
        >
          Create New Agreement
        </Link>
      </div>
    );
  }

  const {
    creator,
    docHash,
    deadline,
    createdBlock,
    completedAt,
    signedCount,
    signerCount,
    status,
    declinedBy,
  } = agreementData;

  const statusInfo = statusLabel(status);
  const remaining = signerCount - signedCount;

  // Determine connected user role
  const connectedLower = connectedAddress?.toLowerCase();
  const isParty = signers.some((s) => s.toLowerCase() === connectedLower);
  const userSignerIndex = signers.findIndex(
    (s) => s.toLowerCase() === connectedLower
  );
  const hasUserSigned =
    userSignerIndex >= 0 &&
    signed[userSignerIndex] === true;
  const canSign = status === 0 && isParty && !hasUserSigned;

  const completedDate =
    completedAt > 0n
      ? new Date(Number(completedAt) * 1000).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      : "";

  return (
    <div className="space-y-8">
      {/* 1. Status Banners */}
      {status === 1 && (
        <div className="executed-banner p-4 sm:p-5 rounded-[2px] flex items-center justify-between">
          <div>
            <div className="font-semibold text-[15px] flex items-center gap-2">
              <span>✓</span> Executed Agreement
            </div>
            <p className="mt-1 text-[13px] text-[#1C1B33]">
              All {signerCount} parties have countersigned. Anchored on {completedDate}.
            </p>
          </div>
          <div className="text-[12px] font-mono text-[#1F7A4D] font-bold">
            {signedCount}/{signerCount} COMPLETE
          </div>
        </div>
      )}

      {status === 2 && (
        <div className="declined-banner p-4 sm:p-5 rounded-[2px]">
          <div className="font-semibold text-[15px] flex items-center gap-2 text-[#A3263A]">
            <span>✕</span> Agreement Declined
          </div>
          <p className="mt-1 text-[13px] text-[#1C1B33]">
            Declined by <span className="font-mono text-[12px]">{declinedBy}</span>.
            This agreement is void and cannot complete.
          </p>
        </div>
      )}

      {status === 3 && (
        <div className="expired-banner p-4 sm:p-5 rounded-[2px]">
          <div className="font-semibold text-[15px] flex items-center gap-2 text-[#C2740A]">
            <span>⚠</span> Agreement Expired
          </div>
          <p className="mt-1 text-[13px] text-[#1C1B33]">
            {deadlineLabel(deadline)}. Unsigned parties can no longer sign.
          </p>
        </div>
      )}

      {/* Action confirmation notification */}
      {stage === "confirmed" && (
        <div className="executed-banner p-3.5 rounded text-[13px] text-[#1F7A4D]">
          ✓ Your transaction has been confirmed on BOT Chain.
        </div>
      )}

      {errorMessage && (
        <div className="declined-banner p-3.5 rounded text-[13px] text-[#A3263A]">
          {errorMessage}
        </div>
      )}

      {/* 2. Document Fingerprint Header */}
      <Panel variant="inset" className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8481A2]">
            Document SHA-256 Fingerprint
          </span>
          <span className="text-[11px] text-[#5A5878]">
            Agreement #{id.toString()}
          </span>
        </div>
        <div className="mono text-[13px] break-all bg-white p-3 rounded border border-[#CFC8E6] text-[#1C1B33]">
          {docHash}
        </div>
      </Panel>

      {/* 3. Hero Signature Block */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#CFC8E6] pb-2">
          <h2 className="serif text-[20px] font-medium text-[#1C1B33]">
            Attestation Signatures
          </h2>
          <span className="text-[12px] text-[#5A5878]">
            {signedCount} of {signerCount} signed
          </span>
        </div>

        <div className="space-y-4">
          {signers.map((signerAddr, idx) => {
            const isSigned = signed[idx] === true;
            const isCaller =
              signerAddr.toLowerCase() === connectedLower;
            const isDecliner =
              status === 2 &&
              signerAddr.toLowerCase() === declinedBy.toLowerCase();

            return (
              <div
                key={signerAddr}
                className={`sig-ruled-line pb-3 pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  isDecliner ? "opacity-60 line-through" : ""
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[#8481A2]">
                      [{idx + 1}]
                    </span>
                    <span className="mono text-[13px] font-medium text-[#1C1B33]">
                      {signerAddr}
                    </span>
                    {isCaller && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#5B3FD0]/10 text-[#5B3FD0] px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#5A5878] pl-5">
                    {isSigned ? (
                      <span className="text-[#1F7A4D] font-medium flex items-center gap-1">
                        <span>✓</span> Countersigned
                      </span>
                    ) : isDecliner ? (
                      <span className="text-[#A3263A] font-medium">
                        Declined
                      </span>
                    ) : status === 3 ? (
                      <span className="text-[#C2740A]">Did not sign</span>
                    ) : (
                      <span className="uppercase tracking-[0.08em] text-[10px] text-[#8481A2]">
                        Awaiting signature
                      </span>
                    )}
                  </div>
                </div>

                {/* If this is caller's row and they can sign/decline */}
                {isCaller && canSign && (
                  <div className="flex items-center gap-2 pt-1 sm:pt-0">
                    <Button
                      variant="signature"
                      size="sm"
                      loading={stage === "signing" || stage === "confirming"}
                      onClick={handleSign}
                    >
                      Sign Document
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowDeclineConfirm(true)}
                    >
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Decline confirmation modal / dialog */}
        {showDeclineConfirm && (
          <div className="p-4 bg-[#FFF0F2] border border-[#E8ACB5] rounded-[2px] space-y-3">
            <div className="text-[13px] font-semibold text-[#A3263A]">
              Decline this agreement?
            </div>
            <p className="text-[12px] text-[#1C1B33]">
              Declining permanently voids the agreement for all parties. No one will be able to complete it.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                loading={stage === "signing" || stage === "confirming"}
                onClick={handleDecline}
              >
                Confirm Decline
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeclineConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* If user is connected but not a signer */}
        {connectedAddress && !isParty && status === 0 && (
          <p className="text-[12px] text-[#8481A2] italic pt-1">
            You aren&apos;t named as a signer on this agreement.
          </p>
        )}
      </div>

      {/* 4. "Check a file" verification box */}
      <div className="pt-4 border-t border-[#CFC8E6]/70">
        <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#5A5878] mb-2">
          Verify File Against This Agreement
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleCheckFile(f);
          }}
          className="border border-[#CFC8E6] bg-[#F6F4FB] rounded-[2px] p-4 text-center space-y-2"
        >
          {isCheckingFile ? (
            <div className="text-[12px] text-[#5B3FD0]">
              Checking document fingerprint...
            </div>
          ) : checkFile ? (
            <div className="text-left space-y-2">
              {checkFile.match ? (
                <div className="executed-banner p-3 rounded text-[13px] font-medium text-[#1F7A4D] flex items-center gap-2">
                  <span>✓</span> This is the document. (SHA-256 matches)
                </div>
              ) : (
                <div className="declined-banner p-3 rounded text-[13px] font-medium text-[#A3263A] space-y-1">
                  <div>✕ This is NOT the document.</div>
                  <div className="text-[11px] mono break-all">
                    File hash: {checkFile.hash}
                  </div>
                  <div className="text-[11px] mono break-all">
                    Target hash: {docHash}
                  </div>
                </div>
              )}
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setCheckFile(null)}
                  className="text-[11px] text-[#5B3FD0] hover:underline"
                >
                  Check another file
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[13px] text-[#1C1B33]">
                Drop a file to verify its fingerprint against this agreement
              </p>
              <label className="inline-block mt-2 text-[11px] text-[#5B3FD0] hover:underline cursor-pointer">
                or select file
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCheckFile(f);
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Marginalia component for the right margin column.
 */
export function AgreementMarginalia({ id }: { id: bigint }) {
  const chainId = useChainId();
  const deployment = useMemo(
    () => (isBotChainId(chainId) ? getDeployment(chainId) : undefined),
    [chainId]
  );

  const { data: agreement } = useReadContract({
    address: deployment?.address,
    abi: countersignAbi,
    functionName: "agreementOf",
    args: [id],
    query: { enabled: !!deployment && id > 0n },
  });

  if (!agreement || agreement.createdBlock === 0) return null;

  const { creator, deadline, createdBlock, signedCount, signerCount, status } =
    agreement;
  const statusInfo = statusLabel(status);

  return (
    <div className="space-y-4 text-[12px]">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8481A2]">
          Status
        </div>
        <div
          className={`font-semibold mt-0.5 ${
            status === 1
              ? "text-[#1F7A4D]"
              : status === 2
              ? "text-[#A3263A]"
              : status === 3
              ? "text-[#C2740A]"
              : "text-[#5B3FD0]"
          }`}
        >
          {statusInfo.label}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8481A2]">
          Attestation Progress
        </div>
        <div className="font-mono text-[#1C1B33] mt-0.5">
          {signedCount} / {signerCount} signed
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8481A2]">
          Deadline
        </div>
        <div className="text-[#5A5878] mt-0.5">
          {deadlineLabel(deadline)}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8481A2]">
          Initiated By
        </div>
        <div className="mono text-[11px] text-[#1C1B33] break-all mt-0.5">
          {creator}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8481A2]">
          Block Anchor
        </div>
        <div className="mono text-[#5A5878] mt-0.5">
          #{createdBlock.toString()}
        </div>
      </div>
    </div>
  );
}
