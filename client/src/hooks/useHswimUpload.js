import { useState, useCallback } from "react";

const SERVER = "https://stream-production-748d.up.railway.app";

export function useHswimUpload(onStatusChange, sectionId) {
  const [hswimFile,       setHswimFile]       = useState(null);
  const [impoundedFile,   setImpoundedFile]   = useState(null);
  const [hswimResult,     setHswimResult]     = useState(null);
  const [impoundedResult, setImpoundedResult] = useState(null);
  const [busy,            setBusy]            = useState(false);
  const [error,           setError]           = useState(null);

  const [manualFields, setManualFields] = useState({
    B: "", L: "",
    buses: "", veh3500to7000: "", veh7000plus: "",
    preparedBy: "", approvedBy: "", date: "",
  });

  const updateManual = useCallback((key, val) => {
    setManualFields(prev => ({ ...prev, [key]: val }));
  }, []);

  const clearHswim = useCallback(() => {
    setHswimFile(null);
    setHswimResult(null);
    setError(null);
    onStatusChange(sectionId, "idle", null);
  }, [onStatusChange, sectionId]);

  const clearImpounded = useCallback(() => {
    setImpoundedFile(null);
    setImpoundedResult(null);
    setError(null);
  }, []);

  const uploadHswim = useCallback(async (file) => {
    if (!file) return;
    setHswimFile(file);
    setError(null);
    setBusy(true);
    onStatusChange(sectionId, "busy", null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch(`${SERVER}/upload/hswim`, { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Upload failed");
      setHswimResult(data);
      onStatusChange(sectionId, "success", data);
    } catch (err) {
      setError(err.message);
      onStatusChange(sectionId, "error", null);
    } finally {
      setBusy(false);
    }
  }, [onStatusChange, sectionId]);

  const uploadImpounded = useCallback(async (file) => {
    if (!file) return;
    setImpoundedFile(file);
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch(`${SERVER}/upload/hswim-impounded`, { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Upload failed");
      setImpoundedResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  // E is passed in from App.jsx (wide loads row count)
  const buildFinalReport = useCallback(async (E = 0) => {
    if (!hswimResult) return null;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        hourlyRows:    hswimResult.reportData.hourlyRows,
        F:             impoundedResult?.F ?? 0,
        E:             Number(E) || 0,
        B:             Number(manualFields.B)             || 0,
        L:             Number(manualFields.L)             || 0,
        buses:         Number(manualFields.buses)         || 0,
        veh3500to7000: Number(manualFields.veh3500to7000) || 0,
        veh7000plus:   Number(manualFields.veh7000plus)   || 0,
        preparedBy:    manualFields.preparedBy,
        approvedBy:    manualFields.approvedBy,
        date:          manualFields.date,
      };
      const res  = await fetch(`${SERVER}/upload/hswim-combined`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to build report");
      return data.reportData;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [hswimResult, impoundedResult, manualFields]);

  return {
    hswimFile, impoundedFile,
    hswimResult, impoundedResult,
    busy, error,
    manualFields, updateManual,
    uploadHswim, uploadImpounded,
    clearHswim, clearImpounded,
    buildFinalReport,
  };
}