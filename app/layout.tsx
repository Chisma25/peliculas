import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";

import "./globals.css";

import { SiteHeader } from "@/components/site-header";
import { DataUnavailableError } from "@/lib/data-availability";
import { getDeploymentVersion } from "@/lib/deployment-version";
import { getSessionUser } from "@/lib/store";
import type { User } from "@/lib/types";

const interfaceFont = Geist({
  subsets: ["latin"],
  variable: "--font-cinema-sans",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Cine semanal",
  description: "App privada para recomendar, elegir y puntuar películas en grupo."
};

export const preferredRegion = "fra1";

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  let user: User | null = null;
  try {
    user = await getSessionUser();
  } catch (error) {
    if (!(error instanceof DataUnavailableError)) {
      throw error;
    }
  }
  const deploymentVersion = getDeploymentVersion();

  return (
    <html lang="es" className={interfaceFont.variable}>
      <body>
        <div className="app-shell">
          <div className="ambient ambient-one" />
          <div className="ambient ambient-two" />
          <SiteHeader user={user} deploymentVersion={deploymentVersion} />
          <main className="page-shell">{children}</main>
        </div>
      </body>
    </html>
  );
}
