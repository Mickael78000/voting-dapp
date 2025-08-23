'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { WalletButton } from '../solana/solana-provider'

interface Candidate {
  publicKey: string
  name: string
}

interface Poll {
  id: number
  name: string
  plusVotesAllowed: number
  minusVotesAllowed: number
  candidates: Candidate[]
}

export default function D21VotingUI({ pollId }: { pollId: number }) {
  const { publicKey } = useWallet()
  const [poll, setPoll] = useState<Poll | null>(null)
  const [loading, setLoading] = useState(true)
  const [plusVotes, setPlusVotes] = useState<string[]>([])
  const [minusVotes, setMinusVotes] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPoll() {
      try {
        const response = await fetch(`/api/polls/${pollId}`)
        if (!response.ok) {
          throw new Error('Failed to fetch poll data')
        }
        const data = await response.json()
        setPoll(data)
      } catch (err) {
        setError('Failed to load poll data')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchPoll()
  }, [pollId])

  const handlePlusVote = (candidateKey: string) => {
    if (plusVotes.includes(candidateKey)) {
      setPlusVotes(plusVotes.filter(key => key !== candidateKey))
    } else if (plusVotes.length < poll?.plusVotesAllowed) {
      setPlusVotes([...plusVotes, candidateKey])
    } else {
      setError(`You can only cast ${poll?.plusVotesAllowed} positive votes`)
    }
  }

  const handleMinusVote = (candidateKey: string) => {
    if (minusVotes.includes(candidateKey)) {
      setMinusVotes(minusVotes.filter(key => key !== candidateKey))
    } else if (minusVotes.length < poll?.minusVotesAllowed) {
      setMinusVotes([...minusVotes, candidateKey])
    } else {
      setError(`You can only cast ${poll?.minusVotesAllowed} negative votes`)
    }
  }

  const handleSubmit = async () => {
    if (!publicKey) {
      setError('Please connect your wallet first')
      return
    }

    if (plusVotes.length === 0) {
      setError('You must cast at least one positive vote')
      return
    }

    if (minusVotes.length > 0 && plusVotes.length < 2) {
      setError('You need at least 2 positive votes to cast any negative votes')
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const plusAllocations = plusVotes.map(candidate => ({
        candidate,
        votes: 1
      }))

      const minusAllocations = minusVotes.map(candidate => ({
        candidate,
        votes: 1
      }))

      const response = await fetch(`/api/vote?pollId=${pollId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account: publicKey.toString(),
          plusAllocations,
          minusAllocations
        }),
      })

      if (!response.ok) {
        const errorData = await response.text()
        throw new Error(errorData || 'Failed to submit vote')
      }

      setSuccess('Your vote has been submitted successfully!')
      // Reset votes after successful submission
      setPlusVotes([])
      setMinusVotes([])
    } catch (err) {
      setError(err.message || 'Failed to submit vote')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-center py-10">Loading poll data...</div>
  }

  if (!poll) {
    return <div className="text-center py-10">Poll not found</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">{poll.name}</h1>
      
      <div className="mb-6">
        <p className="text-lg mb-2">D21 Voting Rules:</p>
        <ul className="list-disc pl-5">
          <li>You can cast up to {poll.plusVotesAllowed} positive votes</li>
          <li>You can cast up to {poll.minusVotesAllowed} negative votes</li>
          <li>To cast any negative votes, you must cast at least 2 positive votes</li>
        </ul>
      </div>

      {!publicKey ? (
        <div className="text-center py-6">
          <p className="mb-4">Connect your wallet to vote</p>
          <WalletButton />
        </div>
      ) : (
        <>
          {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
          {success && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">{success}</div>}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h2 className="text-xl font-semibold mb-3">Positive Votes ({plusVotes.length}/{poll.plusVotesAllowed})</h2>
                            <ul className="space-y-2">
                {poll.candidates.map((candidate) => (
                  <li key={candidate.publicKey} className="flex items-center">
                    <button
                      onClick={() => handlePlusVote(candidate.publicKey)}
                      className={`flex-1 p-3 border rounded-lg ${
                        plusVotes.includes(candidate.publicKey)
                          ? 'bg-green-100 border-green-500'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span>{candidate.name}</span>
                        {plusVotes.includes(candidate.publicKey) && (
                          <span className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                            +
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h2 className="text-xl font-semibold mb-3">Negative Votes ({minusVotes.length}/{poll.minusVotesAllowed})</h2>
              <ul className="space-y-2">
                {poll.candidates.map((candidate) => (
                  <li key={candidate.publicKey} className="flex items-center">
                    <button
                      onClick={() => handleMinusVote(candidate.publicKey)}
                      disabled={plusVotes.length < 2}
                      className={`flex-1 p-3 border rounded-lg ${
                        minusVotes.includes(candidate.publicKey)
                          ? 'bg-red-100 border-red-500'
                          : plusVotes.length < 2
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span>{candidate.name}</span>
                        {minusVotes.includes(candidate.publicKey) && (
                          <span className="bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                            -
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="mt-8 text-center">
            <button
              onClick={handleSubmit}
              disabled={submitting || plusVotes.length === 0}
              className={`px-6 py-3 rounded-lg font-medium ${
                submitting || plusVotes.length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {submitting ? 'Submitting...' : 'Submit Vote'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}