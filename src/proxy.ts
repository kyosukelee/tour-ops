// 1. 公開デモのデータが古ければ作り直す(毎朝の処理が動かなかった日の予備。DEMO_RESET=true のときだけ)
// 2. 未ログインなら /login へ回す(Cookie の有無だけを見る簡易チェック)
//    本当の確認は、画面と Server Action の中で毎回 requireActor() が行う
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { ensureDemoIsFresh } from "@/server/demo-freshness";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) await ensureDemoIsFresh();
  if (pathname === "/login") return NextResponse.next();
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // 認証API・静的ファイル・定期処理のAPIは対象外
  matcher: ["/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
