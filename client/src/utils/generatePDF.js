import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { PDF_COLUMNS, COLUMN_WEIGHTS } from "../config/sections";
import { formatCell } from "./formatCell";

/**
 * Generates and downloads a PDF report from the uploaded data.
 * @param {object} result - the server response object containing allRows/previewRows and filename
 */
export function generatePDF(result) {
  // ── A4 landscape ──────────────────────────────────────────────
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const margins = { top: 30, left: 10, right: 10 };
  const cellHeight = 80;
  const headHeight = 70;

  const pageWidth = doc.internal.pageSize.getWidth();
  const availableWidth = pageWidth - margins.left - margins.right;

  const totalWeight = PDF_COLUMNS.reduce(
    (sum, col) => sum + (COLUMN_WEIGHTS[col.key] ?? 1.5), 0
  );

  const COLUMN_WIDTHS = {};
  PDF_COLUMNS.forEach((col) => {
    COLUMN_WIDTHS[col.key] =
      (COLUMN_WEIGHTS[col.key] ?? 1.5) / totalWeight * availableWidth;
  });

  const headers = PDF_COLUMNS.map((c) => c.label);

  const allRows = result.allRows ?? result.previewRows;
  const rows = allRows.map((row) =>
    PDF_COLUMNS.map((c) => {
      let val = formatCell(c.key, row[c.key]) ?? "";
      return val;
    })
  );

  autoTable(doc, {
    showHead: "firstPage",
    rowPageBreak: "avoid",
    head: [headers],
    body: rows,

    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 0,
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
      halign: "center",
      valign: "middle",
      minCellHeight: cellHeight,
      overflow: "hidden",
    },

    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 7,
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
      minCellHeight: headHeight,
      overflow: "hidden",
    },

    columnStyles: PDF_COLUMNS.reduce((acc, col, i) => {
      acc[i] = { cellWidth: COLUMN_WIDTHS[col.key] };
      return acc;
    }, {}),

    didParseCell: (data) => {
      data.cell.text = [];
    },

    didDrawCell: (data) => {
      const { doc, cell } = data;
      const rawText = String(cell.raw ?? "").trim();
      if (!rawText) return;

      const colKey = PDF_COLUMNS[data.column.index]?.key;
      if (!colKey) return;
      const isWrappable = ["Transp", "Cargo"].includes(colKey);

      doc.saveGraphicsState();
      doc.setFontSize(7);
      doc.setFont("helvetica", data.section === "head" ? "bold" : "normal");

      // ── HEADER ──────────────────────────────────────────────
      if (data.section === "head") {
        const x = cell.x + cell.width / 2;
        const y = cell.y + cell.height - 4;
        doc.text(rawText, x, y, { angle: 90, align: "left" });

      // ── BODY: WRAPPABLE COLUMNS ──────────────────────────────
      } else if (isWrappable) {
        const lineSpacing = 9;
        const maxTextWidth = cell.height - 6;
        const words = rawText.split(/[\s,]+/).filter(Boolean);
        const lines = [];
        let currentLine = "";

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          if (doc.getTextWidth(testLine) <= maxTextWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);

        const maxLines = Math.floor(cell.width / lineSpacing);
        const visibleLines = lines.slice(0, maxLines);
        const totalBlockWidth = visibleLines.length * lineSpacing;
        const startX =
          cell.x + (cell.width - totalBlockWidth) / 2 + lineSpacing / 2;

        visibleLines.forEach((line, i) => {
          const textWidth = doc.getTextWidth(line);
          const xLine = startX + i * lineSpacing;
          const yLine = cell.y + (cell.height + textWidth) / 2;
          doc.text(line, xLine, yLine, { angle: 90, align: "left" });
        });

      // ── BODY: ALL OTHER COLUMNS ──────────────────────────────
      } else {
        const x = cell.x + cell.width / 2;
        const textWidth = doc.getTextWidth(rawText);
        const y = cell.y + (cell.height + textWidth) / 2;
        doc.text(rawText, x, y, { angle: 90, align: "left" });
      }

      doc.restoreGraphicsState();
    },

    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.5,
    margin: margins,
  });

  doc.save(`${result.filename.replace(/\.[^/.]+$/, "")}_report.pdf`);
}