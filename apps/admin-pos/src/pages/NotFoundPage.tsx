import { ROUTES } from '../routes/routes'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center gap-2">
      <p className="text-3xl font-black text-text">404</p>
      <p className="text-sm font-bold text-text">Page not found</p>
      <a href={ROUTES.DASHBOARD} className="mt-2 text-xs font-bold text-primary-strong hover:underline">
        Back to Dashboard
      </a>
    </div>
  )
}
