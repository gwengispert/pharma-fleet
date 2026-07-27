const SIZES = {
  sm: { box: "h-6 w-6", icon: "h-3.5 w-3.5", text: "text-sm" },
  md: { box: "h-8 w-8", icon: "h-4 w-4", text: "text-base" },
  lg: { box: "h-11 w-11", icon: "h-6 w-6", text: "text-2xl" },
};

// Brand mark: a rounded teal square with a medical cross, used consistently
// across the home, admin, and driver headers.
export default function Logo({ size = "md", withText = true }) {
  const { box, icon, text } = SIZES[size] || SIZES.md;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`flex ${box} flex-none items-center justify-center rounded-lg bg-teal-700 dark:bg-teal-500`}
      >
        <svg viewBox="0 0 24 24" fill="#ffffff" className={icon} aria-hidden="true">
          <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" />
        </svg>
      </span>
      {withText && (
        <span className={`font-semibold tracking-tight ${text}`}>Pharma Fleet</span>
      )}
    </span>
  );
}
