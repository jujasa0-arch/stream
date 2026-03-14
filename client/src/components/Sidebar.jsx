import { SECTIONS } from "../config/sections";

/**
 * Sidebar navigation showing all sections and their upload status.
 * Settings tab has no status dot — it's always accessible.
 */
export default function Sidebar({
  sectionStates,
  activeId,
  onSelect,
  onGenerate,
  canGenerate,
}) {
  function getStatus(id) {
    return sectionStates.find((s) => s.id === id)?.status ?? "idle";
  }

  function StatusDot({ status }) {
    const colors = {
      success:   "#28c840",
      uploading: "#febc2e",
      busy:      "#febc2e",
      error:     "#ff5f57",
      idle:      "#444",
    };
    return (
      <span style={{
        display: "inline-block", width: 8, height: 8,
        borderRadius: "50%", background: colors[status] ?? colors.idle,
        flexShrink: 0,
      }} />
    );
  }

  // Sections that have upload state (exclude settings)
  const uploadSections = SECTIONS.filter(s => !s.settings);
  const readyCount = sectionStates.filter(s => s.status === "success").length;

  return (
    <aside className="sidebar">

      {/* App title */}
      <div className="sidebar-top-bar">
        <div className="sidebar-dots">
          <span className="dot dot-red" />
          <span className="dot dot-yellow" />
          <span className="dot dot-green" />
        </div>
        <span className="sidebar-logo-text">ReportGen</span>
      </div>

      <div className="sidebar-divider" />

      {/* Section navigation */}
      <nav className="sidebar-nav">
        {SECTIONS.map((section) => {
          const isActive  = section.id === activeId;
          const isSettings = !!section.settings;

          return (
            <button
              key={section.id}
              className={`sidebar-nav-item ${isActive ? "sidebar-nav-item-active" : ""}`}
              onClick={() => onSelect(section.id)}
            >
              <span className="sidebar-nav-label">
                {/* gear icon for settings */}
                {isSettings ? "⚙ " : ""}{section.title}
              </span>
              {/* no status dot for settings tab */}
              {!isSettings && <StatusDot status={getStatus(section.id)} />}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      <div className="sidebar-divider" />

      {/* Section readiness summary — counts upload sections only */}
      <div className="sidebar-summary">
        {readyCount} of {uploadSections.length} sections ready
      </div>

      {/* Generate report button */}
      <button
        className={`sidebar-generate-btn ${!canGenerate ? "sidebar-generate-btn-disabled" : ""}`}
        onClick={onGenerate}
        disabled={!canGenerate}
      >
        {canGenerate ? "↓ Generate Report" : "⊘ No sections ready"}
      </button>

    </aside>
  );
}