import { useState, useCallback } from "react";
import { SECTIONS } from "./config/sections.js";
import { useSettings } from "./hooks/useSettings.js";
import Sidebar from "./components/Sidebar.jsx";
import DailyReportView from "./components/DailyReportView.jsx";
import HswimSection from "./components/HswimSection.jsx";
import SettingsSection from "./components/SettingsSection.jsx";
import { useHswimUpload } from "./hooks/useHswimUpload.js";

const DAILY_IDS = ["wide_load", "impounded", "hswim"];

export default function App() {
  const [sectionStates, setSectionStates] = useState(
    SECTIONS.filter(s => !s.settings).map(s => ({
      id: s.id, status: "idle", result: null,
    }))
  );


  const [activeId, setActiveId]     = useState("daily");
  const { settings, updateSetting, resetSettings } = useSettings();

  // Manual fields lifted here so DailyReportView + HswimSection share state
  const [manualFields, setManualFields] = useState({
    date: "", preparedBy: "", approvedBy: "",
    B: 0, L: 0, buses: 0, veh3500to7000: 0, veh7000plus: 0,
  });

  const updateManual = useCallback((key, value) => {
    setManualFields(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSectionStatus = useCallback((id, status, result) => {
    setSectionStates(prev =>
      prev.map(s => s.id === id ? { ...s, status, result } : s)
    );
  }, []);

  const hswimUpload = useHswimUpload(handleSectionStatus, "hswim");

  const canGenerate = sectionStates.some(s => s.status === "success");

  const wideLoadState = sectionStates.find(s => s.id === "wide_load");
  const wideLoadDone  = wideLoadState?.status === "success";
  const wideLoadE     = wideLoadDone
    ? (wideLoadState.result?.total_rows ?? wideLoadState.result?.allRows?.length ?? 0)
    : 0;

  function handleGenerate() { window.print(); }

  function renderMain() {
    if (activeId === "settings") {
      return (
        <div className="content-area">
          <SettingsSection
            settings={settings}
            updateSetting={updateSetting}
            resetSettings={resetSettings}
          />
        </div>
      );
    }

    return (
      <div style={{ flex: 1, overflow: "hidden", padding: "16px 20px", display: "flex", flexDirection: "column" }}>
        <DailyReportView
          sectionStates={sectionStates}
          onStatusChange={handleSectionStatus}
          manualFields={manualFields}
          updateManual={updateManual}
          settings={settings}
          onGenerate={handleGenerate}
          hswimUpload={hswimUpload} 
        >
          {/* PDF pages render inside the preview card */}
          {wideLoadDone && (
            <HswimSection
              section={SECTIONS.find(s => s.id === "hswim")}
              onStatusChange={handleSectionStatus}
              wideLoadE={wideLoadE}
              wideLoadDone={wideLoadDone}
              settings={settings}
              wideLoadResult={wideLoadState?.result ?? null}
              impoundedResult={
                sectionStates.find(s => s.id === "impounded")?.result ?? null
              }
              manualFields={manualFields}
              updateManual={updateManual}
              embeddedMode={true}
              hswimUpload={hswimUpload} 
            />
          )}
        </DailyReportView>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        sectionStates={sectionStates}
        activeId={
          activeId === "daily"
            ? (sectionStates.find(s => DAILY_IDS.includes(s.id) && s.status === "success")?.id ?? "wide_load")
            : activeId
        }
        onSelect={id => setActiveId(id === "settings" ? "settings" : "daily")}
        onGenerate={handleGenerate}
        canGenerate={canGenerate}
      />

      <div className="main-area">
        <div className="topbar">
          <div className="topbar-left">
            <span className="topbar-title">
              {activeId === "settings" ? "Settings" : "Daily Report"}
            </span>
            <span className="topbar-sub">
              {activeId === "settings" ? "Weighbridge configuration" : "Upload & Generate"}
            </span>
          </div>
          <div className="topbar-badges">
            {sectionStates.filter(s => s.status === "success").length > 0 && (
              <span className="badge badge-green">
                {sectionStates.filter(s => s.status === "success").length} ready
              </span>
            )}
            {settings?.direction && (
              <span className="badge badge-blue">{settings.direction}</span>
            )}
          </div>
        </div>

        {renderMain()}
      </div>
    </div>
  );
}