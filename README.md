# Solana Voting DApp (Anchor + Next.js)

Discover a full‑stack voting dApp on Solana, featuring an Anchor on‑chain program and a Next.js frontend with a Solana Actions endpoint for wallet-agnostic voting flows.

- Program ID: `HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx`
- Anchor CLI: 0.31.1
- Solana CLI: 2.2.12 (devnet by default)


## Table of Contents
- [Overview](#overview)
- [Repository Layout](#repository-layout)
- [On-chain Program](#on-chain-program)
- [Frontend and API](#frontend-and-api)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Build, Test, Deploy](#build-test-deploy)
- [Initialize Sample Data](#initialize-sample-data)
- [Use via Solana Actions](#use-via-solana-actions)
- [Test with Anchor wallet and curl](#test-with-anchor-wallet-and-curl)
- [Troubleshooting](#troubleshooting)
- [License](#license)


## Overview
- Implements a D21-style voting scheme.
- Polls define: description, start/end, candidate count, number of winners, and derived limits for plus/minus votes.
- Voters allocate multiple plus and minus votes across candidates in one transaction.
- Next.js route exposes a Solana Actions GET/POST endpoint for seamless wallet UX.


## Repository Layout
- `anchor/` — Anchor workspace
  - `programs/votingdapp/src/lib.rs` — program entrypoints, accounts, errors
  - `Anchor.toml` — cluster/toolchain config (devnet, Anchor 0.31.1, Solana 2.2.12)
  - `tests/votingdapp.spec.ts` — integration tests (ts‑mocha)
  - `target/idl/votingdapp.json` — IDL generated after build
- `src/` — Next.js 15 app
  - `app/api/vote/route.ts` — Solana Actions GET/POST endpoint
  - `app/page.tsx` + `components/` — UI (dashboard)
- `scripts/initialize-poll.cjs` — node script to initialize a poll and candidates on devnet


## On-chain Program
Source: `anchor/programs/votingdapp/src/lib.rs`

- PDAs
  - `Poll`: seeds `["poll", poll_id.to_le_bytes()]`
  - `Candidate`: seeds `["cand", poll_id.to_le_bytes(), candidate_name.as_bytes()]`
  - `VoterRecord`: seeds `["voter", signer, poll_id.to_le_bytes()]`

- Accounts
  - `Poll` fields: `poll_id: u32`, `poll_description: String(<=100)`, `poll_start: u64`, `poll_end: u64`, `candidate_count: u64`, `winners: u8`, `plus_votes_allowed: u8`, `minus_votes_allowed: u8`.
  - `Candidate` fields: `name: [u8;32]`, `plus_votes: u64`, `minus_votes: u64`.
  - `VoterRecord` fields: `has_voted: bool`, `plus_used: u8`, `minus_used: u8`.

- Instructions
  - `initialize_poll(poll_id: u64, poll_description: String, poll_start: u64, poll_end: u64, winners: u8)`
    - Derives allowed votes using D21‑style formula: `plus = floor(2W - (W-2)*phi)`, `minus = floor(plus/3)`.
  - `initialize_candidate(candidate_name: String, poll_id: u32)`
    - Creates a `Candidate` PDA; increments `candidate_count`.
  - `vote(poll_id: u32, plus_allocations: Vec<VoteAllocation>, minus_allocations: Vec<VoteAllocation>)`
    - Requires `VoterRecord` PDA and supplies candidate accounts via `remaining_accounts`.
    - Enforces: single vote per `VoterRecord`, plus/minus caps, and minus requires at least two plus.
  - `close_voter_record()`

- Errors (`#[error_code]`)
  - `AlreadyVoted`, `TooManyPlus`, `TooManyMinus`, `InvalidTotal`, `MinusRequiresTwoPlus`, `Overflow`


## Frontend and API
- Actions endpoint: `src/app/api/vote/route.ts`
  - GET `/api/vote?pollId=NUMBER`
    - Returns ActionGetResponse with poll metadata, plus/minus caps, candidate list, and a POST action link.
  - POST `/api/vote?pollId=NUMBER`
    - Body: `{ account: <voter pubkey>, data: { plusVotes?: string|string[], minusVotes?: string|string[] } }`
    - Returns base64‑encoded v0 message bytes containing the vote instruction; the client constructs and signs a `VersionedTransaction`.
  - RPC URL: `NEXT_PUBLIC_RPC_URL` env (defaults to devnet).

- UI
  - Next.js 15 + React 19 + Tailwind 4.
  - Home page mounts `DashboardFeature` (`src/app/page.tsx` -> `components/dashboard/`).


## API design and debugging notes
- __Parity with tests and contract__
  - `src/app/api/vote/route.ts` mirrors `anchor/tests/votingdapp.spec.ts` and intentionally excludes any setup/initialization that the test harness performs.
  - No extra logic beyond the smart contract in `anchor/programs/votingdapp/src/lib.rs` is added. The API only builds PDAs, composes the vote instruction, and returns an unsigned v0 message for the wallet to sign.
  - It builds the same PDAs (`poll`, `candidate`, `voter_record`) and defers all constraints to the program.
- __Initialization kept out of API__
  - API does not create polls nor candidates. Initialization is performed only via `scripts/initialize-poll.cjs` (used by tests and local setup) for deterministic state.
- __Debug route for diagnostics__
  - `src/app/api/vote/debug-poll/route.ts` provides read-only diagnostics (PDA calculations, poll existence, candidate listing). It adds no business logic and can be removed or disabled in production.
- __Draft UI component__
  - Draft UI at `src/components/votingdapp/votingdapp-ui.tsx` consumes GET/POST, constructs/signs the returned v0 message with the wallet, and applies UX validations (e.g., require ≥1 plus vote; need ≥2 plus to allow minus). Final enforcement remains on-chain.

Note: Examples in this README use `pollId=2` for the demo dataset. If you initialized a different poll, substitute the appropriate `pollId`. The API defaults to `pollId=1` when not provided.


## Prerequisites
- Node.js 18+ (LTS recommended)
- Yarn
- Solana CLI 2.2.x (`solana --version`)
- Anchor CLI 0.31.1 (`anchor --version`)
- A funded devnet keypair at `~/.config/solana/id.json`

Tip: `anchor/Anchor.toml` sets `cluster = "devnet"` and pins toolchain versions.


## Setup
```bash
# 1) Install JS deps
yarn install
# or: yarn

# 2) Configure Solana for devnet
solana config set --url https://api.devnet.solana.com
solana address
solana airdrop 2 # may need to repeat

# 3) Build Anchor program and IDL
cd anchor
anchor build
# IDL at: anchor/target/idl/votingdapp.json
```


## Build, Test, Deploy
```bash
# Frontend
yarn build
yarn dev   # Next.js dev server at http://localhost:3000

# Anchor tests (in anchor/)
cd anchor
anchor test 

# Deploy to devnet (in anchor/)
anchor deploy
```
Notes:
- Program ID in Rust and frontend is `HaV1HXC6...` (devnet). `Anchor.toml` also contains a `[programs.localnet]` entry used only for localnet.
- The provided `package.json` mocha test script uses absolute paths; prefer running `anchor test` from `anchor/` instead.


## Initialize Sample Data
A helper script adds a poll and sample candidates on devnet.

```bash
# Ensure you built the program first to have a fresh IDL
cd anchor && anchor build && cd ..

# Run the initializer (uses devnet by default)
node scripts/initialize-poll.cjs
```
Script defaults:
- `pollId = 2`, description "Tech vs Environment Policy Debate", `winners = 3`.
- Adds several candidate PDAs.


## Use via Solana Actions
Once your Next.js dev server is running:

- Open in a wallet-agnostic Actions client (example using Dial.to):
  - http://localhost:3000/api/vote
  - https://dial.to/?action=solana-action:http://localhost:3000/api/vote

The GET endpoint advertises candidates and constraints; POST returns a base64 v0 message for the wallet to sign.


## Test with Anchor wallet and curl

Use your devnet wallet at `~/.config/solana/id.json` to exercise the API.

- __1) Ensure services are running__
  - Frontend/API: `yarn dev` (http://localhost:3000)
  - Program deployed on devnet: `cd anchor && anchor deploy`

- __2) Get wallet pubkey and airdrop__
  ```bash
  solana config set --url https://api.devnet.solana.com
  solana address     # copy as <WALLET_PUBKEY>
  solana airdrop 2   # repeat if needed
  ```

- __3) Fetch candidate addresses for a poll__
  - Browser: http://localhost:3000/api/vote?pollId=2
  - Or with curl (optional jq pretty print):
    ```bash
    curl -s "http://localhost:3000/api/vote?pollId=2" | jq .candidates
    ```
  Copy the `publicKey` values of candidates you want to vote for.

- __4) Build a vote (POST) and inspect the response__
  The API expects `{ account, data: { plusVotes?, minusVotes? } }` where votes are arrays of candidate pubkeys.
  ```bash
  curl -s -X POST "http://localhost:3000/api/vote?pollId=2" \
    -H 'Content-Type: application/json' \
    --data '{
      "account": "<WALLET_PUBKEY>",
      "data": {
        "plusVotes": ["<CAND_PUBKEY_1>", "<CAND_PUBKEY_2>"],
        "minusVotes": ["<CAND_PUBKEY_3>"]
      }
    }' | jq
  ```
  You should see:
  ```json
  {
    "transaction": "BASE64_V0_MESSAGE_BYTES",
    "message": "Unsigned v0 message for poll 2"
  }
  ```
  Notes:
  - This is a v0 message, not a signed transaction. A wallet/client must construct a `VersionedTransaction`, sign, and send it.
  - On-chain checks enforce plus/minus caps and "minus requires at least two plus".

- __5) Optional: override RPC for the API__
  ```bash
  export NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
  ```


## Troubleshooting
- Toolchain versions
  - This repo pins Anchor 0.31.1 and Solana 2.2.12 in `anchor/Anchor.toml` and uses `@coral-xyz/anchor@0.31.1` in the frontend. Mismatched toolchains can cause build/runtime errors. Align Rust, Solana, and Anchor versions accordingly.
- IDL not found
  - Ensure `anchor build` ran successfully so `anchor/target/idl/votingdapp.json` exists. The API route imports this IDL.
- Program ID mismatch
  - If you redeploy to a new address, update:
    - Rust `declare_id!` in `anchor/programs/votingdapp/src/lib.rs`
    - Frontend constant `PROGRAM_ID` in `src/app/api/vote/route.ts`
- Devnet airdrops fail
  - Try again or switch RPC. You can set `NEXT_PUBLIC_RPC_URL` for the frontend.
- Test failures
  - Run tests from `anchor/` and inspect printed logs on failure in `tests/votingdapp.spec.ts`.


## License
This project is licensed under the terms of the MIT License. See `LICENSE`.
