/**
 * Location Service for Storefront
 * Handles browser Geolocation and free Reverse Geocoding (BigDataCloud + OpenStreetMap Nominatim).
 * Provides unified address extraction, local persistence, and event-driven updates.
 */

const STORAGE_KEY = 'user_delivery_location'
const PROMPT_DISMISSED_KEY = 'location_prompt_dismissed_session'

/**
 * Get current browser GPS coordinates using standard HTML5 Geolocation API.
 * @param {Object} customOptions
 * @returns {Promise<{latitude: number, longitude: number, accuracy: number}>}
 */
export function getCurrentCoordinates(customOptions = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'))
      return
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
      ...customOptions,
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

  // 1. Primary query: BigDataCloud Free Client-side Reverse Geocoder (fast, no rate-limiting, CORS-friendly)
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    const bdcRes = await fetch(bdcUrl)
    if (bdcRes.ok) {
      const data = await bdcRes.json()
      city = data.city || data.locality || ''
      locality = data.locality || ''
      state = data.principalSubdivision || ''
      pincode = (data.postcode || '').replace(/[^0-9]/g, '').slice(0, 6)
      country = data.countryName || 'India'
    }
  } catch (err) {
    console.warn('BigDataCloud reverse geocode fallback trigger:', err)
  }

  // 2. Secondary query: OpenStreetMap Nominatim (rich street/road & neighbourhood detail)
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
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

      if (!locality) {
        locality = addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || ''
      }
      if (!city) {
        city = addr.city || addr.town || addr.village || addr.city_district || addr.county || ''
      }
      if (!state) {
        state = addr.state || ''
      }
      if (!pincode && addr.postcode) {
        pincode = String(addr.postcode).replace(/[^0-9]/g, '').slice(0, 6)
      }
      if (!country && addr.country) {
        country = addr.country
      }
      if (data.display_name) {
        formattedAddress = data.display_name
      }
    }
  } catch (err) {
    console.warn('Nominatim reverse geocode fallback trigger:', err)
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
 * Fetch current GPS location, reverse-geocode it, save to localStorage, and broadcast change.
 * @returns {Promise<Object>}
 */
export async function detectAndSaveLocation() {
  const coords = await getCurrentCoordinates()
  const locationData = await reverseGeocode(coords.latitude, coords.longitude)
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
