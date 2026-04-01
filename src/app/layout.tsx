import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FocusForge - AI 学习引擎",
  description: "AI 驱动的专注学习引擎，通过番茄工作法、概念拆解和互动测验提升学习效率",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
