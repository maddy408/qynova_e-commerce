import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-[var(--color-bg-main)] font-sans px-6 text-[var(--color-text-main)]">
      <div className="text-center max-w-md bg-white p-8 sm:p-10 rounded-3xl border border-[var(--color-border-subtle)] shadow-sm">
        <h1 className="text-6xl font-black tracking-tight text-[var(--color-brand)]">
          404
        </h1>
        <h2 className="mt-4 text-2xl font-black text-[var(--color-text-main)]">
          Page Not Found
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-[var(--color-text-muted)]">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--color-brand)] px-6 text-xs sm:text-sm font-bold text-white transition-colors hover:bg-[var(--color-brand-hover)] shadow-md shadow-black/10"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
