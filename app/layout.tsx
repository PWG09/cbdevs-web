import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "CBDEVS — Desarrollo web para negocios", description: "Sitios web y soluciones digitales profesionales para negocios." };

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="es"><body>{children}</body></html>; }
