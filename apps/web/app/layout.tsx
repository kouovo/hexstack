import { publicEnvScript } from "@app/env/client";
import type { Metadata } from "next";
import Script from "next/script";
import { connection } from "next/server";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "App",
  description: "Template frontend",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Resolve public config on the running server, never during static prerendering.
  await connection();
  return (
    <html lang="en">
      <head>
        <Script id="app-public-env" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: publicEnvScript() }} />
      </head>
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
