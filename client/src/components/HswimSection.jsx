import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHswimUpload } from "../hooks/useHswimUpload.js";
import "../styles/print.css";
import { PDF_COLUMNS, COLUMN_WEIGHTS, IMPOUNDED_COLUMNS } from "../config/sections.js";
import { formatCell } from "../utils/formatCell.js";
import { formatImpoundedCell } from "../utils/formatImpoundedCell.js";
 
// ─────────────────────────────────────────────
// NOTE: All PDF page components (Page1, Page2, Page3,
// WideLoadsPages, ImpoundedPages, etc.) and all
// business logic functions are UNCHANGED from the
// original. Only the UI shell at the bottom of
// this file has been restyled.
// ─────────────────────────────────────────────
 
const PDF = {
  th: {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontWeight: "800", fontSize: 7.5,
    padding: "2px 2px", textAlign: "center", verticalAlign: "middle",
    whiteSpace: "pre-line",
  },
  td: {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontSize: 7.5,
    padding: "2px 2px", textAlign: "center", verticalAlign: "middle",
  },
  sectionTitle: {
    fontFamily: "Arial, sans-serif", fontWeight: "bold",
    fontSize: 10, color: "#000", marginBottom: 6,
  },
};
 
function distributeE(hourlyRows, wideLoadE) {
  if (!wideLoadE || !hourlyRows?.length) {
    return hourlyRows.map(r => ({ ...r, E: r.E || 0 }));
  }
  const eligible = hourlyRows.map((r, i) => {
    const t = (r.time || "").replace(/[^0-9]/g, "").slice(0, 4);
    const hour = parseInt(t.slice(0, 2), 10);
    return { i, eligible: hour >= 6 && hour < 18 };
  });
  const eligibleIdxs = eligible.filter(x => x.eligible).map(x => x.i);
  if (!eligibleIdxs.length) return hourlyRows.map(r => ({ ...r, E: r.E || 0 }));
  const dist = new Array(hourlyRows.length).fill(0);
  let remaining = Number(wideLoadE);
  const shuffled = [...eligibleIdxs].sort((a, b) => ((a * 7 + 3) % 13) - ((b * 7 + 3) % 13));
  shuffled.forEach((idx, pos) => {
    const isLast = pos === shuffled.length - 1;
    if (isLast) { dist[idx] = remaining; }
    else { const share = Math.round(remaining / (shuffled.length - pos)); dist[idx] = share; remaining -= share; }
  });
  return hourlyRows.map((r, i) => ({ ...r, E: dist[i] }));
}
 
function enrichRow(row) {
  return {
    ...row,
    X: (row.D || 0) + (row.S || 0) + (row.M || 0),
    N: (row.D || 0) + (row.S || 0),
    Y: (row.A || 0) + (row.Z || 0) + (row.G || 0) + (row.R || 0),
    P: (row.Z || 0) + (row.R || 0),
  };
}
 
function buildLiveSummary({ hourlyRows, manualFields, F, E }) {
  if (!hourlyRows?.length) return null;
  const enriched = hourlyRows.map(enrichRow);
  const sum = key => enriched.reduce((acc, r) => acc + (r[key] || 0), 0);
  const D = sum("D"), S = sum("S"), M = sum("M");
  const Q = sum("Q"), A = sum("A"), Z = sum("Z"), G = sum("G"), R = sum("R");
  const X = D + S + M, N = D + S, Y = A + Z + G + R, P = Z + R;
  const buses         = Number(manualFields?.buses)         || 0;
  const veh3500to7000 = Number(manualFields?.veh3500to7000) || 0;
  const veh7000plus   = Number(manualFields?.veh7000plus)   || 0;
  const K    = buses + veh3500to7000 + veh7000plus;
  const eVal = Number(E) || 0;
  const fVal = Number(F) || 0;
  const T    = Q + X + K + eVal;
  return {
    Q, N, M, X, T, Y, A, Z, G, R, P, K,
    E: eVal, F: fVal, exemptTotal: eVal + fVal,
    B: Number(manualFields?.B) || 0,
    L: Number(manualFields?.L) || 0,
    buses, veh3500to7000, veh7000plus,
  };
}
 
const TRANSGRESSION_OVERFLOW_THRESHOLD = 2;
const TRANSGRESSION_ACTION_CHROME_H = 30 + 40;
const TRANSGRESSION_ACTION_ROW_H    = 32;

function computeImpChunks(rowCount) {
  if (rowCount === 0) return 0;
  let chunks = 0;
  let remaining = rowCount;
  remaining -= IMP_ROWS_FIRST_PAGE; chunks++;
  while (remaining > 0) { remaining -= IMP_ROWS_CONT_PAGE; chunks++; }
  return chunks;
}
 
function computeTotalPages(impoundedResult, wideLoadResult, transgressionRowCount = 0, impRowsOnPage4 = 0){
  const sectionIOnPage4 = transgressionRowCount > TRANSGRESSION_OVERFLOW_THRESHOLD;
  const FIXED_PAGES     = sectionIOnPage4 ? 4 : 3;
  const impRows         = Math.max(0, (impoundedResult?.allRows?.length ?? impoundedResult?.rows?.length ?? 0) - impRowsOnPage4 );
  const wideAllRows     = wideLoadResult?.allRows ?? [];
  const impChunksCount = computeImpChunks(impRows);
  const lastChunkRows   = impRows > 0 ? (impRows % IMP_ROWS_PER_PAGE || IMP_ROWS_PER_PAGE) : 0;
  const isFirstImpPage  = impChunksCount === 1;
  const lastImpUsedH    = estimateImpoundedHeight(lastChunkRows, isFirstImpPage);
  const lastImpRemaining = CONTENT_H - lastImpUsedH;
  const widePages = packWideRowsIntoPages([...wideAllRows], lastImpRemaining);
  return FIXED_PAGES + impChunksCount + widePages.length;
}
 
// ─── Dropzone — restyled ──────────────────────────────────────
function Dropzone({ label, sublabel, file, onDrop, onClear, busy, disabled = false }) {
  const [dragging, setDragging] = useState(false);
 
  const handleDrag = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDragEnter = useCallback((e) => { e.preventDefault(); if (!disabled) setDragging(true); }, [disabled]);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setDragging(false); }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const f = e.dataTransfer.files[0];
    if (f) onDrop(f);
  }, [onDrop, disabled]);
  const handleChange = useCallback((e) => {
    if (disabled) return;
    const f = e.target.files[0];
    if (f) onDrop(f);
  }, [onDrop, disabled]);
 
  const inputId = `hswim-input-${label.replace(/\s+/g, "-")}`;
 
  if (file) {
    return (
      <div className="upload-zone done">
        <span className="uz-icon success">✓</span>
        <div className="uz-name">{file.name}</div>
        <div className="uz-hint">{(file.size / 1024).toFixed(1)} KB</div>
        {!busy && (
          <button
            onClick={onClear}
            style={{
              marginTop: 6, background: "none", border: "1px solid var(--navy-300)",
              borderRadius: "var(--radius-sm)", color: "var(--text-muted)",
              fontSize: 11, padding: "3px 10px", cursor: "pointer",
            }}
          >
            Remove
          </button>
        )}
      </div>
    );
  }
 
  return (
    <div
      className={`upload-zone${dragging ? " dragover" : ""}${disabled ? " error" : ""}`}
      style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      onDragOver={disabled ? undefined : handleDrag}
      onDragEnter={disabled ? undefined : handleDragEnter}
      onDragLeave={disabled ? undefined : handleDragLeave}
      onDrop={disabled ? undefined : handleDrop}
      onClick={() => !disabled && document.getElementById(inputId).click()}
    >
      <input
        id={inputId}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: "none" }}
        onChange={handleChange}
        disabled={disabled}
      />
      <span className="uz-icon">↑</span>
      <div className="uz-name">{label}</div>
      <div className="uz-hint">
        {disabled ? "Upload Wide Loads first" : sublabel}
      </div>
    </div>
  );
}
 
// ─── ManualField — restyled ───────────────────────────────────
function ManualField({ label, fieldKey, value, onChange, type = "number", placeholder = "0" }) {
  return (
    <div className="field-group">
      <label className="field-label">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        className="field-input"
      />
    </div>
  );
}
 
// ─── All page components unchanged ───────────────────────────
const A4_W = 1122;
const A4_H = 794;
const PAGE_PAD_X = 28;
const PAGE_PAD_TOP = 14;
const PAGE_PAD_BOT = 18;
 
const PageWrapper = forwardRef(function PageWrapper(
  { children, globalPageNum, totalPages, date, settings }, ref
) {
  const docRef = settings?.reference || "KeNHA/WB/MTCE/4339/2025";
  const titleText = settings
    ? `${settings.name} ${settings.direction} DAILY REPORT`
    : "JUJA WEIGHBRIDGE THIKA BOUND DAILY REPORT";
 
  return (
    <div
      ref={ref}
      className="page-wrapper"
      style={{
        width: A4_W, minWidth: A4_W, maxWidth: A4_W,
        height: A4_H, minHeight: A4_H, maxHeight: A4_H,
        background: "#fff",
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
        padding: `${PAGE_PAD_TOP}px ${PAGE_PAD_X}px ${PAGE_PAD_BOT}px`,
        boxSizing: "border-box",
        marginBottom: 28,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ marginBottom: 2, marginTop: -14, flexShrink: 0 }}>
        <img src="/danka-logo.png" alt="Danka" style={{ height: 80, objectFit: "contain" }} />
      </div>
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>{children}</div>
      <div style={{
        flexShrink: 0, paddingTop: 4,
        display: "grid", gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        fontFamily: "Arial, sans-serif", fontSize: 12,
        color: "#000", fontWeight: "bold", letterSpacing: "0.01em",
      }}>
        <span style={{ textAlign: "left", paddingLeft: 130 }}>{docRef}</span>
        <span style={{ textAlign: "center", whiteSpace: "nowrap" }}>
          {titleText}{date ? ` ${date}` : ""}
        </span>
        <span style={{ textAlign: "right", paddingRight: 100 }}>
          Page {globalPageNum} of {totalPages}
        </span>
      </div>
    </div>
  );
});
 
// ─────────────────────────────────────────────
// Page 1 — Daily and Hourly Statistics
// ← CHANGED: accepts globalPageNum + totalPages
// ─────────────────────────────────────────────
const Page1 = forwardRef(function Page1({ rows, date, preparedBy, approvedBy, settings, globalPageNum, totalPages }, ref) {
  if (!rows?.length) return null;

  const numKeys = ["D","S","M","H","Q","X","C","Y","P","A","Z","G","R","E"];
  const totals = {};
  numKeys.forEach(k => { totals[k] = rows.reduce((s, r) => s + (r[k] || 0), 0); });

  // ── Dynamic row height ──────────────────────────────────────
  // Available content height inside PageWrapper:
  // A4_H(794) - padTop(18) - logo(40) - logoMargin(8) - padBot(14) - footer(22) = 692px
  // Subtract: page title(~26px) + section title(~22px) + preparedBy block(~36px) = 84px
  // Remaining for table: ~608px
  // Table has: 3 header rows + 24 data rows + 1 totals row = 28 rows total
  // So each row gets: 608 / 28 ≈ 21.7px — we use CSS to distribute evenly
  const CONTENT_H   = 620;
  const CHROME_H    = 30 + 32; // title + section label + prepared-by block
  const TABLE_H     = CONTENT_H - CHROME_H; // ~608px available for table
  const TOTAL_ROWS  = 3 + (rows.length) + 1; // 3 header rows + data rows + totals
  const ROW_H       = Math.floor(TABLE_H / TOTAL_ROWS); // px per row
  const PAGE_PAD_BOT  = 14;
  const FOOTER_H      = 22;

  const th = {
    ...PDF.th,
    fontSize: 9,
    padding: "1px 1px",
    height: ROW_H,
    letterSpacing: "0.06em",
    lineHeight: 1.1,
  };
  const td = {
    ...PDF.td,
    fontSize: 11.,
    fontWeight: "semi-bold",
    padding: "0 1px",
    height: ROW_H,
  };
  const tdB = { ...td, fontWeight: "bold" };

  return (
    <PageWrapper ref={ref} globalPageNum={globalPageNum} totalPages={totalPages} date={date} settings={settings}>

      {/* Page title */}
      <div style={{
        textAlign: "center", fontFamily: "Arial, sans-serif", fontWeight: "bold",
        fontSize: 16, color: "#000", marginBottom: 4, marginTop: -2, zIndex: 1 , textDecoration: "underline",
        flexShrink: 0,
      }}>
        {settings
          ? `${settings.name} ${settings.direction} DAILY REPORT`
          : "JUJA WEIGHBRIDGE THIKA BOUND DAILY REPORT"}
      </div>

      {/* Section label */}
      <div style={{ ...PDF.sectionTitle, fontSize: 14, marginBottom: 4, flexShrink: 0 }}>
        1.&nbsp; DAILY AND HOURLY STATISTICS
      </div>

      {/* Table — fills all remaining vertical space */}
      <table style={{
        borderCollapse: "collapse",
        tableLayout: "fixed",
        width: "100%",
        flex: 1,           // stretch vertically
        height: TABLE_H,   // explicit height so rows distribute evenly
      }}>
        <colgroup>
          <col style={{ width: "6.5%" }} />   
          <col style={{ width: "6.5%" }} />   
          <col style={{ width: "4.2%" }} />   
          <col style={{ width: "3.8%" }} />   
          <col style={{ width: "3.8%" }} />   
          <col style={{ width: "4.2%" }} />   
          <col style={{ width: "4.2%" }} />   
          <col style={{ width: "4.5%" }} />   
          <col style={{ width: "4.2%" }} />   
          <col style={{ width: "5.2%" }} />   
          <col style={{ width: "5.2%" }} />   
          <col style={{ width: "5.2%" }} />   
          <col style={{ width: "5.2%" }} />   
          <col style={{ width: "5.2%" }} />   
          <col style={{ width: "5.2%" }} />   
          <col style={{ width: "6%" }} />     
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={3} style={{ ...th, verticalAlign: "middle" }}>DATE</th>
            <th rowSpan={3} style={{ ...th, verticalAlign: "middle" }}>TIME</th>
            <th colSpan={6} style={th}>TRUCKS WEIGHED</th>
            <th rowSpan={3} style={{ ...th, verticalAlign: "middle" }}>{"CALLED\nIN\n(C)"}</th>
            <th rowSpan={3} style={{ ...th, verticalAlign: "middle" }}>{"TOTAL\nOVERLO\nADED\n(Y)=(A+\nZ+G+R)"}</th>
            <th rowSpan={3} style={{ ...th, verticalAlign: "middle" }}>{"IMPOUNDED\n&\nPROHIBITED\n(P)=(Z+R)"}</th>
            <th rowSpan={3} style={{ ...th, verticalAlign: "middle" }}>{"WARNED\nTRUCKS\n(A)"}</th>
            <th rowSpan={3} style={{ ...th, verticalAlign: "middle" }}>{"CHARGED &\nPROHIBITED\n(Z)"}</th>
            <th rowSpan={3} style={{ ...th, verticalAlign: "middle" }}>{"SPECIAL\nRELEASE\n(G)"}</th>
            <th rowSpan={3} style={{ ...th, verticalAlign: "middle" }}>{"REDISTRI-\nBUTED\n(R)"}</th>
            <th rowSpan={3} style={{ ...th, verticalAlign: "middle" }}>{"EXEMPTION\nPERMITS\nNOT\nWEIGHED\n(E)"}</th>
          </tr>
          <tr>
            <th style={th}>{"MULTIDECK\nSCALE"}</th>
            <th style={th}>{"WEIGHED\nSAW"}</th>
            <th style={th}>{"MANUAL\nLY"}</th>
            <th style={th}>{"HSWIM\nTOTAL"}</th>
            <th style={th}>{"HSWIM –\nCLEARED"}</th>
            <th style={th}>{"TOTAL\nWEIGHED"}</th>
          </tr>
          <tr>
            <th style={th}>(D)</th>
            <th style={th}>(S)</th>
            <th style={th}>(M)</th>
            <th style={th}>(H)</th>
            <th style={th}>Q = H-C</th>
            <th style={th}>{"X= (D\n+M+S)"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={td}>{i === 0 ? (date || "") : ""}</td>
              <td style={td}>{row.time}</td>
              <td style={td}>{row.D}</td>
              <td style={td}>{row.S}</td>
              <td style={td}>{row.M}</td>
              <td style={td}>{row.H}</td>
              <td style={td}>{row.Q}</td>
              <td style={td}>{row.X}</td>
              <td style={td}>{row.C}</td>
              <td style={td}>{row.Y}</td>
              <td style={td}>{row.P}</td>
              <td style={td}>{row.A}</td>
              <td style={td}>{row.Z}</td>
              <td style={td}>{row.G}</td>
              <td style={td}>{row.R}</td>
              <td style={td}>{row.E ?? 0}</td>
            </tr>
          ))}
          <tr>
            <td style={tdB}>Totals</td>
            <td style={td} />
            {numKeys.map(k => <td key={k} style={tdB}>{totals[k]}</td>)}
          </tr>
        </tbody>
      </table>

      {/* Prepared / Approved — pinned below table */}
      <div style={{
        marginTop: 6,
        fontFamily: "Arial, sans-serif",
        fontSize: 10.5,
        color: "#000",
        flexShrink: 0,
        lineHeight: 1.6,
      }}>
        <div><strong>Prepared by: {preparedBy || ""}</strong></div>
        <div><strong>Approved by: {approvedBy || ""}</strong></div>
      </div>

    </PageWrapper>
  );
});

// ─────────────────────────────────────────────
// Canvas line chart
// ← CHANGED: chartHeight is now a fixed prop (no DOM measurement)
// ─────────────────────────────────────────────
function CanvasLineChart({ rows, chartHeight }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!rows?.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    // ← CHANGED: use fixed dimensions matching A4 landscape chart area
    const CW = 780, CH = chartHeight || 670;
    canvas.width = CW; canvas.height = CH;

    const padL = 48, padR = 16, padT = 44, padB = 95;
    const cW = CW - padL - padR, cH = CH - padT - padB;

    const series = [
      { key: "N", name: "N=(D+S)",    color: "#1a56db", width: 2 },
      { key: "M", name: "(M)",        color: "#e8510a", width: 2 },
      { key: "Q", name: "Q= H-C",    color: "#9e9e9e", width: 3 },
      { key: "X", name: "X=(D+S+M)", color: "#c97d0a", width: 2.5 },
    ];

    const allV = series.flatMap(s => rows.map(r => Number(r[s.key]) || 0));
    const yMax = Math.ceil(Math.max(...allV, 1) / 50) * 50;
    const toX  = i => padL + (i / (rows.length - 1)) * cW;
    const toY  = v => padT + cH - (v / yMax) * cH;

    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, CW, CH);
    ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, cW, cH);

    ctx.fillStyle = "#111"; ctx.font = "bold 17px Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("Graph on Trucks Weighed per Hour", CW / 2, 10);

    ctx.font = "10px Arial"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let v = 0; v <= yMax; v += 50) {
      const y = toY(v);
      ctx.strokeStyle = "#ccc"; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cW, y); ctx.stroke();
      ctx.fillStyle = "#888"; ctx.fillText(v, padL - 5, y);
    }

    ctx.font = "9px Arial"; ctx.fillStyle = "#555";
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    rows.forEach((r, i) => {
      ctx.save();
      ctx.translate(toX(i), padT + cH + 5);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(r.time || "", 0, 0);
      ctx.restore();
    });

    series.forEach(s => {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.lineJoin = "round";
      ctx.beginPath();
      rows.forEach((r, i) => {
        const x = toX(i), y = toY(Number(r[s.key]) || 0);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    const legendY = CH - 14, swatchW = 24, gap = 120;
    let lx = (CW - series.length * gap) / 2;
    ctx.font = "11px Arial"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    series.forEach(s => {
      ctx.strokeStyle = s.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(lx, legendY); ctx.lineTo(lx + swatchW, legendY); ctx.stroke();
      ctx.fillStyle = "#111"; ctx.fillText(s.name, lx + swatchW + 5, legendY);
      lx += gap;
    });
  }, [rows, chartHeight]);

  // ← CHANGED: canvas renders at fixed chartHeight, width fills parent
  return <canvas ref={canvasRef} style={{ width: "100%", height: chartHeight, display: "block" }} />;
}

// ─────────────────────────────────────────────
// Page 2 — Daily Hourly Data + Chart
// Table and chart both fill full page height
// ─────────────────────────────────────────────

// Available content height (same budget as Page 1):
// A4_H(794) - padTop(18) - logo(40) - logoMargin(8) - padBot(14) - footer(22) = 692px
// Subtract section title (~22px) = 670px for the table+chart row
const PAGE2_CONTENT_H  = 620;   // reduced from 670 — leaves room for footer
const PAGE2_CHROME_H   = 22;    // section title
const PAGE2_TABLE_H    = PAGE2_CONTENT_H - PAGE2_CHROME_H; // 598px
const PAGE2_TOTAL_ROWS = 27;
const PAGE2_ROW_H      = Math.floor(PAGE2_TABLE_H / PAGE2_TOTAL_ROWS); // ~22px
const CHART_HEIGHT     = PAGE2_TABLE_H;


const Page2 = forwardRef(function Page2({ rows, date, settings, globalPageNum, totalPages }, ref) {
  if (!rows?.length) return null;

  const numKeys = ["N","M","Q","X"];
  const totals = {};
  numKeys.forEach(k => { totals[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0); });

  const th = {
    ...PDF.th,
    fontSize: 10.5,
    padding: "0 2px",
    height: PAGE2_ROW_H,
    lineHeight: 1.15,
  };
  const td = {
    ...PDF.td,
    fontSize: 10.5,
    padding: "0 2px",
    height: PAGE2_ROW_H,
  };
  const tdB = { ...td, fontWeight: "bold" };

  return (
    <PageWrapper ref={ref} globalPageNum={globalPageNum} totalPages={totalPages} date={date} settings={settings}>

      {/* Section title — fixed height, does not stretch */}
      <div style={{ ...PDF.sectionTitle, fontSize: 12, marginBottom: 4, flexShrink: 0 }}>
        2.&nbsp;&nbsp; DAILY HOURLY DATA
      </div>

      {/* Main row — table left, chart right, both fill remaining height */}
      <div style={{
        display:  "flex",
        gap:       0,
        flex:      1,          // fill all remaining page height
        minHeight: 0,
        alignItems: "stretch", // both children stretch to same height
      }}>

        {/* Table — left, fixed width ~30%, full height */}
        <div style={{
          flex:       "0 0 28%",
          boxSizing:  "border-box",
          display:    "flex",
          flexDirection: "column",
        }}>
          <table style={{
            borderCollapse: "collapse",
            tableLayout:    "fixed",
            width:          "100%",
            height:         "100%",   // fill the flex column
          }}>
            <colgroup>
              <col style={{ width: "30%" }} />
              <col style={{ width: "17.5%" }} />
              <col style={{ width: "17.5%" }} />
              <col style={{ width: "17.5%" }} />
              <col style={{ width: "17.5%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Time</th>
                <th style={th}>{"Multideck\nweighed"}</th>
                <th style={th}>{"Manu\nally"}</th>
                <th style={th}>{"HSWIM\nCleared"}</th>
                <th style={th}>{"Total\nweighed"}</th>
              </tr>
              <tr>
                <th style={th}></th>
                <th style={th}>N=(D+S)</th>
                <th style={th}>(M)</th>
                <th style={th}>Q = H-C</th>
                <th style={th}>X=(N+M)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td style={td}>{row.time}</td>
                  <td style={td}>{row.N ?? 0}</td>
                  <td style={td}>{row.M ?? 0}</td>
                  <td style={td}>{row.Q ?? 0}</td>
                  <td style={td}>{row.X ?? 0}</td>
                </tr>
              ))}
              <tr>
                <td style={tdB}>Total</td>
                {numKeys.map(k => <td key={k} style={tdB}>{totals[k]}</td>)}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Chart — right, fills all remaining width and full height */}
        <div style={{
          flex:       "1 1 0",
          minWidth:   0,
          paddingLeft: 16,
          display:    "flex",
          alignItems: "stretch",
        }}>
          <CanvasLineChart rows={rows} chartHeight={CHART_HEIGHT} />
        </div>

      </div>
    </PageWrapper>
  );
});

// ─────────────────────────────────────────────
// Page 3 — Traffic Census + Daily Summary + Transgressions
// Matches original PDF: compact stacked tables, NOT stretched to fill page.
// Content occupies upper ~60%, bottom is intentional white space.
// ─────────────────────────────────────────────
const Page3 = forwardRef(function Page3({
  summary, date, settings, globalPageNum, totalPages,
  transgressionRows, showSectionI
}, ref) {
  if (!summary) return null;

  const th = {
    ...PDF.th, fontSize: 12, padding: "3px 2px",
    lineHeight: 1.2, verticalAlign: "middle",
  };
  const td = {
    ...PDF.td, fontSize: 12, padding: "5px 3px", verticalAlign: "middle",
  };

  const hasRealRows = transgressionRows?.length > 0;

  const MAX_TRANSGRESSION_ROWS_WITH_SECTION_I = 4;
  const MAX_TRANSGRESSION_ROWS_WITHOUT_SECTION_I = 8;

  const maxRows = showSectionI
    ? MAX_TRANSGRESSION_ROWS_WITH_SECTION_I
    : MAX_TRANSGRESSION_ROWS_WITHOUT_SECTION_I;

  // Section 5 display rows
  const sec5DisplayRows = hasRealRows
    ? transgressionRows.slice(0, maxRows)
    : [{ date: "NIL", time: "", regNo: "", axleConfig: "", transporter: "",
         censusCLerk: "", policeCharge: "", actionTaken: "", caught: "",
         nextWBSent: "", nextWB: "-" }];

  // Section I display rows — only shown on this page when showSectionI=true
  const secIDisplayRows = hasRealRows
    ? transgressionRows
    : [{ date: "NIL", timeReceived: "", truckNo: "", sendingWB: "",
         ocsReported: "", action1: "", action2: "", evidence: "",
         weightNoted: "", taggedIn: "" }];

  return (
    <PageWrapper ref={ref} globalPageNum={globalPageNum} totalPages={totalPages} date={date} settings={settings}>

      {/* ── 3. TRAFFIC CENSUS DATA ── */}
      <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 14, color: "#000", marginBottom: 16 }}>
        3.&nbsp;&nbsp; TRAFFIC CENSUS DATA
      </div>
      <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%", marginBottom: 18 }}>
        <colgroup>
          <col style={{ width: "14%" }} /><col style={{ width: "22%" }} />
          <col style={{ width: "16%" }} /><col style={{ width: "12%" }} />
          <col style={{ width: "16%" }} /><col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={th}>{"Buses>=\n3500kg"}</th>
            <th style={th}>{"Vehicles>= 3500kg\nbut <7000 excluding\nbuses"}</th>
            <th style={th}>{"Vehicles>=\n7000\nexcluding\nbuses"}</th>
            <th style={th}>{"Total\nTraffic\nCensus\n(K)"}</th>
            <th style={th}>{"Exemption\npermits Not\nweighed (E)"}</th>
            <th style={th}>{"Total\nWeighed"}</th>
            <th style={th}>{"Total\nTraffic"}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>{(summary.buses || 0).toLocaleString()}</td>
            <td style={td}>{(summary.veh3500to7000 || 0).toLocaleString()}</td>
            <td style={td}>{(summary.veh7000plus || 0).toLocaleString()}</td>
            <td style={td}>{(summary.K || 0).toLocaleString()}</td>
            <td style={td}>{summary.E ?? 0}</td>
            <td style={td}>{summary.X ?? 0}</td>
            <td style={td}>{summary.T ?? 0}</td>
          </tr>
        </tbody>
      </table>

      {/* ── 4. DAILY SUMMARY ── */}
      <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 14, color: "#000", marginBottom: 6 }}>
        4.&nbsp;&nbsp; DAILY SUMMARY
      </div>
      <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%", marginBottom: 18 }}>
        <colgroup>
          {Array.from({ length: 16 }).map((_, i) => <col key={i} style={{ width: `${100/16}%` }} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={th}>{"Weighed\nby\nHSWIM\n(Q)"}</th>
            <th style={th}>{"Weighed\nMultideck\nScale\ntotal\n(N)=D+S"}</th>
            <th style={th}>{"Manually\nWeighed\n(M)"}</th>
            <th style={th}>{"Total\nweighed\n(X)"}</th>
            <th style={th}>{"Total\nTraffic\n(T)"}</th>
            <th style={th}>{"Total\nOverload\n(Y)\nA+Z+G+R"}</th>
            <th style={th}>{"Warned\n(A)"}</th>
            <th style={th}>{"Charged\n&Prohib\nited\n(Z)"}</th>
            <th style={th}>{"Special\nrelease\n(G)"}</th>
            <th style={th}>{"Vehicles\nCharged\nbut\nRedistrib\nuted (R)"}</th>
            <th style={th}>{"Impounded\n& prohibit\ned (P)\nZ+R+G"}</th>
            <th style={th}>{"Cases\ncleared\nin Court\n(B)"}</th>
            <th style={th}>{"Transgre\nssions"}</th>
            <th colSpan={3} style={th}>Exemption permits</th>
          </tr>
          <tr>
            <th style={th}>(Q=H-C)</th><th style={th}>(N)</th>
            <th style={th}>(M)</th><th style={th}>(X)=(S+M)</th>
            <th style={th}>(T)=(Q+X+K+E)</th><th style={th}>(Y)</th>
            <th style={th}>(A)</th><th style={th}>(Z)</th>
            <th style={th}>(G)</th><th style={th}>(R)</th>
            <th style={th}>(P)</th><th style={th}>(B)</th>
            <th style={th}>(L)</th>
            <th style={{ ...th, fontSize: 12 }}>{"Not\nweighed\n(E)"}</th>
            <th style={{ ...th, fontSize: 12 }}>{"Weighed\n(F)"}</th>
            <th style={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>{summary.Q ?? 0}</td><td style={td}>{summary.N ?? 0}</td>
            <td style={td}>{summary.M ?? 0}</td><td style={td}>{summary.X ?? 0}</td>
            <td style={td}>{summary.T ?? 0}</td><td style={td}>{summary.Y ?? 0}</td>
            <td style={td}>{summary.A ?? 0}</td><td style={td}>{summary.Z ?? 0}</td>
            <td style={td}>{summary.G ?? 0}</td><td style={td}>{summary.R ?? 0}</td>
            <td style={td}>{summary.P ?? 0}</td><td style={td}>{summary.B ?? 0}</td>
            <td style={td}>{summary.L ?? 0}</td><td style={td}>{summary.E ?? 0}</td>
            <td style={td}>{summary.F ?? 0}</td><td style={td}>{summary.exemptTotal ?? 0}</td>
          </tr>
        </tbody>
      </table>

      {/* ── 5. TRANSGRESSIONS ── */}
      <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 14, color: "#000", marginBottom: 16 }}>
        5.&nbsp;&nbsp; TRANSGRESSIONS
      </div>
      <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 12, color: "#000", marginBottom: 5, }}>
        DAILY TRANSGRESSIONS REPORT
      </div>
      <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%", marginBottom: showSectionI ? 16 : 0 }}>
        <colgroup>
          <col style={{ width: "8%" }} /><col style={{ width: "6%" }} />
          <col style={{ width: "8%" }} /><col style={{ width: "6%" }} />
          <col style={{ width: "13%" }} /><col style={{ width: "9%" }} />
          <col style={{ width: "9%" }} /><col style={{ width: "9%" }} />
          <col style={{ width: "7%" }} /><col style={{ width: "10%" }} />
          <col style={{ width: "7%" }} />
        </colgroup>
        <thead>
          <tr>
            {["Date","Time","Reg No","Axle\nConfig","Transporter",
              "Census\nClerk","Police In\ncharge","Action\nTaken",
              "Caught","Next WB\nreport sent","Next WB"
            ].map(label => <th key={label} style={{ ...th, fontSize: 12 }}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {sec5DisplayRows.map((row, ri) => (
            <tr key={ri}>
              <td style={td}>{row.date || ""}</td>
              <td style={td}>{row.time || ""}</td>
              <td style={td}>{row.regNo || ""}</td>
              <td style={td}>{row.axleConfig || ""}</td>
              <td style={td}>{row.transporter || ""}</td>
              <td style={td}>{row.censusCLerk || ""}</td>
              <td style={td}>{row.policeCharge || ""}</td>
              <td style={td}>{row.actionTaken || ""}</td>
              <td style={td}>{row.caught || ""}</td>
              <td style={td}>{row.nextWBSent || ""}</td>
              <td style={td}>{row.nextWB || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Section I — only rendered here when rows fit on page 3 ── */}
      {showSectionI && (
        <>
          <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 12, color: "#000", marginBottom: 4 }}>
            I.&nbsp;&nbsp; TRANSGRESSIONS ACTION REPORT
          </div>
          <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              <col style={{ width: "8%" }} /><col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} /><col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} /><col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} /><col style={{ width: "14%" }} />
              <col style={{ width: "10%" }} /><col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr>
                {["Date","Time\nReceived","Truck No.","Sending\nWB Station",
                  "OCS\nReported To","Action 1","Action 2",
                  "Attach Evidence\nIf any","Weight\nNoted","Tagged\nin System"
                ].map(label => <th key={label} style={{ ...th, fontSize: 12 }}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {secIDisplayRows.map((row, ri) => (
                <tr key={ri}>
                  <td style={td}>{row.date || ""}</td>
                  <td style={td}>{row.time || ""}</td>
                  <td style={td}>{row.regNo || ""}</td>
                  <td style={td}>{row.sendingWB || ""}</td>
                  <td style={td}>{row.ocsReported || ""}</td>
                  <td style={td}>{row.action1 || ""}</td>
                  <td style={td}>{row.action2 || ""}</td>
                  <td style={td}>{row.evidence || ""}</td>
                  <td style={td}>{row.weightNoted || ""}</td>
                  <td style={td}>{row.taggedIn || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

    </PageWrapper>
  );
});

// ─────────────────────────────────────────────
// ← NEW: Transgressions Action Report — Page 4
// Section "I. TRANSGRESSIONS ACTION REPORT"
// This was present in the original PDF but missing from the app.
// Columns: Date, Time Received, Truck No., Sending WB Station,
//          OCS Reported To, Action 1, Action 2, Attach Evidence,
//          Weight Noted, Tagged in System
// ─────────────────────────────────────────────
const ACTION_COLS = [
  { key: "date",          label: "Date" },
  { key: "timeReceived",  label: "Time\nReceived" },
  { key: "truckNo",       label: "Truck No." },
  { key: "sendingWB",     label: "Sending\nWB station" },
  { key: "ocsReported",   label: "OCS\nReported To" },
  { key: "action1",       label: "Action 1" },
  { key: "action2",       label: "Action 2" },
  { key: "evidence",      label: "Attach evidence\nIf any" },
  { key: "weightNoted",   label: "Weight\nNoted" },
  { key: "taggedIn",      label: "Tagged\nin System" },
];



// Only rendered when transgressionRows.length > TRANSGRESSION_OVERFLOW_THRESHOLD
function TransgressionsActionPageStandalone({
  rows, date, settings, pageRef, globalPageNum, totalPages,
  impoundedRows = [],      // ← new: impounded rows that fit on this page
}) {
  const th = { ...PDF.th, fontSize: 7.5, padding: "3px 2px", lineHeight: 1.2, verticalAlign: "middle" };
  const td = { ...PDF.td, fontSize: 8, padding: "4px 3px", verticalAlign: "middle" };

  // Calculate how much vertical space the transgression table uses
  const transgressionTableH = TRANSGRESSION_ACTION_CHROME_H + (rows.length * TRANSGRESSION_ACTION_ROW_H);
  const remainingH = CONTENT_H - transgressionTableH;
  const canFitImpounded = impoundedRows.length > 0 && remainingH >= (IMP_HEADER_H + MAX_IMP_ROW_H);

  const impTh = {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 11,
    padding: "4px 4px", textAlign: "center", verticalAlign: "middle",
    whiteSpace: "pre-line", lineHeight: 1.3,
  };
  const impTdLocal = {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontSize: 11,
    padding: "4px 5px", textAlign: "center", verticalAlign: "middle",
    maxHeight: MAX_IMP_ROW_H, overflow: "hidden",
  };
  const impColWidthsLocal = ["10%","12%","8%","5%","10%","9%","9%","6%","7%","10%","10%","9%"];

  return (
    <PageWrapper ref={pageRef} globalPageNum={globalPageNum} totalPages={totalPages} date={date} settings={settings}>

      {/* Transgression Action table */}
      <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 11, color: "#000", marginBottom: 4 }}>
        I.&nbsp;&nbsp; TRANSGRESSIONS ACTION REPORT
      </div>
      <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%", marginBottom: canFitImpounded ? 16 : 0 }}>
        <colgroup>
          <col style={{ width: "8%" }} /><col style={{ width: "8%" }} />
          <col style={{ width: "8%" }} /><col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} /><col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} /><col style={{ width: "14%" }} />
          <col style={{ width: "10%" }} /><col style={{ width: "12%" }} />
        </colgroup>
        <thead>
          <tr>
            {["Date","Time\nReceived","Truck No.","Sending\nWB Station",
              "OCS\nReported To","Action 1","Action 2",
              "Attach Evidence\nIf any","Weight\nNoted","Tagged\nin System"
            ].map(label => <th key={label} style={{ ...th, fontSize: 7.5 }}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              <td style={td}>{row.date || ""}</td>
              <td style={td}>{row.time || ""}</td>
              <td style={td}>{row.regNo || ""}</td>
              <td style={td}>{row.sendingWB || ""}</td>
              <td style={td}>{row.ocsReported || ""}</td>
              <td style={td}>{row.action1 || ""}</td>
              <td style={td}>{row.action2 || ""}</td>
              <td style={td}>{row.evidence || ""}</td>
              <td style={td}>{row.weightNoted || ""}</td>
              <td style={td}>{row.taggedIn || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Impounded rows that fit on this page */}
      {canFitImpounded && (
        <>
          <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 13, color: "#000", marginBottom: 10, marginTop: 8, }}>
            6.&nbsp;&nbsp; IMPOUNDED &amp; PROHIBITED
          </div>
          <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%",  }}>
            <colgroup>
              {impColWidthsLocal.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                {IMPOUNDED_COLUMNS.map(col => <th key={col.key} style={impTh}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {impoundedRows.map((row, ri) => (
                <tr key={ri}>
                  {IMPOUNDED_COLUMNS.map(col => (
                    <td key={col.key} style={impTdLocal}>
                      <div style={{
                        maxHeight: MAX_IMP_ROW_H - 8, overflow: "hidden",
                        display: "-webkit-box", WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical", textOverflow: "ellipsis",
                      }}>
                        {formatImpoundedCell(col.key, row[col.key]) ?? ""}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </PageWrapper>
  );
}

// ── Unified transgression row schema ─────────────────────────
// Drives BOTH section 5 (Daily Transgressions) and section I (Action Report)
const TRANSGRESSION_COLS = [
  // ── Shared (auto-linked between both tables) ──
  { key: "date",         label: "Date",                 section: "both" },
  { key: "time",         label: "Time",                 section: "both" },
  { key: "regNo",        label: "Reg No / Truck No.",   section: "both" },
  // ── Section 5 only ──
  { key: "axleConfig",   label: "Axle Config",          section: 5 },
  { key: "transporter",  label: "Transporter",          section: 5 },
  { key: "censusCLerk",  label: "Census Clerk",         section: 5 },
  { key: "policeCharge", label: "Police In charge",     section: 5 },
  { key: "actionTaken",  label: "Action Taken",         section: 5 },
  { key: "caught",       label: "Caught",               section: 5 },
  { key: "nextWBSent",   label: "Next WB report sent",  section: 5 },
  { key: "nextWB",       label: "Next WB",              section: 5 },
  // ── Section I only ──
  { key: "sendingWB",    label: "Sending WB Station",   section: "I" },
  { key: "ocsReported",  label: "OCS Reported To",      section: "I" },
  { key: "action1",      label: "Action 1",             section: "I" },
  { key: "action2",      label: "Action 2",             section: "I" },
  { key: "evidence",     label: "Attach Evidence",      section: "I" },
  { key: "weightNoted",  label: "Weight Noted",         section: "I" },
  { key: "taggedIn",     label: "Tagged in System",     section: "I" },
];

function emptyRow() {
  return Object.fromEntries(TRANSGRESSION_COLS.map(c => [c.key, ""]));
}

// ← CHANGED: TransgressionsPage is now edit-UI only — no PageWrapper, no table rendering
// The table is rendered inside Page3 component above.
function TransgressionsEditControls({ rows, onRowChange, onAddRow, onRemoveRow }) {
  const sec5Fields  = TRANSGRESSION_COLS.filter(c => c.section === "both" || c.section === 5);
  const secIFields  = TRANSGRESSION_COLS.filter(c => c.section === "I");

  return (
    <div className="no-print">
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
        <span style={{ color: "#94a3b8", fontSize: 11 }}>Transgressions</span>
        <button onClick={onAddRow} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 4, color: "#4ade80", padding: "4px 12px", fontSize: 11, cursor: "pointer" }}>
          + Add Row
        </button>
        {rows.length > 0 && (
          <button onClick={() => onRemoveRow(rows.length - 1)} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 4, color: "#f87171", padding: "4px 12px", fontSize: 11, cursor: "pointer" }}>
            − Remove Last
          </button>
        )}
      </div>
      {rows.map((row, ri) => (
        <div key={ri} style={{ marginBottom: 10, padding: 10, background: "#1e293b", borderRadius: 6 }}>
          <div style={{ color: "#4ade80", fontSize: 10, fontWeight: 700, marginBottom: 8 }}>
            Vehicle {ri + 1}
          </div>
          {/* Shared + Section 5 fields */}
          <div style={{ color: "#64748b", fontSize: 9, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Section 5 — Daily Transgressions
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {sec5Fields.map(col => (
              <div key={col.key} style={{ display: "flex", flexDirection: "column", minWidth: 90 }}>
                <label style={{ color: "#64748b", fontSize: 9, marginBottom: 2 }}>{col.label}</label>
                <input
                  value={row[col.key] || ""}
                  onChange={e => onRowChange(ri, col.key, e.target.value)}
                  style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 3, color: "#e2e8f0", fontSize: 10, padding: "3px 6px", width: "100%" }}
                />
              </div>
            ))}
          </div>
          {/* Section I fields */}
          <div style={{ color: "#64748b", fontSize: 9, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Section I — Action Report <span style={{ color: "#475569" }}>(Date, Time, Reg No auto-linked)</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {secIFields.map(col => (
              <div key={col.key} style={{ display: "flex", flexDirection: "column", minWidth: 90 }}>
                <label style={{ color: "#64748b", fontSize: 9, marginBottom: 2 }}>{col.label}</label>
                <input
                  value={row[col.key] || ""}
                  onChange={e => onRowChange(ri, col.key, e.target.value)}
                  style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 3, color: "#e2e8f0", fontSize: 10, padding: "3px 6px", width: "100%" }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// WideLoadsPages
// ─────────────────────────────────────────────
const WIDE_ROW_H       = 106;
const WIDE_HEADER_H    = 102;
const WIDE_TITLE_H     = 48;
const IMP_ROW_H_EST    = 44;
const IMP_HEADER_H_EST = 36;
const IMP_TITLE_H_EST  = 46;
const CONTENT_H        = 692;  // ← was missing, used by packWideRowsIntoPages
const WIDE_ROWS_PER_PAGE = 6;

function WideLoadsPages({ result, settings, pageRefs, globalStartPage, totalPages, date }) {
  if (!result?.allRows?.length) return null;
  const allRows = result.allRows ?? result.previewRows ?? [];
  const chunks  = [];
  for (let i = 0; i < allRows.length; i += WIDE_ROWS_PER_PAGE) {
    chunks.push(allRows.slice(i, i + WIDE_ROWS_PER_PAGE));
  }

  const totalWeight = PDF_COLUMNS.reduce((s, col) => s + (COLUMN_WEIGHTS[col.key] ?? 1.5), 0);

  // ── Fixed row height — prevents Cargo from stretching other cells ──
  // A4 content: 692px - title(28px) - header(72px) = 592px / 5 rows = ~118px
  // ── Height budget per page ────────────────────────────────────
  // A4 content area: 692px
  // First chunk:  692 - title(28+18 margin) - header(80) = 566px / 5 rows = ~113px
  // Other chunks: 692 - header(0, hidden)                = 692px / 5 rows = ~138px
  const HEADER_H      = 84;
  const TITLE_H       = 48;  // section title + margin
  const CONTENT_H     = 692;
  const ROW_H_FIRST   = Math.floor((CONTENT_H - TITLE_H - HEADER_H) / WIDE_ROWS_PER_PAGE); // ~113px
  const ROW_H_CONT    = Math.floor((CONTENT_H - HEADER_H) / WIDE_ROWS_PER_PAGE);


  return (
    <>
      {chunks.map((chunk, ci) => {
        // ← use correct row height based on whether header is visible
        const ROW_H = ci === 0 ? ROW_H_FIRST : ROW_H_CONT;

        const th = {
          background: "#fff", color: "#000", border: "1px solid #000",
          fontFamily: "Arial, sans-serif", fontWeight: "800", fontSize: 12,
          padding: "0", textAlign: "center", verticalAlign: "bottom",
          height: HEADER_H, overflow: "hidden",
        };
        const td = {
          background: "#fff", color: "#000", border: "1px solid #000",
          fontFamily: "Arial, sans-serif", fontSize: 12,
          padding: "0", textAlign: "center", verticalAlign: "middle",
          overflow: "hidden",
          height: ROW_H,
          maxHeight: ROW_H,
        };
        const tdInner = {
          writingMode: "vertical-lr",
          transform: "rotate(180deg)",
          display: "inline-block",
          padding: "4px 2px",
          fontSize: 12,
          fontFamily: "Arial, sans-serif",
          whiteSpace: "normal",
          wordBreak: "break-word",
          textAlign: "left",
          maxHeight: ROW_H - 8,
          overflow: "hidden",
          textOverflow: "ellipsis",
        };

        return (
          <PageWrapper
            key={ci}
            ref={el => { if (pageRefs) pageRefs.current[ci] = el; }}
            globalPageNum={globalStartPage + ci}
            totalPages={totalPages}
            date={date}
            settings={settings}
          >
            {ci === 0 && (
              <div style={{
                fontFamily: "Arial, sans-serif", fontWeight: "bold",
                fontSize: 14, color: "#000", marginBottom: 18,
              }}>
                7.&nbsp;&nbsp;{" "}
                <span style={{ textDecoration: "underline" }}>
                  VEHICLE INSPECTION REPORT (WIDE LOADS)
                </span>
              </div>
            )}

            <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}>
              <colgroup>
                {PDF_COLUMNS.map((col) => (
                  <col key={col.key} style={{ width: `${((COLUMN_WEIGHTS[col.key] ?? 1.5) / totalWeight * 100).toFixed(1)}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {PDF_COLUMNS.map(col => (
                    <th key={col.key} style={{
                      ...th,
                      opacity: ci === 0 ? 1 : 0,
                      height: ci === 0 ? HEADER_H : 0,
                      border: ci === 0 ? "1px solid #000" : "none",
                      overflow: "hidden",
                    }}>
                      {ci === 0 && (
                        <div style={{
                          writingMode: "vertical-lr",
                          transform: "rotate(180deg)",
                          display: "inline-block",
                          padding: "3px 2px",
                          fontSize: 12, fontWeight: 800,
                          fontFamily: "Arial, sans-serif",
                          whiteSpace: "pre-line",
                          height: "100%",
                          textAlign: "left",
                        }}>
                          {col.label}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chunk.map((row, ri) => (
                  <tr key={ri} style={{ height: ROW_H }}>
                    {PDF_COLUMNS.map(col => (
                      <td key={col.key} style={td}>
                        <div style={tdInner}>
                          {formatCell(col.key, row[col.key]) ?? ""}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </PageWrapper>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────
// ImpoundedPages — Section 6
// Renders allRows from the sidebar Impounded & Prohibited upload.
// Matches original PDF: tall rows, readable text, 6 rows per page.
// ─────────────────────────────────────────────
const IMP_ROWS_PER_PAGE    = 11;   // keep for estimation fallback
const MAX_IMP_ROW_H        = 52;   // hard cap on row height
const IMP_HEADER_H         = 38;   // actual rendered header height
const IMP_TITLE_H          = 46;   // section title + margin (first page only)
const IMP_AVAIL_FIRST      = CONTENT_H - IMP_TITLE_H - IMP_HEADER_H; // 608px
const IMP_AVAIL_CONT       = CONTENT_H - IMP_HEADER_H;               // 654px
const IMP_ROWS_FIRST_PAGE  = Math.floor(IMP_AVAIL_FIRST / MAX_IMP_ROW_H); // 11
const IMP_ROWS_CONT_PAGE   = Math.floor(IMP_AVAIL_CONT  / MAX_IMP_ROW_H);

function ImpoundedPages({ result, settings, pageRefs, globalStartPage, totalPages, date }) {
  const allRows = result?.allRows ?? result?.rows ?? [];
  if (!allRows.length) return null;

  const chunks = [];
  for (let i = 0; i < allRows.length; i += IMP_ROWS_PER_PAGE) {
    chunks.push(allRows.slice(i, i + IMP_ROWS_PER_PAGE));
  }

  // ── Row height — distributes evenly, no empty filler rows ────
  // A4 content: 692px - section title (28px) - header (36px) = 628px
  // Last chunk may have fewer rows so we let the browser size naturally
  const ROW_H = 100;

  const th = {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 12,
    padding: "6px 4px", textAlign: "center", verticalAlign: "middle",
    whiteSpace: "pre-line", lineHeight: 1.3,
  };

  const colWidths = [
    "10%",  // DateWeighed
    "12%",  // Transporter
    "8%",   // VehicleReg
    "5%",   // AxleConfig
    "10%",  // Cargo
    "9%",   // Source
    "9%",   // Destination
    "6%",   // AxleOverload
    "7%",   // GVWOverload
    "10%",  // ProhibitionOrder
    "10%",   // Prosecutor
    "9%",   // ComputerOperator
  ];

  return (
  <>
    {chunks.map((chunk, ci) => {

       // A4 content: 692px - section title first page (46px) or 0 - header (36px)
      const MAX_ROW_H = 110;
      // Distribute evenly across however many rows this chunk has
      

      // ← td defined inside loop so isLastChunk is in scope
       const td = {
        background: "#fff", color: "#000", border: "1px solid #000",
        fontFamily: "Arial, sans-serif", fontSize: 12,
        padding: "6px 5px", textAlign: "center", verticalAlign: "middle",
        wordBreak: "break-word", lineHeight: 1.4,height: ROW_H,
        maxHeight: ROW_H,
      };

      return (
        <PageWrapper
          key={ci}
          ref={el => { if (pageRefs) pageRefs.current[ci] = el; }}
          globalPageNum={globalStartPage + ci}
          totalPages={totalPages}
          date={date}
          settings={settings}
        >
          {ci === 0 && (
            <div style={{
              fontFamily: "Arial, sans-serif", fontWeight: "bold",
              fontSize: 14, color: "#000", marginBottom: 18,
            }}>
              6.&nbsp;&nbsp; IMPOUNDED &amp; PROHIBITED
            </div>
          )}
          <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%", borderBottom: "1px solid #000", height: ci === 0 ? `${692 - 46}px` : "646px",}}>
            <colgroup>
              {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                {IMPOUNDED_COLUMNS.map(col => (
                  <th key={col.key} style={th}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chunk.map((row, ri) => (
                <tr key={ri}>
                  {IMPOUNDED_COLUMNS.map(col => (
                    <td key={col.key} style={td}>
                      {formatImpoundedCell(col.key, row[col.key]) ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </PageWrapper>
      );
    })}
  </>
);
}

function estimateImpoundedHeight(rowCount, isFirstPage) {
  const titleH  = isFirstPage ? IMP_TITLE_H_EST : 0;
  return titleH + IMP_HEADER_H_EST + (rowCount * IMP_ROW_H_EST);
}

// ── Pack rows into pages given available height per page ──────
function packWideRowsIntoPages(rows, firstPageAvailH) {
  if (!rows.length) return [];
  const CONT_AVAIL  = CONTENT_H - WIDE_HEADER_H;
  const CLEAN_AVAIL = CONTENT_H - WIDE_TITLE_H - WIDE_HEADER_H;
  const minToStart  = WIDE_HEADER_H + WIDE_ROW_H + 40;
  const pages = [];
  if (firstPageAvailH >= minToStart) {
    const rowsFit = Math.floor((firstPageAvailH - WIDE_HEADER_H) / WIDE_ROW_H);
    pages.push({ rows: rows.splice(0, rowsFit), isShared: true, showTitle: false });
  }
  if (rows.length > 0) {
    const rowsFit = Math.floor(CLEAN_AVAIL / WIDE_ROW_H);
    pages.push({ rows: rows.splice(0, rowsFit), isShared: false, showTitle: true });
  }
  while (rows.length > 0) {
    const rowsFit = Math.floor(CONT_AVAIL / WIDE_ROW_H);
    pages.push({ rows: rows.splice(0, rowsFit), isShared: false, showTitle: false });
  }
  return pages;
}
 

function ImpoundedAndWideLoadsPages({
  impoundedResult, wideLoadResult, settings,
  impoundedStartPage, wideStartPage, totalPages, date, skipTitle = false,
}) {
  const impAllRows  = impoundedResult?.allRows ?? impoundedResult?.rows ?? [];
  const wideAllRows = [...(wideLoadResult?.allRows ?? [])]; // copy — splice mutates

  const impChunks = [];
  let impRemaining = [...impAllRows];
  if (impRemaining.length > 0) {
    impChunks.push(impRemaining.splice(0, IMP_ROWS_FIRST_PAGE));
  }
  while (impRemaining.length > 0) {
    impChunks.push(impRemaining.splice(0, IMP_ROWS_CONT_PAGE));
  }

  // ── Calculate remaining space on last impounded page ─────
  const lastChunk        = impChunks[impChunks.length - 1] ?? [];
  const isFirstImpPage   = impChunks.length === 1;
  const lastImpUsedH     = estimateImpoundedHeight(lastChunk.length, isFirstImpPage);
  const lastImpRemaining = CONTENT_H - lastImpUsedH; // space left after impounded ends

  // ── Pack wide loads rows ──────────────────────────────────
  const widePages = packWideRowsIntoPages([...wideAllRows], lastImpRemaining);

  const totalWeight = PDF_COLUMNS.reduce((s, col) => s + (COLUMN_WEIGHTS[col.key] ?? 1.5), 0);

  const impTh = {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 12,
    padding: "6px 4px", textAlign: "center", verticalAlign: "middle",
    whiteSpace: "pre-line", lineHeight: 1.3,
  };
  const impTd = {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontSize: 11,
    padding: "4px 5px", textAlign: "center", verticalAlign: "middle",
    wordBreak: "break-word", lineHeight: 1.3,
    maxHeight: MAX_IMP_ROW_H,
    overflow: "hidden",
  };
  const impColWidths = ["10%","12%","8%","5%","10%","9%","9%","6%","7%","10%","10%","9%"];

  const renderWideTable = (chunk, showHeader,  availableH = null) => {
    const wideTh = {
      background: "#fff", color: "#000",
      border: showHeader ? "1px solid #000" : "none",
      padding: "0", textAlign: "center", verticalAlign: "bottom",
      height: showHeader ? WIDE_HEADER_H : 0,
      overflow: "hidden",
      opacity: showHeader ? 1 : 0,
    };

    const headerH  = showHeader ? WIDE_HEADER_H : 0;
    const usableH  = availableH
      ? availableH - headerH + 10          // 10px safety buffer
      : CONTENT_H - headerH ;
    const ROW_H    = Math.min(
    WIDE_ROW_H,                          // never exceed normal row height
    Math.floor(usableH  / chunk.length)    // fit all rows in available space
  ) + 18;
    return (
      <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}>
        <colgroup>
          {PDF_COLUMNS.map(col => (
            <col key={col.key} style={{ width: `${((COLUMN_WEIGHTS[col.key] ?? 1.5) / totalWeight * 100).toFixed(1)}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr key="header" style={{ height: ROW_H }}>
            {PDF_COLUMNS.map(col => (
              <th key={col.key} style={{...wideTh, height: WIDE_HEADER_H, maxHeight: WIDE_HEADER_H,}}>
                {showHeader && (
                  <div style={{
                    writingMode: "vertical-lr", transform: "rotate(180deg)",
                    display: "inline-block", padding: "3px 2px",
                    fontSize: 12, fontWeight: 800,
                    fontFamily: "Arial, sans-serif", whiteSpace: "pre-line",
                    height: ROW_H - 4, textAlign: "left",
                  }}>
                    {col.label}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chunk.map((row, ri) => (
            <tr key={ri} style={{ height: WIDE_ROW_H }}>
              {PDF_COLUMNS.map(col => (
                <td key={col.key} style={{
                  background: "#fff", color: "#000", border: "1px solid #000",
                  padding: "0", textAlign: "center", verticalAlign: "middle",
                  overflow: "hidden",
                  height: WIDE_ROW_H, maxHeight: WIDE_ROW_H,
                }}>
                  <div style={{
                    writingMode: "vertical-lr", transform: "rotate(180deg)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "2px",
                    fontSize: 12, fontFamily: "Arial, sans-serif",
                    whiteSpace: "normal", wordBreak: "break-word",
                    overflow: "hidden",
                    height: WIDE_ROW_H - 4, width: "100%",
                  }}>
                    {formatCell(col.key, row[col.key]) ?? ""}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  if (!impChunks.length && !widePages.length) return null;

  // ── Track global page numbers ─────────────────────────────
  // let impPageOffset = 0;
  // let widePageOffset = 0;

  return (
    <>
      {/* ── All impounded pages except last ── */}
      {impChunks.slice(0, -1).map((chunk, ci) => {
      // Calculate dynamic row height to fill the page
      const isFirstPage = ci === 0 && !skipTitle;
      const availH = isFirstPage
        ? CONTENT_H - IMP_TITLE_H - IMP_HEADER_H  // 608px 
        : CONTENT_H - IMP_HEADER_H ;                 // 654px
      const rowH = Math.min(MAX_IMP_ROW_H, Math.floor(availH / chunk.length)) - 10;
      const filledTd = { ...impTd, height: rowH, maxHeight: rowH };
      const tableH = isFirstPage ? 560 : 610;

      return (
        <PageWrapper
          key={`imp-${ci}`}
          ref={null}
          globalPageNum={impoundedStartPage + ci}
          totalPages={totalPages}
          date={date}
          settings={settings}
        >
          {ci === 0 && !skipTitle && (
            <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 14, color: "#000", marginBottom: 18, }}>
              6. <span style={{ padding: 0, textDecoration: "underline", }}>&nbsp;&nbsp; IMPOUNDED &amp; PROHIBITED</span>
            </div>
          )}
          <table style={{
            borderCollapse: "collapse", tableLayout: "fixed", width: "100%",
            height: tableH, maxHeight: tableH,
          }}>
            <colgroup>{impColWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr>{IMPOUNDED_COLUMNS.map(col => <th key={col.key} style={impTh}>{col.label}</th>)}</tr>
            </thead>
            <tbody>
              {chunk.map((row, ri) => (
                <tr key={ri} style={{ height: rowH }}>
                  {IMPOUNDED_COLUMNS.map(col => (
                    <td key={col.key} style={filledTd}>
                      <div style={{
                        maxHeight: rowH ,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        textOverflow: "ellipsis",
                      }}>
                        {formatImpoundedCell(col.key, row[col.key]) ?? ""}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
    </PageWrapper>
  );
})}

      {/* ── Last impounded chunk ── */}
      {impChunks.length > 0 && (() => {
        const lastImpChunk = impChunks[impChunks.length - 1];
        const sharedWidePage = widePages[0]?.isShared ? widePages[0] : null;
        const pageNum = impoundedStartPage + impChunks.length - 1;

        return (
          <PageWrapper
            key="imp-last"
            ref={null}
            globalPageNum={pageNum}
            totalPages={totalPages}
            date={date}
            settings={settings}
          >
            {impChunks.length === 1 && (
              <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 14, color: "#000", marginBottom: 12 }}>
                6.&nbsp;&nbsp; IMPOUNDED &amp; PROHIBITED
              </div>
            )}
            <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%", marginBottom: sharedWidePage ? 10 : 0, borderBottom: "1px solid #000" }}>
              <colgroup>{impColWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead>
                <tr>{IMPOUNDED_COLUMNS.map(col => <th key={col.key} style={impTh}>{col.label}</th>)}</tr>
              </thead>
              <tbody>
                {lastImpChunk.map((row, ri) => (
                  <tr key={ri}>
                    {IMPOUNDED_COLUMNS.map(col => (
                      <td key={col.key} style={impTd}>{formatImpoundedCell(col.key, row[col.key]) ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Wide loads on same page only if first widePage is shared */}
            {sharedWidePage && (
              <>
                <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 14, color: "#000", marginBottom: 28, marginTop: 28 }}>
                  7.&nbsp;&nbsp;<span style={{ textDecoration: "underline" }}>VEHICLE INSPECTION REPORT (WIDE LOADS)</span>
                </div>
                {renderWideTable(
                  sharedWidePage.rows,
                  true,
                  lastImpRemaining - 60  // 60px = section title + margins
                )}
              </>
            )}
          </PageWrapper>
        );
      })()}

      {/* ── Remaining wide loads pages ── */}
      {widePages
        .filter((_, i) => !(i === 0 && widePages[0].isShared)) // skip shared page already rendered
        .map((page, ci) => (
          <PageWrapper
            key={`wide-${ci}`}
            ref={null}
            globalPageNum={wideStartPage + ci + (widePages[0]?.isShared ? 1 : 0)}
            totalPages={totalPages}
            date={date}
            settings={settings}
          >
            {renderWideTable(page.rows, true)}
          </PageWrapper>
        ))
      }
    </>
  );
}

// ─────────────────────────────────────────────
// HswimSection (root export)
// ← CHANGED: global page numbering computed here and passed to all page components
// ← CHANGED: TransgressionsEditControls replaces old TransgressionsPage (edit-only)
// ← CHANGED: Page3 now receives transgressionRows directly
// ← NEW: TransgressionsActionPage added between Page3 and ImpoundedPages
// ─────────────────────────────────────────────
export default function HswimSection({
  section, onStatusChange, wideLoadE = 0, wideLoadDone = false,
  settings, wideLoadResult = null, impoundedResult: impoundedResultProp = null,
  manualFields: manualFieldsProp = null,
  updateManual: updateManualProp = null,
  embeddedMode = false,
  hswimUpload = null,
}) {
  const ownUpload = useHswimUpload(onStatusChange, section.id);
  const {
    hswimFile, impoundedFile,
    hswimResult, impoundedResult,
    busy, error,
    manualFields: manualFieldsInternal,
    updateManual: updateManualInternal,
    uploadHswim, uploadImpounded,
    clearHswim, clearImpounded,
    buildFinalReport,
  } = hswimUpload ?? ownUpload;
 
  const manualFields = manualFieldsProp ?? manualFieldsInternal;
  const updateManual = updateManualProp ?? updateManualInternal;
  const hasHswim     = !!hswimResult;
  const hasImpounded = !!impoundedResult;
  const F            = impoundedResult?.F ?? 0;
 
  const [transgressionRows, setTransgressionRows] = useState([]);
  const addTransgressionRow    = () => setTransgressionRows(prev => [...prev, emptyRow()]);
  const removeTransgressionRow = (i) => setTransgressionRows(prev => prev.filter((_, idx) => idx !== i));
  const updateTransgressionRow = (i, key, val) =>
    setTransgressionRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
 
  const sectionIOnPage4 = transgressionRows.length > TRANSGRESSION_OVERFLOW_THRESHOLD;
 
  const page1Ref    = useRef(null);
  const page2Ref    = useRef(null);
  const page3Ref    = useRef(null);
  const page4Ref    = useRef(null);
  const impPageRefs = useRef([]);
  const widePageRefs = useRef([]);
 
  const totalPages = useMemo(() => {
  const transActionH = TRANSGRESSION_ACTION_CHROME_H + (transgressionRows.length * TRANSGRESSION_ACTION_ROW_H);
  const remainingOnPage4 = CONTENT_H - transActionH;
  const impAvailOnPage4 = remainingOnPage4 - 30 - IMP_HEADER_H;
  const rowsFitOnPage4 = sectionIOnPage4 && impAvailOnPage4 >= MAX_IMP_ROW_H
    ? Math.floor(impAvailOnPage4 / MAX_IMP_ROW_H)
    : 0;
  const impRowsOnPage4 = rowsFitOnPage4 >= 2 ? rowsFitOnPage4 : 0;
  return computeTotalPages(impoundedResultProp, wideLoadResult, transgressionRows.length, impRowsOnPage4);
  }, [impoundedResultProp, wideLoadResult, transgressionRows.length, sectionIOnPage4]);
 
  const impoundedStartPage = sectionIOnPage4 ? 5 : 4;
  const impRowCount  = impoundedResultProp?.allRows?.length ?? impoundedResultProp?.rows?.length ?? 0;
  const impChunks    = impRowCount > 0 ? Math.ceil(impRowCount / IMP_ROWS_PER_PAGE) : 0;
  const wideStartPage = impoundedStartPage + impChunks;
 
  const hourlyRowsWithE = useMemo(() => {
    if (!hasHswim) return null;
    return distributeE(hswimResult.reportData?.hourlyRows, wideLoadE);
  }, [hasHswim, hswimResult, wideLoadE]);
 
  const graphRows = useMemo(() => {
    if (!hourlyRowsWithE) return null;
    return hourlyRowsWithE.map(row => ({
      time: row.time,
      N: (row.D || 0) + (row.S || 0),
      M: row.M || 0,
      Q: row.Q || 0,
      X: (row.D || 0) + (row.S || 0) + (row.M || 0),
    }));
  }, [hourlyRowsWithE]);
 
  const liveSummary = useMemo(() => {
    if (!hasHswim) return null;
    return buildLiveSummary({ hourlyRows: hourlyRowsWithE, manualFields, F, E: wideLoadE });
  }, [hasHswim, hourlyRowsWithE, manualFields, F, wideLoadE]);
 
  const handleGenerate = async () => {
    const report = await buildFinalReport(wideLoadE);
    if (!report) return;
    onStatusChange(section.id, "success", { reportData: report, ready: true });
    setTimeout(() => { window.print(); }, 300);
  };

  if (embeddedMode) {
    return (
      <div id="hswim-print-region" style={{ overflowX: "auto", marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center"}}>
        {hasHswim && (
          <>
            <Page1
              ref={page1Ref}
              rows={hourlyRowsWithE}
              date={manualFields.date}
              preparedBy={manualFields.preparedBy}
              approvedBy={manualFields.approvedBy}
              settings={settings}
              globalPageNum={1}
              totalPages={totalPages}
            />
            <Page2
              ref={page2Ref}
              rows={graphRows}
              date={manualFields.date}
              settings={settings}
              globalPageNum={2}
              totalPages={totalPages}
            />
            <Page3
              ref={page3Ref}
              summary={liveSummary}
              date={manualFields.date}
              settings={settings}
              globalPageNum={3}
              totalPages={totalPages}
              transgressionRows={transgressionRows}
              showSectionI={!sectionIOnPage4}
            />
            <TransgressionsEditControls
              rows={transgressionRows}
              onRowChange={updateTransgressionRow}
              onAddRow={addTransgressionRow}
              onRemoveRow={removeTransgressionRow}
            />
            
            // AFTER — split them so ImpoundedAndWideLoadsPages always renders:
            {sectionIOnPage4 && (() => {
              const transActionH = TRANSGRESSION_ACTION_CHROME_H + (transgressionRows.length * TRANSGRESSION_ACTION_ROW_H);
              const remainingOnPage4 = CONTENT_H - transActionH;
              const impAllRows = impoundedResultProp?.allRows ?? impoundedResultProp?.rows ?? [];
              const impAvailOnPage4 = remainingOnPage4 - 30 - IMP_HEADER_H;
              const rowsFitOnPage4 = impAvailOnPage4 >= MAX_IMP_ROW_H
                ? Math.floor(impAvailOnPage4 / MAX_IMP_ROW_H)
                : 0;
              const impRowsOnPage4 = rowsFitOnPage4 >= 2 ? impAllRows.slice(0, rowsFitOnPage4) : [];

              return (
                <TransgressionsActionPageStandalone
                  rows={transgressionRows}
                  date={manualFields.date}
                  settings={settings}
                  pageRef={page4Ref}
                  globalPageNum={4}
                  totalPages={totalPages}
                  impoundedRows={impRowsOnPage4}
                />
              );
            })()}

{/* ImpoundedAndWideLoadsPages ALWAYS renders — outside the sectionIOnPage4 block */}
{(() => {
  const impAllRows = impoundedResultProp?.allRows ?? impoundedResultProp?.rows ?? [];
  const transActionH = TRANSGRESSION_ACTION_CHROME_H + (transgressionRows.length * TRANSGRESSION_ACTION_ROW_H);
  const remainingOnPage4 = CONTENT_H - transActionH;
  const impAvailOnPage4 = remainingOnPage4 - 30 - IMP_HEADER_H;
  const rowsFitOnPage4 = sectionIOnPage4 && impAvailOnPage4 >= MAX_IMP_ROW_H
    ? Math.floor(impAvailOnPage4 / MAX_IMP_ROW_H)
    : 0;
  const impRowsOnPage4 = rowsFitOnPage4 >= 2 ? impAllRows.slice(0, rowsFitOnPage4) : [];
  const impRowsRemaining = impRowsOnPage4.length > 0
    ? { ...impoundedResultProp, allRows: impAllRows.slice(impRowsOnPage4.length) }
    : impoundedResultProp;

  return (
    <ImpoundedAndWideLoadsPages
      impoundedResult={impRowsRemaining}
      wideLoadResult={wideLoadResult}
      settings={settings}
      impPageRefs={impPageRefs}
      widePageRefs={widePageRefs}
      impoundedStartPage={impoundedStartPage}
      wideStartPage={wideStartPage}
      totalPages={totalPages}
      date={manualFields.date}
      skipTitle={impRowsOnPage4.length > 0}
    />
  );
})()}   
          </>
        )}
      </div>
    );
  }
 
  return (
    <div style={{ display: "flex", gap: 0, alignItems: "flex-start", height: "100%" }}>

      {/* ── LEFT: upload zones + PDF preview ─────── */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", padding: "20px" }}>

        {/* Wide loads warning banner */}
        {!wideLoadDone && (
          <div style={{
            background: "rgba(234,179,8,0.08)",
            border: "1px solid rgba(234,179,8,0.3)",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            marginBottom: 16,
            color: "#fbbf24",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ fontSize: 18 }}>⚠</span>
            Upload the Wide Loads Report first — Exemption Permits Not Weighed (E)
            is derived from that row count and is required for this report.
          </div>
        )}

        {/* Upload grid */}
        <div className="section-heading">File Uploads</div>
        <div className="upload-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 20 }}>

          {/* HSWIM upload zone */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              HSWIM Daily Statistics
              {hasHswim && (
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 20,
                  background: "rgba(34,197,94,0.12)", color: "#4ade80",
                  border: "1px solid rgba(34,197,94,0.25)",
                }}>
                  ✓ {hswimResult.totalRows} rows
                </span>
              )}
              {wideLoadDone && (
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 20,
                  background: "rgba(59,157,224,0.12)", color: "var(--blue-400)",
                  border: "1px solid rgba(59,157,224,0.25)",
                }}>
                  E = {wideLoadE}
                </span>
              )}
            </div>
            <Dropzone
              label="Drop HSWIM Daily CSV / XLSX"
              sublabel=".csv or .xlsx · 24 hourly rows"
              file={hswimFile}
              onDrop={uploadHswim}
              onClear={clearHswim}
              busy={busy}
              disabled={!wideLoadDone}
            />
          </div>

          {/* Impounded upload zone */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              Impounded & Overloaded
              {hasImpounded && (
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 20,
                  background: "rgba(34,197,94,0.12)", color: "#4ade80",
                  border: "1px solid rgba(34,197,94,0.25)",
                }}>
                  ✓ F = {impoundedResult.F}
                </span>
              )}
            </div>
            <Dropzone
              label="Drop Impounded & Overloaded CSV / XLSX"
              sublabel=".csv or .xlsx · Vardict column required"
              file={impoundedFile}
              onDrop={uploadImpounded}
              onClear={clearImpounded}
              busy={busy}
              disabled={!wideLoadDone}
            />
            {hasImpounded && (
              <div style={{
                marginTop: 8, padding: "8px 12px",
                background: "var(--navy-600)",
                border: "1px solid var(--navy-400)",
                borderRadius: "var(--radius-sm)",
                fontSize: 11, color: "var(--text-muted)",
                display: "flex", justifyContent: "space-between",
              }}>
                <span>Exemption Permits Weighed [F]</span>
                <span style={{ color: "#4ade80", fontWeight: 600 }}>{impoundedResult.F}</span>
              </div>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            color: "#f87171",
            fontSize: 12,
            marginBottom: 16,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* ── A4 PAGE PREVIEW ── */}
        {hasHswim && (
          <div id="hswim-print-region" style={{ overflowX: "auto", marginTop: 12 }}>

            <Page1
              ref={page1Ref}
              rows={hourlyRowsWithE}
              date={manualFields.date}
              preparedBy={manualFields.preparedBy}
              approvedBy={manualFields.approvedBy}
              settings={settings}
              globalPageNum={1}
              totalPages={totalPages}
            />

            <Page2
              ref={page2Ref}
              rows={graphRows}
              date={manualFields.date}
              settings={settings}
              globalPageNum={2}
              totalPages={totalPages}
            />

            <Page3
              ref={page3Ref}
              summary={liveSummary}
              date={manualFields.date}
              settings={settings}
              globalPageNum={3}
              totalPages={totalPages}
              transgressionRows={transgressionRows}
              showSectionI={!sectionIOnPage4}
            />

            <TransgressionsEditControls
              rows={transgressionRows}
              onRowChange={updateTransgressionRow}
              onAddRow={addTransgressionRow}
              onRemoveRow={removeTransgressionRow}
            />

            {sectionIOnPage4 && (
              <TransgressionsActionPageStandalone
                rows={transgressionRows}
                date={manualFields.date}
                settings={settings}
                pageRef={page4Ref}
                globalPageNum={4}
                totalPages={totalPages}
              />
            )}

            <ImpoundedAndWideLoadsPages
              impoundedResult={impoundedResultProp}
              wideLoadResult={wideLoadResult}
              settings={settings}
              impPageRefs={impPageRefs}
              widePageRefs={widePageRefs}
              impoundedStartPage={impoundedStartPage}
              wideStartPage={wideStartPage}
              totalPages={totalPages}
              date={manualFields.date}
            />

          </div>
        )}
      </div>

      {/* ── RIGHT: manual fields panel ───────────── */}
      <div className="fields-panel">

        <div className="section-heading">Manual Fields</div>

        {/* E value indicator */}
        <div style={{
          background: "var(--navy-600)",
          border: "1px solid var(--navy-400)",
          borderRadius: "var(--radius-sm)",
          padding: "7px 10px",
          marginBottom: 12,
          fontSize: 11,
          color: wideLoadDone ? "#4ade80" : "var(--text-muted)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span>Exempt Not Weighed [E]</span>
          <span style={{ fontWeight: 600 }}>
            {wideLoadDone ? wideLoadE : "—"}
          </span>
        </div>

        <div className="fields-divider" />
        <div className="section-heading">Court & Compliance</div>
        <ManualField label="Cases Cleared in Court [B]" fieldKey="B"    value={manualFields.B}    onChange={updateManual} />
        <ManualField label="Transgressions [L]"          fieldKey="L"    value={manualFields.L}    onChange={updateManual} />

        <div className="fields-divider" />
        <div className="section-heading">Traffic Census</div>
        <ManualField label="Buses ≥ 3500kg"       fieldKey="buses"         value={manualFields.buses}         onChange={updateManual} />
        <ManualField label="Vehicles 3500–7000kg" fieldKey="veh3500to7000" value={manualFields.veh3500to7000} onChange={updateManual} />
        <ManualField label="Vehicles ≥ 7000kg"    fieldKey="veh7000plus"   value={manualFields.veh7000plus}   onChange={updateManual} />

        <div className="fields-divider" />
        <div className="section-heading">Report Info</div>
        <ManualField label="Date"        fieldKey="date"       value={manualFields.date}       onChange={updateManual} type="text" placeholder="e.g. 12/03/2026" />
        <ManualField label="Prepared By" fieldKey="preparedBy" value={manualFields.preparedBy} onChange={updateManual} type="text" placeholder="Name" />
        <ManualField label="Approved By" fieldKey="approvedBy" value={manualFields.approvedBy} onChange={updateManual} type="text" placeholder="Name" />

        <div className="fields-divider" />

        {/* Page count */}
        <div style={{
          background: "var(--navy-600)",
          border: "1px solid var(--navy-400)",
          borderRadius: "var(--radius-sm)",
          padding: "7px 10px",
          marginBottom: 10,
          fontSize: 11,
          color: "var(--text-muted)",
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span style={{ color: "var(--text-muted)" }}>Estimated pages</span>
          <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{totalPages}</span>
        </div>

        {/* Build button */}
        <button
          className="build-btn"
          disabled={!hasHswim || busy}
          onClick={handleGenerate}
        >
          {busy ? "Building…" : "Build & Download PDF"}
        </button>

        {hasHswim && (
          <div className="pages-hint">
            {hasImpounded
              ? `F = ${impoundedResult.F} loaded`
              : "Upload impounded file for F count"}
          </div>
        )}

      </div>
    </div>
  )
}