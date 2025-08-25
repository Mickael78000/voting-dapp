import React, { useState, useEffect, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import * as anchor from '@coral-xyz/anchor'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'

// Import the IDL - you'll need to generate this from your Anchor program
import VotingdappIDL from '../../../anchor/target/idl/votingdapp.json'
import { Votingdapp } from '../../../anchor/target/types/votingdapp' // Generated types

// Program ID from lib.rs
const PROGRAM_ID = new PublicKey('HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx')

interface Candidate {
  publicKey: PublicKey
  name: string
  plusVotes: number
  minusVotes: number
}

interface Poll {
  id: number
  description: string
  plusVotesAllowed: number
  minusVotesAllowed: number
  candidateCount: number
  winners: number
  pollStart: number
  pollEnd: number
}

interface VoteAllocation {
  candidate: PublicKey
  votes: number
}

interface Topic {
  name: string
  candidates: string[]
}

const TOPICS: Topic[] = [
  { name: 'Education', candidates: ['Alice - Education', 'Bob - Education'] },
  { name: 'Security', candidates: ['Alice - Security', 'Bob - Security'] },
  { name: 'Healthcare', candidates: ['Alice - Healthcare', 'Bob - Healthcare'] },
  { name: 'Defense', candidates: ['Alice - Defense', 'Bob - Defense'] },
  { name: 'Taxes', candidates: ['Alice - Taxes', 'Bob - Taxes'] },
]

export default function D21VotingUI() {
  const { publicKey, connected, connecting } = useWallet()
  const { connection } = useConnection()
  
  // State management
  const [poll, setPoll] = useState<Poll | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [plusVotes, setPlusVotes] = useState<PublicKey[]>([])
  const [minusVotes, setMinusVotes] = useState<PublicKey[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasVoted, setHasVoted] = useState(false)

  // Create program instance
  const program = useMemo(() => {
    if (!publicKey || !connected) return null
    
    const provider = new AnchorProvider(
      connection,
      (window as any).solana,
      AnchorProvider.defaultOptions()
    )
    
    return new Program(VotingdappIDL as any, provider) as Program<Votingdapp>
  }, [connection, publicKey, connected])

  // Helper function to get poll PDA
  const getPollPDA = (pollId: number) => {
    const pollIdBytes = Buffer.alloc(4)
    pollIdBytes.writeUInt32LE(pollId, 0)
    
    return PublicKey.findProgramAddressSync(
      [Buffer.from('poll'), pollIdBytes],
      PROGRAM_ID
    )[0]
  }

  // Helper function to get candidate PDA
  const getCandidatePDA = (pollId: number, candidateName: string) => {
    const pollIdBytes = Buffer.alloc(4)
    pollIdBytes.writeUInt32LE(pollId, 0)
    
    return PublicKey.findProgramAddressSync(
      [Buffer.from('cand'), pollIdBytes, Buffer.from(candidateName)],
      PROGRAM_ID
    )[0]
  }

  // Helper function to get voter record PDA
  const getVoterRecordPDA = (pollId: number, voterKey: PublicKey) => {
    const pollIdBytes = Buffer.alloc(4)
    pollIdBytes.writeUInt32LE(pollId, 0)
    
    return PublicKey.findProgramAddressSync(
      [Buffer.from('voter'), voterKey.toBuffer(), pollIdBytes],
      PROGRAM_ID
    )[0]
  }

  // Load poll and candidates data
  useEffect(() => {
    if (!program) return

    const loadPollData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Try to load poll with ID 1
        const pollPDA = getPollPDA(1)
        
        try {
          const pollAccount = await program.account.poll.fetch(pollPDA)
          const pollData: Poll = {
            id: pollAccount.pollId,
            description: pollAccount.pollDescription,
            plusVotesAllowed: pollAccount.plusVotesAllowed,
            minusVotesAllowed: pollAccount.minusVotesAllowed,
            candidateCount: pollAccount.candidateCount.toNumber(),
            winners: pollAccount.winners,
            pollStart: pollAccount.pollStart.toNumber(),
            pollEnd: pollAccount.pollEnd.toNumber(),
          }
          setPoll(pollData)

          // Load candidates for this poll
          const allCandidates = await program.account.candidate.all()
          const pollCandidates = allCandidates
            .filter(candidateAccount => {
              // Verify this candidate belongs to our poll by checking PDA derivation
              const nameBytes = Buffer.from(candidateAccount.account.name)
              const nameStr = nameBytes.toString().replace(/\0/g, '')
              const expectedPDA = getCandidatePDA(1, nameStr)
              return expectedPDA.equals(candidateAccount.publicKey)
            })
            .map(candidateAccount => ({
              publicKey: candidateAccount.publicKey,
              name: Buffer.from(candidateAccount.account.name).toString().replace(/\0/g, ''),
              plusVotes: candidateAccount.account.plusVotes.toNumber(),
              minusVotes: candidateAccount.account.minusVotes.toNumber(),
            }))

          setCandidates(pollCandidates)

          // Check if user has already voted
          if (publicKey) {
            const voterRecordPDA = getVoterRecordPDA(1, publicKey)
            try {
              const voterRecord = await program.account.voterRecord.fetch(voterRecordPDA)
              setHasVoted(voterRecord.hasVoted)
            } catch {
              setHasVoted(false)
            }
          }

        } catch (pollError) {
          // Poll doesn't exist, create demo data
          console.log('Poll not found on-chain, using demo data')
          setPoll({
            id: 1,
            description: 'Alice vs Bob — Public Policy Preferences',
            plusVotesAllowed: 2,
            minusVotesAllowed: 1,
            candidateCount: 10,
            winners: 5,
            pollStart: Date.now() / 1000,
            pollEnd: (Date.now() / 1000) + 86400, // 24 hours from now
          })

          // Create demo candidates
          const demoCandidates: Candidate[] = [
            'Alice - Education', 'Alice - Security', 'Alice - Healthcare', 
            'Alice - Defense', 'Alice - Taxes',
            'Bob - Education', 'Bob - Security', 'Bob - Healthcare', 
            'Bob - Defense', 'Bob - Taxes'
          ].map(name => ({
            publicKey: getCandidatePDA(1, name),
            name,
            plusVotes: 0,
            minusVotes: 0,
          }))
          
          setCandidates(demoCandidates)
        }

      } catch (err) {
        console.error('Error loading poll data:', err)
        setError('Failed to load poll data')
      } finally {
        setLoading(false)
      }
    }

    loadPollData()
  }, [program, publicKey])

  // Vote handling functions
  const handlePlusVote = (candidateKey: PublicKey) => {
    setError(null)
    
    if (plusVotes.some(key => key.equals(candidateKey))) {
      setPlusVotes(plusVotes.filter(key => !key.equals(candidateKey)))
    } else {
      if (plusVotes.length >= (poll?.plusVotesAllowed || 0)) {
        setError(`You can only cast ${poll?.plusVotesAllowed} positive votes`)
        return
      }
      
      const totalVotes = plusVotes.length + minusVotes.length + 1
      if (totalVotes >= (poll?.candidateCount || 0)) {
        setError(`Maximum ${poll?.candidateCount - 1} total votes allowed`)
        return
      }
      
      setPlusVotes([...plusVotes, candidateKey])
    }
  }

  const handleMinusVote = (candidateKey: PublicKey) => {
    setError(null)
    
    if (minusVotes.some(key => key.equals(candidateKey))) {
      setMinusVotes(minusVotes.filter(key => !key.equals(candidateKey)))
    } else {
      if (minusVotes.length >= (poll?.minusVotesAllowed || 0)) {
        setError(`You can only cast ${poll?.minusVotesAllowed} negative votes`)
        return
      }
      
      const totalVotes = plusVotes.length + minusVotes.length + 1
      if (totalVotes >= (poll?.candidateCount || 0)) {
        setError(`Maximum ${poll?.candidateCount - 1} total votes allowed`)
        return
      }
      
      setMinusVotes([...minusVotes, candidateKey])
    }
  }

  // Submit vote to blockchain
  const submitVote = async () => {
    if (!publicKey || !program || !poll) {
      setError('Wallet not connected or program not initialized')
      return
    }

    // Validation
    if (plusVotes.length === 0) {
      setError('You must cast at least one positive vote')
      return
    }

    if (minusVotes.length > 0 && plusVotes.length < 2) {
      setError('At least 2 positive votes required to cast negative votes')
      return
    }

    if (plusVotes.length > poll.plusVotesAllowed) {
      setError(`Too many positive votes (max ${poll.plusVotesAllowed})`)
      return
    }

    if (minusVotes.length > poll.minusVotesAllowed) {
      setError(`Too many negative votes (max ${poll.minusVotesAllowed})`)
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      // Create vote allocations
      const plusAllocations: VoteAllocation[] = plusVotes.map(candidate => ({
        candidate,
        votes: 1,
      }))

      const minusAllocations: VoteAllocation[] = minusVotes.map(candidate => ({
        candidate,
        votes: 1,
      }))

      // Get required PDAs
      const pollPDA = getPollPDA(poll.id)
      const voterRecordPDA = getVoterRecordPDA(poll.id, publicKey)

      // Prepare remaining accounts (all candidate PDAs)
      const allVotedCandidates = [...plusVotes, ...minusVotes]
      const remainingAccounts = allVotedCandidates.map(candidateKey => ({
        pubkey: candidateKey,
        isWritable: true,
        isSigner: false,
      }))

      // Create and send transaction
      const tx = await program.methods
        .vote(
          poll.id,
          plusAllocations,
          minusAllocations
        )
        .accounts({
          signer: publicKey,
          poll: pollPDA,
          voterRecord: voterRecordPDA,
          systemProgram: SystemProgram.programId,
        } as any)
        .remainingAccounts(remainingAccounts)
        .rpc()

      setSuccess(`Vote submitted successfully! Transaction: ${tx}`)
      setHasVoted(true)
      
      // Clear votes after successful submission
      setPlusVotes([])
      setMinusVotes([])

      // Refresh poll data to show updated vote counts
      setTimeout(() => {
        window.location.reload()
      }, 2000)

    } catch (err: any) {
      console.error('Vote submission error:', err)
      
      // Handle specific Anchor errors
      if (err.message?.includes('AlreadyVoted')) {
        setError('You have already voted in this poll')
        setHasVoted(true)
      } else if (err.message?.includes('TooManyPlus')) {
        setError(`Too many positive votes. Maximum allowed: ${poll.plusVotesAllowed}`)
      } else if (err.message?.includes('TooManyMinus')) {
        setError(`Too many negative votes. Maximum allowed: ${poll.minusVotesAllowed}`)
      } else if (err.message?.includes('MinusRequiresTwoPlus')) {
        setError('At least 2 positive votes required to cast negative votes')
      } else if (err.message?.includes('InvalidTotal')) {
        setError('Total votes exceed the allowed limit')
      } else if (err.message?.includes('User rejected the request')) {
        setError('Transaction was cancelled')
      } else {
        setError(`Failed to submit vote: ${err.message || 'Unknown error'}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const getTopicDescription = (topic: string, proposer: string) => {
    const descriptions: Record<string, Record<string, string>> = {
      Education: {
        Alice: "Increase funding for public schools and teacher training programs",
        Bob: "Promote school choice and charter school expansion"
      },
      Security: {
        Alice: "Focus on community policing and crime prevention programs",
        Bob: "Increase law enforcement funding and surveillance systems"
      },
      Healthcare: {
        Alice: "Expand public healthcare coverage and lower prescription costs",
        Bob: "Promote private healthcare competition and medical savings accounts"
      },
      Defense: {
        Alice: "Reduce military spending and focus on diplomacy",
        Bob: "Strengthen defense capabilities and military readiness"
      },
      Taxes: {
        Alice: "Increase taxes on wealthy individuals and corporations",
        Bob: "Lower taxes across all income brackets and simplify tax code"
      }
    }
    
    return descriptions[topic]?.[proposer] || `${proposer}'s policy on ${topic}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading voting interface...</p>
        </div>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            D21 Voting System
          </h1>
          <p className="text-gray-600 mb-6">
            Connect your Solana wallet to participate in the voting process
          </p>
          <WalletMultiButton />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                Choose Your Policy Preferences: Alice vs Bob
              </h1>
              <p className="text-gray-600">
                {poll?.description || 'D21 Voting System'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500 mb-2">Connected as</div>
              <div className="text-sm font-mono bg-gray-100 px-3 py-1 rounded">
                {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
              </div>
            </div>
          </div>

          {/* Voting Rules */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-800 mb-2">Voting Rules (D21 System):</h3>
            <ul className="text-blue-700 text-sm space-y-1">
              <li>• Cast up to {poll?.plusVotesAllowed || 2} positive votes for candidates you support</li>
              <li>• Cast up to {poll?.minusVotesAllowed || 1} negative vote against candidates you oppose</li>
              <li>• Negative votes require at least 2 positive votes</li>
              <li>• Your vote will be submitted to the Solana blockchain</li>
            </ul>
          </div>
        </div>

        {/* Voting Status */}
        {hasVoted && (
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-6">
            <div className="flex items-center">
              <div className="text-green-600 mr-3">✅</div>
              <div>
                <h3 className="font-semibold text-green-800">Vote Recorded</h3>
                <p className="text-green-700 text-sm">
                  You have already participated in this poll. Thank you for voting!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-6">
            <div className="flex items-center">
              <div className="text-red-600 mr-3">⚠️</div>
              <div>
                <h3 className="font-semibold text-red-800">Error</h3>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success Display */}
        {success && (
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-6">
            <div className="flex items-center">
              <div className="text-green-600 mr-3">✅</div>
              <div>
                <h3 className="font-semibold text-green-800">Success</h3>
                <p className="text-green-700 text-sm">{success}</p>
              </div>
            </div>
          </div>
        )}

        {/* Candidates Grid */}
        <div className="grid gap-4 mb-6">
          {TOPICS.map(topic => (
            <div key={topic.name} className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">
                {topic.name} Policy
              </h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                {topic.candidates.map(candidateName => {
                  const candidate = candidates.find(c => c.name === candidateName)
                  if (!candidate) return null

                  const topic = candidateName.split(' - ')[1]
                  const proposer = candidateName.split(' - ')[0]
                  const isPlusVoted = plusVotes.some(key => key.equals(candidate.publicKey))
                  const isMinusVoted = minusVotes.some(key => key.equals(candidate.publicKey))

                  return (
                    <div
                      key={candidate.publicKey.toString()}
                      className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                        isPlusVoted
                          ? 'border-green-500 bg-green-50'
                          : isMinusVoted
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-800">{candidate.name}</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {getTopicDescription(topic, proposer)}
                          </p>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <div>+{candidate.plusVotes}</div>
                          <div>-{candidate.minusVotes}</div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePlusVote(candidate.publicKey)}
                          disabled={hasVoted || submitting}
                          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                            isPlusVoted
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {isPlusVoted ? '✓ Positive' : '+ Positive'}
                        </button>
                        
                        <button
                          onClick={() => handleMinusVote(candidate.publicKey)}
                          disabled={hasVoted || submitting}
                          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                            isMinusVoted
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {isMinusVoted ? '✓ Negative' : '- Negative'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Vote Summary and Submit */}
        {(plusVotes.length > 0 || minusVotes.length > 0) && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Your Vote Summary</h3>
            
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <h4 className="font-medium text-green-700 mb-2">
                  Positive Votes ({plusVotes.length}/{poll?.plusVotesAllowed || 0})
                </h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  {plusVotes.map(candidateKey => {
                    const candidate = candidates.find(c => c.publicKey.equals(candidateKey))
                    return (
                      <li key={candidateKey.toString()}>
                        • {candidate?.name || 'Unknown Candidate'}
                      </li>
                    )
                  })}
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium text-red-700 mb-2">
                  Negative Votes ({minusVotes.length}/{poll?.minusVotesAllowed || 0})
                </h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  {minusVotes.map(candidateKey => {
                    const candidate = candidates.find(c => c.publicKey.equals(candidateKey))
                    return (
                      <li key={candidateKey.toString()}>
                        • {candidate?.name || 'Unknown Candidate'}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                <p>Your vote will be submitted to the Solana blockchain. You'll need to approve the transaction in your wallet.</p>
              </div>
              
              <button
                onClick={submitVote}
                disabled={hasVoted || submitting || plusVotes.length === 0}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {submitting ? 'Submitting...' : hasVoted ? 'Already Voted' : 'Submit Vote'}
              </button>
            </div>
          </div>
        )}

        {/* Connection Status */}
        {!hasVoted && (plusVotes.length === 0 && minusVotes.length === 0) && (
          <div className="bg-gray-50 p-6 rounded-lg text-center">
            <p className="text-gray-600">
              Please connect your wallet to participate in voting.
            </p>
            <WalletMultiButton className="mt-4" />
          </div>
        )}
      </div>
    </div>
  )
}