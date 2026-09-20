import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk, JetBrains_Mono, Caveat } from "next/font/google";
import { CinematicBackdrop } from "@/components/cinematic-backdrop";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--ff-sans", display: "swap" });
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--ff-display",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--ff-mono",
  display: "swap",
});
const hand = Caveat({ subsets: ["latin"], variable: "--ff-hand", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "SIGNUM · Consola de gestión documental y firma digital",
    template: "%s · SIGNUM",
  },
  description:
    "Consola segura de gestión documental: redacción con espacio de firma reservado, firma digital certificada con sello SHA-256, distribución a entornos y auditoría encadenada.",
  appleWebApp: {
    capable: true,
    title: "SIGNUM",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#04060b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${sans.variable} ${display.variable} ${mono.variable} ${hand.variable}`}
    >
      <body className="font-sans antialiased">
        <CinematicBackdrop />
        {children}
      </body>
    </html>
  );
}
