import type { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toasts are disabled site-wide by product decision.
 * This component renders nothing, so any `toast()` call stays silent.
 * Use inline messages (banners, form errors, empty states) instead.
 */
const Toaster = (_props: ToasterProps) => null;

export { Toaster };
