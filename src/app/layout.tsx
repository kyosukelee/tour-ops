import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tour-ops 観光手配案件管理",
  description: "旅行会社から受けた手配依頼を、引合から精算まで追う案件管理アプリ(デモ)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
