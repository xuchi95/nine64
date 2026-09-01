/** Google "G" mark, single-color (inherits currentColor) to match the Nine64 brass theme. */
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12.24 10.4v3.36h5.6c-.24 1.4-1.7 4.12-5.6 4.12a6.02 6.02 0 0 1 0-12.04c1.66 0 2.98.66 3.9 1.5l2.5-2.4A9.5 9.5 0 0 0 12.24 2.2a9.8 9.8 0 1 0 0 19.6c5.66 0 9.4-3.98 9.4-9.58 0-.64-.06-1.14-.16-1.62h-9.24z" />
    </svg>
  );
}
