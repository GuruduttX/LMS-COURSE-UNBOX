import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    Development only: lets the dev server be opened at dev.courseunbox.com:3000
    (an /etc/hosts alias for 127.0.0.1) as well as localhost. Bunny's Allowed
    Domains ignores `localhost`, so lesson videos only play locally when the
    page is served from a real-looking domain on that list.
  */
  allowedDevOrigins: ["dev.courseunbox.com"],
  /*
    Hostinger's build container has a low thread/process limit; spawning one
    worker per host CPU fails with EAGAIN during "Collecting page data".
  */
  experimental: {
    cpus: 1,
    workerThreads: false,
    staticGenerationMaxConcurrency: 2,
  },
};

export default nextConfig;
