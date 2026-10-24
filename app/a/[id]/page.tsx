import PageShell from "@/components/layout/PageShell";
import AgreementSheet, {
  AgreementMarginalia,
} from "@/components/countersign/AgreementSheet";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AgreementPage({ params }: PageProps) {
  const { id } = await params;
  let validId: bigint | null = null;
  try {
    const parsed = BigInt(id);
    if (parsed > 0n) validId = parsed;
  } catch {
    validId = null;
  }

  if (validId === null) {
    return (
      <PageShell
        title="Invalid Agreement ID"
        description="The agreement ID in the URL is invalid."
      >
        <div className="py-10 text-center text-[#A3263A]">
          Invalid agreement identifier: &ldquo;{id}&rdquo;
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={`Agreement #${validId.toString()}`}
      description="Review attestation signatures and document fingerprint."
      marginalia={<AgreementMarginalia id={validId} />}
    >
      <AgreementSheet id={validId} />
    </PageShell>
  );
}
