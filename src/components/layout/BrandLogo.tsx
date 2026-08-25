import logoDark from "@/assets/nine64-logo-dark.png";
import logoLight from "@/assets/nine64-logo-light.png";
import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

// Raster lockup at 3x density; both variants share the same box so the swap is layout-stable.
const IMG_CLASS =
  "absolute inset-0 block h-full w-auto select-none transition-opacity duration-300 ease-out motion-reduce:transition-none";

/**
 * Nine64 wordmark. Both variants are stacked in the same box and cross-fade
 * when the `.dark` class toggles, so the swap never flashes or shifts layout.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative block h-9 aspect-[1413/468] shrink-0",
        className,
      )}
    >
      <img
        src={logoLight}
        alt={`${APP.name} logo`}
        width={1413}
        height={468}
        className={cn(IMG_CLASS, "opacity-100 dark:opacity-0")}
        draggable={false}
      />
      <img
        src={logoDark}
        alt=""
        aria-hidden
        width={1413}
        height={468}
        className={cn(IMG_CLASS, "opacity-0 dark:opacity-100")}
        draggable={false}
      />
    </span>
  );
}
