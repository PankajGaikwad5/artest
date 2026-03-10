/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Required for WebXR camera access
          { key: 'Permissions-Policy', value: 'camera=*, xr-spatial-tracking=*' },
          // Required for SharedArrayBuffer used by some AR libs
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      // Allow GLB files to be served with correct MIME type
      {
        source: '/(.*.glb)',
        headers: [
          { key: 'Content-Type', value: 'model/gltf-binary' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
