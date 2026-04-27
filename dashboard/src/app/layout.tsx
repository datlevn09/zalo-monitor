import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zalo Monitor",
  description: "AI Chat Monitoring Dashboard",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

// Chạy trước khi render — tránh flash khi chọn dark
const themeInit = `(function(){
  try {
    var t = localStorage.getItem('theme') || 'system';
    var isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
    // Follow system change when mode=system
    if (t === 'system' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e){
        if ((localStorage.getItem('theme') || 'system') === 'system') {
          document.documentElement.classList.toggle('dark', e.matches);
        }
      });
    }
  } catch(e){}
})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
