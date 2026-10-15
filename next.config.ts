import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // File uploads (financial statements, review attachments) go through
      // server actions. Vercel refuses request bodies over 4.5 MB, so files
      // are capped at 4 MB (MAX_FILE_SIZE_BYTES) with room for form overhead.
      bodySizeLimit: "4.4mb",
    },
  },
};

export default nextConfig;
