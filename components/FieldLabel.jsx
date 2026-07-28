// Small label + icon pairing used across the admin forms so each field is
// recognizable at a glance (vehicle vs. person vs. weight vs. address, etc.)
// instead of relying on reading every text label.
export default function FieldLabel({ icon: Icon, children }) {
  return (
    <label className="flex items-center gap-1 text-xs text-neutral-500">
      <Icon className="h-3.5 w-3.5 flex-none text-neutral-400 dark:text-neutral-500" />
      {children}
    </label>
  );
}
