"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";
import { footerLinks } from "@/lib/botchain/chain";

export type NavItem = { href: string; label: string };

export interface PageShellProps {
  children: ReactNode;
  nav?: NavItem[];
  title?: string;
  subtitle?: string;
  description?: string;
  marginalia?: ReactNode;
  documentMeta?: ReactNode;
}

export const DEFAULT_NAV: NavItem[] = [
  { href: "/", label: "New Agreement" },
  { href: "/verify", label: "Verify File" },
  { href: "/mine", label: "My Agreements" },
];

/**
 * Archetype J · Sheet Shell.
 *
 * Ground is a lilac desk (#E3DEF2); centered upon it is a white A4-proportioned
 * sheet (max-w-[760px] or max-w-[940px] with marginalia) with soft paper shadows,
 * thin violet top rule, and document typography.
 */
export default function PageShell({
  children,
  nav = DEFAULT_NAV,
  title,
  subtitle,
  description,
  marginalia,
  documentMeta,
}: PageShellProps) {
  const pathname = usePathname();
  const desc = description || subtitle;
  const { site, explorer } = footerLinks();

  return (
    <div className="sheet-desk-ground min-h-[100dvh] flex flex-col justify-between px-3 sm:px-6 py-6 md:py-10 text-[#1C1B33]">
      {/* Desk header: small wordmark and navigation above sheet */}
      <div className="mx-auto w-full max-w-[920px] mb-4 md:mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 group text-inherit no-underline"
          >
            <span
              className="w-2.5 h-2.5 bg-[#5B3FD0] rounded-[1px] transition-transform group-hover:scale-110"
              aria-hidden="true"
            />
            <span className="text-[14px] font-semibold tracking-[0.06em] uppercase text-[#1C1B33]">
              {app.name}
            </span>
          </Link>
          <span className="text-[#8481A2] text-[12px] hidden sm:inline" aria-hidden="true">
            /
          </span>
          <span className="text-[12px] text-[#5A5878] hidden sm:inline font-normal">
            Bilateral & Multi-party Attestation
          </span>
        </div>

        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-1">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`text-[12px] px-2.5 py-1 rounded transition-colors no-underline ${
                    active
                      ? "bg-[#5B3FD0]/10 text-[#5B3FD0] font-semibold"
                      : "text-[#5A5878] hover:text-[#1C1B33]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <NetworkBadge />
        </div>
      </div>

      {/* The Paper Sheet */}
      <main className="mx-auto w-full max-w-[920px] flex-1">
        <article className="paper-sheet-card p-6 sm:p-10 md:p-12 transition-all">
          {/* Sheet top header: title, lede, and connect control at top right */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-[#CFC8E6]/80">
            <div className="flex-1 min-w-0">
              {documentMeta && <div className="mb-2">{documentMeta}</div>}
              {title && (
                <h1 className="serif text-[26px] sm:text-[32px] md:text-[36px] font-normal leading-[1.15] tracking-tight text-[#1C1B33]">
                  {title}
                </h1>
              )}
              {desc && (
                <p className="mt-2 text-[13px] sm:text-[14px] text-[#5A5878] leading-relaxed max-w-[580px]">
                  {desc}
                </p>
              )}
            </div>

            {/* Connect control in the top-right corner of the sheet */}
            <div className="w-full sm:w-[190px] shrink-0 flex justify-end">
              <ConnectButton />
            </div>
          </div>

          {/* Sheet layout: document content with optional right margin column */}
          <div className="mt-6 flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-1 min-w-0 w-full space-y-6">{children}</div>

            {/* Right margin column (180px, collapses on mobile) for marginalia */}
            {marginalia && (
              <aside className="w-full md:w-[200px] shrink-0 border-t md:border-t-0 md:border-l border-[#CFC8E6]/80 pt-6 md:pt-0 md:pl-6 space-y-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8481A2]">
                  Marginalia
                </div>
                {marginalia}
              </aside>
            )}
          </div>

          {/* Sheet footer: disclaimer and attribution rule */}
          <footer className="mt-12 pt-6 border-t border-[#CFC8E6]/80 text-[#5A5878]">
            <p className="text-[11px] leading-relaxed text-[#5A5878] max-w-[620px]">
              This records that these wallets signed this fingerprint. It doesn&apos;t store the document,
              and it isn&apos;t a legal signature on its own.
            </p>

            <div className="mt-4 pt-4 border-t border-[#CFC8E6]/40 flex flex-wrap items-center justify-between gap-3 text-[11px]">
              <div className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 bg-[#5B3FD0] rounded-[0.5px]"
                  aria-hidden="true"
                />
                <BuiltOnBotChain className="uppercase tracking-[0.06em] text-[#5A5878]" />
              </div>

              <div className="flex items-center gap-4 text-[#8481A2]">
                <a
                  href={site}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#5B3FD0] underline"
                >
                  botchain.ai
                </a>
                <a
                  href={explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#5B3FD0] underline"
                >
                  BOT Chain Explorer
                </a>
              </div>
            </div>
          </footer>
        </article>
      </main>

      {/* Desk foot note */}
      <footer className="mx-auto w-full max-w-[920px] mt-6 text-center text-[11px] text-[#5A5878]">
        Countersign &middot; SHA-256 N-of-N Document Attestation
      </footer>
    </div>
  );
}
