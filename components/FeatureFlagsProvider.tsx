'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface FeatureFlags {
  invoicesEnabled: boolean
}

const FeatureFlagsContext = createContext<FeatureFlags>({ invoicesEnabled: true })

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext)
}

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>({ invoicesEnabled: true })

  useEffect(() => {
    supabase
      .from('feature_flags')
      .select('key, enabled')
      .then(({ data }) => {
        if (!data) return
        const invoices = data.find((r: { key: string; enabled: boolean }) => r.key === 'invoices')
        if (invoices != null) {
          setFlags({ invoicesEnabled: invoices.enabled })
        }
      })
  }, [])

  return (
    <FeatureFlagsContext.Provider value={flags}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}
