import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Timemark — Photo Timestamp & Logo Remover',
  description: 'Add authentic Timemark timestamps and remove AI watermarks directly in your browser. 100% client-side privacy.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Timemark',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="dark h-full">
      <body className="h-full bg-editor-bg text-white antialiased overflow-hidden select-none">
        {children}
      </body>
    </html>
  );
}
