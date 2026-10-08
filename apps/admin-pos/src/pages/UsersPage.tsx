import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface Role {
  id: number
  code: string
  name: string
}

interface StaffUser {
  id: number
  name: string
  email: string | null
  phone: string | null
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
  role_id: number
  role_code: string
  role_name: string
}

export function UsersPage() {
  const [users, setUsers] = useState<StaffUser[] | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function load() {
    api.get('/users').then((res) => setUsers(res.data.users))
  }

  useEffect(() => {
    load()
    api.get('/roles').then((res) => {
      setRoles(res.data.roles)
      if (res.data.roles.length > 0) setRoleId(String(res.data.roles.find((r: Role) => r.code === 'CASHIER')?.id ?? res.data.roles[0].id))
    })
  }, [])

  function openCreate() {
    setEditingUser(null)
    setName('')
    setEmail('')
    setPhone('')
    setPassword('')
    setError('')
    setShowForm(true)
  }

  function openEdit(u: StaffUser) {
    setEditingUser(u)
    setName(u.name)
    setEmail(u.email ?? '')
    setPhone(u.phone ?? '')
    setPassword('')
    setRoleId(String(u.role_id))
    setError('')
    setShowForm(true)
  }

  async function toggleActive(u: StaffUser) {
    await api.put(`/users/${u.id}`, { status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
    load()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, {
          name,
          email,
          phone: phone || null,
          role_id: Number(roleId),
          ...(password ? { password } : {}),
        })
      } else {
        await api.post('/users', { name, email, phone: phone || null, password, role_id: Number(roleId) })
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(apiErrorMessage(err, editingUser ? 'Could not update user' : 'Could not create user'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Staff accounts — admins and cashiers. Deactivating a user blocks login but keeps their history."
        actions={<Button onClick={openCreate}>+ New User</Button>}
      />

      {users === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5">Email</th>
                <th className="px-5 py-3.5">Phone</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E0E3]">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#FAF2F4]/80 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-slate-950">{u.name}</td>
                  <td className="px-5 py-3.5 font-semibold text-slate-800">{u.email ?? '—'}</td>
                  <td className="px-5 py-3.5 font-semibold text-slate-800">{u.phone ?? '—'}</td>
                  <td className="px-5 py-3.5">
                    <Badge tone={u.role_code === 'ADMIN' ? 'amber' : 'slate'}>{u.role_name}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={u.status === 'ACTIVE' ? 'green' : 'slate'}>{u.status}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right font-medium">
                    <button type="button" onClick={() => openEdit(u)} className="mr-3 text-xs font-bold text-[#804652] hover:text-[#4A1821] hover:underline cursor-pointer">
                      Edit
                    </button>
                    <button type="button" onClick={() => toggleActive(u)} className="text-xs font-bold text-slate-700 hover:text-slate-950 hover:underline cursor-pointer">
                      {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm font-semibold text-slate-500">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <Modal title={editingUser ? `Edit ${editingUser.name}` : 'New User'} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Select label="Role" required value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <TextField
              label={editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
              type="password"
              required={!editingUser}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : editingUser ? 'Save Changes' : 'Create User'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
