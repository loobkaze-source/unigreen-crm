import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import { PinchZoomSnapBack } from "@/components/app/pinch-zoom-snapback";

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-thai",
  display: "swap",
});

/**
 * Spelled out rather than left to the default, because PinchZoomSnapBack
 * rewrites this tag to pull a pinched page back to size and has to put back
 * exactly what was here.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Unicloud CRM",
  description: "ระบบ CRM สำหรับทีมขายและบริการ Unicloud",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${notoThai.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before paint so dark mode never flashes light. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full">
        <PinchZoomSnapBack />
        {children}
      </body>
    </html>
  );
}
