import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PencilIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { HomeSection, HomeSectionType } from '../lib/types'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '')
function imageUrl(path: string | null) {
  if (!path) return ''
  return `${API_ORIGIN}/${path}`
}

const TYPES: HomeSectionType[] = ['BANNER', 'CATEGORIES', 'BEST_SELLERS', 'NEW_ARRIVALS', 'FEATURED', 'COMBOS', 'DEALS', 'CUSTOM']
const UNWIRED: HomeSectionType[] = ['COMBOS', 'DEALS']

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
  const [successMessage, setSuccessMessage] = useState('')

  // Image Upload States inside Modal
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageRemoved, setImageRemoved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function load() {
    api.get('/home-sections').then((res) => setSections(res.data.sections))
  }

  useEffect(load, [])

  function openCreateModal() {
    setType('FEATURED')
    setTitle('')
    setItemLimit('10')
    setImageFile(null)
    setImagePreview(null)
    setImageRemoved(false)
    setError('')
    setSuccessMessage('')
    setShowForm(true)
  }

  function openEditModal(s: HomeSection) {
    setEditingSection(s)
    setType(s.type)
    setTitle(s.title ?? '')
    setItemLimit(String(s.item_limit))
    setImageFile(null)
    setImagePreview(null)
    setImageRemoved(false)
    setError('')
    setSuccessMessage('')
  }

  function pickImage(file?: File) {
    if (!file) return
    setImageFile(file)
    setImageRemoved(false)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      let sectionId: number
      if (editingSection) {
        await api.put(`/home-sections/${editingSection.id}`, {
          type,
          title: title || null,
          item_limit: Number(itemLimit) || 10,
          image_path: imageRemoved ? null : (imageFile ? undefined : editingSection.image_path),
        })
        sectionId = editingSection.id
      } else {
        const res = await api.post('/home-sections', { type, title: title || null, item_limit: Number(itemLimit) || 10 })
        sectionId = res.data.id
      }

      // If user selected an image inside the creation/edit modal
      if (imageFile && sectionId) {
        const formData = new FormData()
        formData.append('file', imageFile)
        await api.post(`/home-sections/${sectionId}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else if (imageRemoved && sectionId) {
        await api.delete(`/home-sections/${sectionId}/image`)
      }

      const isEdit = Boolean(editingSection)
      const sectionName = title || (editingSection?.title ?? type.replace('_', ' '))

      setShowForm(false)
      setEditingSection(null)
      setType('FEATURED')
      setTitle('')
      setItemLimit('10')
      setImageFile(null)
      setImagePreview(null)
      setImageRemoved(false)
      setSuccessMessage(isEdit ? `Home section "${sectionName}" saved successfully.` : `Home section "${sectionName}" created successfully.`)
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
        setEditingSection((prev) => (prev ? { ...prev, image_path: URL.createObjectURL(file) } : null))
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

      {successMessage && (
        <div className="mb-4">
          <Alert tone="green">{successMessage}</Alert>
        </div>
      )}

      {sections === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-xs">
            <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
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
            <tbody className="divide-y divide-[#F0E0E3]">
              {sections.map((s, i) => (
                <tr key={s.id} className="hover:bg-[#FAF2F4]/80 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 font-bold">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="text-slate-400 hover:text-[#804652] disabled:opacity-20 cursor-pointer"
                        title="Move Up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === sections.length - 1}
                        className="text-slate-400 hover:text-[#804652] disabled:opacity-20 cursor-pointer"
                        title="Move Down"
                      >
                        ▼
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-16 overflow-hidden rounded-lg border border-[#F2E5E7] bg-[#FAF2F4] flex items-center justify-center">
                        {s.image_path ? (
                          <img src={imageUrl(s.image_path)} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[9px] font-bold text-[#804652]">No Image</span>
                        )}
                      </div>
                      <label className="cursor-pointer text-[11px] font-bold text-[#804652] hover:text-[#4A1821]">
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
                  <td className="px-4 py-3 font-semibold">
                    <Badge tone={UNWIRED.includes(s.type) ? 'amber' : 'slate'}>{s.type.replace('_', ' ')}</Badge>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-950">{s.title ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-900 font-bold">{s.item_limit}</td>
                  <td className="px-4 py-3">
                    <Badge tone={s.is_active ? 'green' : 'slate'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(s)}
                        className="p-1.5 rounded-lg text-slate-600 hover:bg-[#FAF2F4] hover:text-[#804652] transition-colors cursor-pointer"
                        title="Edit Section"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(s)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${s.is_active ? 'text-emerald-700 hover:bg-emerald-50' : 'text-slate-400 hover:bg-[#FAF2F4]'}`}
                        title={s.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <PowerIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(s.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                        title="Delete Section"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sections.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center font-semibold text-slate-500">
                    No home sections created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {(showForm || editingSection) && (
        <Modal
          title={editingSection ? `Edit Section: ${editingSection.title || editingSection.type}` : 'New Home Section'}
          onClose={() => {
            setShowForm(false)
            setEditingSection(null)
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
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

            {/* Background Image Uploader Card */}
            <div className="rounded-2xl border-2 border-dashed border-[#EEDDE0] bg-[#FAF5F6]/70 p-4 transition-colors">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#804652] mb-2.5">
                Background Overlay Image
              </label>
              <div className="flex items-center gap-4">
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 border-[#EEDDE0] bg-white shadow-2xs flex items-center justify-center">
                  {imagePreview || (editingSection && !imageRemoved && editingSection.image_path) ? (
                    <img
                      src={imagePreview ?? imageUrl(editingSection!.image_path)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-[#804652]/60">No Image</span>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#7B3F4A] text-white text-xs font-semibold hover:bg-[#68333D] transition-all shadow-2xs active:scale-98 cursor-pointer"
                    >
                      📷 {editingSection ? 'Change Image' : (imagePreview ? 'Change Image' : 'Upload Image')}
                    </button>

                    {(imagePreview || (editingSection && !imageRemoved && editingSection.image_path)) && (
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null)
                          setImagePreview(null)
                          setImageRemoved(true)
                          if (editingSection) {
                            setEditingSection((prev) => (prev ? { ...prev, image_path: null } : null))
                          }
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs font-medium transition-colors cursor-pointer"
                      >
                        × Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    JPG, PNG, WEBP supported • Optional background image
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => pickImage(e.target.files?.[0])}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#F2E5E7]">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowForm(false)
                  setEditingSection(null)
                }}
              >
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
