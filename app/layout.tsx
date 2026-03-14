import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/store";

export const metadata: Metadata = {
  title: "Cine semanal",
  description: "App privada para recomendar, elegir y puntuar películas en grupo."
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getSessionUser();

  return (
    <html lang="es">
      <body>
        <div className="app-shell">
          <div className="ambient ambient-one" />
          <div className="ambient ambient-two" />
          <SiteHeader user={user} />
          <main className="page-shell">{children}</main>
        </div>
      </body>
    </html>
  );
}
