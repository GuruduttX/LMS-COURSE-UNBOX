import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { getTheme } from "@/lib/theme-server";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Course Unbox — Live online marketing courses with certificate",
    template: "%s | Course Unbox",
  },
  description:
    "Cohort-based online programs in performance marketing, SEO, AEO, GEO and AI — taught by working practitioners, built on real projects, with placement support.",
};

/**
 * `data-theme` is rendered server-side from the cookie, which is the whole
 * anti-flash strategy: the attribute is in the very first byte of HTML, and
 * "system" is resolved by a media query in globals.css rather than by script.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await getTheme();

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
