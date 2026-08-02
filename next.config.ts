import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["markitdown-js"],
  // Video-recording branch: no dev badge/toasts in captured frames.
  devIndicators: false,
};

export default nextConfig;
