/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@pbh/domain",
    "@pbh/contracts",
    "@pbh/application",
    "@pbh/repositories",
    "@pbh/model-gateway",
    "@pbh/agent-runtime",
    "@pbh/security",
    "@pbh/observability",
    "@pbh/content-guidelines",
  ],
};

export default nextConfig;
