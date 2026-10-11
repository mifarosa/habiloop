import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Habiloop",
  description: "Aralıklı alışkanlık takibi: ideal gün, son gün, hatırlatma.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Habiloop", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#3b5bdb", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-dvh">
        <header className="mx-auto flex max-w-xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-semibold">
            🔁 Habiloop
          </Link>
          <Link href="/settings" className="text-sm text-muted hover:text-text">
            Ayarlar
          </Link>
        </header>
        <main className="mx-auto max-w-xl px-4 pb-16">{children}</main>
      </body>
    </html>
  );
}
