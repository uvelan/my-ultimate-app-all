'use client'

import { useState, useEffect } from 'react'
import { getCategories, addCategory, deleteCategory } from '@/actions/category'
import toast from 'react-hot-toast'

export default function CategoryManager() {
    const [categories, setCategories] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [newCatName, setNewCatName] = useState('')
    const [newCatColor, setNewCatColor] = useState('#3b82f6')

    useEffect(() => {
        loadCategories()
    }, [])

    async function loadCategories() {
        setLoading(true)
        try {
            const res = await getCategories()
            setCategories(res)
        } catch (e: any) {
        if (e?.message?.includes('Unauthorized')) {
            window.location.href = '/login';
            return;
        }
            toast.error('Failed to load categories')
        } finally {
            setLoading(false)
        }
    }

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault()
        if (!newCatName.trim()) return
        try {
            await addCategory(newCatName, newCatColor)
            toast.success('Category added')
            setNewCatName('')
            loadCategories()
        } catch (e: any) {
        if (e?.message?.includes('Unauthorized')) {
            window.location.href = '/login';
            return;
        }
            toast.error('Error adding category')
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure?')) return
        try {
            await deleteCategory(id)
            toast.success('Category deleted')
            loadCategories()
        } catch (e: any) {
        if (e?.message?.includes('Unauthorized')) {
            window.location.href = '/login';
            return;
        }
            toast.error('Error deleting category')
        }
    }

    if (loading) return <div>Loading...</div>

    return (
        <div>
            <h4 className="mb-4">Manage Categories</h4>

            <form onSubmit={handleAdd} className="row g-3 mb-5 align-items-end">
                <div className="col-md-6">
                    <label className="form-label">Category Name</label>
                    <input
                        type="text"
                        className="form-control"
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        required
                    />
                </div>
                <div className="col-md-2">
                    <label className="form-label">Color</label>
                    <input
                        type="color"
                        className="form-control form-control-color"
                        value={newCatColor}
                        onChange={e => setNewCatColor(e.target.value)}
                        title="Choose your color"
                    />
                </div>
                <div className="col-md-4">
                    <button type="submit" className="btn btn-primary w-100">Add Category</button>
                </div>
            </form>

            <div className="row g-3">
                {categories.map((c: any) => (
                    <div key={c.id} className="col-md-4 col-sm-6">
                        <div className="card border-0 shadow-sm">
                            <div className="card-body d-flex justify-content-between align-items-center">
                                <div className="d-flex align-items-center">
                                    <div style={{ width: 16, height: 16, backgroundColor: c.color, borderRadius: '50%', marginRight: 10 }}></div>
                                    <span className="fw-medium">{c.name}</span>
                                </div>
                                <button onClick={() => handleDelete(c.id)} className="btn btn-sm btn-outline-danger border-0">
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                {categories.length === 0 && <p className="text-muted">No custom categories found.</p>}
            </div>
        </div>
    )
}
