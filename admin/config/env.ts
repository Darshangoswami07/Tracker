/**
 * DeliveryHub Admin Portal Configuration
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DeliveryHub Admin',
  description: 'Enterprise Logistics Administration Portal',
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Admin-specific environment variables
interface AdminEnv {
  // Backend API
  NEXT_PUBLIC_API_URL: string;
  // Admin authentication
  NEXT_PUBLIC_ADMIN_EMAIL?: string;
  // Security
  NEXT_PUBLIC_ENCRYPTION_KEY: string;
  // Feature flags
  NEXT_PUBLIC_ENABLE_FEATURES?: string;
}

// Environment variables
const env: AdminEnv = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  NEXT_PUBLIC_ADMIN_EMAIL: process.env.NEXT_PUBLIC_ADMIN_EMAIL,
  NEXT_PUBLIC_ENCRYPTION_KEY: process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-secret-key',
  NEXT_PUBLIC_ENABLE_FEATURES: process.env.NEXT_PUBLIC_ENABLE_FEATURES || 'qr,notifications,analytics',
};

export default env;