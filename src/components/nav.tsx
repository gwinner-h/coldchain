"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Pipeline", match: (p: string) => p === "/" },
  { href: "/opportunities", label: "Opportunities", match: (p: string) => p.startsWith("/opportunities") },
  { href: "/accounts", label: "Accounts", match: (p: string) => p.startsWith("/accounts") },
  { href: "/activities", label: "Follow-ups", match: (p: string) => p.startsWith("/activities") },
  { href: "/vista-sync", label: "Vista sync", match: (p: string) => p.startsWith("/vista-sync") },
];

export function Nav({ needsAttention }: { needsAttention: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="border-b border-line bg-ink text-white md:min-h-screen md:w-52 md:shrink-0 md:border-b-0">
      <div className="px-5 pt-5 pb-4">
        <Link href="/" className="font-[family-name:var(--font-condensed)] text-lg font-semibold no-underline">
          Pipeline CRM
        </Link>
      </div>
      <ul className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
        {LINKS.map((l) => {
          const active = l.match(pathname);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 no-underline ${
                  active ? "bg-white/12 font-medium" : "text-white/75 hover:bg-white/8 hover:text-white"
                }`}
              >
                {l.label}
                {l.href === "/vista-sync" && needsAttention > 0 && (
                  <span className="figures rounded-[4px] bg-warn px-1.5 text-xs text-white" aria-label={`${needsAttention} need attention`}>
                    {needsAttention}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
