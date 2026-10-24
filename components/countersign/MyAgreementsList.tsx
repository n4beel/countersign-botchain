"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAccount, useChainId, useReadContract, useReadContracts } from "wagmi";
import ConnectButton from "@/components/ui/ConnectButton";
import { countersignAbi } from "@/lib/botchain/abi";
import { getDeployment } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import { deadlineLabel, statusLabel } from "@/lib/countersign";

export default function MyAgreementsList() {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const deployment = useMemo(
    () => (isBotChainId(chainId) ? getDeployment(chainId) : undefined),
    [chainId]
  );

  // Read agreements involving user
  const {
    data: agreementsData,
    isLoading: isAgreementsLoading,
  } = useReadContract({
    address: deployment?.address,
    abi: countersignAbi,
    functionName: "agreementsFor",
    args: [connectedAddress ?? "0x0000000000000000000000000000000000000000", 0n, 50n],
    query: { enabled: !!deployment && !!connectedAddress },
  });

  const agreements = agreementsData ?? [];

  // Read hasSigned for caller for each agreement
  const hasSignedContracts = useMemo(() => {
    if (!deployment || !agreements.length || !connectedAddress) return [];
    return agreements.map((agr) => ({
      address: deployment.address,
      abi: countersignAbi,
      functionName: "hasSigned" as const,
      args: [agr.id, connectedAddress] as const,
    }));
  }, [deployment, agreements, connectedAddress]);

  const { data: userSignedFlags, isLoading: isFlagsLoading } = useReadContracts({
    contracts: hasSignedContracts,
    query: { enabled: hasSignedContracts.length > 0 },
  });

  // Group agreements
  const grouped = useMemo(() => {
    const waitingForMe: Array<{ agreement: (typeof agreements)[number] }> = [];
    const pendingOthers: Array<{ agreement: (typeof agreements)[number] }> = [];
    const completedOrFinalized: Array<{ agreement: (typeof agreements)[number] }> = [];

    agreements.forEach((agreement, idx) => {
      const signed = userSignedFlags?.[idx]?.result === true;
      const status = agreement.status;

      if (status === 0) {
        if (!signed) {
          waitingForMe.push({ agreement });
        } else {
          pendingOthers.push({ agreement });
        }
      } else {
        completedOrFinalized.push({ agreement });
      }
    });

    return { waitingForMe, pendingOthers, completedOrFinalized };
  }, [agreements, userSignedFlags]);

  if (!connectedAddress) {
    return (
      <div className="py-12 text-center space-y-4">
        <div className="serif text-[22px] text-[#1C1B33]">
          Connect your wallet to view your agreements
        </div>
        <p className="text-[13px] text-[#5A5878] max-w-sm mx-auto">
          View agreements where your address is named as a party or creator.
        </p>
        <div className="w-[180px] mx-auto">
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (isAgreementsLoading || (agreements.length > 0 && isFlagsLoading)) {
    return (
      <div className="py-12 text-center text-[#5A5878]">
        <div className="w-6 h-6 border-2 border-[#5B3FD0] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[13px]">Loading agreements for {connectedAddress}...</p>
      </div>
    );
  }

  if (agreements.length === 0) {
    return (
      <div className="py-12 text-center space-y-4">
        <div className="serif text-[20px] text-[#1C1B33]">
          No agreements found
        </div>
        <p className="text-[13px] text-[#5A5878] max-w-md mx-auto">
          Your wallet is not currently named on any agreements on BOT Chain.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-[#5B3FD0] text-white rounded text-[13px] font-medium"
        >
          Create First Agreement
        </Link>
      </div>
    );
  }

  const renderAgreementCard = (
    item: { agreement: (typeof agreements)[number] },
    highlight = false
  ) => {
    const { agreement } = item;
    const id = agreement.id;
    const status = agreement.status;
    const statusInfo = statusLabel(status);

    return (
      <Link
        key={id.toString()}
        href={`/a/${id}`}
        className={`block p-4 rounded transition-all no-underline shadow-sm group ${
          highlight
            ? "bg-[#FFFDFC] border-2 border-[#5B3FD0]"
            : "bg-white border border-[#CFC8E6] hover:border-[#5B3FD0]"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
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

          <span className="mono text-[12px] text-[#5A5878]">
            {agreement.signedCount}/{agreement.signerCount} signed
          </span>
        </div>

        <div className="mt-2 text-[12px] mono text-[#8481A2] truncate">
          Fingerprint: {agreement.docHash}
        </div>

        <div className="mt-3 pt-2 border-t border-[#CFC8E6]/50 flex items-center justify-between text-[11px] text-[#5A5878]">
          <span>{deadlineLabel(agreement.deadline)}</span>
          <span className="text-[#5B3FD0] font-medium group-hover:underline">
            {highlight ? "Sign Now &rarr;" : "View Sheet &rarr;"}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <div className="space-y-8">
      {/* 1. Waiting for your signature (HERO SECTION) */}
      {grouped.waitingForMe.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#5B3FD0] animate-pulse" />
            <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#5B3FD0]">
              Waiting for Your Signature ({grouped.waitingForMe.length})
            </h2>
          </div>
          <div className="space-y-3">
            {grouped.waitingForMe.map((item) => renderAgreementCard(item, true))}
          </div>
        </section>
      )}

      {/* 2. Other Pending */}
      {grouped.pendingOthers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#5A5878]">
            Pending Other Parties ({grouped.pendingOthers.length})
          </h2>
          <div className="space-y-3">
            {grouped.pendingOthers.map((item) => renderAgreementCard(item, false))}
          </div>
        </section>
      )}

      {/* 3. Completed or Finalized */}
      {grouped.completedOrFinalized.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#5A5878]">
            Finalized Agreements ({grouped.completedOrFinalized.length})
          </h2>
          <div className="space-y-3">
            {grouped.completedOrFinalized.map((item) =>
              renderAgreementCard(item, false)
            )}
          </div>
        </section>
      )}
    </div>
  );
}
