/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      Object.defineProperty(config, 'devtool', {
        get() {
          return 'source-map';
        },
        set() {},
      });
    }
    return config;
  },
  async headers() {
    const cspDev = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "connect-src 'self' ws: http://localhost:* https://*",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
    ].join('; ')

    const cspProd = [
      "default-src 'self'",
      "script-src 'self'",
      "connect-src 'self' https://*",
      "img-src 'self' data: blob:",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: isDev ? cspDev : cspProd,
          },
        ],
      },
    ]
  },
}

export default nextConfig;
