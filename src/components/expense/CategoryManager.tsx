'use client'

import { useState, useEffect } from 'react'
import { getCategories, addCategory, deleteCategory } from '@/actions/category'
import toast from 'react-hot-toast'
import { 
    Grid, 
    Stack 
} from '@/components/layout/Primitives'
import { 
    Card, 
    CardHeader, 
    CardTitle, 
    CardContent 
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Typography } from '@/components/ui/Typography'
import { Input } from '@/components/ui/Input'
import { 
    Plus, 
    Trash2, 
    Tag,
    Palette,
    Loader2
} from 'lucide-react'

export default function CategoryManager() {
    const [categories, setCategories] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [newCatName, setNewCatName] = useState('')
    const [newCatColor, setNewCatColor] = useState('#3b82f6')

    useEffect(() => { loadCategories() }, [])

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

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-24 gap-space-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <Typography variant="caption" className="text-text-muted">Loading categories...</Typography>
        </div>
    )

    return (
        <Stack gap="space-8">
            <Card className="border-none shadow-shadow-md">
                <CardHeader>
                    <CardTitle className="text-h4">Manage Categories</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAdd}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-4 items-end">
                            <div className="md:col-span-2">
                                <Input 
                                    label="Category Name" 
                                    value={newCatName} 
                                    onChange={e => setNewCatName(e.target.value)} 
                                    required 
                                    leftIcon={<Tag size={16} />}
                                />
                            </div>
                            <div className="flex gap-space-4 items-end">
                                <div className="flex-1">
                                    <Input 
                                        label="Color" 
                                        type="color" 
                                        value={newCatColor} 
                                        onChange={e => setNewCatColor(e.target.value)} 
                                        className="h-10 px-1 py-1 cursor-pointer"
                                    />
                                </div>
                                <Button type="submit" variant="primary" className="h-10" leftIcon={<Plus size={18} />}>
                                    Add
                                </Button>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Stack gap="space-4">
                <Typography variant="h4">Existing Categories</Typography>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-4">
                    {categories.map((c: any) => (
                        <Card key={c.id} className="hover:shadow-shadow-md transition-premium border-border/50">
                            <CardContent className="p-space-4 pt-space-4 flex justify-between items-center h-full">
                                <div className="flex items-center gap-space-3">
                                    <div 
                                        className="w-4 h-4 rounded-full shadow-shadow-sm" 
                                        style={{ backgroundColor: c.color }} 
                                    />
                                    <Typography variant="body" className="font-semibold">{c.name}</Typography>
                                </div>
                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={() => handleDelete(c.id)} 
                                    className="text-text-muted hover:text-error hover:bg-error/5"
                                >
                                    <Trash2 size={14} />
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                    {categories.length === 0 && (
                        <div className="col-span-full py-12 text-center border-2 border-dashed border-border rounded-radius-lg bg-background-muted/20">
                            <Typography variant="body" className="text-text-muted">No custom categories found. Add one to get started!</Typography>
                        </div>
                    )}
                </div>
            </Stack>
        </Stack>
    )
}
