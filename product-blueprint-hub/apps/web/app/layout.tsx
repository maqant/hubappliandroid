import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/i18n";

export const metadata: Metadata = {
  title: "Product Blueprint Hub",
  description:
    "Transform ideas into structured, governed, and traceable software project blueprints.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
