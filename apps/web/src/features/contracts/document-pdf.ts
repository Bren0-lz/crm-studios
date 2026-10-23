import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import { ContractPdf, type DocumentPdfInput } from "./ContractPdf";
export type { DocumentPdfInput } from "./ContractPdf";
export async function generateDocumentPdf(input: DocumentPdfInput) {
  return pdf(createElement(ContractPdf, input)).toBlob();
}
