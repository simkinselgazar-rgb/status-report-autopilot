import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // react-pdf has dynamic requires + bundled fonts, keep it a runtime import.
  serverExternalPackages: ['@react-pdf/renderer'],
};

export default config;
