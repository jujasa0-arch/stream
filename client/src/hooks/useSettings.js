import { useState, useCallback } from "react";

const STORAGE_KEY = "wb_settings";

const DEFAULTS = {
  name:      "JUJA WEIGHBRIDGE",
  direction: "THIKA BOUND",
  reference: "KeNHA/WB/MTCE/4339/2025",
  location:  "JUJA",
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable — silently ignore
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(load);

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      save(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    save(DEFAULTS);
    setSettings({ ...DEFAULTS });
  }, []);

  // Derived: full report header string used in footer
  const reportTitle = `${settings.name} ${settings.direction} DAILY REPORT`;

  return { settings, updateSetting, resetSettings, reportTitle };
}