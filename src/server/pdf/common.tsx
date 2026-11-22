// PDF の共通部品(FAX 向け: A4縦・白黒・本文10pt以上、罫線と太字で区別する)
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { COMPANY } from "@/lib/company";
import { formatDateTime } from "@/lib/utils";
import { PDF_FONT } from "./fonts";

export const BORDER = "#000";
// A4 の本文幅(左右 40pt ずつの余白)
export const CONTENT_WIDTH = 515;

export const ps = StyleSheet.create({
  page: { fontFamily: PDF_FONT, fontSize: 10, paddingTop: 48, paddingBottom: 56, paddingHorizontal: 40, lineHeight: 1.45 },
  header: { position: "absolute", top: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8.5 },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, borderTop: `0.5pt solid ${BORDER}`, paddingTop: 4, fontSize: 8.5, flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 18, fontWeight: "bold", textAlign: "center", marginBottom: 8, letterSpacing: 2, lineHeight: 1.3 },
  subtitle: { textAlign: "center", fontSize: 10, marginBottom: 8 },
  sectionTitle: { fontWeight: "bold", fontSize: 11, marginTop: 10, marginBottom: 4 },
  table: { border: `0.75pt solid ${BORDER}`, borderBottom: "none", borderRight: "none" },
  row: { flexDirection: "row" },
  cell: { borderRight: `0.75pt solid ${BORDER}`, borderBottom: `0.75pt solid ${BORDER}`, padding: 3 },
  bold: { fontWeight: "bold" },
  right: { textAlign: "right" },
  muted: { color: "#444" },
  box: { border: `0.75pt solid ${BORDER}`, padding: 6 },
});

export function PdfHeader({ left, issuedAt }: { left: string; issuedAt: Date }) {
  return (
    <View style={ps.header} fixed>
      <Text>{left}</Text>
      <Text>発行 {formatDateTime(issuedAt)}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function PdfFooter({ note }: { note?: string }) {
  return (
    <View style={ps.footer} fixed>
      <Text>
        {COMPANY.name} {COMPANY.department}
        {note ? ` ・ ${note}` : ""}
      </Text>
      <Text>
        TEL {COMPANY.tel} ・ FAX {COMPANY.fax}
      </Text>
    </View>
  );
}

export function Cell({ w, th, right, children }: { w: number; th?: boolean; right?: boolean; children: ReactNode }) {
  return (
    <View style={[ps.cell, { width: w }]}>
      <Text style={[th ? ps.bold : {}, right ? ps.right : {}]}>{children}</Text>
    </View>
  );
}

export function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <View style={ps.table}>
      {rows.map(([label, value]) => (
        <View key={label} style={ps.row} wrap={false}>
          <View style={[ps.cell, { width: 90 }]}>
            <Text style={ps.bold}>{label}</Text>
          </View>
          <View style={[ps.cell, { width: CONTENT_WIDTH - 90 }]}>
            <Text>{value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
