import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AdminProviders from '@/components/providers/AdminProviders';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'DeliveryHub Admin',
  description: 'Enterprise Logistics Administration Portal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="bg-secondary-50 min-h-screen">
        <AdminProviders>{children}</AdminProviders>
      </body>
    </html>
  );
}