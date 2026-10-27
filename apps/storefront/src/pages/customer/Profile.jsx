import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FiCalendar,
  FiGlobe,
  FiBox,
  FiHeart,
  FiMapPin,
  FiUser,
  FiGift,
  FiCheck,
  FiEdit2,
  FiX,
  FiNavigation,
  FiPlus,
  FiTrash2,
  FiCheckCircle,
  FiAlertCircle,
  FiCamera,
  FiPhone,
  FiMail,
  FiShield,
  FiArrowRight,
  FiExternalLink,
  FiShare2,
} from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import {
  api,
  getCustomerToken,
  getStoredCustomer,
  isTokenExpired,
  clearCustomerToken,
  clearCustomerSession,
  setCustomerSession,
  fetchStoreSettings,
  fetchCustomerAddresses,
  saveCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  resolveImageUrl,
} from '../../lib/api'
import { NotificationBell } from '../../components/NotificationBell'
import {
  getCurrentCoordinates,
  reverseGeocode,
  saveStoredLocation,
  getStoredLocation,
} from '../../services/locationService'
import { lookupPostalPincode } from '../../services/pincodeService'
import { ROUTES } from '../../routes/routes'

export default function Profile() {
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(() => (getCustomerToken() ? getStoredCustomer() : null))
  const [referral, setReferral] = useState(null)
  const [storeSettings, setStoreSettings] = useState(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Current detected GPS/delivery location state
  const [currentLocation, setCurrentLocation] = useState(() => getStoredLocation())

  useEffect(() => {
    const handleLocationChange = (e) => {
      setCurrentLocation(e.detail || getStoredLocation())
    }
    window.addEventListener('delivery-location-changed', handleLocationChange)
    return () => window.removeEventListener('delivery-location-changed', handleLocationChange)
  }, [])

  // Profile photo upload state
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [photoPreview, setPhotoPreview] = useState(null)

  // Edit Profile modal state
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  // Address Management state
  const [addresses, setAddresses] = useState([])
  const [loadingAddresses, setLoadingAddresses] = useState(false)
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false)
  const [addressModalMode, setAddressModalMode] = useState('add') // 'add' | 'edit'
  const [editingAddressId, setEditingAddressId] = useState(null)
  const [isDetectingGps, setIsDetectingGps] = useState(false)
  const [gpsFeedback, setGpsFeedback] = useState(null)
  const [isSavingAddress, setIsSavingAddress] = useState(false)
  const [addressError, setAddressError] = useState('')
  const [addressSuccess, setAddressSuccess] = useState('')
  const [addressFormData, setAddressFormData] = useState({
    name: '',
    phone: '',
    line1: '',
    line2: '',
    landmark: '',
    city_district: '',
    state: 'Tamil Nadu',
    pincode: '',
    address_type: 'HOME',
    is_default: false,
  })

  // Postal PIN Code Lookup State for Profile Address Modal
  const [isProfilePincodeLoading, setIsProfilePincodeLoading] = useState(false)
  const [profilePincodeFeedback, setProfilePincodeFeedback] = useState(null)
  const [profilePostOffices, setProfilePostOffices] = useState([])
  const [selectedProfilePostOffice, setSelectedProfilePostOffice] = useState('')

  const handleProfilePincodeLookup = async (pin) => {
    const cleanPin = String(pin !== undefined ? pin : addressFormData.pincode || '').trim()
    if (!cleanPin || cleanPin.length !== 6 || !/^[1-9][0-9]{5}$/.test(cleanPin)) {
      setAddressError('Invalid PIN code. Please enter a valid 6-digit Indian PIN code.')
      setProfilePincodeFeedback(null)
      return
    }

    setIsProfilePincodeLoading(true)
    setAddressError('')

    try {
      const res = await lookupPostalPincode(cleanPin)
      if (!res.valid) {
        setAddressError(res.error || 'Invalid PIN code. Please enter a valid 6-digit Indian PIN code.')
        setProfilePincodeFeedback(null)
        setProfilePostOffices([])
        return
      }

      // Auto-populate available location fields without overwriting street address
      setAddressFormData((prev) => ({
        ...prev,
        city_district: res.city || prev.city_district,
        state: res.state || prev.state,
      }))

      setProfilePostOffices(res.postOffices || [])
      setSelectedProfilePostOffice(res.postOffice || (res.postOffices && res.postOffices[0]) || '')
      setProfilePincodeFeedback({
        valid: true,
        location: res.formattedLocation,
        district: res.district,
        state: res.state,
      })
    } catch {
      setAddressError('Unable to verify PIN code right now. You can enter your address manually.')
    } finally {
      setIsProfilePincodeLoading(false)
    }
  }

  const loadAddresses = async () => {
    setLoadingAddresses(true)
    try {
      const res = await fetchCustomerAddresses()
      const list = res?.addresses || (Array.isArray(res) ? res : [])
      setAddresses(list)
    } catch (err) {
      console.warn('Failed to load customer addresses:', err)
    } finally {
      setLoadingAddresses(false)
    }
  }

  const handleOpenAddAddress = (overrideLocation = null) => {
    const loc = overrideLocation || currentLocation || getStoredLocation()
    setAddressModalMode('add')
    setEditingAddressId(null)
    setAddressError('')
    setAddressSuccess('')

    if (loc?.latitude && loc?.longitude) {
      setGpsFeedback({
        latitude: loc.latitude,
        longitude: loc.longitude,
        shortDisplay: loc.shortDisplay || loc.formattedAddress || `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`,
      })
    } else {
      setGpsFeedback(null)
    }

    setAddressFormData({
      name: customer?.name || '',
      phone: customer?.phone || '',
      line1: loc?.streetAddress || loc?.road || loc?.formattedAddress || '',
      line2: loc?.locality && loc.locality !== loc.city ? loc.locality : '',
      landmark: loc?.locality || '',
      city_district: loc?.city || storeSettings?.city || '',
      state: loc?.state || storeSettings?.state || 'Tamil Nadu',
      pincode: loc?.pincode || '',
      address_type: 'HOME',
      is_default: addresses.length === 0,
    })
    setIsAddressModalOpen(true)
  }

  const handleOpenEditAddress = (addr) => {
    setAddressModalMode('edit')
    setEditingAddressId(addr.id)
    setGpsFeedback(null)
    setAddressError('')
    setAddressSuccess('')
    setAddressFormData({
      name: addr.name || '',
      phone: addr.phone || '',
      line1: addr.line1 || addr.street_address || '',
      line2: addr.line2 || '',
      landmark: addr.landmark || '',
      city_district: addr.city_district || addr.city || '',
      state: addr.state || '',
      pincode: addr.pincode || '',
      address_type: addr.address_type || 'HOME',
      is_default: Boolean(addr.is_default),
    })
    setIsAddressModalOpen(true)
  }

  const handleDetectCurrentLocationForAddress = async () => {
    setIsDetectingGps(true)
    setAddressError('')
    setGpsFeedback(null)
    try {
      const coords = await getCurrentCoordinates()
      const result = await reverseGeocode(coords.latitude, coords.longitude)
      setGpsFeedback({
        latitude: coords.latitude,
        longitude: coords.longitude,
        shortDisplay: result.shortDisplay,
      })
      // Save globally across storefront so Navbar and other views are synced
      saveStoredLocation(result)
      setCurrentLocation(result)

      setAddressFormData((prev) => ({
        ...prev,
        line1: result.streetAddress || result.road || result.formattedAddress || prev.line1,
        line2: result.locality && result.locality !== result.city ? result.locality : prev.line2,
        city_district: result.city || prev.city_district,
        state: result.state || prev.state,
        pincode: result.pincode || prev.pincode,
        landmark: result.locality && result.locality !== result.city ? result.locality : prev.landmark,
      }))
    } catch (err) {
      setAddressError(err.message || 'Unable to retrieve your GPS location. Please verify browser permissions.')
    } finally {
      setIsDetectingGps(false)
    }
  }

  const handleSaveAddress = async (e) => {
    e.preventDefault()
    if (!addressFormData.name.trim() || !addressFormData.phone.trim() || !addressFormData.line1.trim()) {
      setAddressError('Please fill in Name, Phone, and Street Address.')
      return
    }
    if (!addressFormData.city_district.trim() || !addressFormData.pincode.trim()) {
      setAddressError('City and Pincode are required.')
      return
    }
    if (!/^[1-9][0-9]{5}$/.test(addressFormData.pincode.trim())) {
      setAddressError('Invalid PIN code. Please enter a valid 6-digit Indian PIN code.')
      return
    }

    setIsSavingAddress(true)
    setAddressError('')
    try {
      const payload = {
        name: addressFormData.name.trim(),
        phone: addressFormData.phone.replace(/[^0-9]/g, ''),
        line1: addressFormData.line1.trim(),
        line2: addressFormData.line2.trim(),
        landmark: addressFormData.landmark.trim(),
        city_district: addressFormData.city_district.trim(),
        state: addressFormData.state.trim() || 'Rajasthan',
        pincode: addressFormData.pincode.trim(),
        address_type: addressFormData.address_type,
        is_default: addressFormData.is_default ? 1 : 0,
      }

      if (addressModalMode === 'edit') {
        await updateCustomerAddress(editingAddressId, payload)
        setAddressSuccess('Address updated successfully!')
      } else {
        await saveCustomerAddress(payload)
        setAddressSuccess('New address added successfully!')
      }

      // Also set this as active storefront delivery location if default or first address
      if (addressFormData.is_default || addresses.length === 0) {
        saveStoredLocation({
          latitude: gpsFeedback?.latitude || null,
          longitude: gpsFeedback?.longitude || null,
          city: payload.city_district,
          state: payload.state,
          pincode: payload.pincode,
          streetAddress: payload.line1,
          formattedAddress: [payload.line1, payload.line2, payload.city_district, payload.state, payload.pincode]
            .filter(Boolean)
            .join(', '),
          displayTitle: payload.address_type || 'Saved Address',
          displaySubtitle: `${payload.city_district} ${payload.pincode}`,
          shortDisplay: `${payload.city_district} ${payload.pincode}`,
          isGps: Boolean(gpsFeedback?.latitude),
        })
      }

      await loadAddresses()
      setTimeout(() => {
        setIsAddressModalOpen(false)
        setAddressSuccess('')
      }, 700)
    } catch (err) {
      setAddressError(err.response?.data?.error || err.message || 'Failed to save address. Please try again.')
    } finally {
      setIsSavingAddress(false)
    }
  }

  const handleDeleteAddress = async (id) => {
    if (!window.confirm('Are you sure you want to delete this address?')) return
    try {
      await deleteCustomerAddress(id)
      await loadAddresses()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete address')
    }
  }

  const handleSetDefaultAddress = async (addr) => {
    try {
      await updateCustomerAddress(addr.id, {
        ...addr,
        is_default: 1,
      })
      // Update top storefront delivery location
      saveStoredLocation({
        latitude: null,
        longitude: null,
        city: addr.city_district || addr.city,
        state: addr.state,
        pincode: addr.pincode,
        streetAddress: addr.line1,
        formattedAddress: [addr.line1, addr.line2, addr.city_district, addr.state, addr.pincode].filter(Boolean).join(', '),
        displayTitle: addr.address_type || 'Saved Address',
        displaySubtitle: `${addr.city_district || addr.city} ${addr.pincode}`,
        shortDisplay: `${addr.city_district || addr.city} ${addr.pincode}`,
        isGps: false,
      })
      await loadAddresses()
    } catch (err) {
      alert('Failed to set default address')
    }
  }

  const handleSelectForDelivery = (addr) => {
    saveStoredLocation({
      latitude: null,
      longitude: null,
      city: addr.city_district || addr.city,
      state: addr.state,
      pincode: addr.pincode,
      streetAddress: addr.line1,
      formattedAddress: [addr.line1, addr.line2, addr.city_district, addr.state, addr.pincode].filter(Boolean).join(', '),
      displayTitle: addr.address_type || 'Saved Address',
      displaySubtitle: `${addr.city_district || addr.city} ${addr.pincode}`,
      shortDisplay: `${addr.city_district || addr.city} ${addr.pincode}`,
      isGps: false,
    })
    setAddressSuccess(`Delivery location set to ${addr.city_district || addr.city} ${addr.pincode}!`)
    setTimeout(() => setAddressSuccess(''), 2500)
  }

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setPhotoError('')
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
    if (!allowed.includes(file.type)) {
      setPhotoError('Only JPG, PNG, and WebP images are allowed.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Image must be smaller than 5 MB.')
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setPhotoPreview(previewUrl)
    setIsUploadingPhoto(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post('/customers/me/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const updatedCustomer = { ...customer, profile_photo_path: res.data.profile_photo_path }
      setCustomer(updatedCustomer)
      setCustomerSession(getCustomerToken(), updatedCustomer)
    } catch (err) {
      setPhotoError(err.response?.data?.error || 'Failed to upload photo. Please try again.')
    } finally {
      setIsUploadingPhoto(false)
      URL.revokeObjectURL(previewUrl)
      setPhotoPreview(null)
    }
  }

  const handleOpenEdit = () => {
    setEditName(customer?.name || '')
    setEditEmail(customer?.email || '')
    setSaveError('')
    setSaveSuccess('')
    setIsEditing(true)
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    if (!editName.trim()) {
      setSaveError('Name cannot be empty')
      return
    }
    setIsSaving(true)
    setSaveError('')
    try {
      const res = await api.put('/customers/me', {
        name: editName.trim(),
        email: editEmail.trim() || null,
      })
      if (res.data?.customer) {
        setCustomer(res.data.customer)
        setCustomerSession(getCustomerToken(), res.data.customer)
        setSaveSuccess('Profile updated successfully!')
        setTimeout(() => {
          setIsEditing(false)
          setSaveSuccess('')
        }, 800)
      }
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to update profile. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    const token = getCustomerToken()
    if (!token) {
      navigate(ROUTES.LOGIN, { replace: true })
      return
    }

    const cached = getStoredCustomer()
    if (cached) {
      setCustomer((prev) => prev || cached)
    }

    fetchStoreSettings().then((s) => s && setStoreSettings(s))

    // Fetch authenticated customer profile directly from backend (Backend JWT is truth)
    api
      .get('/customers/me')
      .then((res) => {
        if (res.data?.customer) {
          setCustomer(res.data.customer)
          setReferral(res.data.referral || null)
          try {
            localStorage.setItem('customer_data', JSON.stringify(res.data.customer))
          } catch {
            // ignore
          }
          loadAddresses()
        } else {
          setError('Failed to load profile')
        }
        setIsLoading(false)
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          const currentToken = getCustomerToken()
          if (!currentToken || isTokenExpired(currentToken)) {
            clearCustomerSession()
            navigate(ROUTES.LOGIN, { replace: true })
            return
          }
        }
        // If cached customer data is present, keep displaying it gracefully
        if (!getStoredCustomer()) {
          setError('Unable to load profile from server. Please check your connection.')
        }
        setIsLoading(false)
      })
  }, [navigate])

  const handleLogout = () => {
    clearCustomerSession()
    navigate(ROUTES.HOME)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[var(--color-text-main)] font-sans selection:bg-[var(--color-primary-tint)] selection:text-[var(--color-text-main)]">
      
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-xs">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-15 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to={ROUTES.HOME} className="flex items-center gap-2 group select-none">
              <img
                src={storeSettings?.logo ? resolveImageUrl(storeSettings.logo) : '/images/logo2.jpeg'}
                alt={storeSettings?.store_name || 'Shop with Adams'}
                className="h-9 sm:h-10 w-auto max-w-[160px] sm:max-w-[190px] object-contain group-hover:scale-105 transition-transform"
                onError={(e) => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = '/images/logo2.jpeg'
                }}
              />
            </Link>
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 border-l border-slate-200 pl-3">
              <Link to={ROUTES.HOME} className="text-[var(--color-brand)] font-semibold hover:underline">Home</Link>
              <span>/</span>
              <span className="font-bold text-slate-700">Customer Account</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationBell />
            <Link
              to={ROUTES.HOME}
              className="text-xs font-bold text-slate-700 hover:text-[var(--color-brand)] flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <span>← Back to Store</span>
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Profile Dashboard Container */}
      <main className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        
        {/* Loading State */}
        {isLoading && (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 shadow-sm space-y-4">
            <div className="w-12 h-12 border-3 border-[var(--color-primary-tint)] border-t-[var(--color-brand)] rounded-full animate-spin mx-auto" />
            <p className="text-sm font-bold text-[var(--color-text-main)]">Loading your customer account...</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="bg-white rounded-3xl p-8 text-center border border-red-200 shadow-sm space-y-3">
            <p className="text-sm font-bold text-red-600">{error}</p>
            <Link
              to={ROUTES.HOME}
              className="inline-block px-5 py-2.5 bg-[var(--color-brand)] text-white font-bold text-xs rounded-full hover:bg-[var(--color-brand-hover)]"
            >
              Back to Home
            </Link>
          </div>
        )}

        {/* Profile Content */}
        {!isLoading && customer && (
          <div className="space-y-6">
            
            {/* 1. Welcome Hero Greeting Header */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 p-6 sm:p-7 text-white shadow-md border border-slate-800">
              <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-10 left-1/3 w-60 h-60 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
              
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-1 shrink-0 shadow-inner flex items-center justify-center">
                    {(photoPreview || customer.profile_photo_path) ? (
                      <img
                        src={photoPreview || resolveImageUrl(customer.profile_photo_path)}
                        alt={customer.name || 'Customer'}
                        className="w-full h-full rounded-xl object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                          if (e.currentTarget.nextElementSibling) {
                            e.currentTarget.nextElementSibling.style.display = 'flex'
                          }
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-full h-full rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-xl sm:text-2xl items-center justify-center uppercase shadow-xs ${
                        (photoPreview || customer.profile_photo_path) ? 'hidden' : 'flex'
                      }`}
                    >
                      {customer.name?.trim().charAt(0) || 'C'}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                        Welcome back, {customer.name || 'Shopper'}!
                      </h1>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/30 text-purple-200 border border-purple-400/30 backdrop-blur-md">
                        {customer.customer_type || 'RETAIL'} MEMBER
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1 backdrop-blur-md">
                        <FiCheckCircle className="w-3 h-3 text-emerald-400" />
                        <span>Verified Account</span>
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-300">
                      Manage your delivery addresses, personal account info, and track grocery orders.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0 flex-wrap">
                  <Link
                    to={ROUTES.ORDERS}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 backdrop-blur-md transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
                  >
                    <FiBox className="w-4 h-4 text-purple-300" />
                    <span>My Orders</span>
                  </Link>
                  <Link
                    to={ROUTES.WISHLIST}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 backdrop-blur-md transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
                  >
                    <FiHeart className="w-4 h-4 text-pink-300 fill-pink-400/30" />
                    <span>Wishlist</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* 2. Top Metric Overview Cards (4 Cards) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* Card 1: Orders */}
              <Link
                to={ROUTES.ORDERS}
                className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-2xs">
                    <FiBox className="w-5 h-5" />
                  </div>
                  <FiArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    My Orders
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Track shipments & order history
                  </p>
                </div>
              </Link>

              {/* Card 2: Wishlist */}
              <Link
                to={ROUTES.WISHLIST}
                className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-pink-300 transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center group-hover:scale-105 group-hover:bg-pink-600 group-hover:text-white transition-all shadow-2xs">
                    <FiHeart className="w-5 h-5 fill-pink-500/20 group-hover:fill-white" />
                  </div>
                  <FiArrowRight className="w-4 h-4 text-slate-300 group-hover:text-pink-600 group-hover:translate-x-1 transition-all" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-pink-600 transition-colors">
                    My Wishlist
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Saved grocery essentials
                  </p>
                </div>
              </Link>

              {/* Card 3: Saved Addresses */}
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('saved-addresses-section')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between text-left cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-2xs">
                    <FiMapPin className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-100/70 text-emerald-800">
                    {addresses.length} Saved
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-emerald-600 transition-colors">
                    Delivery Addresses
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Instant 1-tap doorstep delivery
                  </p>
                </div>
              </button>

              {/* Card 4: Referral Rewards */}
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('referral-program-section')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                className="group bg-gradient-to-br from-amber-50 to-orange-50/60 p-4 sm:p-5 rounded-2xl border border-amber-200/70 shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex flex-col justify-between text-left cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm shadow-2xs">
                    <FiGift className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-amber-200/80 text-amber-900">
                    {referral?.reward_percent !== undefined && referral.reward_percent !== null ? `${referral.reward_percent}% OFF` : '10% OFF'}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Referral Savings
                  </h3>
                  <p className="text-[11px] text-amber-800 font-medium mt-0.5">
                    {referral?.referral_code && referral.referral_code !== 'N/A' ? (
                      <>Code: <strong className="font-mono font-bold">{referral.referral_code}</strong></>
                    ) : (
                      'Invite friends & save on grocery orders'
                    )}
                  </p>
                </div>
              </button>
            </div>

            {/* 3. Main 2-Column Dashboard Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* ============================================================== */}
              {/* LEFT COLUMN: Profile Identity, Referral & Store Info (4 Cols)   */}
              {/* ============================================================== */}
              <div className="lg:col-span-4 space-y-5">
                
                {/* 1. Customer Identity Profile Card */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                  {/* Decorative Banner */}
                  <div className="h-28 bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 relative overflow-hidden p-4 flex items-start justify-end">
                    <div className="absolute -top-10 -left-10 w-44 h-44 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-10 right-0 w-44 h-44 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />
                    
                    <span className="relative z-10 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/15 text-white backdrop-blur-md border border-white/20">
                      {customer.customer_type || 'RETAIL'} MEMBER
                    </span>
                  </div>

                  {/* Avatar & Details */}
                  <div className="px-5 pb-5 -mt-14 relative z-10">
                    {/* Circular Avatar with Camera Badge */}
                    <div className="relative inline-block mb-3.5">
                      <div className="w-24 h-24 rounded-full p-1 bg-white shadow-md">
                        <div className="w-full h-full rounded-full p-0.5 bg-gradient-to-tr from-purple-500 via-pink-500 to-indigo-400">
                          {(photoPreview || customer.profile_photo_path) ? (
                            <img
                              src={photoPreview || resolveImageUrl(customer.profile_photo_path)}
                              alt={customer.name || 'Customer'}
                              referrerPolicy="no-referrer"
                              className="w-full h-full rounded-full object-cover bg-slate-900 border border-white"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                                if (e.currentTarget.nextElementSibling) {
                                  e.currentTarget.nextElementSibling.style.display = 'flex'
                                }
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-full h-full rounded-full bg-slate-900 text-white font-black text-2xl items-center justify-center uppercase border border-white ${
                              (photoPreview || customer.profile_photo_path) ? 'hidden' : 'flex'
                            }`}
                          >
                            {customer.name?.trim().charAt(0) || 'C'}
                          </div>
                        </div>
                      </div>

                      {isUploadingPhoto && (
                        <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}

                      <label
                        htmlFor="profile-photo-input"
                        title="Update profile picture"
                        className="absolute bottom-1 right-1 bg-indigo-600 hover:bg-indigo-500 border-2 border-white w-7 h-7 rounded-full flex items-center justify-center text-white shadow-md cursor-pointer transition-transform hover:scale-110 active:scale-95"
                      >
                        <FiCamera className="w-3.5 h-3.5" />
                      </label>
                      <input
                        id="profile-photo-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={isUploadingPhoto}
                        onChange={handlePhotoChange}
                      />
                    </div>

                    {photoError && (
                      <p className="text-[11px] font-semibold text-rose-500 pb-2">{photoError}</p>
                    )}

                    {/* Customer Name & Verified Badge */}
                    <div className="space-y-1 mb-4">
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-black text-slate-900 tracking-tight">
                          {customer.name || 'Customer'}
                        </h2>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <FiCheckCircle className="w-3 h-3 text-emerald-600" />
                          <span>Verified</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Adam's Supermarket Valued Shopper
                      </p>
                    </div>

                    {/* Contact & Account Attributes List */}
                    <div className="space-y-2.5 pt-3 border-t border-slate-100 text-xs text-slate-700">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/90 border border-slate-100">
                        <span className="text-slate-500 text-[11px] font-medium flex items-center gap-2">
                          <FiPhone className="w-3.5 h-3.5 text-purple-600" />
                          <span>Mobile Phone</span>
                        </span>
                        <strong className="text-slate-900 font-mono text-xs">
                          {customer.phone ? `+91 ${customer.phone}` : 'Not linked'}
                        </strong>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/90 border border-slate-100">
                        <span className="text-slate-500 text-[11px] font-medium flex items-center gap-2">
                          <FiMail className="w-3.5 h-3.5 text-purple-600" />
                          <span>Email Address</span>
                        </span>
                        <span className="text-slate-900 font-semibold text-xs truncate max-w-[170px]" title={customer.email}>
                          {customer.email || 'No email registered'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/90 border border-slate-100">
                        <span className="text-slate-500 text-[11px] font-medium flex items-center gap-2">
                          <FiCalendar className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Member Since</span>
                        </span>
                        <span className="text-slate-900 font-semibold text-xs">
                          {formatDate(customer.created_at)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/90 border border-slate-100">
                        <span className="text-slate-500 text-[11px] font-medium flex items-center gap-2">
                          <FiShield className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Account Security</span>
                        </span>
                        <span className="text-emerald-700 font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          OTP Protected
                        </span>
                      </div>
                    </div>

                    {/* Edit Profile Button */}
                    <div className="pt-4">
                      <button
                        type="button"
                        onClick={handleOpenEdit}
                        className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98 cursor-pointer"
                      >
                        <FiEdit2 className="w-3.5 h-3.5" />
                        <span>Edit Profile Information</span>
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* ============================================================== */}
              {/* RIGHT COLUMN: Delivery Addresses & Shopping Assistance (8 Cols) */}
              {/* ============================================================== */}
              <div className="lg:col-span-8 space-y-5">
                
                {/* 1. Primary Saved Delivery Addresses Management Hub */}
                <div id="saved-addresses-section" className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
                        <FiMapPin className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-extrabold text-slate-900">
                            Saved Delivery Addresses
                          </h2>
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                            {addresses.length}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Manage delivery destinations or autofill with your live GPS location
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleDetectCurrentLocationForAddress}
                        disabled={isDetectingGps}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 text-[var(--color-brand)] border border-purple-200 hover:bg-purple-100 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                        title="Detect GPS"
                      >
                        <FiNavigation className="w-3.5 h-3.5" />
                        <span>{isDetectingGps ? 'Detecting GPS...' : 'Detect GPS'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenAddAddress()}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--color-brand)] hover:bg-[#6d28d9] text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                      >
                        <FiPlus className="w-4 h-4" />
                        <span>Add New Address</span>
                      </button>
                    </div>
                  </div>

                  {addressSuccess && (
                    <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                      <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{addressSuccess}</span>
                    </div>
                  )}

                  {loadingAddresses ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      <div className="inline-block w-6 h-6 border-2 border-[var(--color-brand)] border-t-transparent rounded-full animate-spin mb-2" />
                      <p>Loading your saved addresses from database...</p>
                    </div>
                  ) : addresses.length === 0 ? (
                    currentLocation ? (
                      <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-50/90 to-indigo-50/70 border border-purple-200/90 shadow-2xs space-y-3.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--color-brand)] text-white flex items-center justify-center shrink-0 shadow-sm">
                              <FiNavigation className="w-5 h-5 text-white animate-pulse" />
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-brand)] bg-[var(--color-primary-tint)] px-2.5 py-0.5 rounded-full border border-purple-200">
                                  Live GPS Location Detected
                                </span>
                                {currentLocation.latitude && (
                                  <span className="text-[10px] font-mono font-bold text-purple-700 bg-white px-2 py-0.5 rounded-md border border-purple-200">
                                    GPS: {Number(currentLocation.latitude).toFixed(4)}, {Number(currentLocation.longitude).toFixed(4)}
                                  </span>
                                )}
                              </div>
                              <h4 className="text-sm font-bold text-slate-900 mt-1.5 leading-snug">
                                {currentLocation.streetAddress || currentLocation.road || currentLocation.formattedAddress || 'Current GPS Location'}
                              </h4>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {[currentLocation.city, currentLocation.state, currentLocation.pincode].filter(Boolean).join(', ')}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenAddAddress(currentLocation)}
                              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                            >
                              <FiEdit2 className="w-3.5 h-3.5" />
                              <span>Save as Delivery Address</span>
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-[11px] text-purple-800 font-medium pt-2 border-t border-purple-100">
                          <span>💡 Address auto-detected from your GPS coordinates. Click save to store it for 1-tap checkout.</span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-12 text-center space-y-3">
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-2xs">
                          <FiMapPin className="w-7 h-7" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">No delivery addresses saved yet</p>
                          <p className="text-xs text-slate-500 mt-0.5 max-w-sm mx-auto">
                            Save your home or office address, or auto-detect using GPS for faster doorstep delivery.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                          <button
                            type="button"
                            onClick={() => handleOpenAddAddress()}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] text-xs font-bold transition-all cursor-pointer shadow-xs"
                          >
                            <FiPlus className="w-4 h-4" />
                            <span>Add Delivery Address</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleDetectCurrentLocationForAddress}
                            disabled={isDetectingGps}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-50 text-[var(--color-brand)] border border-purple-200 hover:bg-purple-100 text-xs font-bold transition-all cursor-pointer"
                          >
                            <FiNavigation className="w-3.5 h-3.5" />
                            <span>{isDetectingGps ? 'Detecting GPS...' : 'Detect Current Location'}</span>
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {addresses.map((addr) => (
                        <div
                          key={addr.id}
                          className={`rounded-2xl p-4.5 border transition-all flex flex-col justify-between ${
                            addr.is_default
                              ? 'border-[var(--color-brand)] bg-[#FAF8FF]/70 shadow-xs'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                                  {addr.address_type || 'HOME'}
                                </span>
                                {addr.is_default ? (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                    <FiCheck className="w-3 h-3" />
                                    <span>Default</span>
                                  </span>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditAddress(addr)}
                                  className="p-1.5 text-slate-400 hover:text-[var(--color-brand)] rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                                  title="Edit Address"
                                >
                                  <FiEdit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAddress(addr.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Delete Address"
                                >
                                  <FiTrash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="space-y-1 text-xs">
                              <p className="font-bold text-slate-900 text-sm">
                                {addr.name}{' '}
                                <span className="font-normal text-slate-500 text-xs font-mono">
                                  (+91 {addr.phone})
                                </span>
                              </p>
                              <p className="text-slate-700 leading-snug">{addr.line1}</p>
                              {addr.line2 && <p className="text-slate-500">{addr.line2}</p>}
                              {addr.landmark && (
                                <p className="text-slate-400 text-[11px]">Landmark: {addr.landmark}</p>
                              )}
                              <p className="font-semibold text-slate-800">
                                {addr.city_district || addr.city}, {addr.state} - {addr.pincode}
                              </p>
                            </div>
                          </div>

                          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => handleSelectForDelivery(addr)}
                              className="font-bold text-[var(--color-brand)] hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <FiNavigation className="w-3 h-3" />
                              <span>Deliver here</span>
                            </button>

                            {!addr.is_default && (
                              <button
                                type="button"
                                onClick={() => handleSetDefaultAddress(addr)}
                                className="font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                              >
                                Set as Default
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Supermarket Store Assistance & Shopping Strip */}
                <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-purple-300 flex items-center justify-center shrink-0">
                      <FiBox className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-white">
                        Looking for Fresh Groceries & Household Essentials?
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Over 5,000+ daily grocery items available with express doorstep delivery.
                      </p>
                    </div>
                  </div>

                  <Link
                    to={ROUTES.HOME}
                    className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-xs transition-all shadow-md text-center shrink-0 cursor-pointer active:scale-95"
                  >
                    Continue Shopping
                  </Link>
                </div>

              </div>

            </div>

            {/* 4. Full-Width Referral & Rewards Program Hub */}
            <div
              id="referral-program-section"
              className="w-full bg-gradient-to-br from-purple-50/90 via-pink-50/40 to-white rounded-3xl p-6 sm:p-8 border border-purple-100 shadow-xs space-y-6"
            >
              {/* Top Banner / Heading */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-purple-100/80">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center font-bold text-lg shrink-0 shadow-2xs">
                    <FiGift className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                        Referral & Rewards Program
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-pink-100 text-pink-700 border border-pink-200">
                        Share & Earn
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Share your exclusive referral code with friends and family to unlock instant discounts on grocery orders!
                    </p>
                  </div>
                </div>

                {/* Live Stats Pills */}
                {referral && (
                  <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto">
                    <div className="px-4 py-2 bg-white rounded-xl border border-purple-100 shadow-2xs text-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Invites</span>
                      <span className="text-lg sm:text-xl font-black text-purple-700">{referral.total_referrals || 0}</span>
                    </div>
                    <div className="px-4 py-2 bg-white rounded-xl border border-pink-100 shadow-2xs text-center">
                      <span className="text-[10px] text-pink-700 font-bold uppercase tracking-wider block">Your Reward</span>
                      <span className="text-lg sm:text-xl font-black text-pink-900">
                        {referral.reward_percent !== undefined && referral.reward_percent !== null ? `${referral.reward_percent}% OFF` : '10% OFF'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Referral Details Body */}
              {referral ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                  {/* Left: Code, Copy & WhatsApp Share (7 cols) */}
                  <div className="lg:col-span-7 space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-2">
                        Your Exclusive Referral Code:
                      </label>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <div className="flex-1 px-4 py-2.5 bg-white border-2 border-purple-200 rounded-2xl text-purple-950 font-black text-base tracking-widest shadow-2xs font-mono select-all flex items-center justify-between">
                          <span>{referral.referral_code || 'Generating...'}</span>
                          <span className="text-[11px] text-purple-600 font-sans font-bold px-2 py-0.5 rounded-md bg-purple-50">
                            10% OFF
                          </span>
                        </div>
                        {referral.referral_code && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(referral.referral_code)
                              setCopiedCode(true)
                              setTimeout(() => setCopiedCode(false), 2000)
                            }}
                            className={`px-5 py-3 rounded-2xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 flex items-center justify-center gap-2 shrink-0 ${
                              copiedCode
                                ? 'bg-emerald-600 text-white'
                                : 'bg-[#6C4EFF] hover:bg-[#5839EE] text-white'
                            }`}
                          >
                            {copiedCode ? (
                              <>
                                <FiCheck className="w-4 h-4 stroke-[2.5]" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <FiShare2 className="w-4 h-4" />
                                <span>Copy Code</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* WhatsApp Share Button */}
                    {referral.referral_code && (
                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Hey! Shop fresh groceries at Adam's Supermarket Melagaram and get 10% OFF on your order using my referral code: ${referral.referral_code}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto inline-flex py-3 px-6 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs items-center justify-center gap-2.5 shadow-sm transition-transform active:scale-98 cursor-pointer"
                      >
                        <FaWhatsapp className="w-4 h-4" />
                        <span>Share with Friends on WhatsApp</span>
                      </a>
                    )}
                  </div>

                  {/* Right: How It Works & Benefits (5 cols) */}
                  <div className="lg:col-span-5 bg-white/90 backdrop-blur-xs p-5 rounded-2xl border border-purple-100 shadow-2xs space-y-2.5">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                      <FiGift className="w-4 h-4 text-pink-600" />
                      <span>How Referral Works</span>
                    </h4>
                    <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                        <span>Share your referral code with friends and family.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                        <span>They get <strong>10% OFF</strong> their first supermarket order at checkout.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-pink-100 text-pink-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                        <span>You earn instant discount savings on your upcoming purchases.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 py-3 text-center">
                  Referral rewards will appear here when active.
                </div>
              )}
            </div>

          </div>
        )}

        {/* Edit Profile Modal */}
        {isEditing && customer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-[var(--color-border-subtle)] relative animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
                <div>
                  <h3 className="text-lg font-black text-[var(--color-text-main)]">
                    Edit Profile
                  </h3>
                  <p className="text-xs text-gray-400">
                    Update your account name and email address
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {saveError && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold">
                  {saveError}
                </div>
              )}

              {saveSuccess && (
                <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{saveSuccess}</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    Mobile Phone Number
                  </label>
                  <input
                    type="text"
                    disabled
                    value={customer.phone ? `+91 ${customer.phone}` : 'Verified via Google / OTP'}
                    className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Phone number is bound to authentication and cannot be changed here.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2.5 rounded-full border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2.5 rounded-full bg-[var(--color-brand)] hover:bg-[#6d28d9] text-white text-xs font-black transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add / Edit Address Modal with Live Geolocation GPS Auto-fill */}
        {isAddressModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-7 shadow-2xl border border-[var(--color-border-subtle)] relative animate-in zoom-in-95 duration-150 my-6">
              <div className="flex items-center justify-between pb-3.5 border-b border-gray-100 mb-4">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[var(--color-text-main)]">
                    {addressModalMode === 'edit' ? 'Edit Delivery Address' : 'Add New Delivery Address'}
                  </h3>
                  <p className="text-xs text-gray-400">
                    Enter delivery details or detect instantly with your GPS
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddressModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {/* GPS Geolocation Auto-fill Button */}
              <div className="mb-4 p-3 bg-gradient-to-r from-[#FAF8FF] to-purple-50 rounded-2xl border border-[#E9DFFF] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white text-[#6C4EFF] border border-[#E9DFFF] flex items-center justify-center shrink-0">
                    <FiNavigation className="w-4 h-4 text-[#6C4EFF]" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#1B133F]">Auto-fill Address via GPS</p>
                    <p className="text-[10px] text-gray-500">
                      Fetches coordinates & reverse-geocodes your address
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isDetectingGps}
                  onClick={handleDetectCurrentLocationForAddress}
                  className="px-3.5 py-2 rounded-full bg-[#6C4EFF] hover:bg-[#4B2AC5] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-60 shrink-0"
                >
                  {isDetectingGps ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Detecting...</span>
                    </>
                  ) : (
                    <>
                      <FiMapPin className="w-3.5 h-3.5" />
                      <span>Use Current Location</span>
                    </>
                  )}
                </button>
              </div>

              {gpsFeedback && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 space-y-1.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      <span className="font-bold">GPS Location Auto-filled:</span>
                      {gpsFeedback.shortDisplay && (
                        <span className="font-sans font-semibold text-emerald-900 ml-1">
                          ({gpsFeedback.shortDisplay})
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-emerald-700">
                      Lat: {Number(gpsFeedback.latitude).toFixed(4)}, Lng: {Number(gpsFeedback.longitude).toFixed(4)}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-700/90 font-sans">
                    ✏️ Fields below are pre-filled with your detected location. You can edit house no, street, landmark, or pincode before saving.
                  </p>
                </div>
              )}

              {addressError && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <FiAlertCircle className="w-4 h-4 shrink-0" />
                  <span>{addressError}</span>
                </div>
              )}

              {addressSuccess && (
                <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{addressSuccess}</span>
                </div>
              )}

              <form onSubmit={handleSaveAddress} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Recipient Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={addressFormData.name}
                      onChange={(e) => setAddressFormData((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. John Doe"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Mobile Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      value={addressFormData.phone}
                      onChange={(e) => setAddressFormData((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="10-digit phone"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Street Address / House / Flat No. <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addressFormData.line1}
                    onChange={(e) => setAddressFormData((p) => ({ ...p, line1: e.target.value }))}
                    placeholder="Flat/House No., Building, Street Name"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Area / Locality <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={addressFormData.line2}
                      onChange={(e) => setAddressFormData((p) => ({ ...p, line2: e.target.value }))}
                      placeholder="e.g. Sector 4, Koramangala"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Landmark <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={addressFormData.landmark}
                      onChange={(e) => setAddressFormData((p) => ({ ...p, landmark: e.target.value }))}
                      placeholder="Near City Mall, Opposite Park"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={addressFormData.city_district}
                      onChange={(e) => setAddressFormData((p) => ({ ...p, city_district: e.target.value }))}
                      placeholder="City"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      State <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={addressFormData.state}
                      onChange={(e) => setAddressFormData((p) => ({ ...p, state: e.target.value }))}
                      placeholder="State"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-gray-700">
                        Pincode <span className="text-red-500">*</span>
                      </label>
                      {isProfilePincodeLoading && (
                        <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-1">
                          <span className="w-2.5 h-2.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          Detecting...
                        </span>
                      )}
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        maxLength={6}
                        value={addressFormData.pincode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                          setAddressFormData((p) => ({ ...p, pincode: val }))
                          if (val.length === 6) {
                            handleProfilePincodeLookup(val)
                          } else if (profilePincodeFeedback) {
                            setProfilePincodeFeedback(null)
                            setProfilePostOffices([])
                          }
                        }}
                        placeholder="6-digit PIN"
                        className="w-full pl-3 pr-16 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleProfilePincodeLookup(addressFormData.pincode)}
                        disabled={isProfilePincodeLoading || (addressFormData.pincode || '').length !== 6}
                        className="absolute right-1.5 px-2 py-1 text-[11px] font-bold text-[var(--color-brand)] bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isProfilePincodeLoading ? '...' : 'Check'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Postal Lookup Feedback Badge */}
                {profilePincodeFeedback?.valid && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                    <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="flex-1 text-[11px]">
                      <span className="font-bold">Location Auto-Filled:</span>{' '}
                      <span className="font-semibold text-emerald-800">{profilePincodeFeedback.location}</span>
                    </div>
                  </div>
                )}

                {/* Multiple Post Offices Dropdown */}
                {profilePostOffices.length > 1 && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Select Post Office / Locality ({profilePostOffices.length} options for PIN {addressFormData.pincode})
                    </label>
                    <select
                      value={selectedProfilePostOffice}
                      onChange={(e) => {
                        const selected = e.target.value
                        setSelectedProfilePostOffice(selected)
                        if (selected) {
                          setAddressFormData((prev) => ({
                            ...prev,
                            city_district: `${selected}${profilePincodeFeedback?.district ? `, ${profilePincodeFeedback.district}` : ''}`,
                          }))
                        }
                      }}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white"
                    >
                      {profilePostOffices.map((po) => (
                        <option key={po} value={po}>
                          {po} (Post Office)
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Choose your specific village or post office branch from this postal code.
                    </p>
                  </div>
                )}

                {/* Address Type Selector */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Address Type
                  </label>
                  <div className="flex items-center gap-2">
                    {['HOME', 'WORK', 'OTHER'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setAddressFormData((p) => ({ ...p, address_type: type }))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          addressFormData.address_type === type
                            ? 'bg-[#6C4EFF] text-white shadow-xs'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Set as Default Address */}
                <div className="pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={addressFormData.is_default}
                      onChange={(e) => setAddressFormData((p) => ({ ...p, is_default: e.target.checked }))}
                      className="w-4 h-4 rounded text-[#6C4EFF] focus:ring-[#6C4EFF]"
                    />
                    <span className="text-xs font-medium text-gray-700">
                      Set as default delivery address
                    </span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsAddressModalOpen(false)}
                    className="px-4 py-2 rounded-full border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingAddress}
                    className="px-6 py-2 rounded-full bg-[var(--color-brand)] hover:bg-[#6d28d9] text-white text-xs font-black transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingAddress ? 'Saving...' : addressModalMode === 'edit' ? 'Update Address' : 'Save Address'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
