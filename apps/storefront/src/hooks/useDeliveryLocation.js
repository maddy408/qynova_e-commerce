import { useState, useEffect, useCallback } from 'react'
import {
  getStoredLocation,
  saveStoredLocation,
  clearStoredLocation,
  detectAndSaveLocation,
} from '../services/locationService'

export function useDeliveryLocation() {
  const [location, setLocation] = useState(() => getStoredLocation())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const handleLocationUpdate = (event) => {
      if (event.detail !== undefined) {
        setLocation(event.detail)
      } else {
        setLocation(getStoredLocation())
      }
    }

    window.addEventListener('delivery-location-changed', handleLocationUpdate)
    return () => {
      window.removeEventListener('delivery-location-changed', handleLocationUpdate)
    }
  }, [])

  const detectLocation = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const detected = await detectAndSaveLocation()
      setLocation(detected)
      return detected
    } catch (err) {
      const msg = err.message || 'Failed to detect location'
      setError(msg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const selectManualLocation = useCallback((locationData) => {
    saveStoredLocation(locationData)
    setLocation(locationData)
    setError(null)
  }, [])

  const clearLocation = useCallback(() => {
    clearStoredLocation()
    setLocation(null)
    setError(null)
  }, [])

  return {
    location,
    isLoading,
    error,
    detectLocation,
    selectManualLocation,
    clearLocation,
    setError,
  }
}
