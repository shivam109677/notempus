const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.5:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  allowedDevOrigins,
};

module.exports = nextConfig;
