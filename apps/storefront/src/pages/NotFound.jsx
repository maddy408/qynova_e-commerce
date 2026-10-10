import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-[#F8F3F6] font-sans px-6 text-[#2D252B]">
      <div className="text-center max-w-md bg-white p-8 sm:p-10 rounded-3xl border border-[#E8E0E5] shadow-sm">
        <h1 className="text-6xl font-black tracking-tight text-[#601D49]">
          404
        </h1>
        <h2 className="mt-4 text-2xl font-black text-[#2D252B]">
          Page Not Found
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-[#6B5E68]">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#601D49] px-6 text-xs sm:text-sm font-bold text-white transition-colors hover:bg-[#4D153A] shadow-md shadow-black/10"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
