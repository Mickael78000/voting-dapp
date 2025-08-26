'use client'

import { useState, useEffect } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useVoteGet, useVotePost, UIPoll } from './votingdapp-data-access'
import {
  VersionedTransaction,
  VersionedMessage
} from '@solana/web3.js'

interface D21VotingUIProps {
  pollId?: number
}

function getTopicDescription(name: string): string {
  const [candidate, topic] = name.split(' - ')
  if (!topic) return name
  
  const descriptions: { [key: string]: string } = {
    Education: 'Funding for schools, universities, and educational programs',
    Security: 'Public safety, law enforcement, and national defense policies',
    Healthcare: 'Medical services, insurance, and public health initiatives',
    Defense: 'Military spending, veteran affairs, and border security',
    Taxes: 'Tax policy, rates, and government revenue strategies',
  }
  
  return descriptions[topic] || `${candidate}'s position on ${topic.toLowerCase()}`
}

export default function D21VotingUI({ pollId = 1 }: D21VotingUIProps) {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [selectedPlus, setSelectedPlus] = useState<string[]>([])
  const [selectedMinus, setSelectedMinus] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data, isLoading, error: fetchError, refetch } = useVoteGet(pollId)
  const votePost = useVotePost()
  const poll: UIPoll | null = data?.poll || null

  useEffect(() => {
    setError(null)
    setSuccess(null)
    setSelectedPlus([])
    setSelectedMinus([])
  }, [pollId])

  const handlePlusVote = (key: string) => {
    setError(null)
    setSelectedPlus(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : prev.length < (poll?.plusVotesAllowed || 0)
        ? [...prev, key]
        : prev
    )
  }

  const handleMinusVote = (key: string) => {
    setError(null)
    setSelectedMinus(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : prev.length < (poll?.minusVotesAllowed || 0)
        ? [...prev, key]
        : prev
    )
  }

  const handleSubmit = async () => {
    if (!wallet.publicKey) {
      setError('Please connect your wallet')
      return
    }
    if (!poll) {
      setError('Poll data not available')
      return
    }
    if (selectedPlus.length === 0) {
      setError('At least one positive vote is required')
      return
    }
    if (selectedMinus.length > 0 && selectedPlus.length < 2) {
      setError('At least 2 positive votes required for negative votes')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // 1. Request unsigned versioned transaction from backend
      const result = await votePost.mutateAsync({
        pollId: poll.id,
        account: wallet.publicKey.toString(),
        plus: selectedPlus,
        minus: selectedMinus
      })
      const txBase64 = (result as any).transaction
      if (!txBase64) throw new Error('No transaction returned')

      // 2. Deserialize versioned message
      const msgBuffer = Buffer.from(txBase64, 'base64')
      const message = VersionedMessage.deserialize(msgBuffer)

      // 3. Build VersionedTransaction
      const versionedTx = new VersionedTransaction(message)

      // 4. Sign with wallet
      const signedTx = await wallet.signTransaction(versionedTx)

      // 5. Send and confirm
      const txid = await connection.sendRawTransaction(signedTx.serialize())
      await connection.confirmTransaction(txid, 'confirmed')

      setSuccess(`Vote sent! Signature: ${txid}`)
      setSelectedPlus([])
      setSelectedMinus([])
      refetch()
    } catch (err: any) {
      setError(err.message || 'Submission failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reset selections
  const handleReset = () => {
    setSelectedPlus([])
    setSelectedMinus([])
    setError(null)
    setSuccess(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-lg">Loading voting interface...</div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="p-6 bg-red-50 rounded-lg">
        <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Poll</h3>
        <p className="text-red-600">{fetchError.message}</p>
        <button 
          onClick={() => refetch()} 
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!wallet.publicKey) {
    return (
      <div className="text-center p-8">
        <div className="mb-4 text-xl font-semibold">
          Connect your Solana wallet to participate in the voting process
        </div>
      </div>
    )
  }

  if (!poll) {
    return (
      <div className="p-6 bg-yellow-50 rounded-lg">
        <h3 className="text-lg font-semibold text-yellow-800 mb-2">Poll Not Available</h3>
        <p className="text-yellow-600">
          Initialize the on-chain demo poll and candidates to submit real votes.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {poll.name || 'D21 Voting System'}
        </h2>

        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Voting Rules</h3>
          <ul className="text-blue-800 text-sm space-y-1">
            <li> Cast up to {poll.plusVotesAllowed} positive votes</li>
            <li> Cast up to {poll.minusVotesAllowed} negative votes (optional)</li>
            <li> At least 2 positive votes required to cast negative votes</li>
            <li> Your vote will be submitted to the Solana blockchain</li>
          </ul>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-600">{success}</p>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-gray-900">Candidates</h3>
          
          {poll.candidates.map((candidate) => (
            <div key={candidate.publicKey} className="border rounded-lg p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-lg font-medium text-gray-900">{candidate.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {getTopicDescription(candidate.name)}
                  </p>
                  <p className="text-xs text-gray-400 mt-2 font-mono">
                    {candidate.publicKey}
                  </p>
                </div>
                
                <div className="flex space-x-3">
                  <button
                    onClick={() => handlePlusVote(candidate.publicKey)}
                    disabled={isSubmitting}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      selectedPlus.includes(candidate.publicKey)
                        ? 'bg-green-600 text-white'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    } disabled:opacity-50`}
                  >
                    👍 Support ({selectedPlus.includes(candidate.publicKey) ? '✓' : '+'})
                  </button>
                  
                  <button
                    onClick={() => handleMinusVote(candidate.publicKey)}
                    disabled={isSubmitting}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      selectedMinus.includes(candidate.publicKey)
                        ? 'bg-red-600 text-white'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    } disabled:opacity-50`}
                  >
                    👎 Oppose ({selectedMinus.includes(candidate.publicKey) ? '✓' : '-'})
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-lg font-semibold text-gray-900 mb-2">Your Selection</h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h5 className="font-medium text-green-700">Positive Votes ({selectedPlus.length}/{poll.plusVotesAllowed}):</h5>
              {selectedPlus.length === 0 ? (
                <p className="text-sm text-gray-500">None selected</p>
              ) : (
                <ul className="text-sm text-green-600 mt-1">
                  {selectedPlus.map(key => {
                    const candidate = poll.candidates.find(c => c.publicKey === key)
                    return <li key={key}>• {candidate?.name}</li>
                  })}
                </ul>
              )}
            </div>
            
            <div>
              <h5 className="font-medium text-red-700">Negative Votes ({selectedMinus.length}/{poll.minusVotesAllowed}):</h5>
              {selectedMinus.length === 0 ? (
                <p className="text-sm text-gray-500">None selected</p>
              ) : (
                <ul className="text-sm text-red-600 mt-1">
                  {selectedMinus.map(key => {
                    const candidate = poll.candidates.find(c => c.publicKey === key)
                    return <li key={key}>• {candidate?.name}</li>
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex space-x-4">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || selectedPlus.length === 0}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Vote'}
          </button>
          
          <button
            onClick={handleReset}
            disabled={isSubmitting}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}