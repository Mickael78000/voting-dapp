'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { WalletButton } from '../solana/solana-provider'
import { AppHero } from '../ui/ui-layout'
import D21VotingUI from './votingdapp-ui'

export default function VotingdappFeature() {
  const { publicKey } = useWallet()

  return publicKey ? (
    <div>
      <AppHero
        title="D21 Voting System"
        subtitle="Cast your votes according to D21 rules. Connect your wallet, review candidates, and submit your ballot."
      >
        <div className="mt-4" />
      </AppHero>
      <D21VotingUI />
    </div>
  ) : (
    <div className="max-w-4xl mx-auto">
      <div className="hero py-[64px]">
        <div className="hero-content text-center">
          <WalletButton />
        </div>
      </div>
    </div>
  )
}
