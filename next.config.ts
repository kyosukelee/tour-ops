import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // 添付ファイル(4MBまで)を Server Action で受け取るため。Vercel の受信上限 4.5MB に収まる大きさ
    serverActions: { bodySizeLimit: "4.4mb" },
  },
  // Vercel 以外(コンテナ)でも動かせるよう、必要なファイルだけをまとめて出力する
  output: "standalone",
  // このフォルダをプロジェクトの起点にする(上の階層の package-lock.json を見に行かない)
  outputFileTracingRoot: path.join(__dirname),
  // PDF 用の日本語フォント(node_modules の TTF を実行時に読む)を本番の出力にも含める
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf",
      "./node_modules/@expo-google-fonts/noto-sans-jp/700Bold/NotoSansJP_700Bold.ttf",
    ],
  },
  // 使わない太さのフォントは含めない(関数のサイズを小さく保つ)
  outputFileTracingExcludes: {
    "/**/*": [
      "./node_modules/@expo-google-fonts/noto-sans-jp/{100Thin,200ExtraLight,300Light,500Medium,600SemiBold,800ExtraBold,900Black}/**",
      "./node_modules/@expo-google-fonts/noto-sans-jp/**/*.png",
    ],
  },
  // PDF 生成ライブラリはバンドルせず、Node.js からそのまま読み込む
  serverExternalPackages: ["@react-pdf/renderer"],
  turbopack: {
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
