'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Typography } from '@/components/ui/Typography';
import { Modal } from '@/components/ui/Modal';
import { Section, Grid } from '@/components/layout/Primitives';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Book as BookIcon, Plus, Download, Search, Loader2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import BookCard from '@/components/books/BookCard';

interface Book {
    id: string;
    title: string;
    description: string;
    cover?: string;
    content: any;
    userName?: string;
    chapterId?: number;
    _count?: { chapters: number };
    createdAt: string;
}

export default function BooksPage() {
    const router = useRouter();
    const [books, setBooks] = useState<Book[]>([]);
    const [loading, setLoading] = useState(true);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchBooks();
    }, []);

    const fetchBooks = async () => {
        try {
            const res = await fetch('/api/books');
            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setBooks(data);
            }
        } catch (error) {
            toast.error('Failed to fetch books');
        } finally {
            setLoading(false);
        }
    };

    const deleteBook = async (e: React.MouseEvent, bookId: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to remove this book from your collection?')) return;

        try {
            const res = await fetch(`/api/books/${bookId}`, {
                method: 'DELETE',
            });

            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return;
            }

            if (res.ok) {
                toast.success('Book removed successfully');
                setBooks(books.filter(b => b.id !== bookId));
            } else {
                const data = await res.json();
                toast.error(data.error || 'Failed to delete book');
            }
        } catch (error) {
            toast.error('Error deleting book');
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            toast.error('Please select a file');
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        if (title) formData.append('title', title);
        if (description) formData.append('description', description);

        try {
            const res = await fetch('/api/books', {
                method: 'POST',
                body: formData,
            });

            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return;
            }

            if (res.ok) {
                toast.success('Book added to collection');
                setShowUploadModal(false);
                setFile(null);
                setTitle('');
                setDescription('');
                fetchBooks();
            } else {
                const error = await res.json();
                toast.error(error.error || 'Failed to upload book');
            }
        } catch (error) {
            toast.error('Error uploading book');
        } finally {
            setUploading(false);
        }
    };

    const filteredBooks = books.filter(book => 
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <ProtectedRoute>
            <DashboardLayout>
                <Section 
                    title="Digital Library" 
                    description="Access and manage your personal collection of books and documents."
                >
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-space-4 mb-space-8">
                        <div className="flex items-center gap-space-4 w-full md:w-auto">
                             <Link href="/dashboard">
                                <Button variant="ghost" size="sm" className="gap-space-2 text-text-muted hover:text-text-primary">
                                    <ArrowLeft size={16} /> Dashboard
                                </Button>
                            </Link>
                            <Input 
                                placeholder="Search library..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                leftIcon={<Search size={16} />}
                                className="md:w-64"
                            />
                        </div>
                        <Button onClick={() => setShowUploadModal(true)} className="gap-space-2 w-full md:w-auto" leftIcon={<Plus size={18} />}>
                            Add to Collection
                        </Button>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32 gap-space-4">
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                            <Typography variant="body" className="text-text-muted">Curating your library...</Typography>
                        </div>
                    ) : filteredBooks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 text-center border-2 border-dashed border-border rounded-radius-lg bg-background-muted/20">
                            <div className="h-16 w-16 rounded-full bg-background-muted flex items-center justify-center mb-space-4">
                                <BookIcon size={32} className="text-text-muted" />
                            </div>
                            <Typography variant="h4" className="mb-space-2">No books found</Typography>
                            <Typography variant="body" className="text-text-muted max-w-md">
                                {searchQuery ? "We couldn't find any books matching your search." : "Your collection is currently empty. Start by adding an EPUB or JSON book."}
                            </Typography>
                            {!searchQuery && (
                                <Button variant="outline" className="mt-space-6" onClick={() => setShowUploadModal(true)} leftIcon={<Plus size={16} />}>
                                    Upload First Book
                                </Button>
                            )}
                        </div>
                    ) : (
                        <Grid cols={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6 }} gap="space-8">
                            {filteredBooks.map((book) => (
                                <BookCard
                                    key={book.id}
                                    book={book}
                                    onDelete={deleteBook}
                                />
                            ))}
                        </Grid>
                    )}

                    <Modal
                        isOpen={showUploadModal}
                        onClose={() => setShowUploadModal(false)}
                        title="Add to Collection"
                        description="Upload an EPUB or JSON book file to your personal digital library."
                    >
                        <form onSubmit={handleUpload} className="space-y-space-6 pt-space-4">
                            <div className="space-y-space-2">
                                <label className="text-small font-medium text-text-primary">Source File</label>
                                <div className="border-2 border-dashed border-border rounded-radius-md p-space-8 flex flex-col items-center justify-center bg-background-muted/30 hover:bg-background-muted/50 transition-colors cursor-pointer relative">
                                    <input
                                        type="file"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        accept=".epub,.json"
                                        onChange={handleFileChange}
                                        required
                                    />
                                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-space-3 text-primary">
                                        <Download size={24} />
                                    </div>
                                    <Typography variant="small" className="font-medium text-text-primary">
                                        {file ? file.name : "Click to browse or drag and drop"}
                                    </Typography>
                                    <Typography variant="caption" className="text-text-muted mt-space-1">
                                        Supports .epub and .json files (max 50MB)
                                    </Typography>
                                </div>
                            </div>

                            <Grid cols={{ sm: 1, md: 1 }} gap="space-4">
                                <Input
                                    label="Custom Title (Optional)"
                                    placeholder="Auto-detected if left blank"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                />
                                <Textarea
                                    label="Short Description (Optional)"
                                    placeholder="Brief summary of the book..."
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    rows={3}
                                />
                            </Grid>

                            <div className="flex gap-space-3 pt-space-4">
                                <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowUploadModal(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" className="flex-1" isLoading={uploading}>
                                    {uploading ? 'Processing...' : 'Upload Book'}
                                </Button>
                            </div>
                        </form>
                    </Modal>
                </Section>
            </DashboardLayout>
        </ProtectedRoute>
    );
}
