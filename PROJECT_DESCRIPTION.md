# Project Description

**Deployed Frontend URL:** [TODO: Link to your deployed frontend]

**Solana Program ID:** HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx (Devnet)

## Project Overview

### Description
This is a D21 voting dApp on Solana. Voters can cast both positive (support) and negative (oppose) votes within configured limits per poll. Votes are recorded on-chain in a custom Anchor program. The frontend is a Next.js app that integrates Solana Actions endpoints to fetch poll data and build unsigned transactions that users sign in their wallet.

### Key Features
- **On-chain polls**: Create polls with a description, time window, winners count, and voting limits.
- **Candidates per poll**: Add named candidate accounts scoped to a poll.
- **D21 voting**: Cast multiple positive votes and optionally negative votes with constraints.
- **One vote per wallet per poll**: Enforced by a voter record account.
- **Solana Actions API**: `/api/vote` GET advertises poll and candidates; POST returns a base64 v0 message to sign.
- **Initializer script**: Seed devnet with sample polls and candidates (`scripts/initialize-poll.cjs`).

### How to Use the dApp
1. **Connect Wallet** in the UI.
2. **Select Poll** in the dropdown (`Poll 1` or `Poll 2`, etc.).
3. **Make Selections**
   - Choose up to the allowed number of positive votes.
   - Optionally choose negative votes (requires at least 2 positive selections).
4. **Submit Vote**
   - The frontend requests an unsigned transaction from `/api/vote` and asks your wallet to sign it, then sends it to Devnet.
5. **Confirm**
   - After confirmation, the UI refreshes with updated on-chain data.

Notes:
- Poll 1 (Demo) is designed with Alice/Bob topic candidates.
- Poll 2 (Conviction) demonstrates an alternative configuration.

## Program Architecture
Anchor program instructions and accounts are inferred from tests and the API layer.

### PDA Usage
- **Poll PDA**: `find_program_address(["poll", u32_le(poll_id)], program_id)`
  - Holds poll configuration and counters.
- **Candidate PDA**: `find_program_address(["cand", u32_le(poll_id), candidate_name], program_id)`
  - One candidate per name per poll.
- **Voter Record PDA**: `find_program_address(["voter", voter_pubkey, u32_le(poll_id)], program_id)`
  - Tracks whether a wallet has voted in a poll to enforce single-vote policy.

### Program Instructions
- **initialize_poll(poll_id: u32, description: string, start_time: i64, end_time: i64, winners: u8)**
  - Creates the `poll` account with configured limits. Plus/minus limits are set in the poll state (e.g., Poll 1: plus=5, minus=1).
- **initialize_candidate(name: string, poll_id: u32)**
  - Creates a `candidate` account for the poll and increments the poll's `candidate_count`.
- **vote(poll_id: u32, plus_alloc: [{candidate: Pubkey, votes: u8}], minus_alloc: [{candidate: Pubkey, votes: u8}])**
  - Validates per-poll constraints and records votes to candidate accounts.
  - Creates the `voter_record` to prevent double voting.

### Account Structure
- **Poll**
  - `poll_id: u32`
  - `poll_description: string`
  - `plus_votes_allowed: u8`
  - `minus_votes_allowed: u8`
  - `candidate_count: u32`
  - `winners: u8`
  - `start_time: i64`, `end_time: i64`
- **Candidate**
  - `name: [u8; 32]` (null-terminated)
  - `plus_votes: u32`
  - `minus_votes: u32`
  - (Scoped by PDA seeds to a poll)
- **VoterRecord**
  - `voter: Pubkey`
  - `poll_id: u32`
  - (Existence prevents additional votes by the same wallet)

## Frontend and API
- **Frontend**: Next.js with Wallet Adapter.
  - Main UI: `src/components/votingdapp/votingdapp-feature.tsx`, `votingdapp-ui.tsx`.
- **Solana Actions**: `src/app/api/vote/route.ts`
  - GET: fetches poll account and filters candidate accounts by PDA equality.
  - POST: builds a Versioned v0 message containing the vote instruction; the client signs and submits.
- **Debug endpoint**: `src/app/api/vote/debug-poll/route.ts` for on-chain diagnostics.

## Initialization and Sample Data
- Script: `scripts/initialize-poll.cjs`
  - Defaults to `pollId=2` unless overridden with CLI argument.
  - Idempotently ensures the poll exists and adds missing candidates.
  - Poll 1 preset: "Alice vs Bob — Public Policy Preferences" with 10 topic candidates (5 for Alice, 5 for Bob).
  - Poll 2 preset: "Tech vs Environment Policy Debate" with 5 candidates.

Usage:
```bash
# Build Anchor to ensure IDL is available
cd anchor && anchor build && cd ..

# Seed poll 1 (Alice/Bob topics)
node scripts/initialize-poll.cjs 1

# Seed/verify poll 2 (default)
node scripts/initialize-poll.cjs
```

## Deployment
- Frontend can be deployed to Vercel.
  - Ensure `anchor/target/idl/votingdapp.json` is committed.
  - Set `NEXT_PUBLIC_RPC_URL` (e.g., `https://api.devnet.solana.com`).
  - For Actions routes (Node.js, dynamic): add at top of API files:
    ```ts
    export const runtime = 'nodejs';
    export const dynamic = 'force-dynamic';
    ```
  - Test endpoints:
    - `https://<your-domain>/api/vote?pollId=1`
    - `https://<your-domain>/api/vote/debug-poll?pollId=1`

## Future Work
- Add update instruction to modify poll metadata (e.g., rename/extend time window).
- Pagination and indexing for large candidate sets.
- Aggregate results view and on-chain tally proofs.

## Testing

### Test Coverage
[TODO: Describe your testing approach and what scenarios you covered]

**Happy Path Tests:**
- Test 1: [Description]
- Test 2: [Description]
- ...

**Unhappy Path Tests:**
- Test 1: [Description of error scenario]
- Test 2: [Description of error scenario]
- ...

### Running Tests
```bash
# Commands to run your tests
anchor test
```

### Additional Notes for Evaluators

[TODO: Add any specific notes or context that would help evaluators understand your project better]