import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Needed by the Dockerfile (node server.js); harmless on Vercel.
  output: "standalone",
};

export default nextConfig;
