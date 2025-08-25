'use client'

import { useMutation, useQuery } from '@tanstack/react-query'

export interface UICandidate {
  publicKey: string
  name: string
}

export interface UIPoll {
  id: number
  name: string
  plusVotesAllowed: number
  minusVotesAllowed: number
  candidates: UICandidate[]
}

function parsePollFromActionGetResponse(data: any): UIPoll | null {
  if (!data) return null
  
  // Extract poll ID from the action href
  const href: string | undefined = data?.links?.actions?.[0]?.href
  if (!href) return null
  
  const queryString = href.includes('?') ? href.substring(href.indexOf('?') + 1) : ''
  const params = new URLSearchParams(queryString)
  const pollIdParam = params.get('pollId')
  const id = pollIdParam ? Number(pollIdParam) : undefined
  
  if (!id || Number.isNaN(id)) return null

  // Use direct fields from route.ts response instead of regex parsing
  const plusVotesAllowed = data?.plusVotesAllowed || 0
  const minusVotesAllowed = data?.minusVotesAllowed || 0
  
  const candidates: UICandidate[] = (data?.candidates || []).map((c: any) => ({
    publicKey: String(c.publicKey),
    name: String(c.name),
  }))

  return {
    id,
    name: data?.name || data?.title || `Poll ${id}`,
    plusVotesAllowed,
    minusVotesAllowed,
    candidates,
  }
}

export function useVoteGet(pollId: number = 1) {
  return useQuery<{ raw: any; poll: UIPoll | null }>({
    queryKey: ['vote', 'get', pollId],
    queryFn: async () => {
      // Fix: Include pollId parameter
      const res = await fetch(`/api/vote?pollId=${pollId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())
      
      const raw = await res.json()
      const poll = parsePollFromActionGetResponse(raw)
      return { raw, poll }
    },
  })
}

export interface PostVoteInput {
  pollId: number
  account: string
  plus: string[]
  minus: string[]
}

export function useVotePost() {
  return useMutation({
    mutationKey: ['vote', 'post'],
    mutationFn: async ({ pollId, account, plus, minus }: PostVoteInput) => {
      const res = await fetch(`/api/vote?pollId=${pollId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Fix: Use correct body structure that matches route.ts expectations
        body: JSON.stringify({
          account,
          data: {
            plusVotes: plus,   // Direct array of candidate public key strings
            minusVotes: minus  // Direct array of candidate public key strings
          }
        }),
      })
      
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText)
      }
      
      return res.json()
    },
  })
}

export interface InitializePollInput {
  pollId: number
  description: string
  winners: number
}

export interface InitializeCandidateInput {
  pollId: number
  candidateName: string
}

// Helper hooks for poll initialization (if needed)
export function useInitializePoll() {
  return useMutation({
    mutationKey: ['poll', 'initialize'],
    mutationFn: async ({ pollId, description, winners }: InitializePollInput) => {
      // This would need a separate API endpoint for poll initialization
      // For now, this is just a placeholder
      throw new Error('Poll initialization not implemented in current API')
    },
  })
}

export function useInitializeCandidate() {
  return useMutation({
    mutationKey: ['candidate', 'initialize'],
    mutationFn: async ({ pollId, candidateName }: InitializeCandidateInput) => {
      // This would need a separate API endpoint for candidate initialization
      // For now, this is just a placeholder
      throw new Error('Candidate initialization not implemented in current API')
    },
  })
}