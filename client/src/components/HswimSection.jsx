import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHswimUpload } from "../hooks/useHswimUpload.js";
import { generateHswimPDF } from "../utils/generateHswimPdf.js";
import { PDF_COLUMNS, COLUMN_WEIGHTS, IMPOUNDED_COLUMNS } from "../config/sections.js";
import { formatCell } from "../utils/formatCell.js";

// ─────────────────────────────────────────────
// Shared PDF styles (white tables, black borders, Arial)
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

// ─────────────────────────────────────────────
// distributeE — spread wideLoadE across rows
// whose time falls in 0600-1800 (wide loads hours)
// Result is an integer per row, total = wideLoadE
// ─────────────────────────────────────────────
function distributeE(hourlyRows, wideLoadE) {
  if (!wideLoadE || !hourlyRows?.length) {
    return hourlyRows.map(r => ({ ...r, E: r.E || 0 }));
  }

  // identify which rows fall in 0600-1800
  const eligible = hourlyRows.map((r, i) => {
    const t = (r.time || "").replace(/[^0-9]/g, "").slice(0, 4);
    const hour = parseInt(t.slice(0, 2), 10);
    return { i, eligible: hour >= 6 && hour < 18 };
  });
  const eligibleIdxs = eligible.filter(x => x.eligible).map(x => x.i);

  if (!eligibleIdxs.length) return hourlyRows.map(r => ({ ...r, E: r.E || 0 }));

  // distribute wideLoadE randomly across eligible rows
  const dist = new Array(hourlyRows.length).fill(0);
  let remaining = Number(wideLoadE);

  // seed a simple deterministic shuffle based on row count
  const shuffled = [...eligibleIdxs].sort((a, b) => ((a * 7 + 3) % 13) - ((b * 7 + 3) % 13));

  shuffled.forEach((idx, pos) => {
    const isLast = pos === shuffled.length - 1;
    if (isLast) {
      dist[idx] = remaining;
    } else {
      const share = Math.round(remaining / (shuffled.length - pos));
      dist[idx] = share;
      remaining -= share;
    }
  });

  return hourlyRows.map((r, i) => ({ ...r, E: dist[i] }));
}

// ─────────────────────────────────────────────
// Client-side formula mirror (hswimFormulas.js)
// Instant live preview — no server call needed
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Dropzone
// ─────────────────────────────────────────────
function Dropzone({ label, sublabel, file, onDrop, onClear, busy, disabled = false }) {
  const handleDrag = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    if (disabled) return;
    const f = e.dataTransfer.files[0];
    if (f) onDrop(f);
  }, [onDrop, disabled]);
  const handleChange = useCallback((e) => {
    if (disabled) return;
    const f = e.target.files[0];
    if (f) onDrop(f);
  }, [onDrop, disabled]);

  if (file) {
    return (
      <div className="dropzone dropzone-filled">
        <div className="file-info">
          <span className="file-icon">📄</span>
          <div>
            <div className="file-name">{file.name}</div>
            <div className="file-meta">{(file.size / 1024).toFixed(1)} KB</div>
          </div>
          {!busy && <button className="clear-btn" onClick={onClear}>×</button>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`dropzone${disabled ? " dropzone-disabled" : ""}`}
      onDragOver={disabled ? undefined : handleDrag}
      onDrop={disabled ? undefined : handleDrop}
      onClick={() => !disabled && document.getElementById(`hswim-input-${label}`).click()}
      style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <input id={`hswim-input-${label}`} type="file" accept=".xlsx,.xls,.csv"
        style={{ display: "none" }} onChange={handleChange} disabled={disabled} />
      <div className="drop-prompt">
        <span className="drop-icon">⬆</span>
        <span className="drop-text">{label}</span>
        <span className="drop-sub">{disabled ? "Upload Wide Loads first" : sublabel}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ManualField
// ─────────────────────────────────────────────
function ManualField({ label, fieldKey, value, onChange, type = "number", placeholder = "0" }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "block", color: "#94a3b8", fontSize: 10, letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" }}>
        {label}
      </label>
      <input type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        style={{ width: "100%", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 4, padding: "6px 10px", color: "#e2e8f0", fontSize: 12, fontFamily: "inherit", outline: "none" }}
        onFocus={e => e.target.style.borderColor = "#4ade80"}
        onBlur={e => e.target.style.borderColor = "#1e293b"}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// PageWrapper — A4 landscape page shell
// ─────────────────────────────────────────────
// PageWrapper is used both directly and via ref for PDF capture
const PageWrapper = forwardRef(function PageWrapper({ children, pageNum, totalPages, date, settings }, ref) {
  const docRef  = settings?.reference || "KeNHA/WB/MTCE/4339/2025";
  const title   = settings
    ? `${settings.name} ${settings.direction} DAILY REPORT`
    : "JUJA WEIGHBRIDGE THIKA BOUND DAILY REPORT";
  const SEP     = "   ";  // footer section separator
  const FOOTER  = `${docRef}${SEP}${title} ${date || ""}${SEP}Page ${pageNum} of ${totalPages}`;
  return (
    <div ref={ref} style={{
      width: 1122, minWidth: 1122, background: "#fff",
      boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
      padding: "18px 28px 14px", boxSizing: "border-box",
      marginBottom: 24,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 8 }}>
        <img src="/danka-logo.png" alt="Danka" style={{ height: 40, objectFit: "contain" }} />
      </div>

      {children}

      {/* Footer */}
      <div style={{ marginTop: 10, paddingTop: 4, fontFamily: "Arial, sans-serif", fontSize: 8, color: "#000", textAlign: "center", fontWeight: "bold", letterSpacing: "0.01em" }}>
        {FOOTER}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────
// Page 1 — Daily and Hourly Statistics
// hourlyRows already have E distributed by caller
// ─────────────────────────────────────────────
const Page1 = forwardRef(function Page1({ rows, date, preparedBy, approvedBy, settings }, ref) {
  if (!rows?.length) return null;

  const numKeys = ["D","S","M","H","Q","X","C","Y","P","A","Z","G","R","E"];
  const totals = {};
  numKeys.forEach(k => { totals[k] = rows.reduce((s, r) => s + (r[k] || 0), 0); });

  const th  = { ...PDF.th, fontSize: 7, padding: "1px 1px" };
  const td  = { ...PDF.td, fontSize: 7, padding: "1px 1px" };
  const tdB = { ...td, fontWeight: "bold" };

  return (
    <PageWrapper ref={ref} pageNum={1} totalPages={3} date={date} settings={settings}>
      <div style={{ textAlign: "center", fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 13, color: "#000", marginBottom: 10, textDecoration: "underline" }}>
        {settings
          ? `${settings.name} ${settings.direction} DAILY REPORT`
          : "JUJA WEIGHBRIDGE THIKA BOUND DAILY REPORT"}
      </div>
      <div style={PDF.sectionTitle}>1.&nbsp; DAILY AND HOURLY STATISTICS</div>

      <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}>
        <colgroup>
          <col style={{ width: "6%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "4.5%" }} />
          <col style={{ width: "4%" }} />
          <col style={{ width: "4%" }} />
          <col style={{ width: "4.5%" }} />
          <col style={{ width: "4.5%" }} />
          <col style={{ width: "4.5%" }} />
          <col style={{ width: "4.5%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "6%" }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={3} style={{ ...th, verticalAlign: "middle" }}>DATE</th>
            <th rowSpan={3} style={{ ...th, verticalAlign: "middle" }}>TIME</th>
            <th colSpan={6} style={th}>TRUCKS WEIGHED</th>
            <th rowSpan={3} style={th}>{"CALLED\nIN\n(C)"}</th>
            <th rowSpan={3} style={th}>{"TOTAL\nOVERLO\nADED\n(Y)=(A+\nZ+G+R)"}</th>
            <th rowSpan={3} style={th}>{"IMPOUNDED\n&\nPROHIBITED\n(P)=(Z+R)"}</th>
            <th rowSpan={3} style={th}>{"WARNED\nTRUCKS\n(A)"}</th>
            <th rowSpan={3} style={th}>{"CHARGED &\nPROHIBITED\n(Z)"}</th>
            <th rowSpan={3} style={th}>{"SPECIAL\nRELEASE\n(G)"}</th>
            <th rowSpan={3} style={th}>{"REDISTRI-\nBUTED\n(R)"}</th>
            <th rowSpan={3} style={th}>{"EXEMPTION\nPERMITS\nNOT\nWEIGHED\n(E)"}</th>
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
            <td style={td}></td>
            {numKeys.map(k => <td key={k} style={tdB}>{totals[k]}</td>)}
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 10, fontFamily: "Arial, sans-serif", fontSize: 9, color: "#000" }}>
        <div><strong>Prepared by:</strong> {preparedBy || ""}</div>
        <div><strong>Approved by:</strong> {approvedBy || ""}</div>
      </div>
    </PageWrapper>
  );
});

// ─────────────────────────────────────────────
// Canvas line chart
// ─────────────────────────────────────────────
function CanvasLineChart({ rows, chartHeight }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!rows?.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const CW = 580, CH = Math.max((chartHeight || 400) * 1.5, 440);
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

  return <canvas ref={canvasRef} style={{ width: "100%", height: chartHeight, display: "block" }} />;
}

// ─────────────────────────────────────────────
// Page 2 — Daily Hourly Data + Chart
// ─────────────────────────────────────────────
const Page2 = forwardRef(function Page2({ rows, date, settings }, ref) {
  const tableRef = useRef(null);
  const [tableH, setTableH] = useState(400);

  // Hooks before early return
  useEffect(() => {
    if (tableRef.current) {
      const h = tableRef.current.getBoundingClientRect().height;
      if (h > 50) setTableH(h);
    }
  }, [rows]);

  if (!rows?.length) return null;

  const numKeys = ["N","M","Q","X"];
  const totals = {};
  numKeys.forEach(k => { totals[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0); });

  const th  = { ...PDF.th, fontSize: 9, padding: "5px 3px" };
  const td  = { ...PDF.td, fontSize: 9, padding: "4px 3px" };
  const tdB = { ...td, fontWeight: "bold" };

  return (
    <PageWrapper ref={ref} pageNum={2} totalPages={3} date={date} settings={settings}>
      <div style={PDF.sectionTitle}>2.&nbsp;&nbsp; DAILY HOURLY DATA</div>

      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        {/* Table */}
        <div ref={tableRef} style={{ flex: "0 0 32%", overflowX: "hidden", boxSizing: "border-box" }}>
          <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              <col style={{ width: "28%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Time</th>
                <th style={th}>{"Multideck\nweighed"}</th>
                <th style={th}>{"Manu\nally"}</th>
                <th style={th}>{"HSWIM\nCLEARED"}</th>
                <th style={th}>{"Total\nweighed"}</th>
              </tr>
              <tr>
                <th style={th}></th>
                <th style={th}>N=(D+S)</th>
                <th style={th}>(M)</th>
                <th style={th}>Q = H-C</th>
                <th style={th}>X= (N+M)</th>
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

        {/* Chart */}
        <div style={{ flex: "1 1 0", background: "#fff", padding: "8px 8px 8px 18px", display: "flex", alignItems: "center" }}>
          <CanvasLineChart rows={rows} chartHeight={tableH} />
        </div>
      </div>
    </PageWrapper>
  );
});

// ─────────────────────────────────────────────
// Page 3 — Traffic Census + Daily Summary
// Uses live-computed summary so manual fields
// update the preview in real time
// ─────────────────────────────────────────────
const Page3 = forwardRef(function Page3({ summary, date, settings }, ref) {
  if (!summary) return null;

  const th = PDF.th;
  const td = PDF.td;

  return (
    <PageWrapper ref={ref} pageNum={3} totalPages={3} date={date} settings={settings}>

      {/* ── 3. TRAFFIC CENSUS DATA ── */}
      <div style={{ ...PDF.sectionTitle, marginTop: 0 }}>3.&nbsp;&nbsp; TRAFFIC CENSUS DATA</div>
      <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%", marginBottom: 24 }}>
        <colgroup>
          <col style={{ width: "14%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "10%" }} />
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
      <div style={PDF.sectionTitle}>4.&nbsp;&nbsp; DAILY SUMMARY</div>
      <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}>
        <colgroup>
          {Array.from({ length: 16 }).map((_, i) => (
            <col key={i} style={{ width: `${100/16}%` }} />
          ))}
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
            <th colSpan={3} style={th}>{"Exemption permits"}</th>
          </tr>
          <tr>
            <th style={th}>(Q=H-C)</th>
            <th style={th}>(N)</th>
            <th style={th}>(M)</th>
            <th style={th}>(X)=(S+M)</th>
            <th style={th}>(T)=(Q+X+K+E)</th>
            <th style={th}>(Y)</th>
            <th style={th}>(A)</th>
            <th style={th}>(Z)</th>
            <th style={th}>(G)</th>
            <th style={th}>(R)</th>
            <th style={th}>(P)</th>
            <th style={th}>(B)</th>
            <th style={th}>(L)</th>
            <th style={th}>{"Not\nweighed\n(E)"}</th>
            <th style={th}>{"Weighed\n(F)"}</th>
            <th style={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>{summary.Q ?? 0}</td>
            <td style={td}>{summary.N ?? 0}</td>
            <td style={td}>{summary.M ?? 0}</td>
            <td style={td}>{summary.X ?? 0}</td>
            <td style={td}>{summary.T ?? 0}</td>
            <td style={td}>{summary.Y ?? 0}</td>
            <td style={td}>{summary.A ?? 0}</td>
            <td style={td}>{summary.Z ?? 0}</td>
            <td style={td}>{summary.G ?? 0}</td>
            <td style={td}>{summary.R ?? 0}</td>
            <td style={td}>{summary.P ?? 0}</td>
            <td style={td}>{summary.B ?? 0}</td>
            <td style={td}>{summary.L ?? 0}</td>
            <td style={td}>{summary.E ?? 0}</td>
            <td style={td}>{summary.F ?? 0}</td>
            <td style={td}>{summary.exemptTotal ?? 0}</td>
          </tr>
        </tbody>
      </table>
    </PageWrapper>
  );
});


// ─────────────────────────────────────────────
// TransgressionsPage — Page 4
// Editable table for daily transgressions data.
// Rows are added manually by the user.
// ─────────────────────────────────────────────
const TRANSGRESSION_COLS = [
  { key: "date",         label: "Date",                width: "8%"  },
  { key: "time",         label: "Time",                width: "6%"  },
  { key: "regNo",        label: "Reg No",              width: "8%"  },
  { key: "axleConfig",   label: "Axle Config",         width: "6%"  },
  { key: "transporter",  label: "Transporter",         width: "12%" },
  { key: "censusCLerk",  label: "Census Clerk",        width: "9%"  },
  { key: "policeCharge", label: "Police In charge",    width: "9%"  },
  { key: "actionTaken",  label: "Action Taken",        width: "9%"  },
  { key: "caught",       label: "Caught",              width: "7%"  },
  { key: "nextWBSent",   label: "Next WB report sent", width: "10%" },
  { key: "nextWB",       label: "Next WB",             width: "7%"  },
];

function emptyRow() {
  return Object.fromEntries(TRANSGRESSION_COLS.map(c => [c.key, ""]));
}

function TransgressionsPage({ rows, onRowChange, onAddRow, onRemoveRow, date, settings, pageRef }) {
  const th = {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 8,
    padding: "4px 3px", textAlign: "center", verticalAlign: "middle",
    whiteSpace: "pre-line",
  };
  const td = {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontSize: 8,
    padding: "2px 3px", textAlign: "center", verticalAlign: "middle",
  };

  const displayRows = rows.length === 0
    ? [{ ...emptyRow(), date: "NIL" }]
    : rows;

  return (
    <div>
      {/* Edit controls — hidden in PDF capture */}
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
        <span style={{ color: "#94a3b8", fontSize: 11 }}>Transgressions</span>
        <button
          onClick={onAddRow}
          style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 4, color: "#4ade80", padding: "4px 12px", fontSize: 11, cursor: "pointer" }}
        >
          + Add Row
        </button>
        {rows.length > 0 && (
          <button
            onClick={() => onRemoveRow(rows.length - 1)}
            style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 4, color: "#f87171", padding: "4px 12px", fontSize: 11, cursor: "pointer" }}
          >
            − Remove Last
          </button>
        )}
      </div>

      {/* Inline edit fields — hidden in PDF capture */}
      {rows.length > 0 && (
        <div className="no-print" style={{ marginBottom: 12 }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6, padding: "8px", background: "#1e293b", borderRadius: 6 }}>
              <span style={{ color: "#94a3b8", fontSize: 10, width: "100%", marginBottom: 4 }}>Row {ri + 1}</span>
              {TRANSGRESSION_COLS.map(col => (
                <div key={col.key} style={{ display: "flex", flexDirection: "column", minWidth: 80 }}>
                  <label style={{ color: "#64748b", fontSize: 9, marginBottom: 2 }}>{col.label.replace("\n", " ")}</label>
                  <input
                    value={row[col.key] || ""}
                    onChange={e => onRowChange(ri, col.key, e.target.value)}
                    style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 3, color: "#e2e8f0", fontSize: 10, padding: "3px 6px", width: "100%" }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* A4 preview */}
      <PageWrapper ref={pageRef} pageNum={4} totalPages={4} date={date} settings={settings}>
        <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 11, color: "#000", marginBottom: 8 }}>
          5.&nbsp;&nbsp; TRANSGRESSIONS
        </div>
        <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 10, color: "#000", marginBottom: 6, textDecoration: "underline" }}>
          DAILY TRANSGRESSIONS REPORT
        </div>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            {TRANSGRESSION_COLS.map((col, i) => <col key={i} style={{ width: col.width }} />)}
          </colgroup>
          <thead>
            <tr>
              {TRANSGRESSION_COLS.map(col => (
                <th key={col.key} style={th}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, ri) => (
              <tr key={ri}>
                {TRANSGRESSION_COLS.map(col => (
                  <td key={col.key} style={td}>{row[col.key] || ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </PageWrapper>
    </div>
  );
}


// ─────────────────────────────────────────────
// WideLoadsPages — renders wide loads rows as
// A4 pages (VEHICLE INSPECTION REPORT section)
// Chunked: up to ROWS_PER_PAGE rows per page
// ─────────────────────────────────────────────
const WIDE_ROWS_PER_PAGE = 5;

function WideLoadsPages({ result, settings, pageRefs }) {
  if (!result?.allRows?.length) return null;
  const allRows = result.allRows ?? result.previewRows ?? [];
  const chunks  = [];
  for (let i = 0; i < allRows.length; i += WIDE_ROWS_PER_PAGE) {
    chunks.push(allRows.slice(i, i + WIDE_ROWS_PER_PAGE));
  }

  const totalPages = chunks.length;
  const th = {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontWeight: "800", fontSize: 7,
    padding: "0", textAlign: "center", verticalAlign: "bottom",
    height: 72, overflow: "hidden",
  };
  const td = {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontSize: 7,
    padding: "0", textAlign: "center", verticalAlign: "middle",
    overflow: "hidden",
  };
  // Inline style for td content wrapper — rotated same as headers
  const tdInner = {
    writingMode: "vertical-lr",
    transform: "rotate(180deg)",
    display: "inline-block",
    padding: "4px 2px",
    fontSize: 7,
    fontFamily: "Arial, sans-serif",
    whiteSpace: "normal",
    wordBreak: "break-word",
    maxHeight: 120,
    textAlign: "left",
  };

  // Compute column widths proportionally
  const totalWeight = PDF_COLUMNS.reduce((s, col) => s + (COLUMN_WEIGHTS[col.key] ?? 1.5), 0);

  return (
    <>
      {chunks.map((chunk, ci) => (
        <PageWrapper
          key={ci}
          ref={el => { if (pageRefs) pageRefs.current[ci] = el; }}
          pageNum={ci + 1}
          totalPages={totalPages}
          settings={settings}
        >
          {ci === 0 && (
            <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 11, color: "#000", marginBottom: 8, textDecoration: "underline" }}>
              7.&nbsp;&nbsp; VEHICLE INSPECTION REPORT (WIDE LOADS)
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
                  <th key={col.key} style={th}>
                    <div style={{
                      writingMode: "vertical-lr",
                      transform: "rotate(180deg)",
                      display: "inline-block",
                      padding: "3px 2px",
                      fontSize: 7, fontWeight: 800,
                      fontFamily: "Arial, sans-serif",
                      whiteSpace: "pre-line",
                      height: "100%",
                      textAlign: "left",
                    }}>
                      {col.label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chunk.map((row, ri) => (
                <tr key={ri}>
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
      ))}
    </>
  );
}

// ─────────────────────────────────────────────
// ImpoundedPages — renders impounded rows as
// A4 pages (section 6)
// ─────────────────────────────────────────────
const IMP_ROWS_PER_PAGE = 6;

function ImpoundedPages({ result, settings, pageRefs }) {
  if (!result?.allRows?.length && !result?.rows?.length) return null;
  const allRows = result.allRows ?? result.rows ?? [];
  const chunks  = [];
  for (let i = 0; i < allRows.length; i += IMP_ROWS_PER_PAGE) {
    chunks.push(allRows.slice(i, i + IMP_ROWS_PER_PAGE));
  }

  const totalPages = chunks.length;
  const th = {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 8,
    padding: "4px 3px", textAlign: "center", verticalAlign: "middle",
    whiteSpace: "pre-line",
  };
  const td = {
    background: "#fff", color: "#000", border: "1px solid #000",
    fontFamily: "Arial, sans-serif", fontSize: 8,
    padding: "3px", textAlign: "center", verticalAlign: "middle",
    wordBreak: "break-word",
  };

  return (
    <>
      {chunks.map((chunk, ci) => (
        <PageWrapper
          key={ci}
          ref={el => { if (pageRefs) pageRefs.current[ci] = el; }}
          pageNum={ci + 1}
          totalPages={totalPages}
          settings={settings}
        >
          {ci === 0 && (
            <div style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold", fontSize: 11, color: "#000", marginBottom: 8 }}>
              6.&nbsp;&nbsp; IMPOUNDED &amp; PROHIBITED
            </div>
          )}
          <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              {IMPOUNDED_COLUMNS.map((col, i) => <col key={i} style={{ width: `${100 / IMPOUNDED_COLUMNS.length}%` }} />)}
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
                    <td key={col.key} style={td}>{row[col.key] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </PageWrapper>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────
// HswimSection (root export)
// ─────────────────────────────────────────────
export default function HswimSection({ section, onStatusChange, wideLoadE = 0, wideLoadDone = false, settings, wideLoadResult = null, impoundedResult: impoundedResultProp = null }) {
  const {
    hswimFile, impoundedFile,
    hswimResult, impoundedResult,
    busy, error,
    manualFields, updateManual,
    uploadHswim, uploadImpounded,
    clearHswim, clearImpounded,
    buildFinalReport,
  } = useHswimUpload(onStatusChange, section.id);

  const hasHswim     = !!hswimResult;
  const hasImpounded = !!impoundedResult;
  const F            = impoundedResult?.F ?? 0;

  // ── Transgressions rows (manual entry) ───────────────────────
  const [transgressionRows, setTransgressionRows] = useState([]);

  const addTransgressionRow    = () => setTransgressionRows(prev => [...prev, emptyRow()]);
  const removeTransgressionRow = (i) => setTransgressionRows(prev => prev.filter((_, idx) => idx !== i));
  const updateTransgressionRow = (i, key, val) =>
    setTransgressionRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));

  // ── Page refs for PDF capture ─────────────────────────────────
  const page1Ref     = useRef(null);
  const page2Ref     = useRef(null);
  const page3Ref     = useRef(null);
  const page4Ref     = useRef(null);
  // Arrays of refs for multi-page sections
  const impPageRefs  = useRef([]);
  const widePageRefs = useRef([]);

  // ── PDF generation state ──────────────────────────────────────
  const [pdfBusy,     setPdfBusy]     = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);

  // hourlyRowsWithE and graphRows are memoized — only recompute when
  // the uploaded data or wideLoadE changes, NOT on every manual field keystroke.
  // This prevents the chart height feedback loop.
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

  // liveSummary CAN recompute on manual field changes — it only affects
  // Page3 text values, not the chart, so no feedback loop here.
  const liveSummary = useMemo(() => {
    if (!hasHswim) return null;
    return buildLiveSummary({
      hourlyRows: hourlyRowsWithE,
      manualFields,
      F,
      E: wideLoadE,
    });
  }, [hasHswim, hourlyRowsWithE, manualFields, F, wideLoadE]);

  const handleGenerate = async () => {
    // Step 1: build the final server-side report data
    const report = await buildFinalReport(wideLoadE);
    if (!report) return;
    onStatusChange(section.id, "success", { reportData: report, ready: true });

    // Step 2: generate PDF from page refs
    setPdfBusy(true);
    setPdfProgress(0);
    try {
      const date     = manualFields.date || "";
      const filename = `HSWIM_report_${date.replace(/\//g, "-") || "report"}`;
      // Collect refs in PDF page order:
      // Page1, Page2, Page3, Page4(Transgressions),
      // Page5+(Impounded), PageN+(Wide Loads)
      const hswimRefs = [page1Ref, page2Ref, page3Ref, page4Ref];
      const impRefs   = (impPageRefs.current || [])
        .filter(Boolean)
        .map(el => ({ current: el }));
      const wideRefs  = (widePageRefs.current || [])
        .filter(Boolean)
        .map(el => ({ current: el }));
      const allRefs   = [...hswimRefs, ...impRefs, ...wideRefs];

      await generateHswimPDF(allRefs, filename, setPdfProgress);
    } finally {
      setPdfBusy(false);
      setPdfProgress(0);
    }
  };

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

      {/* ── LEFT ─────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>

        {/* Wide loads gate banner */}
        {!wideLoadDone && (
          <div style={{
            background: "#1e293b", border: "1px solid #f97316", borderRadius: 8,
            padding: "12px 16px", marginBottom: 16,
            color: "#f97316", fontSize: 12, fontWeight: 700,
          }}>
            ⚠ Upload the Wide Loads Report first — Exemption Permits Not Weighed (E)
            is derived from that row count and is required for this report.
          </div>
        )}

        <div className="section-card">
          <div className="section-header">
            <span className="section-title">HSWIM DAILY STATISTICS</span>
            {hasHswim && <span className="section-badge">✓ {hswimResult.totalRows} ROWS</span>}
            {busy && !hasHswim && <span className="section-badge section-badge-busy">UPLOADING…</span>}
            {wideLoadDone && (
              <span className="section-badge" style={{ color: "#4ade80", borderColor: "#4ade80" }}>
                E = {wideLoadE} from Wide Loads
              </span>
            )}
          </div>
          <Dropzone label="Drop HSWIM Daily CSV / XLSX" sublabel=".csv or .xlsx · 24 hourly rows"
            file={hswimFile} onDrop={uploadHswim} onClear={clearHswim}
            busy={busy} disabled={!wideLoadDone} />
        </div>

        <div className="section-card">
          <div className="section-header">
            <span className="section-title">IMPOUNDED & OVERLOADED</span>
            {hasImpounded && <span className="section-badge">✓ F = {impoundedResult.F}</span>}
            {busy && !hasImpounded && <span className="section-badge section-badge-busy">UPLOADING…</span>}
          </div>
          <Dropzone label="Drop Impounded & Overloaded CSV / XLSX" sublabel=".csv or .xlsx · Vardict column required"
            file={impoundedFile} onDrop={uploadImpounded} onClear={clearImpounded}
            busy={busy} disabled={!wideLoadDone} />
          {hasImpounded && (
            <div className="result" style={{ margin: "0 24px 16px" }}>
              <div className="result-row">
                <span className="result-label">Exemption Permits Weighed [F]</span>
                <span className="result-ok">{impoundedResult.F}</span>
              </div>
              <div className="result-row">
                <span className="result-label">Total Rows Scanned</span>
                <span className="result-val">{impoundedResult.totalRows}</span>
              </div>
            </div>
          )}
        </div>

        {error && <div className="error">⚠ {error}</div>}

        {/* ── A4 PAGE PREVIEW ── */}
        {hasHswim && (
          <div style={{ overflowX: "auto", marginTop: 16 }}>
            <Page1
              ref={page1Ref}
              rows={hourlyRowsWithE}
              date={manualFields.date}
              preparedBy={manualFields.preparedBy}
              approvedBy={manualFields.approvedBy}
              settings={settings}
            />
            <Page2
              ref={page2Ref}
              rows={graphRows}
              date={manualFields.date}
              settings={settings}
            />
            <Page3
              ref={page3Ref}
              summary={liveSummary}
              date={manualFields.date}
              settings={settings}
            />
            <TransgressionsPage
              rows={transgressionRows}
              onRowChange={updateTransgressionRow}
              onAddRow={addTransgressionRow}
              onRemoveRow={removeTransgressionRow}
              date={manualFields.date}
              settings={settings}
              pageRef={page4Ref}
            />
            {/* Impounded pages — section 6 */}
            <ImpoundedPages
              result={impoundedResultProp}
              settings={settings}
              pageRefs={impPageRefs}
            />
            {/* Wide Loads pages — section 7, always last */}
            <WideLoadsPages
              result={wideLoadResult}
              settings={settings}
              pageRefs={widePageRefs}
            />
          </div>
        )}
      </div>

      {/* ── RIGHT: manual fields ──────────────────────── */}
      <div style={{ width: 220, minWidth: 220, flexShrink: 0, background: "#0f172a", borderRadius: 8, padding: "16px 14px", position: "sticky", top: 64 }}>
        <div style={{ color: "#4ade80", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
          Manual Fields
        </div>

        {/* E read-only — flows from Wide Loads */}
        <div style={{ background: "#1e293b", borderRadius: 4, padding: "6px 10px", marginBottom: 12, fontSize: 10, color: wideLoadDone ? "#4ade80" : "#475569" }}>
          Exempt Not Weighed [E] = {wideLoadE}
          {!wideLoadDone && <span style={{ color: "#f97316" }}> (upload wide loads first)</span>}
        </div>

        <div style={{ color: "#475569", fontSize: 10, letterSpacing: "0.06em", marginBottom: 8, textTransform: "uppercase" }}>Court & Compliance</div>
        <ManualField label="Cases Cleared in Court [B]" fieldKey="B" value={manualFields.B} onChange={updateManual} />
        <ManualField label="Transgressions [L]" fieldKey="L" value={manualFields.L} onChange={updateManual} />

        <div style={{ color: "#475569", fontSize: 10, letterSpacing: "0.06em", margin: "12px 0 8px", textTransform: "uppercase" }}>Traffic Census</div>
        <ManualField label="Buses ≥3500kg" fieldKey="buses" value={manualFields.buses} onChange={updateManual} />
        <ManualField label="Vehicles ≥3500–7000kg" fieldKey="veh3500to7000" value={manualFields.veh3500to7000} onChange={updateManual} />
        <ManualField label="Vehicles ≥7000kg" fieldKey="veh7000plus" value={manualFields.veh7000plus} onChange={updateManual} />

        <div style={{ color: "#475569", fontSize: 10, letterSpacing: "0.06em", margin: "12px 0 8px", textTransform: "uppercase" }}>Report Info</div>
        <ManualField label="Date" fieldKey="date" value={manualFields.date} onChange={updateManual} type="text" placeholder="e.g. 12/03/2026" />
        <ManualField label="Prepared By" fieldKey="preparedBy" value={manualFields.preparedBy} onChange={updateManual} type="text" placeholder="Name" />
        <ManualField label="Approved By" fieldKey="approvedBy" value={manualFields.approvedBy} onChange={updateManual} type="text" placeholder="Name" />

        <button
          className={`upload-btn${!hasHswim || busy || pdfBusy ? " upload-btn-disabled" : ""}`}
          style={{ margin: "16px 0 0", width: "100%" }}
          disabled={!hasHswim || busy || pdfBusy}
          onClick={handleGenerate}
        >
          {pdfBusy
            ? `GENERATING PDF… ${pdfProgress}%`
            : busy
            ? "BUILDING…"
            : "BUILD & DOWNLOAD PDF"}
        </button>

        {hasHswim && (
          <div style={{ color: "#475569", fontSize: 10, textAlign: "center", marginTop: 8 }}>
            {hasImpounded ? `F=${impoundedResult.F} loaded` : "Upload impounded file for F count"}
          </div>
        )}
      </div>
    </div>
  );
}