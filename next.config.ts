import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  env: {
    AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_RESOURCE_NAME: process.env.AZURE_OPENAI_RESOURCE_NAME
  },
  // Mark pdfjs-dist as an external package to avoid bundling issues
  serverExternalPackages: ['pdfjs-dist'],
  // Add webpack configuration to handle PDF.js properly
  webpack: (config, { isServer }) => {
    // This is necessary for PDF.js worker to function correctly
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'pdfjs-dist': 'pdfjs-dist/legacy/build/pdf',
      };
    }
    return config;
  },
};

export default nextConfig;
