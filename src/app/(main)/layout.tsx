import type { ReactNode } from "react";
import Script from "next/script";
import { AppNav } from "@/components/app-nav";
import { AppProviders } from "@/app/app-providers";
import { APP_BUILD_VERSION } from "@/lib/build-version";

export default function MainAppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <Script src={`/ios12-bootstrap.js?v=${APP_BUILD_VERSION}`} strategy="beforeInteractive" />
      <AppProviders>
        <AppNav />
        {children}
      </AppProviders>
    </div>
  );
}
