import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface Customer {
  id: number
  name: string
  phone: string
  email: string | null
  customer_type: 'RETAIL' | 'WHOLESALE'
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
  order_count: number
  total_spent: string | number
  latest_order_at: string | null
}

function money(value: string | number) {
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'RETAIL' | 'WHOLESALE'>('ALL')
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [editType, setEditType] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL')
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    api.get('/customers', { params: { search, type: typeFilter === 'ALL' ? undefined : typeFilter } })
      .then((res) => setCustomers(res.data.customers))
  }

  useEffect(() => {
    load()
  }, [search, typeFilter])

  function openEdit(c: Customer) {
    setEditingCustomer(c)
    setEditType(c.customer_type)
    setEditName(c.name)
    setEditEmail(c.email || '')
    setEditStatus(c.status)
    setError('')
  }

  async function handleSaveCustomer(e: React.FormEvent) {
    e.preventDefault()
    if (!editingCustomer) return
    setSaving(true)
    setError('')
    try {
      await api.put(`/customers/${editingCustomer.id}`, {
        name: editName,
        email: editEmail,
        customer_type: editType,
        status: editStatus,
      })
      setEditingCustomer(null)
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to update customer'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleCustomerType(customer: Customer) {
    const nextType = customer.customer_type === 'WHOLESALE' ? 'RETAIL' : 'WHOLESALE'
    try {
      await api.put(`/customers/${customer.id}`, { customer_type: nextType })
      load()
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to toggle price type'))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer List & Price Type Mapping"
        description="View all customer accounts and map pricing type (Retail vs Wholesale price rates) to customers."
        actions={
          <div className="flex gap-2">
            <Select value={typeFilter} onChange={(e: any) => setTypeFilter(e.target.value)} className="w-40">
              <option value="ALL">All Types</option>
              <option value="RETAIL">Retail Only</option>
              <option value="WHOLESALE">Wholesale Only</option>
            </Select>
            <TextField
              placeholder="Search by name, phone, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>
        }
      />

      {customers === null ? (
        <Spinner />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 uppercase text-slate-500 bg-slate-50/70">
                <tr>
                  <th className="px-4 py-3 font-semibold">Customer Name</th>
                  <th className="px-4 py-3 font-semibold">Mobile Phone</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Price Type Mapping</th>
                  <th className="px-4 py-3 font-semibold text-center">Orders</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Spent</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{c.phone}</td>
                    <td className="px-4 py-3 text-slate-500">{c.email || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleCustomerType(c)}
                        title="Click to switch price mapping"
                        className="inline-flex items-center gap-1.5 focus:outline-none"
                      >
                        <Badge tone={c.customer_type === 'WHOLESALE' ? 'amber' : 'green'}>
                          {c.customer_type === 'WHOLESALE' ? 'WHOLESALE PRICE' : 'RETAIL PRICE'}
                        </Badge>
                        <span className="text-[10px] text-slate-400 hover:text-indigo-600 font-medium">(Switch)</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-slate-700">{c.order_count}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{money(c.total_spent)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={c.status === 'ACTIVE' ? 'green' : 'slate'}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(c)}>
                        Edit Mapping
                      </Button>
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No customer accounts found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editingCustomer && (
        <Modal title={`Edit Customer: ${editingCustomer.name}`} onClose={() => setEditingCustomer(null)}>
          <form onSubmit={handleSaveCustomer} className="space-y-4 text-xs">
            {error && <Alert>{error}</Alert>}
            <TextField label="Customer Name" required value={editName} onChange={(e) => setEditName(e.target.value)} />
            <TextField label="Email Address" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Optional" />

            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
              <label className="block font-bold text-slate-800">Price Type Mapping</label>
              <Select value={editType} onChange={(e: any) => setEditType(e.target.value)}>
                <option value="RETAIL">RETAIL PRICE — Standard retail catalog pricing</option>
                <option value="WHOLESALE">WHOLESALE PRICE — Special discounted wholesale rates</option>
              </Select>
              <p className="text-[11px] text-slate-500">
                When set to Wholesale, POS billing and order previews automatically select wholesale prices for items where available.
              </p>
            </div>

            <Select label="Account Status" value={editStatus} onChange={(e: any) => setEditStatus(e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setEditingCustomer(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
