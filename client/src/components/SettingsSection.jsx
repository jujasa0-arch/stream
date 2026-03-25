// ─────────────────────────────────────────────
// SettingsSection — restyled for DANKA Reports
// Logic unchanged. Inline styles replaced with
// CSS classes from global.css
// ─────────────────────────────────────────────

function SettingField({ label, description, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label className="settings-field-label">{label}</label>
      {description && (
        <div className="settings-field-hint">{description}</div>
      )}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="settings-input"
      />
    </div>
  );
}

export default function SettingsSection({ settings, updateSetting, resetSettings }) {
  const preview = `${settings.reference}     ${settings.name} ${settings.direction} DAILY REPORT     Page N of N`;

  return (
    <div className="settings-section">

      {/* ── Header ─────────────────────────────────── */}
      <h2 className="settings-title">Weighbridge Settings</h2>
      <p className="settings-subtitle">
        These values appear in every report header, footer, and PDF.
        Changes take effect immediately in the preview.
      </p>

      {/* ── Fields card ────────────────────────────── */}
      <div className="settings-card">
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
      </div>

      {/* ── Footer preview ──────────────────────────── */}
      <div className="settings-card" style={{ marginTop: 12 }}>
        <span className="settings-field-label">Footer Preview</span>
        <div className="settings-footer-preview">{preview}</div>
      </div>

      {/* ── Reset ───────────────────────────────────── */}
      <button className="settings-reset-btn" onClick={resetSettings}>
        Reset to defaults
      </button>

    </div>
  );
}