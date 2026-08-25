import { Globe, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Language switcher. `variant="icon"` matches the header's square controls,
 * `variant="inline"` is a full-width row for the mobile drawer.
 */
export function LanguageToggle({
  variant = "icon",
  className,
}: {
  variant?: "icon" | "inline";
  className?: string;
}) {
  const { t, locale, setLocale } = useT();
  const active = LOCALES.find((l) => l.id === locale) ?? LOCALES[0]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("common.language")}
          className={cn(
            variant === "icon"
              ? "flex size-12 items-center justify-center gap-1 rounded-xl border border-border/80 bg-secondary/30 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground lg:size-11"
              : "flex w-full items-center justify-between rounded-lg border border-border/80 bg-secondary/30 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground",
            className,
          )}
        >
          {variant === "icon" ? (
            <>
              <Globe className="size-5" />
              <span className="sr-only">{active.label}</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-2">
                <Globe className="size-4" />
                {t("common.language")}
              </span>
              <span className="font-semibold text-foreground">{active.short}</span>
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-xl p-2">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.id}
            onSelect={() => setLocale(l.id)}
            className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm"
          >
            {l.label}
            {l.id === locale && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
