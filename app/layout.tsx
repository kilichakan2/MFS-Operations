import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Inter } from 'next/font/google'
import './globals.css'
import { LanguageProvider } from '@/lib/LanguageContext'
import PwaGuard from '@/components/PwaGuard'

// Display font (Adieu) — self-hosted, owns the --font-display variable.
const adieu = localFont({
  src: [
    { path: '../public/fonts/adieu/Adieu-Light.otf', weight: '300', style: 'normal' },
    { path: '../public/fonts/adieu/Adieu-Regular.otf', weight: '400', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
  fallback: ['Inter', 'system-ui', 'sans-serif'],
})

// Body font (Inter) — owns the --font-text variable.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-text',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'MFS Operations',
  description: 'MFS Global Ltd — Internal Operations App',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-16.png',  sizes: '16x16',  type: 'image/png' },
      { url: '/icons/icon-32.png',  sizes: '32x32',  type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    shortcut: '/favicon.ico',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${adieu.variable} ${inter.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#16205B" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body><PwaGuard /><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  )
}
