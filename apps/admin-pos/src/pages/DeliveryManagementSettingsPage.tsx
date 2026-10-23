import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Card, PageHeader, TextField, Spinner } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface DeliveryManagementSettings {
  radius_km: string
  price_per_kg: string
  flat_fallback_charge: string
  own_delivery_days: number
  post_min_days: number
  post_max_days: number
  default_courier_name: string
}

/**
 * Own-delivery vs India Post decision, the weight-based delivery
 * charge, and the ETA shown at checkout are all driven by this one
 * settings row (delivery_management_settings) — see
 * DeliveryCalculationService. Changing price_per_kg here takes effect
 * immediately on the next quote; nothing here is cached.
 */
export function DeliveryManagementSettingsPage() {
  const [settings, setSettings] = useState<DeliveryManagementSettings | null>(null)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    api
      .get('/settings/delivery-management')
      .then((res) => setSettings(res.data.settings))
      .catch((err) => setError(apiErrorMessage(err, 'Could not load delivery settings')))
  }

  useEffect(load, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    setError('')
    setSuccessMessage('')
    try {
      const res = await api.put('/settings/delivery-management', settings)
      setSettings(res.data.settings)
      setSuccessMessage('Delivery settings saved — new charges apply immediately to the next quote.')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save delivery settings'))
    } finally {
      setSaving(false)
    }
  }

  function set<K extends keyof DeliveryManagementSettings>(key: K, value: DeliveryManagementSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  if (settings === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const exampleWeight = 5
  const exampleCharge = (Number(settings.price_per_kg) || 0) * exampleWeight

  return (
    <div>
      <PageHeader
        title="Delivery Management Settings"
        description="Shop delivers itself within the radius (free); beyond that, India Post delivers at a weight-based charge. A customer's first order is always free delivery, regardless of distance."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={handleSubmit} className="space-y-4 lg:col-span-2">
          <Card className="space-y-4 p-5">
            {error && <Alert>{error}</Alert>}
            {successMessage && <Alert tone="green">{successMessage}</Alert>}

            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Delivery Radius (km)"
                type="number"
                step="0.1"
                min="0.1"
                required
                value={settings.radius_km}
                onChange={(e) => set('radius_km', e.target.value)}
              />
              <TextField
                label="Own Delivery — Days"
                type="number"
                min="1"
                required
                value={settings.own_delivery_days}
                onChange={(e) => set('own_delivery_days', Number(e.target.value))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Price per kg (₹)"
                type="number"
                step="0.01"
                min="0"
                required
                value={settings.price_per_kg}
                onChange={(e) => set('price_per_kg', e.target.value)}
              />
              <TextField
                label="Flat Fallback Charge (₹)"
                type="number"
                step="0.01"
                min="0"
                required
                value={settings.flat_fallback_charge}
                onChange={(e) => set('flat_fallback_charge', e.target.value)}
                placeholder="Used only when no item has weight data"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="India Post — Minimum Days"
                type="number"
                min="1"
                required
                value={settings.post_min_days}
                onChange={(e) => set('post_min_days', Number(e.target.value))}
              />
              <TextField
                label="India Post — Maximum Days"
                type="number"
                min="1"
                required
                value={settings.post_max_days}
                onChange={(e) => set('post_max_days', Number(e.target.value))}
              />
            </div>

            <TextField
              label="Default Courier Name"
              required
              value={settings.default_courier_name}
              onChange={(e) => set('default_courier_name', e.target.value)}
            />

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </Card>
        </form>

        <div className="space-y-6">
          <Card className="space-y-3 p-5">
            <h2 className="text-base font-serif font-bold text-slate-900">How This Is Applied</h2>
            <ul className="space-y-2 text-xs text-slate-600 list-disc pl-4">
              <li>Within {settings.radius_km || '—'} km of the shop: delivered by the shop itself, {settings.own_delivery_days} day{settings.own_delivery_days === 1 ? '' : 's'}, free.</li>
              <li>
                Beyond that: {settings.default_courier_name || 'the courier'}, {settings.post_min_days}-{settings.post_max_days} days, charged at ₹{settings.price_per_kg || '0'}/kg
                (sum of each item's weight × quantity).
              </li>
              <li>Every customer's first order is free delivery, regardless of distance.</li>
              <li>If no item in the order has weight data, a flat ₹{settings.flat_fallback_charge || '0'} applies instead.</li>
            </ul>
            <div className="mt-2 p-3 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-strong)]">
                Example: a {exampleWeight}kg item, repeat customer, beyond radius
              </p>
              <p className="text-lg font-serif font-bold text-slate-900 mt-0.5">₹{exampleCharge.toFixed(2)}</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
