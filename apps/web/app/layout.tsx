import type { Metadata } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "700", "800"],
});

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Notempus App",
  description: "One app for matching, live sessions, wallets, and trust workflows",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        <Script id="performance-clear-shim" strategy="beforeInteractive">
          {`(function(){try{if(typeof window==='undefined'){return;}var perf=window.performance;if(!perf){return;}var ensureFn=function(name){if(typeof perf[name]==='function'){return;}var noop=function(){};try{perf[name]=noop;return;}catch(_e){}try{Object.defineProperty(perf,name,{value:noop,configurable:true,writable:true});}catch(_e2){}};ensureFn('clearMarks');ensureFn('clearMeasures');}catch(_e3){}})();`}
        </Script>
        {children}
      </body>
    </html>
  );
}
