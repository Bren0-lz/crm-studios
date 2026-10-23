import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  documentContentFromText,
  documentContentText,
  type ClinicBranding,
  type DocumentContent,
  type DocumentNode,
} from "@crm/contracts";
import type { ReactNode } from "react";
import { companyIdentification } from "./model";

Font.register({
  family: "DM Sans",
  fonts: [
    { src: "/fonts/dm-sans/normal-400.ttf", fontWeight: 400 },
    { src: "/fonts/dm-sans/normal-600.ttf", fontWeight: 600 },
    {
      src: "/fonts/dm-sans/italic-400.ttf",
      fontWeight: 400,
      fontStyle: "italic",
    },
    {
      src: "/fonts/dm-sans/italic-600.ttf",
      fontWeight: 600,
      fontStyle: "italic",
    },
  ],
});
const styles = StyleSheet.create({
  page: {
    padding: 48,
    paddingBottom: 60,
    fontFamily: "DM Sans",
    fontSize: 11,
    lineHeight: 1.6,
    color: "#1f2925",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingBottom: 16,
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#d9ded9",
  },
  logo: { width: 100, maxHeight: 56, objectFit: "contain" },
  brand: { fontSize: 18, fontWeight: 600 },
  company: { fontSize: 9, textAlign: "right", maxWidth: 260 },
  paragraph: { marginBottom: 10 },
  title: { fontSize: 18, fontWeight: 600, marginTop: 12, marginBottom: 16 },
  heading: { fontSize: 12, fontWeight: 600, marginTop: 16, marginBottom: 8 },
  list: { marginBottom: 10 },
  item: { flexDirection: "row", gap: 6, paddingLeft: 10 },
  marker: { width: 18 },
  itemBody: { flex: 1 },
  bold: { fontWeight: 600 },
  italic: { fontStyle: "italic" },
  underline: { textDecoration: "underline" },
  left: { textAlign: "left" },
  center: { textAlign: "center" },
  right: { textAlign: "right" },
  justify: { textAlign: "justify" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 9,
    color: "#657168",
    textAlign: "center",
  },
});

export interface DocumentPdfInput {
  title: string;
  body: string;
  content?: DocumentContent | undefined;
  branding?: ClinicBranding | null | undefined;
}

export function ContractPdf({
  title,
  body,
  content,
  branding,
}: DocumentPdfInput) {
  const source = content ?? documentContentFromText(body);
  function inline(node: DocumentNode, key: number): ReactNode {
    if (node.type === "hardBreak") return "\n";
    return (
      <Text
        key={key}
        style={(node.marks ?? []).map((mark) => styles[mark.type])}
      >
        {node.text ?? ""}
      </Text>
    );
  }
  function block(node: DocumentNode, key: number): ReactNode {
    if (node.type === "bulletList" || node.type === "orderedList")
      return (
        <View key={key} style={styles.list}>
          {node.content?.map((item, index) => (
            <View key={index} style={styles.item}>
              <Text style={styles.marker}>
                {node.type === "bulletList"
                  ? "•"
                  : `${(node.attrs?.start ?? 1) + index}.`}
              </Text>
              <View style={styles.itemBody}>{item.content?.map(block)}</View>
            </View>
          ))}
        </View>
      );
    const signature =
      /^\s*_{5,}/.test(documentContentText({ version: 1, doc: node })) &&
      documentContentText({ version: 1, doc: node }).length < 1000;
    return (
      <Text
        key={key}
        style={[
          node.type === "heading"
            ? node.attrs?.level === 1
              ? styles.title
              : styles.heading
            : styles.paragraph,
          styles[node.attrs?.textAlign ?? "left"],
        ]}
        minPresenceAhead={node.type === "heading" ? 36 : 0}
        orphans={2}
        widows={2}
        wrap={!signature}
      >
        {node.content?.length ? node.content.map(inline) : "\n"}
      </Text>
    );
  }
  return (
    <Document
      title={title}
      author={branding?.name ?? "Studios Aryana"}
      language="pt-BR"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} wrap={false}>
          {branding?.logoDataUrl &&
          /^data:image\/(png|jpeg);base64,/.test(branding.logoDataUrl) ? (
            <Image style={styles.logo} src={branding.logoDataUrl} />
          ) : (
            <Text style={styles.brand}>
              {branding?.name ?? "Studios Aryana"}
            </Text>
          )}
          <View style={styles.company}>
            {companyIdentification(branding).map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
        </View>
        {source.doc.content?.map(block)}
        <Text
          fixed
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
