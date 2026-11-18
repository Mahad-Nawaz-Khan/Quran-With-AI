import type { Metadata } from "next";
import { Inter, Amiri } from "next/font/google";
import "./globals.css";
import ChatWidget from "./components/ChatWidget";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const amiri = Amiri({
  weight: ["400", "700"],
  subsets: ["arabic"],
  variable: "--font-arabic",
});

export const metadata: Metadata = {
  title: "Quran AI - Read, Listen & Understand",
  description: "The Noble Quran with translations, audio recitations, and AI-powered explanations",
};

const THEME_INIT_SCRIPT = `(function(){var r=document.documentElement;var t=null;try{t=localStorage.getItem('theme');if(typeof t==='string'){t=t.trim();if(t.charAt(0)==='"'&&t.charAt(t.length-1)==='"'){try{var pt=JSON.parse(t);if(typeof pt==='string')t=pt;}catch(e){}}}}catch(e){}if(t==='light'){r.classList.remove('dark');r.style.colorScheme='light';}else{r.classList.add('dark');r.style.colorScheme='dark';}var l=null;try{l=localStorage.getItem('quran-language');if(typeof l==='string'){l=l.trim();if(l.charAt(0)==='"'&&l.charAt(l.length-1)==='"'){try{var pl=JSON.parse(l);if(typeof pl==='string')l=pl;}catch(e){}}}}catch(e){}if(l==='en'||l==='ar'||l==='ur'||l==='id'||l==='tr'){r.lang=l;r.dir=l==='ar'||l==='ur'?'rtl':'ltr';}else{r.dir='ltr';}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${inter.variable} ${amiri.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased min-h-screen bg-background text-foreground">
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
