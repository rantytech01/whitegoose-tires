import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhiteGoose Tires | Drive with Confidence",
  description: "New and used tires, rims and accessories across Kenya.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-ink font-body antialiased">{children}</body>
    </html>
  );
}
