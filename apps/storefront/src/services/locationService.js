/**
 * Location Service for Storefront
 * Handles browser Geolocation and free Reverse Geocoding (BigDataCloud + OpenStreetMap Nominatim).
 * Provides unified address extraction, local persistence, and event-driven updates.
 */

const STORAGE_KEY = 'user_delivery_location'
const PROMPT_DISMISSED_KEY = 'location_prompt_dismissed_session'

/** Above this, a fix is considered too coarse (often a cell-tower/wifi estimate rather than GPS) to trust without a retry. */
const ACCURACY_RETRY_THRESHOLD_METERS = 100

function getPositionOnce(options) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
      },
      (error) => {
        let message = 'Unable to retrieve location.'
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location access was denied. Please allow location access in your browser settings.'
            break
          case error.POSITION_UNAVAILABLE:
            message = 'Location information is currently unavailable. Please check your GPS/network.'
            break
          case error.TIMEOUT:
            message = 'Location request timed out. Please try again.'
            break
          default:
            message = error.message || message
        }
        reject(new Error(message))
      },
      options
    )
  })
}

/**
 * Get current browser GPS coordinates using standard HTML5 Geolocation API.
 * Never falls back to IP-based geolocation — a wrong fix is better surfaced
 * via low `accuracy` than silently replaced with a city-level IP guess.
 *
 * `maximumAge: 0` forces a fresh fix every time (a cached fix from an
 * earlier, possibly different, location was part of why this previously
 * showed Madurai/Peraiyur instead of the user's actual position near
 * Pavoorchatram). If the first fix is coarser than
 * ACCURACY_RETRY_THRESHOLD_METERS, one retry is attempted and the more
 * accurate of the two fixes is kept — a low-accuracy fix is still
 * returned (never thrown away) so the caller can show it to the user
 * with its accuracy figure rather than fail outright.
 *
 * @param {Object} customOptions
 * @returns {Promise<{latitude: number, longitude: number, accuracy: number}>}
 */
export async function getCurrentCoordinates(customOptions = {}) {
  const options = {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0,
    ...customOptions,
  }

  const first = await getPositionOnce(options)
  if (first.accuracy == null || first.accuracy <= ACCURACY_RETRY_THRESHOLD_METERS) {
    return first
  }

  try {
    const second = await getPositionOnce(options)
    return second.accuracy != null && second.accuracy < first.accuracy ? second : first
  } catch {
    return first
  }
}

/**
 * Free Reverse Geocoding using BigDataCloud Client API + OpenStreetMap Nominatim.
 * No API key needed, completely free, CORS enabled for client-side frontend use.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Object>} Unified parsed address object
 */
export async function reverseGeocode(latitude, longitude) {
  const lat = Number(latitude)
  const lng = Number(longitude)

  let road = ''
  let locality = ''
  let city = ''
  let state = ''
  let pincode = ''
  let country = 'India'
  let formattedAddress = ''

  // 1. Primary query: OpenStreetMap Nominatim, read most-specific-first
  //    (village/suburb/neighbourhood before town/city). BigDataCloud
  //    (below) was previously queried first and nearly always returns
  //    some value for `city` even for rural coordinates — typically the
  //    district headquarters (e.g. Madurai for a Pavoorchatram/Tenkasi
  //    fix) — which then skipped Nominatim's finer-grained result
  //    entirely via the old `if (!city)` gate. Nominatim is queried
  //    first now so its locality-level detail is used whenever present.
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    const nomRes = await fetch(nomUrl, {
      headers: {
        Accept: 'application/json',
      },
    })
    if (nomRes.ok) {
      const data = await nomRes.json()
      const addr = data.address || {}

      road =
        addr.road ||
        addr.street ||
        addr.pedestrian ||
        addr.residential ||
        addr.neighbourhood ||
        addr.suburb ||
        addr.amenity ||
        ''

      // Most specific locality first — a village/suburb, never the
      // district/first geocoder result.
      locality = addr.village || addr.hamlet || addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || ''
      city = addr.village || addr.suburb || addr.town || addr.city || addr.city_district || addr.county || ''
      state = addr.state || ''
      if (addr.postcode) {
        pincode = String(addr.postcode).replace(/[^0-9]/g, '').slice(0, 6)
      }
      if (addr.country) {
        country = addr.country
      }
      if (data.display_name) {
        formattedAddress = data.display_name
      }
    }
  } catch (err) {
    console.warn('Nominatim reverse geocode failed, will fall back to BigDataCloud:', err)
  }

  // 2. Fallback only: BigDataCloud fills in whatever Nominatim couldn't
  //    provide (it failed entirely, or is missing a field) — never
  //    overrides a value Nominatim already supplied.
  if (!city || !locality || !pincode) {
    try {
      const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
      const bdcRes = await fetch(bdcUrl)
      if (bdcRes.ok) {
        const data = await bdcRes.json()
        if (!locality) locality = data.locality || ''
        if (!city) city = data.city || data.locality || ''
        if (!state) state = data.principalSubdivision || ''
        if (!pincode) pincode = (data.postcode || '').replace(/[^0-9]/g, '').slice(0, 6)
        if (!country) country = data.countryName || 'India'
      }
    } catch (err) {
      console.warn('BigDataCloud reverse geocode fallback failed:', err)
    }
  }

  // Assemble clean street and display strings
  const streetParts = [road, locality].filter(Boolean)
  const streetAddress =
    streetParts.length > 0
      ? streetParts.join(', ')
      : formattedAddress
      ? formattedAddress.split(',').slice(0, 2).join(',').trim()
      : 'Current GPS Location'

  const displayTitle = locality || city || 'Current Location'
  const displaySubtitle = [city, pincode].filter(Boolean).join(' ') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  const shortDisplay = [displayTitle, pincode].filter(Boolean).join(' ')

  const locationResult = {
    latitude: lat,
    longitude: lng,
    road,
    locality,
    city: city || 'Local Area',
    state: state || '',
    pincode: pincode || '',
    country: country || 'India',
    streetAddress,
    formattedAddress: formattedAddress || [streetAddress, city, state, pincode].filter(Boolean).join(', '),
    displayTitle,
    displaySubtitle,
    shortDisplay,
    isGps: true,
    timestamp: Date.now(),
  }

  return locationResult
}

/**
 * Log lat/lng/accuracy for a GPS fix during debugging (C1 — wrong live
 * location bug). Call sites log immediately after getCurrentCoordinates()
 * resolves; this is a thin wrapper so the log format stays consistent.
 */
export function logGpsFix(coords, label = 'GPS fix') {
  console.log(`[location] ${label}: lat=${coords.latitude}, lng=${coords.longitude}, accuracy=${coords.accuracy}m`)
}

/**
 * Fetch current GPS location, reverse-geocode it, save to localStorage, and broadcast change.
 * @returns {Promise<Object>}
 */
export async function detectAndSaveLocation() {
  const coords = await getCurrentCoordinates()
  logGpsFix(coords)
  const locationData = await reverseGeocode(coords.latitude, coords.longitude)
  locationData.accuracy = coords.accuracy
  saveStoredLocation(locationData)
  return locationData
}

/**
 * Retrieve saved location object from localStorage.
 * @returns {Object|null}
 */
export function getStoredLocation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Save location object to localStorage and emit 'delivery-location-changed' event.
 * @param {Object} locationData
 */
export function saveStoredLocation(locationData) {
  if (!locationData) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locationData))
    window.dispatchEvent(
      new CustomEvent('delivery-location-changed', {
        detail: locationData,
      })
    )
  } catch (err) {
    console.error('Failed to save delivery location to storage:', err)
  }
}

/**
 * Clear stored location from localStorage and notify components.
 */
export function clearStoredLocation() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(
      new CustomEvent('delivery-location-changed', {
        detail: null,
      })
    )
  } catch (err) {
    console.error('Failed to clear delivery location from storage:', err)
  }
}

/**
 * Session and local storage flag to know if prompt was dismissed.
 */
export function isLocationPromptDismissed() {
  try {
    return (
      sessionStorage.getItem(PROMPT_DISMISSED_KEY) === 'true' ||
      localStorage.getItem(PROMPT_DISMISSED_KEY) === 'true'
    )
  } catch {
    return false
  }
}

export function setLocationPromptDismissed() {
  try {
    sessionStorage.setItem(PROMPT_DISMISSED_KEY, 'true')
    localStorage.setItem(PROMPT_DISMISSED_KEY, 'true')
  } catch {
    // ignore
  }
}
