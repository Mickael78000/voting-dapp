'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
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

interface VoteAllocation {
  candidate: string
  votes: number
}

export default function D21VotingUI() {
  const { publicKey, connect, disconnect, connected, connecting } = useWallet()
  const [poll, setPoll] = useState<Poll | null>(null)
  const [loading, setLoading] = useState(true)
  const [plusVotes, setPlusVotes] = useState<string[]>([])
  const [minusVotes, setMinusVotes] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Derived limits
  const totalAllowed = (poll?.plusVotesAllowed || 0) + (poll?.minusVotesAllowed || 0)

  useEffect(() => {
    async function fetchPoll() {
      try {
        // Fetch the action response from /api/vote
        const response = await fetch(`/api/vote`)
        if (!response.ok) {
          throw new Error('Failed to fetch poll data')
        }
        const data: any = await response.json()

        // Parse pollId from action href like /api/vote?pollId=123
        const href: string | undefined = data?.links?.actions?.[0]?.href
        const queryString = href && href.includes('?') ? href.substring(href.indexOf('?') + 1) : ''
        const params = new URLSearchParams(queryString)
        const parsedPollId = Number(params.get('pollId'))

        // Parse limits from description text "Cast up to X positive and Y negative votes."
        const desc: string = data?.description || ''
        const match = desc.match(/up to\s+(\d+)\s+positive\s+and\s+(\d+)\s+negative/i)
        const plus = match ? Number(match[1]) : 0
        const minus = match ? Number(match[2]) : 0

        const candidates: Candidate[] = (data?.candidates || []).map((c: any) => ({
          publicKey: String(c.publicKey),
          name: String(c.name),
        }))

        if (!parsedPollId || Number.isNaN(parsedPollId) || candidates.length === 0) {
          throw new Error('No active poll found')
        }

        const uiPoll: Poll = {
          id: parsedPollId,
          name: data?.title || `Poll ${parsedPollId}`,
          plusVotesAllowed: plus,
          minusVotesAllowed: minus,
          candidates,
        }

        setPoll(uiPoll)
        setError(null)
      } catch (err: any) {
        setError(`Failed to load poll: ${err.message}`)
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchPoll()
  }, [])

  const handlePlusVote = (candidateKey: string) => {
    setError(null)
    if (plusVotes.includes(candidateKey)) {
      setPlusVotes(plusVotes.filter(key => key !== candidateKey))
    } else {
      if (plusVotes.length >= (poll?.plusVotesAllowed || 0)) {
        setError(`You can only cast ${poll?.plusVotesAllowed} positive votes`)
        return
      }
      if (plusVotes.length + minusVotes.length >= totalAllowed) {
        setError(`Maximum ${totalAllowed} total votes allowed`)
        return
      }
      setPlusVotes([...plusVotes, candidateKey])
    }
  }

  const handleMinusVote = (candidateKey: string) => {
    setError(null)
    if (minusVotes.includes(candidateKey)) {
      setMinusVotes(minusVotes.filter(key => key !== candidateKey))
    } else {
      if (plusVotes.length < 2) {
        setError('At least 2 positive votes required to cast negative votes')
        return
      }
      if (minusVotes.length >= (poll?.minusVotesAllowed || 0)) {
        setError(`You can only cast ${poll?.minusVotesAllowed} negative votes`)
        return
      }
      if (plusVotes.length + minusVotes.length >= totalAllowed) {
        setError(`Maximum ${totalAllowed} total votes allowed`)
        return
      }
      setMinusVotes([...minusVotes, candidateKey])
    }
  }

  const submitVote = async () => {
    if (!publicKey) {
      setError('Wallet not connected')
      return
    }
    if (plusVotes.length === 0) {
      setError('You must cast at least one positive vote')
      return
    }
    if (minusVotes.length > 0 && plusVotes.length < 2) {
      setError('At least 2 positive votes required to cast negative votes')
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const plusAllocations: VoteAllocation[] = plusVotes.map(candidate => ({
        candidate,
        votes: 1
      }))

      const minusAllocations: VoteAllocation[] = minusVotes.map(candidate => ({
        candidate,
        votes: 1
      }))

      const response = await fetch(`/api/vote?pollId=${poll?.id || 1}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account: publicKey.toBase58(),
          plusAllocations,
          minusAllocations,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Failed to submit vote')
      }

      const result = await response.json()
      
      if (result.mode === 'demo') {
        setSuccess('Demo vote submitted successfully! (No blockchain transaction required)')
      } else {
        setSuccess('Vote submitted! Please confirm the transaction in your wallet.')
      }
      
      // Clear votes after successful submission
      setPlusVotes([])
      setMinusVotes([])
    } catch (err: any) {
      setError(`Failed to submit vote: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const clearVotes = () => {
    setPlusVotes([])
    setMinusVotes([])
    setError(null)
    setSuccess(null)
  }

  // Organize candidates by topic for display
  const canonicalTopics = ['Education', 'Security', 'Healthcare', 'Defense', 'Taxes']
  
  // Helper functions to identify Alice/Bob candidates
  const isAlice = (name: string) => /\balice\b/i.test(name)
  const isBob = (name: string) => /\bbob\b/i.test(name)

  // Parse proposer/topic from candidate names
  type Parsed = { proposer: 'Alice' | 'Bob' | null; topic: string | null; c: Candidate }

  const parsed: Parsed[] = (poll?.candidates || []).map(c => {
    const raw = c.name.toLowerCase()
    let proposer: 'Alice' | 'Bob' | null = null
    
    if (/alice/i.test(raw)) proposer = 'Alice'
    else if (/bob/i.test(raw)) proposer = 'Bob'

    // Find topic match
    let topic: string | null = null
    for (const t of canonicalTopics) {
      if (raw.includes(t.toLowerCase())) {
        topic = t
        break
      }
    }

    return { proposer, topic, c }
  })

  const topicRows = canonicalTopics.map(topic => {
    const alice = parsed.find(p => p.proposer === 'Alice' && p.topic === topic)?.c
    const bob = parsed.find(p => p.proposer === 'Bob' && p.topic === topic)?.c
    return { topic, alice, bob }
  })

  const getCandidateName = (candidateKey: string) => {
    const candidate = poll?.candidates.find(c => c.publicKey === candidateKey)
    return candidate?.name || candidateKey
  }

  const getTopicIcon = (topic: string) => {
    const icons: Record<string, string> = {
      'Education': '🎓',
      'Security': '🛡️',
      'Healthcare': '🏥',
      'Defense': '⚔️',
      'Taxes': '💰'
    }
    return icons[topic] || '📋'
  }

  const getTopicDescription = (topic: string, proposer: 'Alice' | 'Bob') => {
    const descriptions: Record<string, Record<string, string>> = {
      'Education': {
        'Alice': 'Progressive education reform with technology integration and increased funding for public schools.',
        'Bob': 'Traditional education values with focus on core subjects and standardized testing improvements.'
      },
      'Security': {
        'Alice': 'Community-based policing with focus on social programs and crime prevention.',
        'Bob': 'Enhanced law enforcement with increased funding for police and stricter penalties.'
      },
      'Healthcare': {
        'Alice': 'Universal healthcare system with expanded public options and preventive care focus.',
        'Bob': 'Market-based healthcare solutions with private sector competition and choice.'
      },
      'Defense': {
        'Alice': 'Diplomatic approach with reduced military spending and increased peacekeeping efforts.',
        'Bob': 'Strong defense policy with enhanced military capabilities and strategic alliances.'
      },
      'Taxes': {
        'Alice': 'Progressive taxation with higher rates for wealthy and corporate tax reforms.',
        'Bob': 'Lower tax rates across the board with simplified tax code and business incentives.'
      }
    }
    return descriptions[topic]?.[proposer] || `${proposer}'s ${topic} program`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl">Loading voting interface...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white font-inter">
      <div className="container max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent animate-pulse">
            🗳️ D21 Voting dApp
          </h1>
          <p className="text-xl text-gray-300 mb-6">
            Choose Your Policy Preferences: Alice vs Bob
          </p>
          
          {/* Voting Rules */}
          <div className="backdrop-filter backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl p-6 mb-8 max-w-3xl mx-auto">
            <h2 className="text-2xl font-semibold mb-4">Voting Rules</h2>
            <div className="grid md:grid-cols-3 gap-4 text-center">
              <div className="bg-green-500/20 rounded-xl p-4">
                <div className="text-3xl mb-2">✅</div>
                <div className="font-medium">Up to {poll?.plusVotesAllowed} Positive Votes</div>
                <div className="text-green-200 text-sm">Support your favorites</div>
              </div>
              <div className="bg-red-500/20 rounded-xl p-4">
                <div className="text-3xl mb-2">❌</div>
                <div className="font-medium">Up to {poll?.minusVotesAllowed} Negative Vote</div>
                <div className="text-red-200 text-sm">Requires 2 positive votes first</div>
              </div>
              <div className="bg-blue-500/20 rounded-xl p-4">
                <div className="text-3xl mb-2">🎯</div>
                <div className="font-medium">Max {totalAllowed} Total Votes</div>
                <div className="text-blue-200 text-sm">Strategic voting encouraged</div>
              </div>
            </div>
          </div>
        </div>

        {/* Wallet Connection */}
        <div className="backdrop-filter backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl p-8 mb-8 text-center">
          {!connected ? (
            <div>
              <div className="text-6xl mb-4">🔐</div>
              <h3 className="text-2xl font-semibold mb-4">Connect Your Wallet to Vote</h3>
              <p className="text-gray-300 mb-6">Connect your Solana wallet to participate in the voting process</p>
              <WalletButton className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 transform hover:scale-105">
                {connecting ? 'Connecting...' : 'Connect Wallet'}
              </WalletButton>
            </div>
          ) : (
            <div>
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-2xl font-semibold mb-2">Wallet Connected</h3>
              <p className="text-gray-300 font-mono text-sm mb-4">
                {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
              </p>
              <button
                onClick={disconnect}
                className="bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-6 rounded-lg transition-all duration-300"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Voting Interface */}
        {connected && poll && (
          <>
            {/* Vote Summary */}
            <div className="backdrop-filter backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Your Votes</h3>
                <div className="flex space-x-4">
                  <span className="text-green-400 font-medium">
                    ➕ {plusVotes.length}/{poll.plusVotesAllowed}
                  </span>
                  <span className="text-red-400 font-medium">
                    ➖ {minusVotes.length}/{poll.minusVotesAllowed}
                  </span>
                  <span className="text-blue-400 font-medium">
                    Total: {plusVotes.length + minusVotes.length}/{totalAllowed}
                  </span>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-green-500/10 rounded-xl p-4">
                  <h4 className="text-green-400 font-medium mb-2">Positive Votes</h4>
                  <div className="text-green-200 text-sm min-h-[40px]">
                    {plusVotes.length === 0 ? (
                      <em>No positive votes selected</em>
                    ) : (
                      plusVotes.map(vote => (
                        <div key={vote} className="bg-green-600/20 rounded px-2 py-1 mb-1">
                          {getCandidateName(vote)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="bg-red-500/10 rounded-xl p-4">
                  <h4 className="text-red-400 font-medium mb-2">Negative Votes</h4>
                  <div className="text-red-200 text-sm min-h-[40px]">
                    {minusVotes.length === 0 ? (
                      <em>No negative votes selected</em>
                    ) : (
                      minusVotes.map(vote => (
                        <div key={vote} className="bg-red-600/20 rounded px-2 py-1 mb-1">
                          {getCandidateName(vote)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Topics Grid */}
            <div className="grid gap-6 mb-8">
              {topicRows.map(({ topic, alice, bob }) => (
                <div key={topic} className="backdrop-filter backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl p-6 hover:bg-white/15 transition-all duration-300 hover:scale-[1.02]">
                  <div className="text-center mb-6">
                    <div className="text-5xl mb-4">{getTopicIcon(topic)}</div>
                    <h3 className="text-2xl font-bold">{topic}</h3>
                  </div>
                  <div className="grid md:grid-cols-2 gap-6">
                    {[
                      { candidate: alice, proposer: 'Alice' as const, color: 'blue' },
                      { candidate: bob, proposer: 'Bob' as const, color: 'purple' }
                    ].map(({ candidate, proposer, color }) => (
                      <div key={proposer} className={`bg-${color}-500/10 rounded-xl p-6 border-2 border-${color}-500/20`}>
                        <h4 className={`text-xl font-semibold text-${color}-300 mb-3`}>
                          {proposer}'s Program
                        </h4>
                        <p className="text-gray-300 text-sm mb-4">
                          {getTopicDescription(topic, proposer)}
                        </p>
                        {candidate ? (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handlePlusVote(candidate.publicKey)}
                              disabled={!plusVotes.includes(candidate.publicKey) && (plusVotes.length >= poll.plusVotesAllowed || plusVotes.length + minusVotes.length >= totalAllowed)}
                              className={`flex-1 py-3 px-4 rounded-lg font-medium text-white transition-all duration-300 ${
                                plusVotes.includes(candidate.publicKey)
                                  ? 'bg-green-600 shadow-lg shadow-green-500/40'
                                  : 'bg-green-500 hover:bg-green-600 hover:scale-105'
                              } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
                            >
                              👍 Support
                            </button>
                            <button
                              onClick={() => handleMinusVote(candidate.publicKey)}
                              disabled={!minusVotes.includes(candidate.publicKey) && (plusVotes.length < 2 || minusVotes.length >= poll.minusVotesAllowed || plusVotes.length + minusVotes.length >= totalAllowed)}
                              className={`flex-1 py-3 px-4 rounded-lg font-medium text-white transition-all duration-300 ${
                                minusVotes.includes(candidate.publicKey)
                                  ? 'bg-red-600 shadow-lg shadow-red-500/40'
                                  : 'bg-red-500 hover:bg-red-600 hover:scale-105'
                              } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
                            >
                              👎 Oppose
                            </button>
                          </div>
                        ) : (
                          <div className="text-gray-400 text-center py-3">
                            —
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Messages */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-6">
                <div className="text-red-400 font-medium">{error}</div>
              </div>
            )}
            
            {success && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-4 mb-6">
                <div className="text-green-400 font-medium">{success}</div>
              </div>
            )}

            {/* Submit Section */}
            <div className="backdrop-filter backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl p-8 text-center">
              <div className="flex justify-center space-x-4 mb-6">
                <button
                  onClick={clearVotes}
                  className="bg-gray-500 hover:bg-gray-600 text-white font-medium py-3 px-6 rounded-lg transition-all duration-300"
                  disabled={submitting}
                >
                  Clear All Votes
                </button>
                <button
                  onClick={submitVote}
                  className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  disabled={submitting || plusVotes.length === 0}
                >
                  {submitting ? 'Submitting...' : 'Submit Votes'}
                </button>
              </div>
              
              <p className="text-gray-400 text-sm">
                Your vote will be submitted to the Solana blockchain. You'll need to approve the transaction in your wallet.
              </p>
            </div>
          </>
        )}

        {/* No wallet connected message */}
        {!connected && (
          <div className="text-center text-gray-400 mt-8">
            <p>Please connect your wallet to participate in voting.</p>
          </div>
        )}
      </div>
    </div>
  )
}