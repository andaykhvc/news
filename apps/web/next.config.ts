import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@sak/domain', '@sak/validation'],
  poweredByHeader: false,
};

export default config;
