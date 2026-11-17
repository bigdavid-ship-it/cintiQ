import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { SplashScreen } from "@/components/brand/splash-screen";
import { PwaRegister } from "@/components/pwa/pwa-register";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });

export const metadata: Metadata = {
  title: { default: "cintiQ – Your Campus. Your Marketplace.", template: "%s · cintiQ" },
  description: "Buy and sell with verified student entrepreneurs and local businesses around your university.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/cintiq-logo.png", apple: "/cintiq-logo.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "cintiQ" },
};

export const viewport: Viewport = {
  themeColor: "#0e5c63",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable}`}>
      <body className="flex min-h-screen flex-col pb-16 md:pb-0">
        <SplashScreen />
        <Suspense><NavigationProgress /></Suspense>
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        <MobileNav />
        <PwaRegister />
      </body>
    </html>
  );
}
