'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Button } from '@/components/ui/components'; // Assuming Button is available
import toast from 'react-hot-toast';
import Link from 'next/link';


interface Book {
    id: string;
    title: string;
    description: string;
    cover?: string;
    content: any;
    userName?: string;
    createdAt: string;
}

import { useRouter } from 'next/navigation';

export default function BooksPage() {
    const router = useRouter();
    const [books, setBooks] = useState<Book[]>([]);
    const [loading, setLoading] = useState(true);
    const [showUpload, setShowUpload] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        fetchBooks();
    }, []);

    const fetchBooks = async () => {
        try {
            const res = await fetch('/api/books');
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
        e.stopPropagation(); // Prevent opening the book
        if (!confirm('Are you sure you want to delete this book?')) return;

        try {
            const res = await fetch(`/api/books/${bookId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                toast.success('Book deleted successfully');
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

            if (res.ok) {
                toast.success('Book uploaded successfully');
                setShowUpload(false);
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

    return (
        <ProtectedRoute>
            {/* Full Page Library Container */}
            <div className="min-h-screen bg-[#2e1d15] text-[#d4c5b0] font-serif books-library-theme" style={{
                backgroundImage: 'linear-gradient(rgba(46, 29, 21, 0.95), rgba(46, 29, 21, 0.95)), url("https://images.unsplash.com/photo-1507842217121-9e93c8aaf27c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80")',
                backgroundSize: 'cover',
                backgroundAttachment: 'fixed'
            }}>
                {/* Header */}
                <header className="bg-black/30 backdrop-blur-md sticky top-0 z-40 border-b border-[#5c4033]">
                    <div className="container mx-auto px-6 py-4 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <Link href="/dashboard" className="text-[#d4c5b0]/70 hover:text-[#d4c5b0] transition-colors">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                            </Link>
                            <div>
                                <h1 className="text-2xl font-bold tracking-wider text-[#e6dccf] font-serif">My Library</h1>
                            </div>
                        </div>
                        <Button
                            onClick={() => setShowUpload(!showUpload)}
                            className="bg-[#8b4513] hover:bg-[#6f370f] text-[#e6dccf] border-none shadow-lg transition-all transform hover:scale-105"
                        >
                            {showUpload ? 'Cancel' : 'Add Book +'}
                        </Button>
                    </div>
                </header>

                <main className="container mx-auto px-6 py-8">

                    {/* Upload Section */}
                    {showUpload && (
                        <div className="mb-10 animate-fade-in">
                            <div className="bg-[#1a110d]/80 backdrop-blur-md p-8 rounded-xl border border-[#5c4033] shadow-2xl max-w-2xl mx-auto">
                                <h3 className="text-xl text-[#e6dccf] mb-6 border-b border-[#5c4033] pb-2">Add to Collection</h3>
                                <form onSubmit={handleUpload} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1 text-[#d4c5b0]/80">Book File (.epub, .json)</label>
                                        <input
                                            type="file"
                                            className="w-full p-2 bg-[#2e1d15] border border-[#5c4033] rounded text-[#d4c5b0] focus:ring-1 focus:ring-[#8b4513]"
                                            accept=".epub,.json"
                                            onChange={handleFileChange}
                                            required
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-[#d4c5b0]/80">Title</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 bg-[#2e1d15] border border-[#5c4033] rounded text-[#d4c5b0] focus:ring-1 focus:ring-[#8b4513]"
                                                placeholder="Auto-detected if empty"
                                                value={title}
                                                onChange={e => setTitle(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1 text-[#d4c5b0]/80">Description</label>
                                        <textarea
                                            className="w-full p-2 bg-[#2e1d15] border border-[#5c4033] rounded text-[#d4c5b0] focus:ring-1 focus:ring-[#8b4513]"
                                            rows={2}
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                        />
                                    </div>
                                    <div className="pt-2">
                                        <Button
                                            type="submit"
                                            disabled={uploading}
                                            className="w-full bg-[#5c4033] hover:bg-[#4a332a] text-[#e6dccf]"
                                        >
                                            {uploading ? 'Processing...' : 'Upload to Library'}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* Books Grid */}
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-pulse text-[#8b4513] text-xl">Loading your collection...</div>
                        </div>
                    ) : books.length === 0 ? (
                        <div className="text-center py-20 text-[#d4c5b0]/50">
                            <div className="text-6xl mb-4 text-[#5c4033]">📖</div>
                            <h3 className="text-xl mb-2">Your library is empty</h3>
                            <p>Upload an EPUB or JSON book to get started.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
                            {books.map((book) => (
                                <div
                                    key={book.id}
                                    className="group relative perspective-1000 cursor-pointer"
                                    onClick={() => router.push(`/books/${book.id}/read`)}
                                >
                                    <div
                                        className="relative w-full aspect-[2/3] rounded-r-lg shadow-xl transition-transform duration-300 group-hover:transform group-hover:-translate-y-2 group-hover:rotate-y-[-10deg] lg:group-hover:rotate-y-[-15deg] origin-left bg-[#1a110d]"
                                        title={book.description || book.title}
                                    >
                                        {/* Book Spine Effect */}
                                        <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-[#5c4033] to-[#3e2b22] z-10 rounded-l-sm"></div>

                                        {/* Cover Image or Fallback */}
                                        {book.cover ? (
                                            <div className="absolute inset-0 pl-3 overflow-hidden rounded-r-lg">
                                                <img
                                                    src={book.cover}
                                                    alt={book.title}
                                                    className="w-full h-full object-cover"
                                                    loading="lazy"
                                                />
                                            </div>
                                        ) : (
                                            <div className="absolute inset-0 pl-3 bg-[#3e2b22] flex flex-col items-center justify-center p-4 text-center rounded-r-lg border-l border-[#5c4033]">
                                                <h4 className="font-serif font-bold text-[#e6dccf] line-clamp-3">{book.title}</h4>
                                                <div className="w-full h-[1px] bg-[#d4c5b0]/20 my-3"></div>
                                                <p className="text-xs text-[#d4c5b0]/60 line-clamp-2">{book.description || 'No description'}</p>
                                            </div>
                                        )}

                                        {/* Overlay gradient for depth */}
                                        <div className="absolute inset-0 pl-3 bg-gradient-to-r from-black/40 to-transparent pointer-events-none rounded-r-lg"></div>

                                        {/* Action Buttons - Moved inside for better transform handling */}
                                        <div className="absolute top-2 right-2 flex flex-col gap-2 z-50">
                                            {/* Read button removed as clickable card does the same, keep delete */}
                                            <button
                                                onClick={(e) => deleteBook(e, book.id)}
                                                className="p-2 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg backdrop-blur-sm transition-transform hover:scale-110"
                                                title="Delete"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Shelf Shadow */}
                                    <div className="mt-4 text-center">
                                        <h5 className="font-medium text-[#e6dccf] truncate text-sm px-1">{book.title}</h5>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </ProtectedRoute>
    );
}
