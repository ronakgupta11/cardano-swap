"use client"

import { useEffect } from "react"
import { useNetwork } from "@meshsdk/react"

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const network = useNetwork()

  useEffect(() => {
    console.log('Current network:', network)
  }, [network])

  return <>{children}</>
}
