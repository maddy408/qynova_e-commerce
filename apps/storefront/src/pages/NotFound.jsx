import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black px-6">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold tracking-tight text-black dark:text-white">
          404
        </h1>
        <h2 className="mt-4 text-2xl font-semibold text-zinc-800 dark:text-zinc-200">
          Page Not Found
        </h2>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
