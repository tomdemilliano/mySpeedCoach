/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  // Explicitly exclude API routes from the service worker
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [],
});

const nextConfig = {};

module.exports = withPWA(nextConfig);
