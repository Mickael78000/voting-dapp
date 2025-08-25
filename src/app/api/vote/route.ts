import {
  ActionGetResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  ActionPostRequest
} from "@solana/actions";

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, TransactionMessage, Transaction } from "@solana/web3.js";

import VotingdappIDL from "@/../anchor/target/idl/votingdapp.json";
import type { Votingdapp } from "anchor/target/types/votingdapp";

// Program ID for your deployed Anchor program
const PROGRAM_ID = new PublicKey("HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx");

// CORS preflight
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: ACTIONS_CORS_HEADERS });
}

// PDA Helpers
function getPollIdBytes(pollId: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(pollId, 0);
  return buf;
}

function getPollPDA(pollId: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), getPollIdBytes(pollId)],
    PROGRAM_ID
  )[0];
}

function getCandidatePDA(pollId: number, candidateName: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cand"), getPollIdBytes(pollId), Buffer.from(candidateName)],
    PROGRAM_ID
  )[0];
}

function getVoterRecordPDA(pollId: number, voterKey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("voter"), voterKey.toBuffer(), getPollIdBytes(pollId)],
    PROGRAM_ID
  )[0];
}

// Create Anchor program instance
function createProgram(connection: anchor.web3.Connection): Program<Votingdapp> {
  const wallet = {
    publicKey: PROGRAM_ID,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const provider = new AnchorProvider(connection, wallet);
  return new Program<Votingdapp>(VotingdappIDL as any, provider);
}

// GET handler - fetch poll and candidates or fallback demo
export async function GET(request: Request) {
  const url = new URL(request.url);
  const pollIdParam = url.searchParams.get("pollId") || "1";
  const pollId = parseInt(pollIdParam, 10);

  if (isNaN(pollId)) {
    return Response.json(
      { error: "Invalid poll ID" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  try {
    const connection = new anchor.web3.Connection(
      process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );
    const program = createProgram(connection);

    const pollPDA = getPollPDA(pollId);
    const pollAccount = await program.account.poll.fetch(pollPDA);

    const candidatesRaw = await program.account.candidate.all();
    const candidates = candidatesRaw
      .filter((c) => {
        const nameBytes = Buffer.from(c.account.name).subarray(
          0,
          c.account.name.findIndex((b) => b === 0) >= 0
            ? c.account.name.findIndex((b) => b === 0)
            : 32
        );
        const expectedPDA = getCandidatePDA(pollId, nameBytes.toString());
        return expectedPDA.equals(c.publicKey);
      })
      .map((c) => ({
        publicKey: c.publicKey.toString(),
        name: Buffer.from(c.account.name).toString().replace(/\0/g, ""),
      }));

    const response: ActionGetResponse & {
      name: string;
      plusVotesAllowed: number;
      minusVotesAllowed: number;
      candidates: Array<{ publicKey: string; name: string }>;
    } = {
      icon: "https://example.com/voting-icon.jpg",
      title: `Poll ${pollId}: ${pollAccount.pollDescription}`,
      description: `D21 Voting System - Cast up to ${pollAccount.plusVotesAllowed} positive and ${pollAccount.minusVotesAllowed} negative votes. This poll has ${candidates.length} candidates competing for ${pollAccount.winners} seats.`,
      label: "Vote",
      name: pollAccount.pollDescription,
      plusVotesAllowed: pollAccount.plusVotesAllowed,
      minusVotesAllowed: pollAccount.minusVotesAllowed,
      candidates,
      links: {
        actions: [
          {
            label: "Cast Your Votes",
            href: `/api/vote?pollId=${pollId}`,
            type: "post",
            parameters: [
              {
                name: "plusVotes",
                label: `Select up to ${pollAccount.plusVotesAllowed} candidates for positive votes`,
                required: true,
              },
              {
                name: "minusVotes",
                label: `Select up to ${pollAccount.minusVotesAllowed} candidates for negative votes (optional)`,
                required: false,
              },
            ],
          },
        ],
      },
    };

    return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
  } catch (pollError) {
    // Fallback to demo if poll account not found
    return generateFallbackPoll(pollId);
  }
}

function generateFallbackPoll(pollId: number): Response {
  const fallbackPolls = {
    1: {
      title: "Alice vs Bob — Public Policy Preference Poll",
      description: "D21 Voting System Demo - Cast up to 2 positive and 1 negative votes. Choose your preferred policies across 5 key areas: education, security, healthcare, defense, and taxes.",
      name: "Alice vs Bob — Public Policy Preferences",
      plusVotesAllowed: 2,
      minusVotesAllowed: 1,
      candidates: [
        "Alice - Education", "Alice - Security", "Alice - Healthcare",
        "Alice - Defense", "Alice - Taxes",
        "Bob - Education", "Bob - Security", "Bob - Healthcare",
        "Bob - Defense", "Bob - Taxes"
      ],
    },
    2: {
      title: "Tech vs Environment Policy Debate",
      description: "D21 Voting Demo - Cast up to 3 positive and 1 negative votes. This poll is not yet initialized on-chain.",
      name: "Tech vs Environment Policy Debate",
      plusVotesAllowed: 3,
      minusVotesAllowed: 1,
      candidates: [
        "Tech Innovation Focus",
        "Environmental Protection",
        "Balanced Approach",
        "Economic Growth Priority",
        "Renewable Energy Push"
      ],
    },
  } as const;

  const fallback = fallbackPolls[pollId] || {
    title: `Poll ${pollId} - Not Found`,
    description: `D21 Voting System - Poll ${pollId} has not been initialized on-chain yet.`,
    name: `Uninitialized Poll ${pollId}`,
    plusVotesAllowed: 2,
    minusVotesAllowed: 1,
    candidates: ["Option A", "Option B", "Option C", "Option D"],
  };

  const demoCandidates = fallback.candidates.map((name: string) => ({
    publicKey: getCandidatePDA(pollId, name).toString(),
    name,
  }));

  const response: ActionGetResponse & {
    name: string;
    plusVotesAllowed: number;
    minusVotesAllowed: number;
    candidates: Array<{ publicKey: string; name: string }>;
  } = {
    icon: "https://example.com/voting-icon.jpg",
    title: fallback.title,
    description: fallback.description,
    label: "Vote (Demo Mode)",
    name: fallback.name,
    plusVotesAllowed: fallback.plusVotesAllowed,
    minusVotesAllowed: fallback.minusVotesAllowed,
    candidates: demoCandidates,
    links: {
      actions: [
        {
          label: "Cast Your Votes (Demo)",
          href: `/api/vote?pollId=${pollId}`,
          type: "post",
          parameters: [
            {
              name: "plusVotes",
              label: `Select up to ${fallback.plusVotesAllowed} candidates for positive votes`,
              required: true,
            },
            {
              name: "minusVotes",
              label: `Select up to ${fallback.minusVotesAllowed} candidates for negative votes (optional)`,
              required: false,
            },
          ],
        },
      ],
    },
  };

  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}

// POST handler to cast votes
export async function POST(request: Request) {
  const url = new URL(request.url);
  const pollIdParam = url.searchParams.get("pollId") || "1";
  const pollId = parseInt(pollIdParam, 10);

  if (isNaN(pollId)) {
    return Response.json(
      { error: "Invalid poll ID" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const program = createProgram(connection);

  try {
    const body: ActionPostRequest = await request.json();

    if (!body.account) {
      return Response.json(
        { error: "Missing account in request body" },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    let voter: PublicKey;
    try {
      voter = new PublicKey(body.account);
    } catch {
      return Response.json(
        { error: "Invalid account public key" },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    const requestData = body.data as {
      plusVotes?: any;
      minusVotes?: any;
    };

    const plusVoteCandidates: string[] = Array.isArray(requestData.plusVotes)
      ? requestData.plusVotes
      : requestData.plusVotes
      ? [requestData.plusVotes]
      : [];

    const minusVoteCandidates: string[] = Array.isArray(requestData.minusVotes)
      ? requestData.minusVotes
      : requestData.minusVotes
      ? [requestData.minusVotes]
      : [];

    if (plusVoteCandidates.length === 0) {
      return Response.json(
        { error: "At least one positive vote is required" },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    const pollPDA = getPollPDA(pollId);
    let pollAccount;
    try {
      pollAccount = await program.account.poll.fetch(pollPDA);
    } catch {
      return handleDemoVote(pollId, plusVoteCandidates, minusVoteCandidates);
    }

    if (plusVoteCandidates.length > pollAccount.plusVotesAllowed) {
      return Response.json(
        { error: `Too many positive votes (max ${pollAccount.plusVotesAllowed})` },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    if (minusVoteCandidates.length > pollAccount.minusVotesAllowed) {
      return Response.json(
        { error: `Too many negative votes (max ${pollAccount.minusVotesAllowed})` },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    if (plusVoteCandidates.length + minusVoteCandidates.length >= pollAccount.candidateCount.toNumber()) {
      return Response.json(
        { error: `Total votes must be less than ${pollAccount.candidateCount}` },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    if (minusVoteCandidates.length > 0 && plusVoteCandidates.length < 2) {
      return Response.json(
        { error: "At least 2 positive votes required to cast negative votes" },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    const voterRecordPDA = getVoterRecordPDA(pollId, voter);
    try {
      const voterRecord = await program.account.voterRecord.fetch(voterRecordPDA);
      if (voterRecord.hasVoted) {
        return Response.json(
          { error: "Voter has already cast a ballot" },
          { status: 400, headers: ACTIONS_CORS_HEADERS }
        );
      }
    } catch {
      // Voter record not found, expected for new voters
    }

    // Convert candidates strings to PublicKeys and prepare allocations
    const plusAllocations = plusVoteCandidates.map((str) => {
      try {
        return { candidate: new PublicKey(str), votes: 1 };
      } catch {
        throw new Error(`Invalid candidate public key: ${str}`);
      }
    });

    const minusAllocations = minusVoteCandidates.map((str) => {
      try {
        return { candidate: new PublicKey(str), votes: 1 };
      } catch {
        throw new Error(`Invalid candidate public key: ${str}`);
      }
    });

    // Collect unique candidate accounts
    const allCandidates = [...plusAllocations, ...minusAllocations].map((a) => a.candidate);
    const uniqueCandidates = Array.from(new Map(allCandidates.map(c => [c.toString(), c])).values());

    const remainingAccounts = uniqueCandidates.map(c => ({
      pubkey: c,
      isWritable: true,
      isSigner: false,
    }));

    // Create vote instruction
    const instruction = await program.methods
      .vote(pollId, plusAllocations, minusAllocations)
      .accounts({
        signer: voter,
        poll: pollPDA,
        voterRecord: voterRecordPDA,
        systemProgram: SystemProgram.programId,
      } as any)
      .remainingAccounts(remainingAccounts)
      .instruction();

    // Compose transaction
    const { blockhash } = await connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: voter,
      recentBlockhash: blockhash,
      instructions: [instruction],
    }).compileToLegacyMessage();

    const transaction = new Transaction(message);

    const response = await createPostResponse({
      fields: {
        type: "transaction",
        transaction,
        message: `Submitting ${plusAllocations.length} positive and ${minusAllocations.length} negative votes to poll ${pollId}`,
      },
    });

    return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
  } catch (error: any) {
    console.error("Error in POST handler:", error);
    return Response.json(
      {
        error: `Poll ${pollId} not found on-chain. Please initialize the poll first or try demo mode.`,
        suggestion: `Use poll ID 1 for demo mode or initialize poll ${pollId} using the Anchor program.`,
      },
      { status: 404, headers: ACTIONS_CORS_HEADERS }
    );
  }
}

function handleDemoVote(
  pollId: number,
  plusVoteCandidates: string[],
  minusVoteCandidates: string[]
): Response {
  const sumPlus = plusVoteCandidates.length;
  const sumMinus = minusVoteCandidates.length;

  const constraints = {
    1: { maxPlus: 2, maxMinus: 1 },
    2: { maxPlus: 3, maxMinus: 1 },
    default: { maxPlus: 2, maxMinus: 1 },
  };

  const { maxPlus, maxMinus } = constraints[pollId] || constraints.default;

  if (sumPlus > maxPlus) {
    return Response.json(
      { error: `Too many positive votes (max ${maxPlus})` },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }
  if (sumMinus > maxMinus) {
    return Response.json(
      { error: `Too many negative votes (max ${maxMinus})` },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }
  if (sumMinus > 0 && sumPlus < 2) {
    return Response.json(
      { error: "At least 2 positive votes required to cast negative votes" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  return Response.json(
    {
      message: `Demo vote recorded for poll ${pollId}! No blockchain transaction required.`,
      mode: "demo",
      pollId,
      votes: {
        plus: plusVoteCandidates,
        minus: minusVoteCandidates,
      },
      note: `Poll ${pollId} is not initialized on-chain. This is a simulation.`,
    },
    { headers: ACTIONS_CORS_HEADERS }
  );
}
