import { useState } from "react";
import { SECTIONS, GROUPS } from "../config/sections";

/**
 * ANKA Reports — Sidebar
 *
 * Features:
 *  - Collapsible groups: Daily Report / Mobile Report
 *  - Status dots per section (success / uploading / error / idle)
 *  - Ready count summary at bottom
 *  - Generate button (disabled until canGenerate)
 *  - System section (Settings) below a divider, no group header
 */





export default function Sidebar({
  sectionStates,
  activeId,
  onSelect,
  onGenerate,
  canGenerate,
}) {
  // Track which groups are open. Daily starts open, mobile starts closed.
  const [openGroups, setOpenGroups] = useState({ daily: true, mobile: false });

  function toggleGroup(id) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function getStatus(id) {
    return sectionStates.find((s) => s.id === id)?.status ?? "idle";
  }

  const uploadSections = SECTIONS.filter((s) => !s.settings);
  const readyCount = sectionStates.filter((s) => s.status === "success").length;

  // Sections that belong to named groups (daily / mobile)
  const groupedSections = (groupId) =>
    SECTIONS.filter((s) => s.group === groupId);

  // System-level sections (settings, etc.)
  const systemSections = SECTIONS.filter((s) => s.group === "system");

  function SidebarLogo() {
  const [imgFailed, setImageFailed] = useState(false);

  if (imgFailed) {
    return (
      <>
        <div className="sidebar-logo-mark">A</div>
        <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">ANKA Reports</span>
            <span className="sidebar-brand-sub">Weighbridge Portal</span>
        </div>
      </>
    );
  }

    return (
      <img
        src="/logo.png"
        alt="ANKA Logo"
        className="sidebar-logo-img"
        onError={() => setImageFailed(true)}
      />
    )
  }

  return (
    <aside className="sidebar">

      {/* ── Brand header ───────────────────────────────────── */}
      <div className="sidebar-brand">
        <SidebarLogo />
      </div>

      {/* ── Navigation ─────────────────────────────────────── */}
      <nav className="sidebar-nav">

        {/* Grouped sections: Daily Report, Mobile Report */}
        {GROUPS.map((group) => {
          const sections = groupedSections(group.id);
          if (sections.length === 0) return null;
          const isOpen = !!openGroups[group.id];

          return (
            <div key={group.id} className="sidebar-group">

              {/* Group header — clickable to collapse */}
              <button
                className="sidebar-group-btn"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
              >
                <span className="sidebar-group-label">{group.label}</span>
                <span className={`sidebar-chevron ${isOpen ? "open" : ""}`}>
                  ▶
                </span>
              </button>

              {/* Children — shown when group is open */}
              {isOpen && (
                <div className="sidebar-group-children">
                  {sections.map((section) => (
                    <SidebarItem
                      key={section.id}
                      section={section}
                      isActive={section.id === activeId}
                      status={getStatus(section.id)}
                      onClick={() => onSelect(section.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

      </nav>

      <div style={{ flex: 1 }} />

      {/* ── Footer: ready count + generate button ──────────── */}
      <div className="sidebar-footer">

        {/* System divider + Settings */}
        {systemSections.length > 0 && (
          <>
            <div className="sidebar-divider" />
            {systemSections.map((section) => (
              <SidebarItem
                key={section.id}
                section={section}
                isActive={section.id === activeId}
                status={null} // no status dot for settings
                onClick={() => onSelect(section.id)}
                isSystem
              />
            ))}
          </>
        )}


        
        <div className="sidebar-ready">
          <StatusDot status={readyCount === uploadSections.length && readyCount > 0 ? "success" : "idle"} />
          <span className="sidebar-ready-text">
            {readyCount} of {uploadSections.length} sections ready
          </span>
        </div>

        <button
          className={`sidebar-generate-btn ${!canGenerate ? "disabled" : ""}`}
          onClick={onGenerate}
          disabled={!canGenerate}
        >
          {canGenerate ? "↓ Generate Report" : "⊘ No sections ready"}
        </button>
      </div>

    </aside>
  );
}

// ── Sub-components ───────────────────────────────────────────

function SidebarItem({ section, isActive, status, onClick, isSystem }) {
  return (
    <button
      className={`sidebar-item ${isActive ? "active" : ""} ${isSystem ? "system" : ""}`}
      onClick={onClick}
    >
      {isSystem && <span className="sidebar-item-icon">⚙</span>}
      <span className="sidebar-item-label">{section.title}</span>
      {status !== null && <StatusDot status={status} />}
    </button>
  );
}

function StatusDot({ status }) {
  const colors = {
    success:   "var(--status-success)",
    uploading: "var(--status-warn)",
    busy:      "var(--status-warn)",
    error:     "var(--status-error)",
    idle:      "var(--status-idle)",
  };
  return (
    <span
      className="status-dot"
      style={{ background: colors[status] ?? colors.idle }}
    />
  );
}