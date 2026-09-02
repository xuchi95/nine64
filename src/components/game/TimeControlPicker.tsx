import { TIME_CATEGORIES, TIME_CONTROLS, type TimeControl } from "@/config/app";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function TimeControlPicker({
  value,
  onChange,
}: {
  value: TimeControl | null;
  onChange: (tc: TimeControl | null) => void;
}) {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
          value === null
            ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm ring-2 ring-primary/35"
            : "border-border bg-surface-2 text-muted-foreground hover:border-primary/50 hover:text-foreground",
        )}
      >
        {t("game.timeControl.unlimited")}
      </button>
      {TIME_CATEGORIES.map((cat) => (
        <div key={cat}>
          <p className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">{cat}</p>
          <div className="flex flex-wrap gap-2">
            {TIME_CONTROLS.filter((t) => t.category === cat).map((tc) => (
              <button
                key={tc.id}
                type="button"
                onClick={() => onChange(tc)}
                className={cn(
                  "tabular rounded-md border px-3 py-1.5 text-sm transition-colors",
                  value?.id === tc.id
                    ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm ring-2 ring-primary/35"
                    : "border-border bg-surface-2 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                {tc.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
