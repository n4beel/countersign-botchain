import Link from "next/link";
import PageShell from "@/components/layout/PageShell";

export default function NotFound() {
  return (
    <PageShell title="Document Not Found" subtitle="This agreement record could not be found">
      <div className="py-12 w-full max-w-lg mx-auto text-center">
        <div className="p-8 border border-[#CFC8E6]/80 rounded-[4px] space-y-5 bg-[#FAF9FC]">
          <div className="w-12 h-12 mx-auto bg-[#5B3FD0]/10 text-[#5B3FD0] rounded-full flex items-center justify-center text-xl font-serif">
            §
          </div>
          <h2 className="text-xl font-normal font-serif text-[#1C1B33]">
            Record Not Found
          </h2>
          <p className="text-xs text-[#5A5878] leading-relaxed max-w-sm mx-auto">
            The agreement fingerprint or document identifier requested was not found on this network.
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded bg-[#5B3FD0] text-white hover:bg-[#4A32B0] transition-colors"
            >
              ← Return to New Agreement
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
