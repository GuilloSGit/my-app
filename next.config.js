/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: isProd ? 'export' : undefined,
  distDir: isProd ? 'dist' : '.next',
  basePath: isProd ? '/my-app' : '',
  assetPrefix: isProd ? '/my-app/' : '',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

module.exports = nextConfig;
