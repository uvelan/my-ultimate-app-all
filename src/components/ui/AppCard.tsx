'use client';

import Image from 'next/image';

interface AppCardProps {
    name: string;
    description: string;
    image: string;
    onClick?: () => void;
}

export default function AppCard({ name, description, image, onClick }: AppCardProps) {
    return (
        <div className="bg-white rounded-2xl p-3 shadow-sm hover:shadow-md transition-shadow duration-300 w-full flex flex-col h-full">
            <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-gray-100">
                {/* Fallback pattern if image fails or for mock */}
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-300">
                    <span className="text-3xl">📱</span>
                </div>
                {/* Once we have real images, we'd use Next.js Image here with a valid src */}
                {image && (
                    <img
                        src={image}
                        alt={name}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                            // Hide broken image icon
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                )}
            </div>

            <h3 className="text-sm font-bold text-gray-800 mb-1 line-clamp-1 truncate" title={name}>
                {name}
            </h3>

            <p className="text-xs text-gray-500 mb-3 line-clamp-2 min-h-[32px]" title={description}>
                {description}
            </p>
        </div>
    );
}
