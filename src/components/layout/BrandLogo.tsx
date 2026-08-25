import logoDark from "@/assets/nexus-logo-dark.svg";
import logoLight from "@/assets/nexus-logo-light.svg";
import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

// Vector wordmark stays crisp on any density; raster fallbacks live in /public/brand.
const IMG_CLASS =
  "absolute inset-0 block h-full w-auto select-none transition-opacity duration-300 ease-out motion-reduce:transition-none";

/**
 * Nexus wordmark. Both variants are stacked in the same box and cross-fade
 * when the `.dark` class toggles, so the swap never flashes or shifts layout.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative block h-9 aspect-[272/100] shrink-0",
        className,
      )}
    >
      <img
        src={logoLight}
        alt={`${APP.name} logo`}
        className={cn(IMG_CLASS, "opacity-100 dark:opacity-0")}
        draggable={false}
      />
      <img
        src={logoDark}
        alt=""
        aria-hidden
        className={cn(IMG_CLASS, "opacity-0 dark:opacity-100")}
        draggable={false}
      />
    </span>
  );
}
