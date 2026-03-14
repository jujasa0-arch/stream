// ─────────────────────────────────────────────
// SettingsSection
// Weighbridge configuration panel — lives in
// its own sidebar tab so settings persist across
// all sections via useSettings hook in App.jsx
// ─────────────────────────────────────────────

function SettingField({ label, description, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{
        display: "block", color: "#cbd5e1", fontSize: 14,
        letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase",
      }}>
        {label}
      </label>
      {description && (
        <div style={{ color: "#005ad8", fontSize: 12, marginBottom: 6 }}>
          {description}
        </div>
      )}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", background: "#1e293b", border: "1px solid #334155",
          borderRadius: 6, padding: "10px 14px", color: "#f1f5f9",
          fontSize: 13, fontFamily: "inherit", outline: "none",
          boxSizing: "border-box",
        }}
        onFocus={e => e.target.style.borderColor = "#4ade80"}
        onBlur={e => e.target.style.borderColor = "#1e293b"}
      />
    </div>
  );
}

export default function SettingsSection({ settings, updateSetting, resetSettings }) {
  const preview = `${settings.reference}     ${settings.name} ${settings.direction} DAILY REPORT`;

  return (
    <div style={{ maxWidth: 640, padding: "8px 0", color: "#e2e8f0" }}>

      {/* Header */}
      <div style={{
        marginBottom: 24, paddingBottom: 16,
        borderBottom: "1px solid #334155",
      }}>
        <h2 style={{
          color: "#f1f5f9", fontFamily: "inherit", fontSize: 18,
          fontWeight: 700, margin: "0 0 6px",
        }}>
          Weighbridge Settings
        </h2>
        <p style={{ color: "#005ad8", fontSize: 12, margin: 0 }}>
          These values appear in every report header, footer, and PDF.
          Changes take effect immediately in the preview.
        </p>
      </div>

      {/* Fields */}
      <SettingField
        label="Weighbridge Name"
        description="The full name of this weighbridge station."
        value={settings.name}
        onChange={v => updateSetting("name", v)}
        placeholder="e.g. JUJA WEIGHBRIDGE"
      />

      <SettingField
        label="Direction"
        description="Traffic direction this report covers."
        value={settings.direction}
        onChange={v => updateSetting("direction", v)}
        placeholder="e.g. THIKA BOUND or NAIROBI BOUND"
      />

      <SettingField
        label="Reference Number"
        description="Official document reference shown in the footer."
        value={settings.reference}
        onChange={v => updateSetting("reference", v)}
        placeholder="e.g. KeNHA/WB/MTCE/4339/2025"
      />

      <SettingField
        label="Station Location"
        description="Physical location of the weighbridge."
        value={settings.location}
        onChange={v => updateSetting("location", v)}
        placeholder="e.g. JUJA"
      />

      {/* Live preview of footer */}
      <div style={{
        background: "#1e293b", border: "1px solid #334155",
        borderRadius: 8, padding: "14px 16px", marginTop: 8, marginBottom: 24,
      }}>
        <div style={{ color: "#94a3b8", fontSize: 10, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>
          Footer Preview
        </div>
        <div style={{
          fontFamily: "Arial, sans-serif", fontSize: 11, color: "#cbd5e1",
          fontWeight: "bold", textAlign: "center", wordBreak: "break-word",
        }}>
          {preview}{"     "}Page N of N
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={resetSettings}
        style={{
          background: "transparent", border: "1px solid #334155",
          borderRadius: 6, padding: "8px 20px", color: "#005ad8",
          fontSize: 12, cursor: "pointer", fontFamily: "inherit",
        }}
        onMouseEnter={e => { e.target.style.borderColor = "#ef4444"; e.target.style.color = "#ef4444"; }}
        onMouseLeave={e => { e.target.style.borderColor = "#334155"; e.target.style.color = "#005ad8"; }}
      >
        Reset to defaults
      </button>
    </div>
  );
}