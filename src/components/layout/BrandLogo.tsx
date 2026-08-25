import logoDark from "@/assets/nexus-logo-dark.svg";
import logoLight from "@/assets/nexus-logo-light.svg";
import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

// Raster fallbacks at 1x/2x/3x so devices that can't use the vector wordmark
// (older WebViews, e-mail/screenshot renderers) still get a Retina-sharp mark.
const RASTER = {
  dark: {
    src: "/brand/logo-dark@1x.png",
    srcSet:
      "/brand/logo-dark@1x.png 1x, /brand/logo-dark@2x.png 2x, /brand/logo-dark@3x.png 3x",
  },
  light: {
    src: "/brand/logo-light@1x.png",
    srcSet:
      "/brand/logo-light@1x.png 1x, /brand/logo-light@2x.png 2x, /brand/logo-light@3x.png 3x",
  },
} as const;

const IMG_CLASS =
  "block h-full w-auto max-h-full select-none [grid-area:logo] transition-opacity duration-300 ease-out will-change-[opacity] motion-reduce:transition-none";

/**
 * Nexus wordmark. Both variants are stacked in the same grid cell and
 * cross-fade when the `.dark` class toggles, so the swap never flashes or
 * shifts layout.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-grid h-9 shrink-0 overflow-hidden [grid-template-areas:'logo']",
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

