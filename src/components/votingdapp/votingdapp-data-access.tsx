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
  const href: string | undefined = data?.links?.actions?.[0]?.href
  if (!href) return null
  // Avoid relying on window/location; parse query from href directly
  const queryString = href.includes('?') ? href.substring(href.indexOf('?') + 1) : ''
  const params = new URLSearchParams(queryString)
  const pollIdParam = params.get('pollId')
  const id = pollIdParam ? Number(pollIdParam) : undefined
  if (!id || Number.isNaN(id)) return null

  const desc: string = data?.description || ''
  const match = desc.match(/up to\s+(\d+)\s+positive\s+and\s+(\d+)\s+negative/i)
  const plus = match ? Number(match[1]) : 0
  const minus = match ? Number(match[2]) : 0

  const candidates: UICandidate[] = (data?.candidates || []).map((c: any) => ({
    publicKey: String(c.publicKey),
    name: String(c.name),
  }))

  return {
    id,
    name: data?.title || `Poll ${id}`,
    plusVotesAllowed: plus,
    minusVotesAllowed: minus,
    candidates,
  }
}

export function useVoteGet() {
  return useQuery<{ raw: any; poll: UIPoll | null }>({
    queryKey: ['vote', 'get'],
    queryFn: async () => {
      const res = await fetch('/api/vote', { cache: 'no-store' })
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
      const plusAllocations = plus.map((candidate) => ({ candidate, votes: 1 }))
      const minusAllocations = minus.map((candidate) => ({ candidate, votes: 1 }))

      const res = await fetch(`/api/vote?pollId=${pollId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, plusAllocations, minusAllocations }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
  })
}
