import { useState, useCallback } from "react";

import { SECTIONS } from "./config/sections.js";
import { generateImpoundedPDF } from "./utils/generateImpoundedPDF.js";
import { generatePDF } from "./utils/generatePDF.js";
import { useSettings } from "./hooks/useSettings.js";
import Sidebar from "./components/Sidebar.jsx";
import UploadSection from "./components/UploadSection.jsx";
import HswimSection from "./components/HswimSection.jsx";
import SettingsSection from "./components/SettingsSection.jsx";

export default function App() {
  const [sectionStates, setSectionStates] = useState(
    SECTIONS.filter(s => !s.settings).map((s) => ({ id: s.id, status: "idle", result: null }))
  );

  const [activeId, setActiveId] = useState(SECTIONS[0]?.id);

  // Weighbridge settings — persisted in localStorage
  const { settings, updateSetting, resetSettings } = useSettings();

  const handleSectionStatus = useCallback((id, status, result) => {
    setSectionStates((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, result } : s))
    );
  }, []);

  const canGenerate = sectionStates.some((s) => s.status === "success");

  // E flows from Wide Loads row count into HSWIM
  const wideLoadState = sectionStates.find((s) => s.id === "wide_load");
  const wideLoadDone  = wideLoadState?.status === "success";
  const wideLoadE     = wideLoadDone
    ? (wideLoadState.result?.total_rows ?? wideLoadState.result?.allRows?.length ?? 0)
    : 0;

  function handleGenerate() {
    const readySections = sectionStates.filter((s) => s.status === "success");
    if (readySections.length > 0) {
      const first = readySections[0];
      if (first.id === "impounded") {
        generateImpoundedPDF(first.result);
      } else if (first.id !== "hswim") {
        generatePDF(first.result);
      }
    }
  }

  function renderSection(section) {
    if (section.settings) {
      return (
        <SettingsSection
          key={section.id}
          settings={settings}
          updateSetting={updateSetting}
          resetSettings={resetSettings}
        />
      );
    }
    if (section.custom) {
      return (
        <HswimSection
          key={section.id}
          section={section}
          onStatusChange={handleSectionStatus}
          wideLoadE={wideLoadE}
          wideLoadDone={wideLoadDone}
          settings={settings}
          wideLoadResult={wideLoadState?.result ?? null}
          impoundedResult={sectionStates.find(s => s.id === "impounded")?.result ?? null}
        />
      );
    }
    return (
      <UploadSection
        key={section.id}
        section={section}
        onStatusChange={handleSectionStatus}
      />
    );
  }

  return (
    <div className="root">
      <Sidebar
        sectionStates={sectionStates}
        activeId={activeId}
        onSelect={setActiveId}
        onGenerate={handleGenerate}
        canGenerate={canGenerate}
        sections={SECTIONS}
      />
      <main className="main-content">
        {SECTIONS.map((section) =>
          section.id === activeId ? renderSection(section) : null
        )}
      </main>
    </div>
  );
}