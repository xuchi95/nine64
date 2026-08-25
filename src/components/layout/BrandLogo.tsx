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
  "h-full w-auto select-none transition-opacity duration-300 ease-out will-change-[opacity] motion-reduce:transition-none";

/**
 * Nexus wordmark. Both variants are stacked in the same grid cell and
 * cross-fade when the `.dark` class toggles, so the swap never flashes or
 * shifts layout.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 [grid-template-areas:'logo'] [&>picture]:[grid-area:logo]",
        className,
      )}
    >
      <picture className="opacity-100 transition-opacity duration-300 ease-out dark:opacity-0">
        <source srcSet={logoLight} type="image/svg+xml" />
        <img
          src={RASTER.light.src}
          srcSet={RASTER.light.srcSet}
          alt={`${APP.name} logo`}
          className={IMG_CLASS}
          draggable={false}
        />
      </picture>
      <picture className="opacity-0 transition-opacity duration-300 ease-out dark:opacity-100">
        <source srcSet={logoDark} type="image/svg+xml" />
        <img
          src={RASTER.dark.src}
          srcSet={RASTER.dark.srcSet}
          alt=""
          aria-hidden
          className={IMG_CLASS}
          draggable={false}
        />
      </picture>
    </span>
  );
}
