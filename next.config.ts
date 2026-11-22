import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Vercel 以外(コンテナ)でも動かせるよう、必要なファイルだけをまとめて出力する
  output: "standalone",
  // このフォルダをプロジェクトの起点にする(上の階層の package-lock.json を見に行かない)
  outputFileTracingRoot: path.join(__dirname),
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
