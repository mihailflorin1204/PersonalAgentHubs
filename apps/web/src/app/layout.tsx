import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "AgentHub",
  description: "Sign in and create an organization.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
