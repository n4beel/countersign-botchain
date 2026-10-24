"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { type Hex } from "viem";
import { useChainId, useReadContract } from "wagmi";
import Panel from "@/components/ui/Panel";
import { countersignAbi } from "@/lib/botchain/abi";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import { hashFile, statusLabel } from "@/lib/countersign";

export default function FileVerifier() {
  const chainId = useChainId();
  const deployment = useMemo(
    () => (isBotChainId(chainId) ? getDeployment(chainId) : undefined),
    [chainId]
  );

  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
    hash: Hex;
  } | null>(null);
  const [hashing, setHashing] = useState(false);
  const [manualHash, setManualHash] = useState("");

  const activeHash = fileInfo?.hash ?? (manualHash.startsWith("0x") ? (manualHash as Hex) : undefined);

  // Read agreements for document hash
  const {
    data: docAgreements,
    isLoading: isQueryLoading,
  } = useReadContract({
    address: deployment?.address,
    abi: countersignAbi,
    functionName: "agreementsForDoc",
    args: [activeHash ?? "0x0000000000000000000000000000000000000000000000000000000000000000", 0n, 50n],
    query: { enabled: !!deployment && !!activeHash },
  });

  const agreements = docAgreements ?? [];

  const handleFileDrop = useCallback(async (file: File) => {
    setHashing(true);
    try {
      const hash = await hashFile(file);
      setFileInfo({
        name: file.name,
        size: file.size,
        hash,
      });
      setManualHash("");
    } catch {
      // Hashing error
    } finally {
      setHashing(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* File Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFileDrop(f);
        }}
        className="border-2 border-dashed border-[#CFC8E6] hover:border-[#5B3FD0] bg-white rounded-[2px] p-8 text-center space-y-3 transition-colors"
      >
        {hashing ? (
          <div className="text-[13px] text-[#5B3FD0] flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Computing SHA-256 digest in browser...
          </div>
        ) : (
          <div>
            <div className="text-[15px] font-medium text-[#1C1B33]">
              Drop any document to check its on-chain agreements
            </div>
            <p className="text-[12px] text-[#5A5878] mt-1">
              Computes SHA-256 fingerprint client-side and queries BOT Chain registry
            </p>
            <label className="inline-block mt-3 px-3 py-1.5 bg-[#F6F4FB] border border-[#CFC8E6] text-[#1C1B33] text-[12px] font-medium rounded cursor-pointer hover:bg-[#EBE7F6]">
              Browse File
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileDrop(f);
                }}
              />
            </label>
          </div>
        )}
      </div>

      {/* Or manual hash search */}
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-[#8481A2]">Or search by hash:</span>
        <input
          type="text"
          value={manualHash}
          onChange={(e) => {
            setManualHash(e.target.value.trim());
            setFileInfo(null);
          }}
          placeholder="0x..."
          className="mono flex-1 px-3 py-1.5 bg-white border border-[#CFC8E6] rounded text-[12px] text-[#1C1B33] focus:outline-none focus:border-[#5B3FD0]"
        />
      </div>

      {/* Results */}
      {activeHash && (
        <div className="space-y-4 pt-4 border-t border-[#CFC8E6]">
          <Panel variant="inset">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8481A2]">
              Queried Fingerprint
            </div>
            <div className="mono text-[12px] break-all text-[#1C1B33] mt-1">
              {activeHash}
            </div>
            {fileInfo && (
              <div className="text-[11px] text-[#5A5878] mt-1">
                File: {fileInfo.name} ({(fileInfo.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </Panel>

          {isQueryLoading ? (
            <div className="py-6 text-center text-[#5A5878] text-[13px]">
              Querying BOT Chain for matching agreements...
            </div>
          ) : agreements.length === 0 ? (
            <div className="p-6 text-center bg-white border border-[#CFC8E6] rounded space-y-2">
              <div className="text-[14px] font-medium text-[#1C1B33]">
                No agreements found
              </div>
              <p className="text-[12px] text-[#5A5878]">
                No agreement on BOT Chain has registered this SHA-256 fingerprint.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-[12px] font-semibold text-[#5A5878]">
                Found {agreements.length} agreement{agreements.length === 1 ? "" : "s"} on BOT Chain:
              </div>

              {agreements.map((agreement) => {
                const id = agreement.id;
                const status = agreement.status;
                const statusInfo = statusLabel(status);
                const signerCount = agreement.signerCount;
                const signedCount = agreement.signedCount;

                return (
                  <Link
                    key={id.toString()}
                    href={`/a/${id}`}
                    className="block p-4 bg-white border border-[#CFC8E6] hover:border-[#5B3FD0] rounded transition-all no-underline group shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="serif text-[17px] font-medium text-[#1C1B33] group-hover:text-[#5B3FD0]">
                          Agreement #{id.toString()}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            status === 1
                              ? "bg-[#1F7A4D]/10 text-[#1F7A4D]"
                              : status === 2
                              ? "bg-[#A3263A]/10 text-[#A3263A]"
                              : status === 3
                              ? "bg-[#C2740A]/10 text-[#C2740A]"
                              : "bg-[#5B3FD0]/10 text-[#5B3FD0]"
                          }`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                      <span className="text-[12px] text-[#5A5878] mono">
                        {signedCount}/{signerCount} signed
                      </span>
                    </div>

                    <div className="mt-2 text-[11px] text-[#8481A2] flex items-center justify-between">
                      <span>Block #{agreement.createdBlock.toString()}</span>
                      <span className="text-[#5B3FD0] group-hover:underline">
                        View Sheet &rarr;
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
