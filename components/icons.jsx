// Small hand-drawn line icons used to label form fields — no icon library
// dependency, just plain inline SVG in a consistent stroke style.

function IconBase({ className, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function UserIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </IconBase>
  );
}

export function TruckIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="2" y="7" width="13" height="9" rx="1" />
      <path d="M15 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18.5" r="1.5" />
      <circle cx="17.5" cy="18.5" r="1.5" />
    </IconBase>
  );
}

export function TagIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12.5 3H5a2 2 0 0 0-2 2v7.5a2 2 0 0 0 .59 1.41l8.5 8.5a2 2 0 0 0 2.82 0l6.5-6.5a2 2 0 0 0 0-2.82l-8.5-8.5A2 2 0 0 0 12.5 3Z" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function WeightIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="6" r="3" />
      <path d="M8.5 9 5 20h14l-3.5-11" />
    </IconBase>
  );
}

export function MapPinIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 21s-7-6.3-7-11.5A7 7 0 0 1 19 9.5C19 14.7 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.25" />
    </IconBase>
  );
}

export function PhoneIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M5 4h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a1 1 0 0 1-1 1C10.5 19 5 13.5 4 6a1 1 0 0 1 1-2Z" />
    </IconBase>
  );
}

export function ClockIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </IconBase>
  );
}

export function CalendarIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
    </IconBase>
  );
}

export function DollarIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 2.5v19M16.5 6.5c0-1.7-2-3-4.5-3s-4.5 1.2-4.5 3c0 4 9 2.3 9 6.5 0 1.8-2 3-4.5 3s-4.5-1.3-4.5-3" />
    </IconBase>
  );
}

export function NoteIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M6 3h9l4 4v14H6Z" />
      <path d="M15 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </IconBase>
  );
}

export function SettingsIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 2v2.8M12 19.2V22M4.2 4.2l2 2M17.8 17.8l2 2M2 12h2.8M19.2 12H22M4.2 19.8l2-2M17.8 6.2l2-2" />
    </IconBase>
  );
}

export function BoxIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 8 12 3l9 5-9 5-9-5Z" />
      <path d="M3 8v9l9 5 9-5V8" />
      <path d="M12 13v9" />
    </IconBase>
  );
}

export function RouteIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="6" cy="19" r="2.25" />
      <circle cx="18" cy="5" r="2.25" />
      <path d="M6 16.75V13a4 4 0 0 1 4-4h4a4 4 0 0 0 4-4" />
    </IconBase>
  );
}

export function DatabaseIcon(props) {
  return (
    <IconBase {...props}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </IconBase>
  );
}

export function UploadIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
    </IconBase>
  );
}

export function UndoIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M7 8 3 12l4 4" />
      <path d="M3 12h11a5 5 0 0 1 0 10h-1" />
    </IconBase>
  );
}

export function SnowflakeIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11M9 5l3 2 3-2M9 19l3-2 3 2M4 10l1 3-3 1M4 14l1-3-3-1M20 10l-1 3 3 1M20 14l-1-3 3-1" />
    </IconBase>
  );
}
