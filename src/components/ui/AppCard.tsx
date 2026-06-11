'use client';

import { Typography } from '@/components/ui/Typography';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { AppWindow } from 'lucide-react';

interface AppCardProps {
    name: string;
    description: string;
    image: string;
    onClick?: () => void;
}

import Image from 'next/image';

export default function AppCard({ name, description, image, onClick }: AppCardProps) {
    return (
        <Card 
            className="group cursor-pointer overflow-hidden bg-secondary border border-border hover:border-accent/40 hover:-translate-y-1 transition-all duration-base ease-stitch h-full flex flex-col w-full"
            onClick={onClick}
        >
            <div className="relative w-full h-40 md:h-48 overflow-hidden flex flex-col items-center justify-center transition-all duration-base ease-stitch group-hover:bg-primary/5">
                {image ? (
                    <Image
                        src={image}
                        alt={name}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 15vw"
                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                ) : (
                    <AppWindow className="h-12 w-12 text-text-muted transition-all duration-500 group-hover:text-primary group-hover:scale-125 animate-pulse" />
                )}
                
                {/* Subtle overlay on hover */}
                <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-premium" />
            </div>

            <CardContent className="p-space-4 flex flex-col flex-1">
                <Typography variant="small" className="font-bold text-text-primary mb-space-1 line-clamp-1 group-hover:text-primary transition-premium">
                    {name}
                </Typography>
                <Typography variant="caption" className="text-text-secondary line-clamp-2 min-h-[32px]">
                    {description}
                </Typography>
            </CardContent>
        </Card>
    );
}
