import { useEffect, useState, type FormEvent } from 'react'
import { PencilIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { HomeSection, HomeSectionType } from '../lib/types'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '')
function imageUrl(path: string) {
  return `${API_ORIGIN}/${path}`
}

const TYPES: HomeSectionType[] = ['BANNER', 'CATEGORIES', 'BEST_SELLERS', 'NEW_ARRIVALS', 'FEATURED', 'COMBOS', 'DEALS', 'CUSTOM']
const UNWIRED: HomeSectionType[] = ['BEST_SELLERS', 'COMBOS', 'DEALS']

export function HomeSectionsPage() {
  const [sections, setSections] = useState<HomeSection[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingSection, setEditingSection] = useState<HomeSection | null>(null)

  const [type, setType] = useState<HomeSectionType>('FEATURED')
  const [title, setTitle] = useState('')
  const [itemLimit, setItemLimit] = useState('10')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  function load() {
    api.get('/home-sections').then((res) => setSections(res.data.sections))
  }

  useEffect(load, [])

  function openCreateModal() {
    setType('FEATURED')
    setTitle('')
    setItemLimit('10')
    setError('')
    setShowForm(true)
  }

  function openEditModal(s: HomeSection) {
    setEditingSection(s)
    setType(s.type)
    setTitle(s.title ?? '')
    setItemLimit(String(s.item_limit))
    setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (editingSection) {
        await api.put(`/home-sections/${editingSection.id}`, { type, title: title || null, item_limit: Number(itemLimit) || 10 })
        setEditingSection(null)
      } else {
        await api.post('/home-sections', { type, title: title || null, item_limit: Number(itemLimit) || 10 })
        setShowForm(false)
      }
      setType('FEATURED')
      setTitle('')
      setItemLimit('10')
      load()
    } catch (err) {
      setError(apiErrorMessage(err, editingSection ? 'Could not update section' : 'Could not create section'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleImageUpload(sectionId: number, file: File | undefined) {
    if (!file) return
    setUploadingImage(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.post(`/home-sections/${sectionId}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      load()
      if (editingSection && editingSection.id === sectionId) {
        setEditingSection((prev) => prev ? { ...prev, image_path: URL.createObjectURL(file) } : null)
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not upload image'))
    } finally {
      setUploadingImage(false)
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
        description="Layout, ordering, and background overlay image configuration for storefront home page sections."
        actions={<Button onClick={openCreateModal}>+ New Section</Button>}
      />

      {sections === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#F2E5E7] uppercase text-[#804652] bg-[#FAF2F4]/80 text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Background Image</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Item Limit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2E5E7]">
              {sections.map((s, i) => (
                <tr key={s.id} className="hover:bg-[#FAF2F4]/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 font-bold">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="text-slate-400 hover:text-[#7B3F4A] disabled:opacity-20"
                        title="Move Up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === sections.length - 1}
                        className="text-slate-400 hover:text-[#7B3F4A] disabled:opacity-20"
                        title="Move Down"
                      >
                        ▼
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-16 overflow-hidden rounded-xl border border-[#EEDDE0] bg-[#FAF2F4] flex items-center justify-center">
                        {s.image_path ? (
                          <img src={imageUrl(s.image_path)} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[9px] text-slate-400 font-bold">No Image</span>
                        )}
                      </div>
                      <label className="cursor-pointer text-[11px] font-bold text-[#7B3F4A] hover:text-[#5C2B34]">
                        {uploadingImage ? 'Uploading…' : 'Upload'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => handleImageUpload(s.id, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Badge tone={UNWIRED.includes(s.type) ? 'amber' : 'slate'}>{s.type.replace('_', ' ')}</Badge>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{s.title ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 font-bold">{s.item_limit}</td>
                  <td className="px-4 py-3">
                    <Badge tone={s.is_active ? 'green' : 'slate'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(s)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-[#FAF2F4] hover:text-[#7B3F4A] transition-colors"
                      title="Edit Section"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(s)}
                      className={`p-1.5 rounded-lg transition-colors ${s.is_active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-[#FAF2F4]'}`}
                      title={s.is_active ? 'Deactivate' : 'Activate'}
                    >
                      <PowerIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title="Delete Section"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
              {sections.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No home sections created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {(showForm || editingSection) && (
        <Modal title={editingSection ? `Edit Section: ${editingSection.title || editingSection.type}` : 'New Home Section'} onClose={() => { setShowForm(false); setEditingSection(null); }}>
          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            {error && <Alert>{error}</Alert>}
            <Select label="Type" value={type} onChange={(e) => setType(e.target.value as HomeSectionType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace('_', ' ')}
                  {UNWIRED.includes(t) ? ' (not wired up yet)' : ''}
                </option>
              ))}
            </Select>
            <TextField label="Section Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Featured Picks" />
            <TextField label="Item Display Limit" type="number" value={itemLimit} onChange={(e) => setItemLimit(e.target.value)} />
            
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setEditingSection(null); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : editingSection ? 'Save Changes' : 'Create Section'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
