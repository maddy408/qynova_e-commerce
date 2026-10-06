import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { HomeSection, HomeSectionType } from '../lib/types'

const TYPES: HomeSectionType[] = ['BANNER', 'CATEGORIES', 'BEST_SELLERS', 'NEW_ARRIVALS', 'FEATURED', 'COMBOS', 'DEALS', 'CUSTOM']

const UNWIRED: HomeSectionType[] = ['BEST_SELLERS', 'COMBOS', 'DEALS']

export function HomeSectionsPage() {
  const [sections, setSections] = useState<HomeSection[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<HomeSectionType>('FEATURED')
  const [title, setTitle] = useState('')
  const [itemLimit, setItemLimit] = useState('10')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function load() {
    api.get('/home-sections').then((res) => setSections(res.data.sections))
  }

  useEffect(load, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/home-sections', { type, title: title || null, item_limit: Number(itemLimit) || 10 })
      setShowForm(false)
      setType('FEATURED')
      setTitle('')
      setItemLimit('10')
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create section'))
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(section: HomeSection) {
    await api.put(`/home-sections/${section.id}`, { is_active: section.is_active ? 0 : 1 })
    load()
  }

  async function remove(id: number) {
    if (!window.confirm('Delete this home section?')) return
    await api.delete(`/home-sections/${id}`)
    load()
  }

  async function move(index: number, direction: -1 | 1) {
    if (!sections) return
    const target = index + direction
    if (target < 0 || target >= sections.length) return
    const reordered = [...sections]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    setSections(reordered)
    await api.put('/home-sections/reorder', { ordered_ids: reordered.map((s) => s.id) })
    load()
  }

  return (
    <div>
      <PageHeader
        title="Home Page Sections"
        description="Layout and ordering for the storefront home page. Best Sellers / Combos / Deals are schema-ready but not wired up yet — those features don't have a backend."
        actions={<Button onClick={() => setShowForm(true)}>+ New Section</Button>}
      />

      {sections === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Order</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Title</th>
                <th className="px-5 py-3 font-medium">Item Limit</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sections.map((s, i) => (
                <tr key={s.id}>
                  <td className="px-5 py-3">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                        ↑
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={UNWIRED.includes(s.type) ? 'amber' : 'slate'}>{s.type.replace('_', ' ')}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{s.title ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{s.item_limit}</td>
                  <td className="px-5 py-3">
                    <Badge tone={s.is_active ? 'green' : 'slate'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" onClick={() => toggleActive(s)} className="mr-3 text-xs text-slate-600 hover:underline">
                      {s.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" onClick={() => remove(s.id)} className="text-xs text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {sections.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                    No home sections yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <Modal title="New Home Section" onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <Select label="Type" value={type} onChange={(e) => setType(e.target.value as HomeSectionType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace('_', ' ')}
                  {UNWIRED.includes(t) ? ' (not wired up yet)' : ''}
                </option>
              ))}
            </Select>
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Featured Picks" />
            <TextField label="Item Limit" type="number" value={itemLimit} onChange={(e) => setItemLimit(e.target.value)} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Section'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
