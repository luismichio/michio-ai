import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: process.env.STATIC_EXPORT ? 'export' : undefined,
    images: {
        unoptimized: true,
    },
    // TensorFlow.js works out of the box with Next.js/Turbopack
};

export default nextConfig;
