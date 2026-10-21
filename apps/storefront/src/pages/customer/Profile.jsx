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
} from 'react-icons/fi'
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
    <div className="min-h-screen bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-sans selection:bg-[var(--color-primary-tint)] selection:text-[var(--color-text-main)]">
      
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-[var(--color-border-subtle)] sticky top-0 z-30 shadow-xs">
        <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 min-h-14 py-2 sm:py-0 flex items-center justify-between gap-2">
          <Link to={ROUTES.HOME} className="flex items-center gap-2.5 group shrink-0 select-none">
            <img
              src={storeSettings?.logo ? resolveImageUrl(storeSettings.logo) : '/images/logo2.jpeg'}
              alt={storeSettings?.store_name || 'Shop with Adams'}
              className="h-10 sm:h-11 w-auto max-w-[180px] sm:max-w-[210px] object-contain group-hover:scale-105 transition-transform"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = '/images/logo2.jpeg'
              }}
            />
            <span className="hidden sm:inline-block text-[9px] font-bold tracking-wider text-[var(--color-text-muted)] uppercase border-l border-gray-200 pl-2.5 ml-1">
              Customer Profile
            </span>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <NotificationBell />
            <Link
              to={ROUTES.HOME}
              className="text-xs font-bold text-[var(--color-brand)] hover:text-[var(--color-text-main)] flex items-center gap-1 px-2.5 sm:px-3.5 py-2 rounded-full hover:bg-[var(--color-bg-alt)] transition-colors"
            >
              <span>← Store</span>
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs font-bold text-red-600 hover:bg-red-50 px-2.5 sm:px-3.5 py-2 rounded-full transition-colors cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Profile Container */}
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 xl:px-12 py-5 sm:py-10">
        
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)] mb-4 sm:mb-6">
          <Link to={ROUTES.HOME} className="text-[var(--color-brand)] hover:underline">Home</Link>
          <span>/</span>
          <span className="text-[var(--color-text-main)]">My Profile</span>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="bg-white rounded-3xl p-10 text-center border border-[var(--color-border-subtle)] shadow-sm space-y-4">
            <div className="w-12 h-12 border-4 border-[var(--color-primary-tint)] border-t-[var(--color-brand)] rounded-full animate-spin mx-auto" />
            <p className="text-sm font-bold text-[var(--color-text-main)]">Loading profile data from database...</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="bg-white rounded-3xl p-8 text-center border border-red-200 shadow-sm space-y-3">
            <p className="text-sm font-bold text-red-600">{error}</p>
            <Link
              to={ROUTES.HOME}
              className="inline-block px-5 py-2.5 bg-[var(--color-brand)] text-white font-bold text-xs rounded-full hover:bg-[var(--color-brand-hover)] min-h-[44px]"
            >
              Back to Home
            </Link>
          </div>
        )}

        {/* Profile Content */}
        {!isLoading && customer && (
          <div className="space-y-5 sm:space-y-6">
            
            {/* Profile Overview Card */}
            <div className="bg-white rounded-3xl p-5 sm:p-8 border border-[var(--color-border-subtle)] shadow-[var(--shadow-profile-card)] relative overflow-hidden">
              <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br from-[var(--color-primary-tint)]/60 to-[var(--color-bg-alt)]/60 pointer-events-none blur-2xl" />

              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 relative z-10">
                
                {/* Prominent Profile Photo */}
                <div className="relative shrink-0">
                  {customer.profile_photo_path ? (
                    <img
                      src={customer.profile_photo_path}
                      alt={customer.name || 'Customer Profile'}
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-[var(--color-primary-tint)] shadow-md ring-4 ring-[var(--color-bg-alt)]"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        if (e.currentTarget.nextElementSibling) {
                          e.currentTarget.nextElementSibling.style.display = 'flex'
                        }
                      }}
                    />
                  ) : null}
                  <div
                    className={`w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-[var(--color-brand)] text-white font-black text-2xl sm:text-4xl items-center justify-center shadow-md ring-4 ring-[var(--color-bg-alt)] uppercase ${
                      customer.profile_photo_path ? 'hidden' : 'flex'
                    }`}
                  >
                    {customer.name?.trim().charAt(0) || 'C'}
                  </div>
                  
                  {customer.profile_photo_path && (
                    <span className="absolute bottom-0 right-0 bg-emerald-500 border-2 border-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white shadow-xs" title="Google Verified Account">
                      ✓
                    </span>
                  )}
                </div>

                {/* Name, Type & Quick Summary */}
                <div className="flex-1 text-center sm:text-left space-y-1.5 w-full">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <h1 className="text-xl sm:text-3xl font-black text-[var(--color-text-main)] tracking-tight break-words">
                      {customer.name || 'Customer'}
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-[var(--color-primary-tint)] text-[var(--color-brand)] border border-[var(--color-border-subtle)]">
                      {customer.customer_type || 'RETAIL'}
                    </span>
                    <button
                      type="button"
                      onClick={handleOpenEdit}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 hover:bg-purple-100 text-[var(--color-brand)] border border-purple-200 rounded-full text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer ml-auto sm:ml-0"
                      title="Edit Profile Details"
                    >
                      <FiEdit2 className="w-3.5 h-3.5" />
                      <span>Edit Profile</span>
                    </button>
                  </div>

                  <p className="text-xs sm:text-sm text-[var(--color-text-muted)] font-medium break-all">
                    {customer.email || 'No email linked'}
                  </p>

                  <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[11px] sm:text-xs text-[var(--color-text-muted)]">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--color-bg-alt)] rounded-full border border-[var(--color-border-subtle)]">
                      <FiCalendar className="w-3.5 h-3.5 text-[var(--color-brand)]" />
                      <span>Member since <strong>{formatDate(customer.created_at)}</strong></span>
                    </span>
                    {customer.profile_photo_path && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-800 rounded-full border border-blue-200 font-medium text-[11px]">
                        <FiGlobe className="w-3.5 h-3.5 text-blue-600" />
                        <span>Google Linked</span>
                      </span>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Quick Access Tiles: Orders, Wishlist, Addresses */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
              <Link
                to={ROUTES.ORDERS}
                className="bg-white p-3 sm:p-4 rounded-2xl border border-[var(--color-border-subtle)] shadow-xs hover:border-[var(--color-brand)]/50 hover:shadow-md transition-all flex flex-col items-center text-center group"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--color-bg-alt)] text-[var(--color-brand)] flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <FiBox className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-[var(--color-text-main)]">My Orders</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">Track & history</span>
              </Link>

              <Link
                to={ROUTES.HOME}
                className="bg-white p-3 sm:p-4 rounded-2xl border border-[var(--color-border-subtle)] shadow-xs hover:border-[var(--color-brand)]/50 hover:shadow-md transition-all flex flex-col items-center text-center group"
              >
                <div className="w-10 h-10 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <FiHeart className="w-5 h-5 fill-pink-500" />
                </div>
                <span className="text-xs font-bold text-[var(--color-text-main)]">Wishlist</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">Saved items</span>
              </Link>

              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('saved-addresses-section')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                className="bg-white p-3 sm:p-4 rounded-2xl border border-[var(--color-border-subtle)] shadow-xs hover:border-[var(--color-brand)]/50 hover:shadow-md transition-all flex flex-col items-center text-center group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <FiMapPin className="w-5 h-5 text-amber-600" />
                </div>
                <span className="text-xs font-bold text-[var(--color-text-main)]">Addresses</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {addresses.length > 0 ? `${addresses.length} saved` : 'Manage delivery'}
                </span>
              </button>
            </div>

            {/* Account Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              
              {/* Card 1: Contact & Identification */}
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[var(--color-border-subtle)] shadow-xs space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-alt)] text-[var(--color-brand)] flex items-center justify-center font-bold text-sm">
                    <FiUser className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-extrabold text-[var(--color-text-main)]">Personal Information</h2>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-[var(--color-text-muted)] font-semibold block mb-0.5">Full Name</span>
                    <p className="font-bold text-[var(--color-text-main)] text-sm">{customer.name || '—'}</p>
                  </div>

                  <div>
                    <span className="text-[var(--color-text-muted)] font-semibold block mb-0.5">Email Address</span>
                    <p className="font-bold text-[var(--color-text-main)] text-sm break-all">{customer.email || 'Not provided'}</p>
                  </div>

                  <div>
                    <span className="text-[var(--color-text-muted)] font-semibold block mb-0.5">Mobile Number</span>
                    <p className="font-bold text-[var(--color-text-main)] text-sm">
                      {customer.phone ? `+91 ${customer.phone}` : 'Not provided'}
                    </p>
                  </div>

                  <div>
                    <span className="text-[var(--color-text-muted)] font-semibold block mb-0.5">Customer Type</span>
                    <p className="font-bold text-[var(--color-text-main)]">{customer.customer_type || 'RETAIL'}</p>
                  </div>
                </div>
              </div>

              {/* Card 2: Referral & Rewards Summary */}
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[var(--color-border-subtle)] shadow-xs space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center font-bold text-sm">
                    <FiGift className="w-4 h-4 text-pink-600" />
                  </div>
                  <h2 className="text-sm font-extrabold text-[var(--color-text-main)]">Referral Program</h2>
                </div>

                {referral ? (
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[var(--color-text-muted)] font-semibold block mb-0.5">Your Referral Code</span>
                      <div className="inline-flex items-center gap-2">
                        <div className="px-3 py-1.5 bg-[var(--color-bg-main)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-main)] font-black text-sm tracking-wider">
                          {referral.referral_code || 'Generating...'}
                        </div>
                        {referral.referral_code && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(referral.referral_code)
                              setCopiedCode(true)
                              setTimeout(() => setCopiedCode(false), 2000)
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[var(--color-primary-tint)] hover:bg-[var(--color-extra-040)] text-[var(--color-brand)] text-xs font-bold transition-colors cursor-pointer"
                          >
                            {copiedCode ? (
                              <span className="flex items-center gap-1">
                                <FiCheck className="w-3.5 h-3.5" />
                                <span>Copied</span>
                              </span>
                            ) : (
                              'Copy'
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="p-3 bg-[var(--color-bg-main)] rounded-xl border border-[var(--color-border-subtle)]">
                        <span className="text-[11px] text-[var(--color-text-muted)] font-semibold block">Total Referrals</span>
                        <span className="text-lg font-black text-[var(--color-brand)]">{referral.total_referrals || 0}</span>
                      </div>
                      <div className="p-3 bg-pink-50 rounded-xl border border-pink-100">
                        <span className="text-[11px] text-pink-700 font-semibold block">Reward Rate</span>
                        <span className="text-lg font-black text-pink-900">
                          {referral.reward_percent !== undefined && referral.reward_percent !== null ? `${referral.reward_percent}% OFF` : '—'}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed pt-1">
                      Share your code with friends to give them {referral.referred_discount_percent ?? referral.reward_percent ?? ''}% OFF on their first purchase, and you'll earn {referral.referrer_discount_percent ?? referral.reward_percent ?? ''}% OFF too!
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-[var(--color-text-muted)] py-4">
                    Referral rewards will appear here when active.
                  </div>
                )}
              </div>

            </div>

            {/* Section 3: Saved Delivery Addresses (Database Synchronized + Current Location GPS Autofill) */}
            <div id="saved-addresses-section" className="bg-white rounded-3xl p-5 sm:p-7 border border-[var(--color-border-subtle)] shadow-xs space-y-5 scroll-mt-20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0">
                    <FiMapPin className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-[var(--color-text-main)]">
                      Saved Delivery Addresses
                    </h2>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      Manage delivery destinations or autofill with your current GPS location
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenAddAddress}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[var(--color-brand)] hover:bg-[#6d28d9] text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  <FiPlus className="w-4 h-4" />
                  <span>Add New Address</span>
                </button>
              </div>

              {addressSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{addressSuccess}</span>
                </div>
              )}

              {loadingAddresses ? (
                <div className="py-8 text-center text-xs text-gray-400">
                  <div className="inline-block w-6 h-6 border-2 border-[var(--color-brand)] border-t-transparent rounded-full animate-spin mb-2" />
                  <p>Loading your saved addresses...</p>
                </div>
              ) : addresses.length === 0 ? (
                currentLocation ? (
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-50/90 to-indigo-50/70 border-2 border-purple-200/90 shadow-xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--color-brand)] text-white flex items-center justify-center shrink-0 shadow-sm">
                          <FiNavigation className="w-5 h-5 text-white animate-pulse" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-brand)] bg-[var(--color-primary-tint)] px-2.5 py-0.5 rounded-full border border-purple-200">
                              Current Location Detected
                            </span>
                            {currentLocation.latitude && (
                              <span className="text-[10px] font-mono font-bold text-purple-700 bg-white px-2 py-0.5 rounded-md border border-purple-200">
                                GPS: {Number(currentLocation.latitude).toFixed(4)}, {Number(currentLocation.longitude).toFixed(4)}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-[var(--color-text-main)] mt-1.5 leading-snug">
                            {currentLocation.streetAddress || currentLocation.road || currentLocation.formattedAddress || 'Current GPS Location'}
                          </h4>
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                            {[currentLocation.city, currentLocation.state, currentLocation.pincode].filter(Boolean).join(', ')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenAddAddress(currentLocation)}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-full bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white text-xs font-black shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                        >
                          <FiEdit2 className="w-3.5 h-3.5" />
                          <span>Review & Save Address</span>
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-[11px] text-purple-800 font-medium pt-2 border-t border-purple-100">
                      <span>💡 Address auto-filled from your GPS coordinates. You can review, edit details, or change before saving.</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <FiMapPin className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[var(--color-text-main)]">No delivery addresses saved yet</p>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        Save an address or auto-detect using GPS for faster one-tap checkout.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenAddAddress()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] text-xs font-bold transition-all cursor-pointer shadow-xs"
                      >
                        <FiPlus className="w-4 h-4" />
                        <span>Add Delivery Address</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDetectCurrentLocationForAddress}
                        disabled={isDetectingGps}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-purple-50 text-[var(--color-brand)] border border-purple-200 hover:bg-purple-100 text-xs font-bold transition-all cursor-pointer"
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
                      className={`rounded-2xl p-4 sm:p-5 border transition-all flex flex-col justify-between ${
                        addr.is_default
                          ? 'border-[var(--color-brand)] bg-[#FAF8FF]/40 shadow-xs'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                              {addr.address_type || 'HOME'}
                            </span>
                            {addr.is_default ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <FiCheck className="w-3 h-3" />
                                <span>Default Address</span>
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditAddress(addr)}
                              className="p-1.5 text-gray-400 hover:text-[var(--color-brand)] rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                              title="Edit Address"
                            >
                              <FiEdit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAddress(addr.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                              title="Delete Address"
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1 text-xs">
                          <p className="font-bold text-[var(--color-text-main)] text-sm">
                            {addr.name}{' '}
                            <span className="font-normal text-gray-500 text-xs">
                              (+91 {addr.phone})
                            </span>
                          </p>
                          <p className="text-gray-700 leading-snug">{addr.line1}</p>
                          {addr.line2 && <p className="text-gray-500">{addr.line2}</p>}
                          {addr.landmark && (
                            <p className="text-gray-400 text-[11px]">Landmark: {addr.landmark}</p>
                          )}
                          <p className="font-semibold text-gray-800">
                            {addr.city_district || addr.city}, {addr.state} - {addr.pincode}
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleSelectForDelivery(addr)}
                          className="text-[11px] font-bold text-[var(--color-brand)] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <FiNavigation className="w-3 h-3" />
                          <span>Deliver here</span>
                        </button>

                        {!addr.is_default && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultAddress(addr)}
                            className="text-[11px] font-medium text-gray-500 hover:text-gray-800 cursor-pointer"
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

            {/* Quick Navigation Footer */}
            <div className="pt-4 flex items-center justify-start">
              <Link
                to={ROUTES.HOME}
                className="min-h-[44px] flex items-center justify-center px-6 py-3 rounded-full bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-black/10 active:scale-98"
              >
                Continue Shopping
              </Link>
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
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Pincode <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={addressFormData.pincode}
                      onChange={(e) => setAddressFormData((p) => ({ ...p, pincode: e.target.value }))}
                      placeholder="6-digit PIN"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white"
                    />
                  </div>
                </div>

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
