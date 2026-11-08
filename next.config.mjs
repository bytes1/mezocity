/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
  experimental: {
    optimizePackageImports: [
      'wagmi',
      'viem',
      'lucide-react',
    ],
  },
  webpack: (config) => {
    if (config.output) {
      config.output.chunkLoadTimeout = 300000;
    }
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      '@x402/core/client': false,
      '@x402/evm': false,
      '@x402/evm/exact/client': false,
      '@x402/evm/upto/client': false,
      '@x402/svm/exact/client': false,
    };
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /ox[\\/]_esm[\\/]tempo[\\/]internal[\\/]virtualMasterPool\.js/ },
    ];
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/.well-known/agent-card.json',
        destination: '/api/agent-card',
      },
      {
        source: '/mcp',
        destination: '/api/mcp',
      },
    ];
  },
};

export default nextConfig;

