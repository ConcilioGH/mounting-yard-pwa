import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { AppNav } from "@/components/app-nav";
import { AppProviders } from "@/app/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Mounting Yard",
  title: { default: "Mounting Yard", template: "%s · Mounting Yard" },
  description: "iPad mounting yard assessments with offline storage and CSV tools.",
  icons: {
    icon: [{ url: "/icon", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mounting Yard",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script src="/ios12-bootstrap.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-[100dvh] bg-slate-950 text-slate-100">
        <AppProviders>
          <AppNav />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
