import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono, Outfit } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body-family",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-family",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display-family",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Aruviah",
    template: "%s · Aruviah",
  },
  description:
    "Discover hundreds of products flowing past you — electronics, home, beauty, fashion, and more.",
  openGraph: {
    title: "Aruviah",
    description:
      "Discover hundreds of products flowing past you — electronics, home, beauty, fashion, and more.",
    siteName: "Aruviah",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8F6" },
    { media: "(prefers-color-scheme: dark)", color: "#111815" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${ibmPlexMono.variable} ${outfit.variable} font-body antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
