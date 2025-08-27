'use client'

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { ClientOnlyWalletButton } from '../solana/solana-provider'
import { AppHero } from '../ui/ui-layout'
import D21VotingUI from './votingdapp-ui'

export default function VotingdappFeature() {
  const { publicKey } = useWallet()
  const [selectedPollId, setSelectedPollId] = useState<number>(1)

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#9fbbc9' }}>
      <AppHero
        title="D21 Voting System"
        subtitle="Participate in democratic voting using the D21 method on the Solana blockchain"
      />
      
      {!publicKey ? (
        <div className="max-w-4xl mx-auto p-6">
          <div className="text-center bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Connect Your Wallet
            </h2>
            <p className="text-gray-600 mb-6">
              To participate in voting, you need to connect your Solana wallet.
            </p>
            <ClientOnlyWalletButton />
            
            <div className="mt-8 text-left">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">About D21 Voting</h3>
              <div className="space-y-3 text-gray-600">
                <p>
                  The D21 voting system allows you to cast both positive and negative votes,
                  giving you more nuanced control over election outcomes.
                </p>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">How it works:</h4>
                  <ul className="text-blue-800 space-y-1 text-sm">
                    <li> Cast positive votes for candidates you support</li>
                    <li> Optionally cast negative votes for candidates you oppose</li>
                    <li> You need at least 2 positive votes to cast any negative votes</li>
                    <li> All votes are recorded on the Solana blockchain for transparency</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="max-w-4xl mx-auto p-6 mb-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Select Poll
              </h3>
              <div className="flex items-center space-x-4">
                <label htmlFor="poll-select" className="text-sm font-medium text-gray-700">
                  Poll ID:
                </label>
                <select
                  id="poll-select"
                  value={selectedPollId}
                  onChange={(e) => setSelectedPollId(Number(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={1}>Poll 1 - Alice vs Bob Policy</option>
                  <option value={2}>Poll 2 - Convictions</option>
                  <option value={3}>Poll 3</option>
                  <option value={4}>Poll 4</option>
                  <option value={5}>Poll 5</option>
                </select>
                <div className="text-sm text-gray-500">
                  Connected: {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="text-sm font-semibold text-yellow-800 mb-1">Note:</h4>
                <p className="text-xs text-yellow-700">
                  Poll 1 runs in demo mode with hardcoded candidates. Other polls require on-chain initialization.
                  Demo votes don't require blockchain transactions.
                </p>
              </div>
            </div>
          </div>

          <D21VotingUI pollId={selectedPollId} />
          
          <div className="max-w-4xl mx-auto p-6 mt-6">
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Voting Information
              </h3>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">Your Wallet</h4>
                  <p className="text-sm text-gray-600 font-mono break-all">
                    {publicKey.toString()}
                  </p>
                </div>
                
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">Transaction Info</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Network: Solana Devnet</p>
                    <p>Program: HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx</p>
                    <p>Status: {selectedPollId === 1 ? 'Demo Mode' : 'Blockchain Mode'}</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <h4 className="font-semibold text-gray-800 mb-2">Security & Privacy</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>• Your votes are recorded on the blockchain and cannot be changed</p>
                  <p>• Each wallet can only vote once per poll</p>
                  <p>• All transactions require your wallet approval</p>
                  <p>• Vote data is public but wallet identity remains pseudonymous</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}