import type { Metadata } from "next";
import { Suspense } from "react";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans-condensed/500.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import "./globals.css";
import { Nav } from "@/components/nav";
import { authMode, getCurrentUser } from "@/server/auth";
import { getRuntime } from "@/server/runtime";
import { UserSwitcher } from "@/components/user-switcher";

export const metadata: Metadata = {
  title: { default: "Pipeline", template: "%s · CRM" },
  description: "Business development pipeline connected to Vista",
};

async function NavWithCount() {
  const { repo } = await getRuntime();
  const needsAttention = (await repo.outbox.list({ statuses: ["DEAD"], limit: 100 })).length;
  return <Nav needsAttention={needsAttention} />;
}

async function TopBar() {
  const user = await getCurrentUser();
  const { repo, config } = await getRuntime();
  const users = authMode() === "dev" ? await repo.users.list() : [];
  return (
    <>
      <span className="mr-auto text-muted">
        Vista company <span className="figures text-ink">{config.vistaCompany}</span>
      </span>
      {users.length > 0 ? (
        <UserSwitcher
          users={users.map((u) => ({ email: u.email, label: `${u.name} (${u.role.toLowerCase()})` }))}
          current={user.email}
        />
      ) : (
        <span>{user.name}</span>
      )}
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen md:flex">
        <Suspense fallback={<div aria-hidden className="bg-ink md:min-h-screen md:w-52 md:shrink-0" />}>
          <NavWithCount />
        </Suspense>
        <div className="min-w-0 flex-1">
          <header className="flex min-h-12 flex-wrap items-center justify-end gap-3 border-b border-line bg-surface px-6 py-2.5 text-sm">
            <Suspense fallback={null}>
              <TopBar />
            </Suspense>
          </header>
          <main className="mx-auto max-w-[1440px] px-6 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
