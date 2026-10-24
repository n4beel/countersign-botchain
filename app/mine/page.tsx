import PageShell from "@/components/layout/PageShell";
import MyAgreementsList from "@/components/countersign/MyAgreementsList";

export default function MinePage() {
  return (
    <PageShell
      title="My Agreements"
      description="Track documents awaiting your signature or pending countersignatures from other parties."
    >
      <MyAgreementsList />
    </PageShell>
  );
}
