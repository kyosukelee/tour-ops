// 未ログインなら /login へ回す(Cookie の有無だけを見る簡易チェック)
// 本当の確認は、画面と Server Action の中で毎回 requireActor() が行う
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // ログイン画面・認証API・静的ファイル・定期処理のAPIは対象外
  matcher: ["/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
