import type { Metadata } from 'next'
import Header from '@/components/Header'
import { FeatureFlagsProvider } from '@/components/FeatureFlagsProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'JOracle by Algorithma',
  description: 'Revenue forecasting and P&L allocation',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F9F9F8] antialiased">
        <FeatureFlagsProvider>
          <Header />
          <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
        </FeatureFlagsProvider>
      </body>
    </html>
  )
}
