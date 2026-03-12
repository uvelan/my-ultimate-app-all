'use client';

import { useRouter } from 'next/navigation';
import { BookOpen, Headphones, Download, Trash2 } from 'lucide-react';
import { Typography } from '@/components/ui/Typography';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface Book {
    id: string;
    title: string;
    description: string;
    cover?: string;
    chapterId?: number;
    _count?: { chapters: number };
}

interface BookCardProps {
    book: Book;
    onDelete: (e: React.MouseEvent, id: string) => void;
    showProgress?: boolean;
}

import Image from 'next/image';

export default function BookCard({ book, onDelete, showProgress = true }: BookCardProps) {
    const router = useRouter();
    const progress = book._count?.chapters ? Math.round(((book.chapterId || 0) / book._count.chapters) * 100) : 0;

    return (
        <div className="group flex flex-col h-full">
            <div 
                className="relative aspect-[2/3] w-full rounded-radius-md overflow-hidden bg-background-muted shadow-shadow-md group-hover:shadow-shadow-xl transition-all duration-500 cursor-pointer"
                onClick={() => router.push(`/books/${book.id}/read`)}
            >
                {/* Spine Depth Effect */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/20 z-10" />
                
                {book.cover ? (
                    <Image 
                        src={book.cover} 
                        alt={book.title || "Book Cover"}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 15vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-500" 
                    />
                ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center p-space-6 text-center bg-gradient-to-br from-background-muted to-background-surface">
                        <Typography variant="small" className="font-bold text-text-primary line-clamp-4 font-serif">
                            {book.title}
                        </Typography>
                        <div className="w-8 h-1 bg-primary/20 my-space-4" />
                        <Typography variant="caption" className="text-text-muted line-clamp-3">
                            {book.description || 'Untitled Collection'}
                        </Typography>
                    </div>
                )}

                {/* Action Overlays */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-space-3 z-30">
                    <Button 
                        size="sm" 
                        className="w-32 gap-space-2 bg-white text-black hover:bg-white/90"
                        onClick={(e) => { e.stopPropagation(); router.push(`/books/${book.id}/read`); }}
                    >
                        <BookOpen size={14} /> Read
                    </Button>
                    <Button 
                        size="sm" 
                        variant="secondary"
                        className="w-32 gap-space-2"
                        onClick={(e) => { e.stopPropagation(); router.push(`/books/${book.id}/listen`); }}
                    >
                        <Headphones size={14} /> Listen
                    </Button>
                    
                    <div className="absolute top-space-2 right-space-2 flex gap-space-2">
                        <button 
                            onClick={(e) => { e.stopPropagation(); window.open(`/api/books/${book.id}/download`, '_blank'); }}
                            className="p-space-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors"
                            title="Download"
                        >
                            <Download size={14} />
                        </button>
                        <button 
                            onClick={(e) => onDelete(e, book.id)}
                            className="p-space-2 bg-error/10 hover:bg-error/20 text-error-foreground rounded-full backdrop-blur-md transition-colors"
                            title="Delete"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="mt-space-4 flex-1">
                <Typography 
                    variant="small" 
                    className="font-semibold text-text-primary truncate block hover:text-primary transition-colors cursor-pointer" 
                    onClick={() => router.push(`/books/${book.id}/read`)}
                >
                    {book.title}
                </Typography>
                
                {showProgress && book._count?.chapters !== undefined && book._count.chapters > 0 && (
                    <div className="mt-space-2">
                        <div className="flex justify-between items-center mb-space-1">
                            <Typography variant="caption" className="text-text-muted">
                                Progress
                            </Typography>
                            <Typography variant="caption" className="text-text-primary font-medium">
                                {progress}%
                            </Typography>
                        </div>
                        <div className="w-full bg-background-muted rounded-full h-1 overflow-hidden">
                            <div 
                                className="bg-primary h-full transition-all duration-500" 
                                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} 
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
