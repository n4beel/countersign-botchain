import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import CreateAgreementForm from "@/components/countersign/CreateAgreementForm";
import { app } from "@/lib/app-config";

export default function Home() {
  return (
    <PageShell
      title="Countersign Document"
      description="Fingerprint a document, name the parties, and have each one sign from their own wallet."
    >
      <BotChainGate noWalletNote="Viewing or verifying document agreements does not require a wallet. Connect your wallet to create and sign agreements.">
        <CreateAgreementForm />
      </BotChainGate>
    </PageShell>
  );
}
