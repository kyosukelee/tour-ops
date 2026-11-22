// PDF 用の日本語フォント(Noto Sans JP、SIL Open Font License)
// npm パッケージの TTF を使う。next.config.ts の outputFileTracingIncludes で本番の出力にも含める
import path from "node:path";
import { Font } from "@react-pdf/renderer";

const FONT_DIR = path.join(process.cwd(), "node_modules", "@expo-google-fonts", "noto-sans-jp");
export const PDF_FONT = "NotoSansJP";

let registered = false;

export function registerPdfFonts() {
  if (registered) return;
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: path.join(FONT_DIR, "400Regular", "NotoSansJP_400Regular.ttf"), fontWeight: "normal" },
      { src: path.join(FONT_DIR, "700Bold", "NotoSansJP_700Bold.ttf"), fontWeight: "bold" },
    ],
  });
  // 日本語は単語の区切りがないので、1文字ずつ改行できるようにする(英数字の単語はそのまま)
  Font.registerHyphenationCallback((word) =>
    /[　-ヿ㐀-鿿＀-￯]/.test(word) ? Array.from(word).flatMap((ch) => [ch, ""]) : [word],
  );
  registered = true;
}
