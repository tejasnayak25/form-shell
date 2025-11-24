import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Form Shell",
  description: "A simple and secure way to share forms with your students.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <Script id="disable-devtool-marker" strategy="beforeInteractive">
          {`(function(){var el=document.createElement('div');el.setAttribute('disable-devtool-auto','');document.documentElement.appendChild(el)})();`}
        </Script>
        <Script src="https://cdn.jsdelivr.net/npm/disable-devtool" strategy="beforeInteractive" />

        {children}
      </body>
    </html>
  );
}
