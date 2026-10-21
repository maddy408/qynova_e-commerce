// Client-side SEO helpers.
//
// The real SEO (title, description, canonical, Open Graph, JSON-LD) is put
// into the HTML by the server (public/index.php + /api/seo/render) for every
// URL a crawler or link preview loads directly. In the browser we only:
//   - keep the tab title right while the shopper navigates inside the app;
//   - drop the server tags of the FIRST page once the shopper moves on, so
//     stale product/category tags don't linger.
import { useEffect } from 'react'

export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://shopadams.in').replace(/\/+$/, '')

let siteNameCache = null

/** Brand name: from the server-rendered og:site_name, else env, else default. */
export function siteName() {
  if (siteNameCache) return siteNameCache
  const meta = typeof document !== 'undefined' ? document.querySelector('meta[property="og:site_name"]') : null
  siteNameCache = meta?.getAttribute('content') || import.meta.env.VITE_SITE_NAME || 'Shop with Adams'
  return siteNameCache
}
siteName() // read it now, before the server tags are removed

/** Sets the browser tab title for the current page ("Title | Brand"). */
export function usePageTitle(title) {
  useEffect(() => {
    if (!title) return
    // On the page the visitor/Googlebot landed on, keep the server's SEO title (it is
    // length-fitted with brand & city); only set titles after in-app navigation.
    if (document.querySelector('title[data-seo="ssr"]')) return
    const brand = siteName()
    document.title = title.includes(brand) ? title : `${title} | ${brand}`
  }, [title])
}

/** Removes the server-rendered SEO tags/content (marked data-seo="ssr"). */
export function removeServerSeo() {
  if (typeof document === 'undefined') return
  document.querySelectorAll('[data-seo="ssr"]').forEach((el) => el.remove())
}

const isObj = (x) => x !== null && typeof x === 'object'

/** /product/<slug> (falls back to the id; the page then swaps to the slug URL). */
export function productPath(productOrId) {
  const key = isObj(productOrId) ? productOrId.slug || productOrId.product_slug || productOrId.id || productOrId.product_id : productOrId
  return `/product/${encodeURIComponent(String(key ?? ''))}`
}

/** /category/<slug>[/<subSlug>] when slugs are known, else the old query URL (server 301s it to the slug URL). */
export function categoryPath(category, subcategory) {
  const catSlug = isObj(category) ? category.slug : null
  const subSlug = isObj(subcategory) ? subcategory.slug : null
  if (catSlug && (!subcategory || subSlug)) {
    return `/category/${encodeURIComponent(catSlug)}${subSlug ? `/${encodeURIComponent(subSlug)}` : ''}`
  }
  const catId = isObj(category) ? category.id : category
  const subId = isObj(subcategory) ? subcategory.id : subcategory
  const params = new URLSearchParams()
  if (catId) params.set('category_id', String(catId))
  if (subId) params.set('subcategory_id', String(subId))
  return `/products?${params.toString()}`
}
