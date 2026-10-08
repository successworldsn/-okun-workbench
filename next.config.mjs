/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ship the committed public infrastructure feed with the Capital Desk route.
  outputFileTracingIncludes: { "/capital/command": ["./data/public/**/*"] },
};

export default nextConfig;
