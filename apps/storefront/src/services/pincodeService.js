/**
 * Postal PIN Code Service
 * Integrates with India Post API: https://api.postalpincode.in/pincode/{PINCODE}
 * 
 * Validates 6-digit Indian PIN codes, provides in-memory caching and request deduplication,
 * and extracts State, District, City/Block, and Post Office names.
 */

// In-memory cache to prevent duplicate network calls
const pincodeCache = new Map()

// In-flight requests map to avoid duplicate concurrent calls
const inFlightRequests = new Map()

/**
 * Validate if a string is a 6-digit Indian PIN code.
 * Must be exactly 6 digits and cannot start with '0'.
 * @param {string|number} pincode
 * @returns {boolean}
 */
export function isValidIndianPincode(pincode) {
  if (!pincode) return false
  const clean = String(pincode).trim()
  return /^[1-9][0-9]{5}$/.test(clean)
}

/**
 * Lookup Postal Location from https://api.postalpincode.in/pincode/{PINCODE}
 * 
 * @param {string|number} pincode 6-digit Indian PIN code
 * @returns {Promise<{
 *   valid: boolean,
 *   pincode: string,
 *   state?: string,
 *   district?: string,
 *   city?: string,
 *   block?: string,
 *   postOffice?: string,
 *   postOffices?: string[],
 *   allOffices?: Array<any>,
 *   formattedLocation?: string,
 *   error?: string
 * }>}
 */
export async function lookupPostalPincode(pincode) {
  const clean = String(pincode || '').trim()

  // 1. Validate exactly 6 digits
  if (!isValidIndianPincode(clean)) {
    return {
      valid: false,
      pincode: clean,
      error: 'Invalid PIN code. Please enter a valid 6-digit Indian PIN code.',
    }
  }

  // 2. Check in-memory cache
  if (pincodeCache.has(clean)) {
    return pincodeCache.get(clean)
  }

  // 3. Prevent duplicate concurrent in-flight requests
  if (inFlightRequests.has(clean)) {
    return inFlightRequests.get(clean)
  }

  const lookupPromise = (async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 9000)

      const url = `https://api.postalpincode.in/pincode/${clean}`
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Postal API responded with status ${response.status}`)
      }

      const data = await response.json()

      // The API returns an array containing an object with Status and PostOffice
      if (!Array.isArray(data) || data.length === 0) {
        return {
          valid: false,
          pincode: clean,
          error: 'Invalid PIN code. Please enter a valid 6-digit Indian PIN code.',
        }
      }

      const resultEntry = data[0]

      // Status check: API returns "Status": "Success" or "Status": "Error"
      if (
        resultEntry?.Status !== 'Success' ||
        !Array.isArray(resultEntry?.PostOffice) ||
        resultEntry.PostOffice.length === 0
      ) {
        return {
          valid: false,
          pincode: clean,
          error: 'Invalid PIN code. Please enter a valid 6-digit Indian PIN code.',
        }
      }

      const rawOffices = resultEntry.PostOffice

      // Extract unique post office names
      const officeNames = [
        ...new Set(rawOffices.map((po) => (po.Name ? po.Name.trim() : '')).filter(Boolean)),
      ]

      const firstOffice = rawOffices[0] || {}
      const state = (firstOffice.State || '').trim()
      const district = (firstOffice.District || '').trim()
      const block = (firstOffice.Block && firstOffice.Block !== 'NA' ? firstOffice.Block.trim() : '')
      const primaryPostOffice = officeNames[0] || ''

      // Determine city / town / block representation
      const city = block || district || primaryPostOffice

      // Build clean formatted location string: e.g. "Surandai, Tenkasi, Tamil Nadu"
      const locationParts = [primaryPostOffice, district, state].filter(Boolean)
      const formattedLocation = locationParts.join(', ')

      const successResult = {
        valid: true,
        pincode: clean,
        state,
        district,
        city,
        block,
        postOffice: primaryPostOffice,
        postOffices: officeNames,
        allOffices: rawOffices.map((po) => ({
          name: (po.Name || '').trim(),
          branchType: po.BranchType || '',
          deliveryStatus: po.DeliveryStatus || '',
          block: (po.Block || '').trim(),
          district: (po.District || '').trim(),
          state: (po.State || '').trim(),
        })),
        formattedLocation,
      }

      // Store in cache
      pincodeCache.set(clean, successResult)
      return successResult
    } catch (err) {
      const isAbort = err.name === 'AbortError'
      const errorMsg = isAbort
        ? 'PIN code lookup timed out. Please check your internet connection or enter location manually.'
        : 'Unable to verify PIN code online. Please check your network or enter location manually.'

      return {
        valid: false,
        pincode: clean,
        error: errorMsg,
        networkError: true,
      }
    } finally {
      inFlightRequests.delete(clean)
    }
  })()

  inFlightRequests.set(clean, lookupPromise)
  return lookupPromise
}
