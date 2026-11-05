/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
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

