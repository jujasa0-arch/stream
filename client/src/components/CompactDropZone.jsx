import { useEffect } from "react";
import { useUpload } from "../hooks/useUpload";
import { SERVER } from "../config/sections";

/**
 * CompactDropZone
 * Self-contained, auto-uploads the moment a file is dropped.
 * Designed to sit inside the unified upload card.
 */
export default function CompactDropZone({ label, endpoint, sectionId, onStatusChange }) {
  const {
    file, dragOver, status, result, errorMsg,
    inputRef, pickFile,
    onDragOver, onDragLeave, onDrop,
    upload, reset,
  } = useUpload(`${SERVER}${endpoint}`);

  // Auto-upload as soon as a file is picked
  useEffect(() => {
    if (file && status === "idle") {
      upload();
    }
  }, [file, status, upload]);

  // Notify parent of status changes
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(sectionId, status, result);
    }
  }, [status, result, onStatusChange, sectionId]);

  const isDone    = status === "success";
  const isLoading = status === "uploading";
  const isError   = status === "error";

  return (
    <div
      className={[
        "cdz",
        dragOver  ? "cdz-drag"  : "",
        isDone    ? "cdz-done"  : "",
        isError   ? "cdz-error" : "",
        isLoading ? "cdz-busy"  : "",
      ].filter(Boolean).join(" ")}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => !isLoading && inputRef.current?.click()}
      title={errorMsg || ""}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => pickFile(e.target.files[0])}
      />

      {/* Icon */}
      <span className="cdz-icon">
        {isLoading ? "↻" : isDone ? "✓" : isError ? "!" : "↑"}
      </span>

      {/* Label */}
      <div className="cdz-label">{label}</div>

      {/* Sub text */}
      {isDone && result && (
        <div className="cdz-file" title={file?.name}>
          {file?.name?.length > 18 ? file.name.slice(0, 16) + "…" : file?.name}
        </div>
      )}
      {isLoading && <div className="cdz-hint">Uploading…</div>}
      {isError && <div className="cdz-hint cdz-hint-error">Failed — retry</div>}
      {!file && !isLoading && !isDone && (
        <div className="cdz-hint">.csv · .xlsx · .xls</div>
      )}

      {/* Remove button when done */}
      {isDone && !isLoading && (
        <button
          className="cdz-clear"
          onClick={(e) => { e.stopPropagation(); reset(); }}
          title="Remove file"
        >
          ✕
        </button>
      )}
    </div>
  );
}