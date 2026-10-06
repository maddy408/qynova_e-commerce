import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Card, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface ReferralSettings {
  is_enabled: boolean
  referrer_discount_percent: string
  referred_discount_percent: string
  max_discount_amount: string | null
  min_order_amount: string | null
  first_order_only: boolean
  reward_trigger: 'SIGNUP' | 'FIRST_ORDER' | 'FIRST_DELIVERED_ORDER'
  referral_validity_days: number | null
  referral_code_prefix: string | null
}

interface ReferralReport {
  totals: { total_referrals: number; successful_referrals: number; pending_referrals: number }
  referral_discount_given: number
  top_referrers: { id: number; name: string; referral_count: number }[]
}

export function ReferralSettingsPage() {
  const [settings, setSettings] = useState<ReferralSettings | null>(null)
  const [report, setReport] = useState<ReferralReport | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    api.get('/referral-settings').then((res) => setSettings(res.data.settings))
    api.get('/reports/referrals').then((res) => setReport(res.data))
  }

  useEffect(load, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    setError('')
    try {
      const res = await api.put('/referral-settings', settings)
      setSettings(res.data.settings)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save settings'))
    } finally {
      setSaving(false)
    }
  }

  function set<K extends keyof ReferralSettings>(key: K, value: ReferralSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  if (settings === null) {
    return <Spinner />
  }

  return (
    <div>
      <PageHeader title="Referral Settings" description="Controls the referral reward customers get for inviting others." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={handleSubmit} className="space-y-4 lg:col-span-2">
          <Card className="space-y-4 p-5">
            {error && <Alert>{error}</Alert>}
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={settings.is_enabled}
                onChange={(e) => set('is_enabled', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Enable referral system
            </label>

            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Referrer Discount %"
                type="number"
                step="0.01"
                value={settings.referrer_discount_percent}
                onChange={(e) => set('referrer_discount_percent', e.target.value)}
              />
              <TextField
                label="Referred Customer Discount %"
                type="number"
                step="0.01"
                value={settings.referred_discount_percent}
                onChange={(e) => set('referred_discount_percent', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Maximum Discount Amount"
                type="number"
                step="0.01"
                value={settings.max_discount_amount ?? ''}
                onChange={(e) => set('max_discount_amount', e.target.value || null)}
                placeholder="No cap"
              />
              <TextField
                label="Minimum Order Amount"
                type="number"
                step="0.01"
                value={settings.min_order_amount ?? ''}
                onChange={(e) => set('min_order_amount', e.target.value || null)}
                placeholder="None"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Reward Trigger" value={settings.reward_trigger} onChange={(e) => set('reward_trigger', e.target.value as ReferralSettings['reward_trigger'])}>
                <option value="SIGNUP">On Signup</option>
                <option value="FIRST_ORDER">On First Order</option>
                <option value="FIRST_DELIVERED_ORDER">On First Delivered Order</option>
              </Select>
              <TextField
                label="Referral Validity (days)"
                type="number"
                value={settings.referral_validity_days ?? ''}
                onChange={(e) => set('referral_validity_days', e.target.value ? Number(e.target.value) : null)}
                placeholder="No expiry"
              />
            </div>
            <TextField
              label="Referral Code Prefix"
              value={settings.referral_code_prefix ?? ''}
              onChange={(e) => set('referral_code_prefix', e.target.value || null)}
              placeholder="Default: derived from customer name"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={settings.first_order_only}
                onChange={(e) => set('first_order_only', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              First order only
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </Card>
        </form>

        <div className="space-y-6">
          {report && (
            <Card className="space-y-3 p-5">
              <h2 className="text-sm font-semibold text-slate-900">Referral Report</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-500">Total</p>
                  <p className="text-lg font-semibold text-slate-900">{report.totals.total_referrals}</p>
                </div>
                <div>
                  <p className="text-slate-500">Successful</p>
                  <p className="text-lg font-semibold text-slate-900">{report.totals.successful_referrals}</p>
                </div>
                <div>
                  <p className="text-slate-500">Pending</p>
                  <p className="text-lg font-semibold text-slate-900">{report.totals.pending_referrals}</p>
                </div>
                <div>
                  <p className="text-slate-500">Discount Given</p>
                  <p className="text-lg font-semibold text-slate-900">₹{report.referral_discount_given}</p>
                </div>
              </div>
              {report.top_referrers.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-slate-500">Top Referrers</p>
                  <ul className="space-y-1 text-sm">
                    {report.top_referrers.map((r) => (
                      <li key={r.id} className="flex justify-between text-slate-600">
                        <span>{r.name}</span>
                        <span>{r.referral_count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
