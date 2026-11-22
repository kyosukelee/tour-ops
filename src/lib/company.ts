// 自社(手配を出す側)の情報。PDF のフッターやメールの署名に使う
// デモでは架空の会社。本番で使うときは環境変数で上書きする
export const COMPANY = {
  name: process.env.COMPANY_NAME ?? "デモ観光手配株式会社",
  department: process.env.COMPANY_DEPARTMENT ?? "手配センター",
  tel: process.env.COMPANY_TEL ?? "000-0000-0001",
  fax: process.env.COMPANY_FAX ?? "000-0000-0002",
  email: process.env.COMPANY_EMAIL ?? "arrange@tour-ops.example",
};
