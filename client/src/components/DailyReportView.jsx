import { useMemo } from "react";
import CompactDropZone from "./CompactDropZone";
import { useRef, useState } from "react";
/**
 * DailyReportView
 *
 * Unified view combining:
 *  - 4 compact auto-upload drop zones
 *  - Inline manual fields (date, prepared by, approved by, B, L, census)
 *  - Stat cards derived from uploaded data
 *  - PDF preview (hidden until HSWIM is ready)
 *  - Right panel: E indicator + overflow fields + build button
 *
 * The HSWIM page render (Page1–Page3 etc.) is delegated to HswimSection
 * which receives the already-uploaded results as props.
 */
export default function DailyReportView({
    sectionStates,
    onStatusChange,
    manualFields,
    updateManual,
    settings,
    onGenerate,
    hswimUpload,
    children, // ← HswimSection's PDF preview pages render here
  }) {

  const {
      hswimFile, impoundedFile,
      uploadHswim, uploadImpounded,
      clearHswim, clearImpounded,
      busy,
      hswimResult, impoundedResult,
  } = hswimUpload;



  // Derive results from sectionStates
  const wideLoadResult   = sectionStates.find(s => s.id === "wide_load")?.result   ?? null;

  const wideLoadDone  = sectionStates.find(s => s.id === "wide_load")?.status  === "success";
  const hswimDone     = sectionStates.find(s => s.id === "hswim")?.status      === "success";

  const wideLoadE = wideLoadDone
    ? (wideLoadResult?.total_rows ?? wideLoadResult?.allRows?.length ?? 0)
    : 0;

  // Stat card values derived from processed data
  const stats = useMemo(() => {
  const totalWeighed = hswimResult?.reportData?.hourlyRows
    ? hswimResult.reportData.hourlyRows.reduce((s, r) => s + (r.X || 0), 0)
    : null;
  const totalOverload = hswimResult?.reportData?.hourlyRows
    ? hswimResult.reportData.hourlyRows.reduce((s, r) => s + (r.Y || 0), 0)
    : null;

  // impoundedResult.F exists but allRows may be on the prop version
  const impoundedCount =
    impoundedResult?.allRows?.length ??
    impoundedResult?.total_rows ??
    impoundedResult?.F ??          // ← add this fallback
    null;

  const wideCount =
    wideLoadResult?.allRows?.length ??
    wideLoadResult?.total_rows ??
    null;

  const overloadPct = totalWeighed && totalOverload
    ? ((totalOverload / totalWeighed) * 100).toFixed(1) : null;
  const impoundedPct = totalWeighed && impoundedCount
    ? ((impoundedCount / totalWeighed) * 100).toFixed(1) : null;

  return { totalWeighed, totalOverload, overloadPct, impoundedCount, impoundedPct, wideCount };
}, [hswimResult, impoundedResult, wideLoadResult]);

  const previewReady = hswimDone;

  return (
    <div className="drv-shell">

      {/* ── STAT CARDS ─────────────────────────────── */}
      <div className="drv-stats">
        <StatCard
          label="Total Weighed"
          value={stats.totalWeighed}
          sub="trucks today"
          color="blue"
          pct={100}
        />
        <StatCard
          label="TOTAL OVERLOADED"
          value={stats.totalOverload}
          sub={stats.overloadPct ? `${stats.overloadPct}% of total weighed` : "—"}
          color="red"
          pct={parseFloat(stats.overloadPct) || 0}
        />
        <StatCard
          label="SPECIAL RELEASED (VALID PERMIT)"
          value={stats.impoundedCount}
          sub={stats.impoundedPct ? `${stats.impoundedPct}% of total weighed` : "—"}
          color="amber"
          pct={parseFloat(stats.impoundedPct) || 0}
        />
        <StatCard
          label="Wide Loads"
          value={stats.wideCount}
          sub="inspected today"
          color="green"
          pct={100}
        />
      </div>

      {/* ── MAIN + RIGHT PANEL ─────────────────────── */}
      <div className="drv-body">
        <div className="drv-main">

          {/* ── UPLOAD + MANUAL FIELDS CARD ──────────── */}
          <div className="drv-card">
            <div className="drv-card-title">File Uploads</div>

            {/* 4 compact drop zones */}
            <div className="drv-zones">
              <CompactDropZone
                label="Wide Loads"
                endpoint="/upload"
                sectionId="wide_load"
                onStatusChange={onStatusChange}
              />
              <CompactDropZone
                label="Impounded & Prohibited"
                endpoint="/upload/impounded"
                sectionId="impounded"
                onStatusChange={onStatusChange}
              />
              <ControlledZone
                label="Daily Hour Stats"
                file={hswimFile}
                onDrop={uploadHswim}
                onClear={clearHswim}
                busy={busy}
                disabled={!wideLoadDone}
                done={!!hswimResult}
                />

                {/* Impounded — controlled via hswimUpload handlers */}
                <ControlledZone
                label="Impounded & Overloaded"
                file={impoundedFile}
                onDrop={uploadImpounded}
                onClear={clearImpounded}
                busy={busy}
                disabled={!wideLoadDone}
                done={!!impoundedResult}
                />
            </div>

            {/* E value indicator */}
            {wideLoadDone && (
              <div className="drv-e-pill">
                <span>Exemption Permits Not Weighed [E]</span>
                <span className="drv-e-val">{wideLoadE}</span>
              </div>
            )}

            <div className="drv-divider" />

            {/* Report info fields — inline */}
            <div className="drv-card-title">Report Info</div>
            <div className="drv-fields-row drv-fields-3">
              <FieldMini
                label="Date"
                fieldKey="date"
                value={manualFields.date}
                onChange={updateManual}
                type="text"
                placeholder="e.g. 03/02/2026"
              />
              <FieldMini
                label="Prepared By"
                fieldKey="preparedBy"
                value={manualFields.preparedBy}
                onChange={updateManual}
                type="text"
                placeholder="Name"
              />
              <FieldMini
                label="Approved By"
                fieldKey="approvedBy"
                value={manualFields.approvedBy}
                onChange={updateManual}
                type="text"
                placeholder="Name"
              />
            </div>
          </div>

          {/* ── PDF PREVIEW CARD (hidden until ready) ── */}
          {previewReady && (
            <div className="drv-card drv-preview-card">
              <div className="drv-preview-header">
                <span className="drv-card-title" style={{ margin: 0 }}>PDF Preview</span>
                <span className="drv-preview-badge">
                  {manualFields.date || "—"} · {settings?.direction || ""}
                </span>
              </div>
              <div className="drv-preview-body">
                {children}
              </div>
            </div>
          )}

        </div>

        {/* ── RIGHT PANEL ─────────────────────────────── */}
        <div className="drv-right">
          <div className="drv-card drv-right-card">

            {/* E indicator */}
            <div className="drv-e-box">
              <span>Exempt [E]</span>
              <span>{wideLoadDone ? wideLoadE : "—"}</span>
            </div>

            <div className="drv-section-label">Court & Compliance</div>
            <FieldSmall label="Cases Cleared [B]" fieldKey="B"    value={manualFields.B}    onChange={updateManual} />
            <FieldSmall label="Transgressions [L]" fieldKey="L"   value={manualFields.L}    onChange={updateManual} />

            <div className="drv-divider" />
            <div className="drv-section-label">Traffic Census</div>
            <FieldSmall label="Buses ≥ 3500kg"      fieldKey="buses"         value={manualFields.buses}         onChange={updateManual} />
            <FieldSmall label="Vehicles 3500–7000kg" fieldKey="veh3500to7000" value={manualFields.veh3500to7000} onChange={updateManual} />
            <FieldSmall label="Vehicles ≥ 7000kg"   fieldKey="veh7000plus"   value={manualFields.veh7000plus}   onChange={updateManual} />

            <div className="drv-divider" />

            {/* Page count */}
            <div className="drv-pages-row">
              <span>Estimated pages</span>
              <span className="drv-pages-val">
                {hswimDone ? (impoundedResult?.allRows
                  ? Math.ceil(impoundedResult.allRows.length / 12) + 4
                  : 4)
                  : "—"}
              </span>
            </div>

            <button
              className={`drv-build-btn${!hswimDone ? " disabled" : ""}`}
              disabled={!hswimDone}
              onClick={onGenerate}
            >
              {hswimDone ? "Build & Download PDF" : "Upload files to generate"}
            </button>
            <div className="drv-pages-hint">
              {settings?.direction || ""} · {manualFields.date || "no date set"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function StatCard({ label, value, sub, color, pct }) {
  const colors = {
    blue:  { bar: "#05ff12", sparkline: "#05ff12" },
    red:   { bar: "#fdff79", sparkline: "#fdff79" },
    amber: { bar: "#ffd698", sparkline: "#ffd698" },
    green: { bar: "#05ffe2", sparkline: "#05ffe2" },
  };
  const c = colors[color] || colors.blue;
  const safePct = Math.min(Math.max(pct || 0, 0), 100);

  return (
    <div className="drv-stat">
      <div className="drv-stat-label">{label}</div>
      <div className="drv-stat-val">
        {value !== null && value !== undefined
          ? value.toLocaleString()
          : <span className="drv-stat-empty">—</span>}
      </div>
      <div className="drv-stat-sub" style={{ color: c.bar }}>{sub}</div>

      {/* Sparkline ghost */}
      <svg
        className="drv-stat-spark"
        width="44" height="28"
        viewBox="0 0 44 28"
        style={{ opacity: value ? 0.75 : 0.06 }}
      >
        <polyline
          points="0,28 8,20 16,22 24,10 32,14 44,4"
          fill="none"
          stroke={c.sparkline}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Progress bar */}
      <div className="drv-stat-bar-track">
        <div
          className="drv-stat-bar-fill"
          style={{ width: `${safePct}%`, background: c.bar }}
        />
      </div>
    </div>
  );
}

function FieldMini({ label, fieldKey, value, onChange, type = "number", placeholder = "0" }) {
  return (
    <div className="drv-field-mini">
      <label className="drv-field-label">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(fieldKey, e.target.value)}
        className="drv-field-input"
      />
    </div>
  );
}

function FieldSmall({ label, fieldKey, value, onChange, type = "number", placeholder = "0" }) {
  return (
    <div className="drv-field-sm">
      <label className="drv-field-label">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(fieldKey, e.target.value)}
        className="drv-field-input"
      />
    </div>
  );
}

function ControlledZone({ label, file, onDrop, onClear, busy, disabled, done }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={[
        "cdz",
        dragging ? "cdz-drag" : "",
        done    ? "cdz-done" : "",
        busy    ? "cdz-busy" : "",
        disabled && !done ? "cdz-disabled" : "",
      ].filter(Boolean).join(" ")}
      style={{ opacity: disabled && !done ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault(); setDragging(false);
        if (disabled) return;
        const f = e.dataTransfer.files[0];
        if (f) onDrop(f);
      }}
      onClick={() => !disabled && !busy && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files[0]; if (f) onDrop(f); }}
      />
      <span className="cdz-icon">
        {busy ? "↻" : done ? "✓" : "↑"}
      </span>
      <div className="cdz-label">{label}</div>
      {done && file && (
        <>
          <div className="cdz-file" title={file.name}>
            {file.name?.length > 18 ? file.name.slice(0, 16) + "…" : file.name}
          </div>
          {!busy && (
            <button className="cdz-clear" onClick={e => { e.stopPropagation(); onClear(); }}>✕</button>
          )}
        </>
      )}
      {!done && !busy && <div className="cdz-hint">{disabled ? "Upload Wide Loads first" : ".csv · .xlsx"}</div>}
      {busy && <div className="cdz-hint">Uploading…</div>}
    </div>
  );
}