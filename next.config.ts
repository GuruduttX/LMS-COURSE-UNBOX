import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    Development only: lets the dev server be opened at dev.courseunbox.com:3000
    (an /etc/hosts alias for 127.0.0.1) as well as localhost. Bunny's Allowed
    Domains ignores `localhost`, so lesson videos only play locally when the
    page is served from a real-looking domain on that list.
  */
  allowedDevOrigins: ["dev.courseunbox.com"],
};

export default nextConfig;
