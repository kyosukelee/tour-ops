// 手配依頼書(照会・手配・変更・取消)の PDF
// FAX で送る前提: A4縦・白黒、本文10pt以上、色ではなく罫線と太字で区別する
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { COMPANY } from "@/lib/company";
import { REQUEST_TITLE, type RequestKind } from "@/lib/status";
import { formatDate, formatDateRange, formatDateTime } from "@/lib/utils";
import { PDF_FONT, registerPdfFonts } from "./fonts";

export type RequestPdfData = {
  kind: RequestKind;
  requestNo: string | null; // 記録前の確認用は null(「下書き」と表示)
  issuedAt: Date;
  project: {
    code: string;
    title: string;
    agencyName: string;
    startDate: string;
    endDate: string;
    paxAdult: number;
    paxChild: number;
    language: string | null;
  };
  supplier: { name: string; contactName: string | null; fax: string | null; email: string | null };
  senderName: string;
  replyDue: string | null;
  note: string | null;
  items: {
    serviceDate: string;
    serviceTime: string | null;
    category: string;
    description: string;
    quantity: number;
    meetingPlace: string | null;
    supplierNote: string | null;
    confirmationNo: string | null;
  }[];
};

const BORDER = "#000";
const s = StyleSheet.create({
  page: { fontFamily: PDF_FONT, fontSize: 10, paddingTop: 48, paddingBottom: 56, paddingHorizontal: 40, lineHeight: 1.45 },
  header: { position: "absolute", top: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8.5 },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, borderTop: `0.5pt solid ${BORDER}`, paddingTop: 4, fontSize: 8.5, flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 18, fontWeight: "bold", textAlign: "center", marginBottom: 8, letterSpacing: 2, lineHeight: 1.3 },
  draft: { textAlign: "center", fontSize: 10, fontWeight: "bold", border: `1pt solid ${BORDER}`, padding: 2, marginBottom: 6, alignSelf: "center", paddingHorizontal: 8 },
  parties: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, marginBottom: 10 },
  to: { width: "52%" },
  toName: { fontSize: 13, fontWeight: "bold", borderBottom: `1pt solid ${BORDER}`, paddingBottom: 2, marginBottom: 3 },
  from: { width: "42%", fontSize: 9.5 },
  bold: { fontWeight: "bold" },
  lead: { marginBottom: 8 },
  sectionTitle: { fontWeight: "bold", fontSize: 11, marginTop: 10, marginBottom: 4 },
  table: { border: `0.75pt solid ${BORDER}`, borderBottom: "none", borderRight: "none" },
  row: { flexDirection: "row" },
  cell: { borderRight: `0.75pt solid ${BORDER}`, borderBottom: `0.75pt solid ${BORDER}`, padding: 3 },
  th: { fontWeight: "bold", backgroundColor: "#fff" },
  noteBox: { border: `0.75pt solid ${BORDER}`, padding: 6, minHeight: 36 },
  box: { fontSize: 11 },
});

// 列幅は pt で決める(A4 の本文幅 515pt に収まるように。% だと罫線が重なって消えることがある)
const COLS = { no: 24, date: 62, cat: 52, desc: 160, qty: 34, place: 86, note: 96 };
const RCOLS = { no: 24, desc: 190, ok: 90, conf: 105, amount: 105 };

function RequestPdf({ d }: { d: RequestPdfData }) {
  const title = REQUEST_TITLE[d.kind];
  const pax = `大人 ${d.project.paxAdult}名${d.project.paxChild > 0 ? ` ・ 子ども ${d.project.paxChild}名` : ""}`;
  const cancel = d.kind === "cancel";
  const lead = cancel
    ? "下記の手配を取り消します。お手数ですが、取消の受領と取消料の有無を回答欄にご記入のうえご返信ください。"
    : d.kind === "inquiry"
      ? "下記の内容で空き状況と料金のご確認をお願いいたします。回答欄にご記入のうえご返信ください。"
      : d.kind === "change"
        ? "先にお願いしている手配について、下記のとおり変更をお願いいたします。変更後の内容で回答欄にご記入のうえご返信ください。"
        : "下記のとおり手配をお願いいたします。回答欄にご記入のうえご返信ください。";

  return (
    <Document title={`${title} ${d.project.code} ${d.supplier.name}`} author={COMPANY.name} creator="tour-ops">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Text>
            案件番号 {d.project.code}
            {d.requestNo ? ` ・ 依頼番号 ${d.requestNo}` : ""}
          </Text>
          <Text>発行 {formatDateTime(d.issuedAt)}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>

        <Text style={s.title}>{title}</Text>
        {!d.requestNo && <Text style={s.draft}>確認用(未送付)</Text>}

        <View style={s.parties}>
          <View style={s.to}>
            <Text style={s.toName}>{d.supplier.name} 御中</Text>
            {d.supplier.contactName && <Text>ご担当: {d.supplier.contactName} 様</Text>}
            {d.supplier.fax && <Text>FAX: {d.supplier.fax}</Text>}
            {d.supplier.email && <Text>メール: {d.supplier.email}</Text>}
          </View>
          <View style={s.from}>
            <Text style={s.bold}>{COMPANY.name}</Text>
            <Text>{COMPANY.department} 担当: {d.senderName}</Text>
            <Text>TEL: {COMPANY.tel}</Text>
            <Text>FAX: {COMPANY.fax}</Text>
            <Text>メール: {COMPANY.email}</Text>
          </View>
        </View>

        <Text style={s.lead}>{lead}</Text>
        {d.replyDue && (
          <Text style={[s.lead, s.bold]}>
            ご回答期限: {formatDate(d.replyDue, { withYear: true })}
          </Text>
        )}

        <Text style={s.sectionTitle}>ツアーの概要</Text>
        <View style={s.table}>
          <InfoRow label="ツアー名" value={d.project.title} />
          <InfoRow label="団体名" value={`${d.project.agencyName} 様ご一行`} />
          <InfoRow label="日程" value={formatDateRange(d.project.startDate, d.project.endDate)} />
          <InfoRow label="人数" value={pax} />
          {d.project.language && <InfoRow label="案内言語" value={d.project.language} />}
        </View>

        <Text style={s.sectionTitle}>{cancel ? "取消する手配" : "ご依頼内容"}</Text>
        <View style={s.table}>
          <View style={s.row} fixed>
            <Cell w={COLS.no} th>No</Cell>
            <Cell w={COLS.date} th>利用日時</Cell>
            <Cell w={COLS.cat} th>種別</Cell>
            <Cell w={COLS.desc} th>内容</Cell>
            <Cell w={COLS.qty} th>数量</Cell>
            <Cell w={COLS.place} th>集合・迎車場所</Cell>
            <Cell w={COLS.note} th>連絡事項</Cell>
          </View>
          {d.items.map((it, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Cell w={COLS.no}>{String(i + 1)}</Cell>
              <Cell w={COLS.date}>
                {formatDate(it.serviceDate)}
                {it.serviceTime ? `\n${it.serviceTime.slice(0, 5)}` : ""}
              </Cell>
              <Cell w={COLS.cat}>{it.category}</Cell>
              <Cell w={COLS.desc}>
                {it.description}
                {it.confirmationNo ? `\n(確定番号 ${it.confirmationNo})` : ""}
              </Cell>
              <Cell w={COLS.qty}>{String(it.quantity)}</Cell>
              <Cell w={COLS.place}>{it.meetingPlace ?? ""}</Cell>
              <Cell w={COLS.note}>{it.supplierNote ?? ""}</Cell>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>通信欄</Text>
        <View style={s.noteBox}>
          <Text>{d.note ?? ""}</Text>
        </View>

        <View wrap={false}>
          <Text style={s.sectionTitle}>回答欄(ご記入のうえ、FAX {COMPANY.fax} またはメールでご返信ください)</Text>
          <View style={s.table}>
            <View style={s.row}>
              <Cell w={RCOLS.no} th>No</Cell>
              <Cell w={RCOLS.desc} th>内容</Cell>
              <Cell w={RCOLS.ok} th>{cancel ? "取消の受領" : "可否"}</Cell>
              <Cell w={RCOLS.conf} th>{cancel ? "取消番号" : "確定番号"}</Cell>
              <Cell w={RCOLS.amount} th>{cancel ? "取消料(円)" : "金額(円・税込)"}</Cell>
            </View>
            {d.items.map((it, i) => (
              <View key={i} style={[s.row, { minHeight: 24 }]}>
                <Cell w={RCOLS.no}>{String(i + 1)}</Cell>
                <Cell w={RCOLS.desc}>{it.description}</Cell>
                <Cell w={RCOLS.ok}>
                  <Text style={s.box}>{cancel ? "□ 受領" : "□ 可  □ 不可"}</Text>
                </Cell>
                <Cell w={RCOLS.conf}>{""}</Cell>
                <Cell w={RCOLS.amount}>{""}</Cell>
              </View>
            ))}
          </View>
          <View style={[s.row, { marginTop: 8, justifyContent: "flex-end", gap: 24 }]}>
            <Text>回答日: 　　年　　月　　日</Text>
            <Text>ご回答者: ＿＿＿＿＿＿＿＿＿＿</Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>
            {COMPANY.name} {COMPANY.department}
          </Text>
          <Text>
            TEL {COMPANY.tel} ・ FAX {COMPANY.fax}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

function Cell({ w, th, children }: { w: number; th?: boolean; children: React.ReactNode }) {
  return (
    <View style={[s.cell, { width: w }]}>
      <Text style={th ? s.th : undefined}>{children}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <View style={[s.cell, { width: 90 }]}>
        <Text style={s.bold}>{label}</Text>
      </View>
      <View style={[s.cell, { width: 424 }]}>
        <Text>{value}</Text>
      </View>
    </View>
  );
}

export async function renderRequestPdf(data: RequestPdfData): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<RequestPdf d={data} />);
}

export function requestPdfFilename(data: Pick<RequestPdfData, "kind" | "project" | "requestNo">): string {
  // 依頼番号は案件番号を含む(例: T-2026-0005-R3)
  return `${REQUEST_TITLE[data.kind]}_${data.requestNo ?? `${data.project.code}_確認用`}.pdf`;
}
