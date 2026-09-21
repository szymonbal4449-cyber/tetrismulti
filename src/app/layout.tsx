import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TETRA ARENA — Tetris multiplayer online",
  description:
    "Tetris multiplayer dla 2-4 graczy: tryb walki i tryb współpracy. Utwórz pokój, wyślij kod znajomym i grajcie online.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="crt font-body antialiased">{children}</body>
    </html>
  );
}
