// server endpoint
//export const SERVER = 'http://localhost:5000';
export const SERVER = "https://stream-production-748d.up.railway.app";

// columns to be formatted as dates
export const DATE_COLUMNS = [
  "Inspection Date",
  "Date of Travel",
  "Start Date",
  "End Date",
];

// columns to be formatted as numbers
export const NUMBER_COLUMNS = ["weighofload", "Authweight"];

export const PDF_COLUMNS = [
  { key: "Inspection Date",  label: "Inspection\nDate" },
  { key: "registration",     label: "Registration" },
  { key: "Transp",           label: "Transporter" },
  { key: "Model",            label: "Model" },
  { key: "Origin",           label: "Origin" },
  { key: "destination",      label: "Destination" },
  { key: "Axleconf",         label: "Axleconf" },
  { key: "Inspstick",        label: "Inspsticker" },
  { key: "InsuaranceStic",   label: "InsuSticker" },
  { key: "Cargo",            label: "Cargo" },
  { key: "Dpermitissu",      label: "Permit Issue\nDate" },
  { key: "Height",           label: "Height" },
  { key: "Length",           label: "Length_" },
  { key: "Width",            label: "Width_" },
  { key: "AbnormalLPermit",  label: "Abnormal\nLoad Permit" },
  { key: "Totaltyres",       label: "Total Tyres" },
  { key: "weighofload",      label: "Load Weight" },
  { key: "Authweight",       label: "Authorized\nWeight" },
  { key: "Permit No.",       label: "Permit No." },
  { key: "Date of Travel",   label: "Date of\nTravel" },
  { key: "Start Date",       label: "PStartD" },
  { key: "End Date",         label: "PEndD" },
];

export const COLUMN_WEIGHTS = {
  "Inspection Date":  1.5,
  "registration":     1.5,
  "Transp":           3,
  "Model":            1.5,
  "Origin":           1.5,
  "destination":      1.5,
  "Axleconf":         1,
  "Inspstick":        1,
  "InsuaranceStic":   1,
  "Cargo":            4,
  "Dpermitissu":      1.5,
  "Height":           1,
  "Length":           1,
  "Width":            1,
  "AbnormalLPermit":  1.5,
  "Totaltyres":       1,
  "weighofload":      1.5,
  "Authweight":       1.5,
  "Permit No.":       1.5,
  "Date of Travel":   1.5,
  "Start Date":       1.5,
  "End Date":         1.5,
};

export const IMPOUNDED_COLUMNS = [
  { key: "DateWeighed",      label: "Date Weighed/\nProhibited" },
  { key: "Transporter",      label: "Transporter" },
  { key: "VehicleReg",       label: "VehicleReg" },
  { key: "AxleConfig",       label: "Axle\nConfig" },
  { key: "Cargo",            label: "Cargo" },
  { key: "Source",           label: "Source" },
  { key: "Destination",      label: "Destination" },
  { key: "AxleOverload",     label: "Axle\nOverload" },
  { key: "GVWOverload",      label: "GVW\nOver load" },
  { key: "ProhibitionOrder", label: "ProhibitionOrder" },
  { key: "Prosecutor",       label: "Prosecutor" },
  { key: "ComputerOperator", label: "Computer\nOperator" },
];

export const IMPOUNDED_NUMBER_COLUMNS = ["AxleOverload", "GVWOverload"];
export const IMPOUNDED_DATE_COLUMNS   = ["DateWeighed"];

// ── GROUPS ───────────────────────────────────────────────────
// Drives the collapsible sidebar groups.
// Each section gets a `group` field matching a group id.
// Sections with group: "system" go under the system divider.
export const GROUPS = [
  { id: "daily",  label: "Daily Report" },
  { id: "mobile", label: "Mobile Report" },
];

// ── SECTIONS array ────────────────────────────────────────────
// group:    which sidebar group this belongs to
// custom:   true → renders HswimSection component
// settings: true → renders SettingsSection component
export const SECTIONS = [
  // ── Daily Report sections ─────────────────────────────────
  {
    id:            "wide_load",
    group:         "daily",
    title:         "Wide Loads",
    endpoint:      "/upload",
    pdfColumns:    PDF_COLUMNS,
    columnWeights: COLUMN_WEIGHTS,
    rotated:       true,
  },
  {
    id:            "impounded",
    group:         "daily",
    title:         "Impounded & Prohibited",
    endpoint:      "/upload/impounded",
    pdfColumns:    IMPOUNDED_COLUMNS,
    columnWeights: null,
    rotated:       false,
  },
  {
    id:            "hswim",
    group:         "daily",
    title:         "HSWIM Daily Report",
    endpoint:      null,
    pdfColumns:    null,
    columnWeights: null,
    rotated:       false,
    custom:        true,
  },

  // ── Mobile Report sections ────────────────────────────────
  // Add your mobile report section configs here when ready.
  // Example:
  // {
  //   id:       "mobile_stats",
  //   group:    "mobile",
  //   title:    "Mobile Statistics",
  //   endpoint: "/upload/mobile",
  //   ...
  // },

  // ── System ───────────────────────────────────────────────
  {
    id:       "settings",
    group:    "system",
    title:    "Settings",
    settings: true,
  },
];