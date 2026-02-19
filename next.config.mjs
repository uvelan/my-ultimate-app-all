/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    serverExternalPackages: ['@prisma/client', 'sharp', 'bcryptjs'],
    // Exclude specific heavy files from being bundled in the function
    outputFileTracingExcludes: {
        '*': [
            'node_modules/@swc/core-linux-x64-gnu',
            'node_modules/@swc/core-linux-x64-musl',
            'node_modules/@esbuild/linux-x64',
        ],
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
    },
    // Increase body size limit for API routes if needed, though unrelated to payload size
};

export default nextConfig;
