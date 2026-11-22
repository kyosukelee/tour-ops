// デモ用の架空データ。日付はすべて「今日」からの相対日で作り、いつ開いても
// 「今週出発」「期限超過」などが表示されるようにする。会社名はすべて架空。人名は「デモ 太郎」のような、ひと目で仮名とわかる名前にする。
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "./types";
import { hashPassword } from "better-auth/crypto";
import * as s from "./schema";
import { addDays, tokyoDateTime } from "../lib/dates";
import type { ArrangementStatus, ProjectStatus } from "../lib/status";

export type SeedDb = Db;

type Category = (typeof s.arrangementCategory.enumValues)[number];

// ---------- マスタ ----------

const USERS = [
  { key: "admin", name: "デモ 花子", email: "admin@tour-ops.example", role: "admin" },
  { key: "staff1", name: "デモ 太郎", email: "staff1@tour-ops.example", role: "staff" },
  { key: "staff2", name: "デモ 次郎", email: "staff2@tour-ops.example", role: "staff" },
] as const;
type UserKey = (typeof USERS)[number]["key"];

const AGENCIES = {
  aozora: {
    name: "青空トラベル株式会社",
    contactName: "デモ 一郎",
    email: "group@aozora-travel.example",
    phone: "000-1111-0001",
    fax: "000-1111-0002",
    note: "国内の団体旅行が中心",
  },
  mirai: {
    name: "ミライツーリスト株式会社",
    contactName: "デモ 桜子",
    email: "school@mirai-tourist.example",
    phone: "000-2222-0001",
    fax: "000-2222-0002",
    note: "教育旅行(修学旅行・校外学習)",
  },
  gtj: {
    name: "Global Trail Japan",
    contactName: "Demo Contact",
    email: "ops@globaltrail.example",
    phone: "000-3333-0001",
    fax: null,
    note: "インバウンド(英語圏・韓国)",
  },
} as const;
type AgencyKey = keyof typeof AGENCIES;

const SUPPLIERS: Record<
  string,
  { name: string; category: Category; email: string | null; fax: string | null; policy: string }
> = {
  shiokaze: { name: "ホテル潮風", category: "lodging", email: "group@shiokaze.example", fax: "000-4000-0001", policy: "14日前から20%、7日前から50%" },
  tsubaki: { name: "旅館 つばき荘", category: "lodging", email: null, fax: "000-4000-0002", policy: "10日前から30%" },
  ark: { name: "シティホテル アーク", category: "lodging", email: "sales@ark-hotel.example", fax: null, policy: "7日前から30%" },
  aoba: { name: "青葉観光バス", category: "bus", email: null, fax: "000-4100-0001", policy: "14日前から20%" },
  minato: { name: "みなと交通 貸切部", category: "bus", email: "charter@minato.example", fax: "000-4100-0002", policy: "10日前から20%" },
  sakura: { name: "さくら観光タクシー", category: "taxi", email: "tour@sakura-taxi.example", fax: "000-4200-0001", policy: "前日から50%" },
  chuo: { name: "中央タクシー", category: "taxi", email: null, fax: "000-4200-0002", policy: "当日100%" },
  kotoba: { name: "通訳ガイド事務所 ことば", category: "guide", email: "booking@kotoba-guide.example", fax: null, policy: "3日前から50%" },
  irori: { name: "和食処 いろり", category: "meal", email: null, fax: "000-4400-0001", policy: "3日前から人数変更不可" },
  breeze: { name: "レストラン ブリーズ", category: "meal", email: "group@breeze.example", fax: null, policy: "前日から100%" },
  midori: { name: "みどり歴史資料館", category: "admission", email: null, fax: "000-4500-0001", policy: "取消料なし" },
  akane: { name: "体験工房 あかね", category: "admission", email: "reserve@akane-kobo.example", fax: null, policy: "5日前から30%" },
  hokuto: { name: "北斗レンタル", category: "other", email: "rental@hokuto.example", fax: null, policy: "取消料なし" },
};
type SupplierKey = keyof typeof SUPPLIERS;

// ---------- 案件 ----------

type ArrSpec = {
  cat: Category;
  sup: SupplierKey;
  day: number; // 出発日からの日数
  time?: string;
  desc: string;
  qty: number;
  cost: number; // 単価(原価)
  price: number; // 単価(販売)
  status: ArrangementStatus;
  reply?: number; // 回答期限(今日からの日数)
  cancelFrom?: number; // 取消料発生日(出発日からの日数、負の値)
  conf?: string;
  meet?: string;
  actual?: number; // 精算額
  invoice?: boolean;
  cancelFee?: number;
};

type ProjectSpec = {
  title: string;
  agency: AgencyKey;
  status: ProjectStatus;
  start: number; // 今日からの日数
  nights: number;
  adult: number;
  child: number;
  lang: string;
  owner: UserKey;
  note?: string;
  arrs: ArrSpec[];
};

const PROJECTS: ProjectSpec[] = [
  {
    title: "社員旅行 1泊2日",
    agency: "aozora", status: "inquiry", start: 45, nights: 1, adult: 32, child: 0, lang: "日本語", owner: "staff1",
    note: "予算は1人3万円前後。宿は大浴場ありが希望",
    arrs: [
      { cat: "lodging", sup: "shiokaze", day: 0, desc: "1泊2食付き 和室", qty: 32, cost: 12000, price: 14000, status: "pending" },
      { cat: "bus", sup: "aoba", day: 0, time: "08:00", desc: "大型バス 2日間", qty: 1, cost: 180000, price: 210000, status: "pending" },
    ],
  },
  {
    title: "高校2年 修学旅行(平和学習コース)",
    agency: "mirai", status: "quoting", start: 30, nights: 2, adult: 128, child: 0, lang: "日本語", owner: "staff2",
    arrs: [
      { cat: "lodging", sup: "ark", day: 0, desc: "2泊 朝食付き 4名1室", qty: 256, cost: 8000, price: 9200, status: "requested", reply: 2, cancelFrom: -14 },
      { cat: "bus", sup: "minato", day: 0, time: "09:30", desc: "大型バス4台 3日間", qty: 4, cost: 270000, price: 310000, status: "requested", reply: 1, cancelFrom: -14 },
      { cat: "guide", sup: "kotoba", day: 1, time: "09:00", desc: "語り部・平和学習ガイド", qty: 4, cost: 25000, price: 30000, status: "pending" },
      { cat: "meal", sup: "irori", day: 1, time: "12:00", desc: "昼食 弁当", qty: 128, cost: 1200, price: 1500, status: "pending" },
    ],
  },
  {
    title: "海外団体 3日間 歴史と食のツアー",
    agency: "gtj", status: "quoted", start: 21, nights: 2, adult: 18, child: 0, lang: "英語", owner: "staff1",
    arrs: [
      { cat: "lodging", sup: "ark", day: 0, desc: "2泊 朝食付き ツイン", qty: 36, cost: 11000, price: 13500, status: "tentative", reply: 5, cancelFrom: -7 },
      { cat: "bus", sup: "minato", day: 0, time: "10:00", desc: "中型バス 3日間", qty: 1, cost: 210000, price: 245000, status: "tentative", reply: 5, cancelFrom: -10 },
      { cat: "guide", sup: "kotoba", day: 0, time: "10:00", desc: "英語通訳ガイド 3日間", qty: 3, cost: 30000, price: 36000, status: "requested", reply: 3 },
      { cat: "meal", sup: "breeze", day: 1, time: "18:30", desc: "夕食 コース", qty: 18, cost: 5000, price: 6000, status: "pending" },
    ],
  },
  {
    title: "企業研修 日帰りバスツアー",
    agency: "aozora", status: "lost", start: 14, nights: 0, adult: 40, child: 0, lang: "日本語", owner: "staff2",
    note: "他社の見積に決まったため失注",
    arrs: [
      { cat: "bus", sup: "aoba", day: 0, time: "08:30", desc: "大型バス 1日", qty: 1, cost: 95000, price: 110000, status: "cancelled" },
      { cat: "meal", sup: "irori", day: 0, time: "12:00", desc: "昼食 御膳", qty: 40, cost: 2500, price: 3000, status: "cancelled" },
    ],
  },
  {
    title: "韓国団体 2泊3日 温泉と街歩き",
    agency: "gtj", status: "arranging", start: 10, nights: 2, adult: 24, child: 0, lang: "韓国語", owner: "staff2",
    arrs: [
      { cat: "lodging", sup: "tsubaki", day: 0, desc: "2泊2食付き 和室", qty: 48, cost: 13000, price: 15500, status: "confirmed", cancelFrom: -10, conf: "TB-2231" },
      { cat: "bus", sup: "aoba", day: 0, time: "11:00", desc: "中型バス 3日間", qty: 1, cost: 200000, price: 235000, status: "confirmed", cancelFrom: -14, conf: "AB-5520", meet: "空港 到着ロビー" },
      { cat: "guide", sup: "kotoba", day: 0, time: "11:00", desc: "韓国語通訳ガイド 3日間", qty: 3, cost: 30000, price: 36000, status: "requested", reply: -1 },
      { cat: "meal", sup: "breeze", day: 1, time: "12:00", desc: "昼食 ランチコース", qty: 24, cost: 2800, price: 3400, status: "requested", reply: 2 },
      { cat: "taxi", sup: "sakura", day: 1, time: "13:30", desc: "観光タクシー オプショナル 2台 4時間", qty: 2, cost: 30000, price: 35000, status: "requested", reply: 1, meet: "旅館 つばき荘 玄関" },
      { cat: "admission", sup: "akane", day: 2, time: "10:00", desc: "工芸体験", qty: 24, cost: 2000, price: 2500, status: "pending" },
    ],
  },
  {
    title: "中学校 校外学習",
    agency: "mirai", status: "arranging", start: 5, nights: 0, adult: 96, child: 0, lang: "日本語", owner: "staff1",
    arrs: [
      { cat: "bus", sup: "minato", day: 0, time: "08:15", desc: "大型バス3台 1日", qty: 3, cost: 90000, price: 105000, status: "confirmed", cancelFrom: -10, conf: "MT-0917", meet: "学校 正門前" },
      { cat: "admission", sup: "midori", day: 0, time: "10:00", desc: "団体入館 解説付き", qty: 96, cost: 500, price: 700, status: "tentative", reply: 0 },
      { cat: "meal", sup: "irori", day: 0, time: "12:00", desc: "昼食 弁当", qty: 96, cost: 1000, price: 1300, status: "requested", reply: 1, cancelFrom: -3 },
      { cat: "guide", sup: "kotoba", day: 0, time: "09:30", desc: "学習ガイド", qty: 3, cost: 20000, price: 24000, status: "confirmed", conf: "KG-118" },
    ],
  },
  {
    title: "シニア旅行会 1泊2日",
    agency: "aozora", status: "arranged", start: 3, nights: 1, adult: 26, child: 0, lang: "日本語", owner: "staff1",
    arrs: [
      { cat: "lodging", sup: "shiokaze", day: 0, desc: "1泊2食付き 和室", qty: 26, cost: 13500, price: 15800, status: "confirmed", cancelFrom: -14, conf: "SK-7781" },
      { cat: "bus", sup: "aoba", day: 0, time: "08:30", desc: "大型バス 2日間", qty: 1, cost: 180000, price: 210000, status: "confirmed", cancelFrom: -14, conf: "AB-5602", meet: "駅前 ロータリー" },
      { cat: "meal", sup: "irori", day: 0, time: "12:00", desc: "昼食 御膳", qty: 26, cost: 2500, price: 3000, status: "confirmed", cancelFrom: -3, conf: "IR-33" },
      { cat: "meal", sup: "breeze", day: 1, time: "12:00", desc: "昼食 ランチ", qty: 26, cost: 2200, price: 2700, status: "confirmed", conf: "BR-901" },
      { cat: "admission", sup: "midori", day: 1, time: "10:00", desc: "団体入館", qty: 26, cost: 500, price: 700, status: "confirmed", conf: "MD-55" },
    ],
  },
  {
    title: "海外VIP 観光タクシーで巡る2日間",
    agency: "gtj", status: "arranged", start: 20, nights: 1, adult: 4, child: 0, lang: "英語", owner: "staff2",
    arrs: [
      { cat: "lodging", sup: "ark", day: 0, desc: "1泊 朝食付き スイート", qty: 2, cost: 45000, price: 55000, status: "confirmed", cancelFrom: -7, conf: "AK-1204" },
      { cat: "taxi", sup: "sakura", day: 0, time: "10:00", desc: "観光タクシー 1台 8時間", qty: 1, cost: 56000, price: 65000, status: "confirmed", cancelFrom: -1, conf: "ST-2045", meet: "シティホテル アーク ロビー" },
      { cat: "taxi", sup: "sakura", day: 1, time: "09:00", desc: "観光タクシー 1台 6時間", qty: 1, cost: 42000, price: 49000, status: "confirmed", cancelFrom: -1, conf: "ST-2046", meet: "シティホテル アーク ロビー" },
      { cat: "guide", sup: "kotoba", day: 0, time: "10:00", desc: "英語通訳ガイド 2日間", qty: 2, cost: 35000, price: 42000, status: "confirmed", conf: "KG-130" },
      { cat: "meal", sup: "breeze", day: 0, time: "19:00", desc: "夕食 個室コース", qty: 4, cost: 12000, price: 15000, status: "confirmed", conf: "BR-915" },
    ],
  },
  {
    title: "親子体験ツアー 2泊3日",
    agency: "aozora", status: "operating", start: -1, nights: 2, adult: 12, child: 10, lang: "日本語", owner: "staff2",
    arrs: [
      { cat: "lodging", sup: "shiokaze", day: 0, desc: "2泊2食付き 和洋室", qty: 44, cost: 11000, price: 13000, status: "confirmed", conf: "SK-7690" },
      { cat: "bus", sup: "minato", day: 0, time: "09:00", desc: "中型バス 3日間", qty: 1, cost: 210000, price: 245000, status: "confirmed", conf: "MT-0870" },
      { cat: "admission", sup: "akane", day: 1, time: "10:00", desc: "ものづくり体験", qty: 22, cost: 1800, price: 2200, status: "confirmed", conf: "AK-77" },
      { cat: "other", sup: "hokuto", day: 1, desc: "雨具レンタル", qty: 22, cost: 300, price: 400, status: "confirmed", conf: "HR-12" },
    ],
  },
  {
    title: "大学ゼミ合宿 2泊3日",
    agency: "mirai", status: "settling", start: -12, nights: 2, adult: 22, child: 0, lang: "日本語", owner: "staff1",
    arrs: [
      { cat: "lodging", sup: "tsubaki", day: 0, desc: "2泊2食付き 会議室付き", qty: 44, cost: 10000, price: 11800, status: "confirmed", conf: "TB-2150", actual: 440000, invoice: true },
      { cat: "bus", sup: "aoba", day: 0, time: "08:00", desc: "中型バス 往復", qty: 1, cost: 150000, price: 175000, status: "confirmed", conf: "AB-5410", actual: 158000, invoice: true },
      { cat: "meal", sup: "irori", day: 2, time: "12:00", desc: "昼食 御膳", qty: 22, cost: 2500, price: 3000, status: "confirmed", conf: "IR-21" },
    ],
  },
  {
    title: "秋の紅葉ツアー 1泊2日",
    agency: "aozora", status: "completed", start: -40, nights: 1, adult: 30, child: 0, lang: "日本語", owner: "staff1",
    arrs: [
      { cat: "lodging", sup: "shiokaze", day: 0, desc: "1泊2食付き 和室", qty: 30, cost: 13000, price: 15200, status: "confirmed", conf: "SK-7311", actual: 390000, invoice: true },
      { cat: "bus", sup: "aoba", day: 0, time: "08:00", desc: "大型バス 2日間", qty: 1, cost: 180000, price: 210000, status: "confirmed", conf: "AB-5180", actual: 180000, invoice: true },
      { cat: "meal", sup: "breeze", day: 1, time: "12:00", desc: "昼食 ランチ", qty: 30, cost: 2200, price: 2700, status: "confirmed", conf: "BR-820", actual: 66000, invoice: true },
    ],
  },
  {
    title: "インセンティブ旅行 2泊3日",
    agency: "gtj", status: "cancelled", start: 12, nights: 2, adult: 30, child: 0, lang: "英語", owner: "staff2",
    note: "依頼元の都合で催行中止。取消料は依頼元へ請求する",
    arrs: [
      { cat: "lodging", sup: "shiokaze", day: 0, desc: "2泊 朝食付き ツイン", qty: 60, cost: 12000, price: 14500, status: "cancelled", cancelFrom: -14, conf: "SK-7740", cancelFee: 144000 },
      { cat: "bus", sup: "minato", day: 0, time: "10:00", desc: "大型バス 3日間", qty: 1, cost: 270000, price: 310000, status: "cancelled", cancelFrom: -10, conf: "MT-0901" },
      { cat: "guide", sup: "kotoba", day: 0, time: "10:00", desc: "英語通訳ガイド 3日間", qty: 3, cost: 30000, price: 36000, status: "cancelled", cancelFrom: -3, conf: "KG-125" },
    ],
  },
];

// 案件ステータスまでの道のり(変更履歴の作成用)
function statusPath(status: ProjectStatus): ProjectStatus[] {
  const main: ProjectStatus[] = [
    "inquiry", "quoting", "quoted", "arranging", "arranged", "operating", "settling", "completed",
  ];
  if (status === "lost") return ["inquiry", "quoting", "quoted", "lost"];
  if (status === "cancelled") return ["inquiry", "quoting", "quoted", "arranging", "arranged", "cancelled"];
  return main.slice(0, main.indexOf(status) + 1);
}

const PRE_ORDER: readonly ProjectStatus[] = ["inquiry", "quoting", "quoted", "lost"];

// ---------- 実行 ----------

export const ALL_TABLE_NAMES = [
  "audit_logs", "status_history", "comments", "tasks", "attachments", "request_items",
  "supplier_requests", "arrangements", "projects", "suppliers", "agencies",
  "verification", "account", "session", "user",
] as const;

export async function resetAll(db: SeedDb) {
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${ALL_TABLE_NAMES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`),
  );
}

export async function seedDemoData(db: SeedDb, opts: { today: string; password: string }) {
  const { today } = opts;
  const at = (offset: number, time = "09:00") => tokyoDateTime(addDays(today, offset), time);

  // 担当者とログイン情報(Better Auth の credential アカウント)
  const passwordHash = await hashPassword(opts.password);
  const userIds = {} as Record<UserKey, string>;
  for (const u of USERS) {
    const id = randomUUID();
    userIds[u.key] = id;
    await db.insert(s.users).values({ id, name: u.name, email: u.email, role: u.role, emailVerified: true });
    await db.insert(s.accounts).values({
      id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: passwordHash,
    });
  }

  const agencyRows = await db
    .insert(s.agencies)
    .values(Object.values(AGENCIES).map((a) => ({ ...a })))
    .returning({ id: s.agencies.id, name: s.agencies.name });
  const agencyIds = Object.fromEntries(
    (Object.keys(AGENCIES) as AgencyKey[]).map((k) => [k, agencyRows.find((r) => r.name === AGENCIES[k].name)!.id]),
  ) as Record<AgencyKey, string>;

  const supplierRows = await db
    .insert(s.suppliers)
    .values(
      Object.values(SUPPLIERS).map((v) => ({
        name: v.name, category: v.category, email: v.email, fax: v.fax,
        cancelPolicyNote: v.policy,
      })),
    )
    .returning({ id: s.suppliers.id, name: s.suppliers.name });
  const supplierIds = Object.fromEntries(
    Object.entries(SUPPLIERS).map(([k, v]) => [k, supplierRows.find((r) => r.name === v.name)!.id]),
  ) as Record<SupplierKey, string>;

  const year = today.slice(0, 4);
  let projectNo = 0;

  for (const p of PROJECTS) {
    projectNo += 1;
    const startDate = addDays(today, p.start);
    const [project] = await db
      .insert(s.projects)
      .values({
        code: `T-${year}-${String(projectNo).padStart(4, "0")}`,
        title: p.title,
        agencyId: agencyIds[p.agency],
        status: p.status,
        startDate,
        endDate: addDays(startDate, p.nights),
        paxAdult: p.adult,
        paxChild: p.child,
        language: p.lang,
        ownerUserId: userIds[p.owner],
        note: p.note ?? null,
      })
      .returning({ id: s.projects.id });

    // 変更履歴: 3日おきに1段ずつ進んだことにする
    const path = statusPath(p.status);
    await db.insert(s.statusHistory).values(
      path.map((to, i) => ({
        projectId: project.id,
        fromStatus: i === 0 ? null : path[i - 1],
        toStatus: to,
        changedBy: userIds[p.owner],
        changedAt: at(-3 * (path.length - i), "10:00"),
      })),
    );

    // 手配明細
    const arrRows = await db
      .insert(s.arrangements)
      .values(
        p.arrs.map((a) => ({
          projectId: project.id,
          category: a.cat,
          serviceDate: addDays(startDate, a.day),
          serviceTime: a.time ?? null,
          supplierId: supplierIds[a.sup],
          description: a.desc,
          quantity: a.qty,
          unitCost: a.cost,
          unitPrice: a.price,
          status: a.status,
          replyDue: a.reply === undefined ? null : addDays(today, a.reply),
          cancelFeeFrom: a.cancelFrom === undefined ? null : addDays(startDate, a.cancelFrom),
          confirmationNo: a.conf ?? null,
          actualCost: a.actual ?? null,
          invoiceReceived: a.invoice ?? false,
          cancelFee: a.cancelFee ?? null,
          meetingPlace: a.meet ?? null,
        })),
      )
      .returning({ id: s.arrangements.id });
    const arrs = p.arrs.map((a, i) => ({ ...a, id: arrRows[i].id }));

    // 手配依頼: 依頼済みの手配を仕入先ごとにまとめる。受注前は「照会」、受注後は「手配」
    const requested = arrs.filter((a) => a.status !== "pending");
    const bySupplier = new Map<SupplierKey, typeof arrs>();
    for (const a of requested) bySupplier.set(a.sup, [...(bySupplier.get(a.sup) ?? []), a]);
    for (const [sup, items] of bySupplier) {
      const kind = PRE_ORDER.includes(p.status) ? "inquiry" : "booking";
      const method = SUPPLIERS[sup].email ? "email" : "fax";
      const sentOffset = Math.min(-2, p.start - 25);
      const [req] = await db
        .insert(s.supplierRequests)
        .values({ projectId: project.id, supplierId: supplierIds[sup], kind, method, sentAt: at(sentOffset, "14:00"), sentBy: userIds[p.owner] })
        .returning({ id: s.supplierRequests.id });
      await db.insert(s.requestItems).values(items.map((a) => ({ requestId: req.id, arrangementId: a.id })));

      // 失注・キャンセルの案件は取消依頼も送ってある
      const cancelled = items.filter((a) => a.status === "cancelled");
      if (cancelled.length > 0) {
        const [cancelReq] = await db
          .insert(s.supplierRequests)
          .values({ projectId: project.id, supplierId: supplierIds[sup], kind: "cancel", method, sentAt: at(-1, "11:00"), sentBy: userIds[p.owner] })
          .returning({ id: s.supplierRequests.id });
        await db.insert(s.requestItems).values(cancelled.map((a) => ({ requestId: cancelReq.id, arrangementId: a.id })));
      }
    }

    // 自動タスク: 回答期限と取消料発生日
    const terminal = p.status === "completed" || p.status === "lost" || p.status === "cancelled";
    const autoTasks = arrs.flatMap((a) => {
      const list: (typeof s.tasks.$inferInsert)[] = [];
      const supplierName = SUPPLIERS[a.sup].name;
      if (a.reply !== undefined) {
        list.push({
          projectId: project.id, arrangementId: a.id, title: `回答期限: ${supplierName}(${a.desc})`,
          dueDate: addDays(today, a.reply), assigneeUserId: userIds[p.owner], source: "auto", autoType: "reply_due",
          done: terminal || a.status === "confirmed" || a.status === "cancelled",
        });
      }
      if (a.cancelFrom !== undefined) {
        const due = addDays(startDate, a.cancelFrom);
        list.push({
          projectId: project.id, arrangementId: a.id, title: `取消料発生日: ${supplierName}(${a.desc})`,
          dueDate: due, assigneeUserId: userIds[p.owner], source: "auto", autoType: "cancel_fee",
          done: terminal || a.status === "cancelled" || due < today,
        });
      }
      return list;
    });
    if (autoTasks.length > 0) await db.insert(s.tasks).values(autoTasks);
  }

  // 手入力のタスクとコメント(いくつかの案件にだけ)
  const projectRows = await db.select({ id: s.projects.id, title: s.projects.title }).from(s.projects);
  const pid = (title: string) => projectRows.find((r) => r.title === title)!.id;

  await db.insert(s.tasks).values([
    { projectId: pid("韓国団体 2泊3日 温泉と街歩き"), title: "ガイド事務所へ回答の催促を電話する", dueDate: today, assigneeUserId: userIds.staff2 },
    { projectId: pid("大学ゼミ合宿 2泊3日"), title: "和食処 いろりの請求書を受け取り、精算額を入れる", dueDate: addDays(today, 2), assigneeUserId: userIds.staff1 },
    { projectId: pid("高校2年 修学旅行(平和学習コース)"), title: "見積書を作って依頼元へ送る", dueDate: addDays(today, 4), assigneeUserId: userIds.staff2 },
  ]);

  await db.insert(s.comments).values([
    { projectId: pid("韓国団体 2泊3日 温泉と街歩き"), body: "オプショナルの観光タクシーは参加者の確定待ち。2台で仮手配中。", authorUserId: userIds.staff2, createdAt: at(-2, "16:20") },
    { projectId: pid("インセンティブ旅行 2泊3日"), body: "依頼元から中止の連絡(FAX)。取消依頼を全仕入先へ送付済み。", authorUserId: userIds.staff2, createdAt: at(-1, "11:30") },
    { projectId: pid("シニア旅行会 1泊2日"), body: "車いす利用の方が1名。バス会社に伝達済み。", authorUserId: userIds.staff1, createdAt: at(-4, "09:45") },
  ]);

  await db.insert(s.auditLogs).values({ action: "system.seed", targetType: "database", changes: { today } });

  return { users: USERS.map((u) => ({ email: u.email, role: u.role })) };
}
