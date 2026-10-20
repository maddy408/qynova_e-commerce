import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { removeServerSeo, siteName } from '../lib/seo'

/**
 * Keeps the server-rendered SEO tags of the page the visitor (or Googlebot)
 * landed on, and removes them as soon as the visitor navigates to another
 * page inside the app, resetting the tab title to the brand until that page
 * sets its own.
 */
export default function SeoRouteReset() {
  const { pathname } = useLocation()
  const firstPath = useRef(pathname)

  useEffect(() => {
    if (pathname === firstPath.current) return
    firstPath.current = '\u0000' // from now on every change resets
    removeServerSeo()
    document.title = siteName()
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
