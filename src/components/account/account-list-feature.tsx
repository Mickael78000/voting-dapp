'use client'

import { useWallet } from '@solana/wallet-adapter-react'

import { redirect } from 'next/navigation'
import { ClientOnlyWalletButton } from '../solana/solana-provider'

export default function AccountListFeature() {
  const { publicKey } = useWallet()

  if (publicKey) {
    return redirect(`/account/${publicKey.toString()}`)
  }

  return (
    <div className="hero py-[64px]">
      <div className="hero-content text-center">
        <ClientOnlyWalletButton />
      </div>
    </div>
  )
}
