import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VDCD Húp - Đóng dấu ảnh & video thời gian & địa điểm chuẩn Timemark',
  description:
    'Ứng dụng đóng dấu ngày giờ, toạ độ GPS, địa chỉ chuẩn Timemark lên ảnh và video trực tiếp trên trình duyệt.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VDCD Húp',
  },
  openGraph: {
    title: 'VDCD Húp - Đóng dấu ảnh & video chuẩn Timemark',
    description:
      'Đóng dấu ngày giờ, toạ độ, địa chỉ chuẩn Timemark lên ảnh và video trực tiếp trên trình duyệt.',
    type: 'website',
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
