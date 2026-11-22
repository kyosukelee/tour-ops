// 案件の PDF 3種
// - 案件票(社内控え): 原価・粗利・仕入先の連絡先・未完了のタスクまで載せる
// - 案件票(依頼元向け): 旅行会社への回答・確定連絡。原価・粗利・社内メモは載せない
// - 行程表: 添乗員・社内向けに、日別・時刻順の行程と集合場所・確定番号
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { COMPANY } from "@/lib/company";
import { ARRANGEMENT_STATUS_LABEL, CATEGORY_LABEL, PROJECT_STATUS_LABEL, type ArrangementCategory, type ArrangementStatus, type ProjectStatus } from "@/lib/status";
import { formatDate, formatDateRange, formatYen } from "@/lib/utils";
import { Cell, InfoTable, PdfFooter, PdfHeader, ps } from "./common";
import { registerPdfFonts } from "./fonts";

export const PROJECT_PDF_TYPES = ["internal", "agency", "itinerary"] as const;
export type ProjectPdfType = (typeof PROJECT_PDF_TYPES)[number];
export const PROJECT_PDF_TITLE: Record<ProjectPdfType, string> = {
  internal: "案件票(社内控え)",
  agency: "手配状況のご案内",
  itinerary: "行程表",
};

export type ProjectPdfData = {
  issuedAt: Date;
  project: {
    code: string;
    title: string;
    status: ProjectStatus;
    startDate: string;
    endDate: string;
    paxAdult: number;
    paxChild: number;
    language: string | null;
    note: string | null;
    ownerName: string | null;
    agencyName: string;
    agencyContact: string | null;
    agencyFax: string | null;
    agencyEmail: string | null;
  };
  arrangements: {
    serviceDate: string;
    serviceTime: string | null;
    category: ArrangementCategory;
    supplierName: string | null;
    description: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    actualCost: number | null;
    status: ArrangementStatus;
    confirmationNo: string | null;
    meetingPlace: string | null;
    cancelFee: number | null;
  }[];
  tasks: { title: string; dueDate: string; assigneeName: string | null }[];
  totals: { sales: number; cost: number; profit: number };
};

const pax = (p: ProjectPdfData["project"]) => `大人 ${p.paxAdult}名${p.paxChild > 0 ? ` ・ 子ども ${p.paxChild}名` : ""}`;
const time = (t: string | null) => (t ? t.slice(0, 5) : "");

function InternalSheet({ d }: { d: ProjectPdfData }) {
  const p = d.project;
  const W = { date: 50, cat: 50, sup: 70, desc: 99, qty: 28, st: 38, conf: 52, cost: 64, price: 64 }; // 計 515
  const margin = d.totals.sales > 0 ? `${((d.totals.profit / d.totals.sales) * 100).toFixed(1)}%` : "—";
  return (
    <Page size="A4" style={ps.page}>
      <PdfHeader left={`案件番号 ${p.code} ・ 社外秘`} issuedAt={d.issuedAt} />
      <Text style={ps.title}>{PROJECT_PDF_TITLE.internal}</Text>
      <InfoTable
        rows={[
          ["ツアー名", p.title],
          ["ステータス", PROJECT_STATUS_LABEL[p.status]],
          ["依頼元", `${p.agencyName}${p.agencyContact ? `(${p.agencyContact} 様)` : ""}${p.agencyFax ? ` FAX ${p.agencyFax}` : ""}`],
          ["日程", formatDateRange(p.startDate, p.endDate)],
          ["人数", pax(p)],
          ["案内言語", p.language ?? "—"],
          ["担当者", p.ownerName ?? "—"],
        ]}
      />

      <Text style={ps.sectionTitle}>手配明細</Text>
      <View style={ps.table}>
        <View style={ps.row} fixed>
          <Cell w={W.date} th>利用日時</Cell>
          <Cell w={W.cat} th>種別</Cell>
          <Cell w={W.sup} th>仕入先</Cell>
          <Cell w={W.desc} th>内容</Cell>
          <Cell w={W.qty} th>数量</Cell>
          <Cell w={W.st} th>状態</Cell>
          <Cell w={W.conf} th>確定番号</Cell>
          <Cell w={W.cost} th>原価計</Cell>
          <Cell w={W.price} th>販売計</Cell>
        </View>
        {d.arrangements.map((a, i) => {
          const cancelled = a.status === "cancelled";
          const cost = a.actualCost ?? a.unitCost * a.quantity;
          return (
            <View key={i} style={ps.row} wrap={false}>
              <Cell w={W.date}>{`${formatDate(a.serviceDate)}${a.serviceTime ? `\n${time(a.serviceTime)}` : ""}`}</Cell>
              <Cell w={W.cat}>{CATEGORY_LABEL[a.category]}</Cell>
              <Cell w={W.sup}>{a.supplierName ?? "未定"}</Cell>
              <Cell w={W.desc}>{`${cancelled ? "【取消】" : ""}${a.description}${cancelled && a.cancelFee != null ? `\n取消料 ${formatYen(a.cancelFee)}` : ""}`}</Cell>
              <Cell w={W.qty} right>{String(a.quantity)}</Cell>
              <Cell w={W.st}>{ARRANGEMENT_STATUS_LABEL[a.status]}</Cell>
              <Cell w={W.conf}>{a.confirmationNo ?? ""}</Cell>
              <Cell w={W.cost} right>{cancelled ? "—" : `${formatYen(cost)}${a.actualCost != null ? "\n(精算)" : ""}`}</Cell>
              <Cell w={W.price} right>{cancelled ? "—" : formatYen(a.unitPrice * a.quantity)}</Cell>
            </View>
          );
        })}
      </View>

      <View style={[ps.row, { justifyContent: "flex-end", marginTop: 6, gap: 16 }]} wrap={false}>
        <Text>売上見込み {formatYen(d.totals.sales)}</Text>
        <Text>原価見込み {formatYen(d.totals.cost)}</Text>
        <Text style={ps.bold}>粗利見込み {formatYen(d.totals.profit)}({margin})</Text>
      </View>
      <Text style={[ps.muted, { fontSize: 8.5, textAlign: "right" }]}>取消の手配は含めない。精算額がある手配は精算額で計算。</Text>

      <Text style={ps.sectionTitle}>未完了のタスク</Text>
      {d.tasks.length === 0 ? (
        <Text>なし</Text>
      ) : (
        d.tasks.map((t, i) => (
          <Text key={i}>
            ・{formatDate(t.dueDate)} {t.title}({t.assigneeName ?? "担当未定"})
          </Text>
        ))
      )}

      {p.note && (
        <>
          <Text style={ps.sectionTitle}>メモ</Text>
          <View style={ps.box}>
            <Text>{p.note}</Text>
          </View>
        </>
      )}
      <PdfFooter note="社外秘" />
    </Page>
  );
}

// 依頼元(旅行会社)向け: 原価・粗利・仕入先の連絡先・社内メモは載せない
function AgencySheet({ d }: { d: ProjectPdfData }) {
  const p = d.project;
  const W = { date: 62, cat: 56, desc: 207, qty: 40, st: 60, price: 90 }; // 計 515
  const shown = d.arrangements.filter((a) => a.status !== "cancelled");
  const stateLabel = (s: ArrangementStatus) => (s === "confirmed" ? "確定" : "手配中");
  return (
    <Page size="A4" style={ps.page}>
      <PdfHeader left={`案件番号 ${p.code}`} issuedAt={d.issuedAt} />
      <Text style={ps.title}>{PROJECT_PDF_TITLE.agency}</Text>
      <View style={[ps.row, { justifyContent: "space-between", marginBottom: 10 }]}>
        <View style={{ width: "52%" }}>
          <Text style={{ fontSize: 13, fontWeight: "bold", borderBottom: "1pt solid #000", paddingBottom: 2, marginBottom: 3 }}>{p.agencyName} 御中</Text>
          {p.agencyContact && <Text>ご担当: {p.agencyContact} 様</Text>}
          {p.agencyFax && <Text>FAX: {p.agencyFax}</Text>}
        </View>
        <View style={{ width: "42%", fontSize: 9.5 }}>
          <Text style={ps.bold}>{COMPANY.name}</Text>
          <Text>
            {COMPANY.department} 担当: {p.ownerName ?? "—"}
          </Text>
          <Text>TEL: {COMPANY.tel}</Text>
          <Text>FAX: {COMPANY.fax}</Text>
        </View>
      </View>
      <Text style={{ marginBottom: 8 }}>ご依頼いただいた手配の状況をお知らせします。「手配中」の項目は、確定しだい改めてご連絡いたします。</Text>
      <InfoTable
        rows={[
          ["ツアー名", p.title],
          ["日程", formatDateRange(p.startDate, p.endDate)],
          ["人数", pax(p)],
          ...(p.language ? ([["案内言語", p.language]] as [string, string][]) : []),
        ]}
      />
      <Text style={ps.sectionTitle}>手配内容</Text>
      <View style={ps.table}>
        <View style={ps.row} fixed>
          <Cell w={W.date} th>利用日時</Cell>
          <Cell w={W.cat} th>種別</Cell>
          <Cell w={W.desc} th>内容</Cell>
          <Cell w={W.qty} th>数量</Cell>
          <Cell w={W.st} th>状況</Cell>
          <Cell w={W.price} th>金額(税込)</Cell>
        </View>
        {shown.map((a, i) => (
          <View key={i} style={ps.row} wrap={false}>
            <Cell w={W.date}>{`${formatDate(a.serviceDate)}${a.serviceTime ? `\n${time(a.serviceTime)}` : ""}`}</Cell>
            <Cell w={W.cat}>{CATEGORY_LABEL[a.category]}</Cell>
            <Cell w={W.desc}>{`${a.description}${a.supplierName ? `\n${a.supplierName}` : ""}`}</Cell>
            <Cell w={W.qty} right>{String(a.quantity)}</Cell>
            <Cell w={W.st}>{stateLabel(a.status)}</Cell>
            <Cell w={W.price} right>{formatYen(a.unitPrice * a.quantity)}</Cell>
          </View>
        ))}
        <View style={ps.row} wrap={false}>
          <Cell w={W.date + W.cat + W.desc + W.qty + W.st} th right>合計(税込)</Cell>
          <Cell w={W.price} th right>{formatYen(d.totals.sales)}</Cell>
        </View>
      </View>
      <Text style={[ps.muted, { fontSize: 9, marginTop: 6 }]}>金額は手配内容ごとの合計(単価 × 数量)です。正式なご請求は別途ご案内します。</Text>
      <PdfFooter />
    </Page>
  );
}

// 行程表: 取消を除き、日別・時刻順に並べる
function Itinerary({ d }: { d: ProjectPdfData }) {
  const p = d.project;
  const W = { time: 44, cat: 56, desc: 175, place: 110, conf: 70, qty: 60 }; // 計 515
  const shown = d.arrangements.filter((a) => a.status !== "cancelled");
  const days = [...new Set(shown.map((a) => a.serviceDate))].sort();
  const dayNo = (date: string) => Math.round((Date.parse(date) - Date.parse(p.startDate)) / 86_400_000) + 1;
  return (
    <Page size="A4" style={ps.page}>
      <PdfHeader left={`案件番号 ${p.code}`} issuedAt={d.issuedAt} />
      <Text style={ps.title}>{PROJECT_PDF_TITLE.itinerary}</Text>
      <Text style={ps.subtitle}>
        {p.title}
      </Text>
      <InfoTable
        rows={[
          ["日程", formatDateRange(p.startDate, p.endDate)],
          ["団体名", `${p.agencyName} 様ご一行`],
          ["人数", pax(p)],
          ["案内言語", p.language ?? "—"],
          ["緊急連絡先", `${COMPANY.name} ${COMPANY.department} TEL ${COMPANY.tel}(担当: ${p.ownerName ?? "—"})`],
        ]}
      />
      {days.map((day) => (
        <View key={day} wrap={false}>
          <Text style={ps.sectionTitle}>
            {dayNo(day)}日目 {formatDate(day, { withYear: true })}
          </Text>
          <View style={ps.table}>
            <View style={ps.row}>
              <Cell w={W.time} th>時刻</Cell>
              <Cell w={W.cat} th>種別</Cell>
              <Cell w={W.desc} th>内容</Cell>
              <Cell w={W.place} th>集合・迎車場所</Cell>
              <Cell w={W.conf} th>確定番号</Cell>
              <Cell w={W.qty} th>手配状況</Cell>
            </View>
            {shown
              .filter((a) => a.serviceDate === day)
              .sort((a, b) => (a.serviceTime ?? "99").localeCompare(b.serviceTime ?? "99"))
              .map((a, i) => (
                <View key={i} style={ps.row}>
                  <Cell w={W.time}>{time(a.serviceTime) || "—"}</Cell>
                  <Cell w={W.cat}>{CATEGORY_LABEL[a.category]}</Cell>
                  <Cell w={W.desc}>{`${a.description}${a.supplierName ? `\n${a.supplierName}` : ""}`}</Cell>
                  <Cell w={W.place}>{a.meetingPlace ?? ""}</Cell>
                  <Cell w={W.conf}>{a.confirmationNo ?? ""}</Cell>
                  <Cell w={W.qty}>{ARRANGEMENT_STATUS_LABEL[a.status]}</Cell>
                </View>
              ))}
          </View>
        </View>
      ))}
      {days.length === 0 && <Text style={{ marginTop: 10 }}>手配がまだありません。</Text>}
      <PdfFooter />
    </Page>
  );
}

export async function renderProjectPdf(type: ProjectPdfType, d: ProjectPdfData): Promise<Buffer> {
  registerPdfFonts();
  const page = type === "internal" ? <InternalSheet d={d} /> : type === "agency" ? <AgencySheet d={d} /> : <Itinerary d={d} />;
  return renderToBuffer(
    <Document title={`${PROJECT_PDF_TITLE[type]} ${d.project.code}`} author={COMPANY.name} creator="tour-ops">
      {page}
    </Document>,
  );
}

export function projectPdfFilename(type: ProjectPdfType, code: string) {
  return `${PROJECT_PDF_TITLE[type]}_${code}.pdf`;
}
