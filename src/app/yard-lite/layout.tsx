import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Yard Lite",
  description: "iOS 12 compatible mounting yard assessments",
};

export default function YardLiteLayout({ children }: { children: ReactNode }) {
  return children;
}
