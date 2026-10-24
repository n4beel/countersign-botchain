import PageShell from "@/components/layout/PageShell";
import FileVerifier from "@/components/countersign/FileVerifier";

export default function VerifyPage() {
  return (
    <PageShell
      title="Verify Document Fingerprint"
      description="Drop any document to check if it has been anchored and countersigned on BOT Chain."
    >
      <FileVerifier />
    </PageShell>
  );
}
