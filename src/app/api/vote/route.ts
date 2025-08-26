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
function createProgram(connection: anchor.web3.Connection, wallet?: anchor.Wallet): Program {
  const provider = new AnchorProvider(
    connection,
    wallet || {
      publicKey: PROGRAM_ID,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    },
    { commitment: "confirmed" }
  );
  return new Program(VotingdappIDL as any, provider);
}

// GET: fetch poll & candidates
export async function GET(request: Request) {
  const url = new URL(request.url);
  const pollId = parseInt(url.searchParams.get("pollId") || "1", 10);
  
  if (isNaN(pollId)) {
    return Response.json(
      { error: "Invalid poll ID" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  const connection = new anchor.web3.Connection(
    process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com",
    "confirmed"
  );
  const program = createProgram(connection);

  // fetch all candidates
  const candidatesRaw = await program.account['candidate'].all();
  const candidates = candidatesRaw
    .filter((c) => {
      const nameBytes = Buffer.from(c.account.name).subarray(
        0,
        c.account.name.findIndex((b) => b === 0) >= 0
          ? c.account.name.findIndex((b) => b === 0)
          : 32
      );
      return getCandidatePDA(pollId, nameBytes.toString()).equals(
        c.publicKey
      );
    })
    .map((c) => ({
      publicKey: c.publicKey.toString(),
      name: Buffer.from(c.account.name)
        .toString()
        .replace(/\0/g, ""),
    }));

  try {
    const pollPDA = getPollPDA(pollId);
    const pollAccount = await program.account['poll'].fetch(pollPDA);

    const response: ActionGetResponse & {
      name: string;
      plusVotesAllowed: number;
      minusVotesAllowed: number;
      candidates: Array<{ publicKey: string; name: string }>;
    } = {
      icon: "https://example.com/voting-icon.jpg",
      title: `Poll ${pollId}: ${pollAccount.pollDescription}`,
      description: `Cast up to ${pollAccount.plusVotesAllowed} positive and ${pollAccount.minusVotesAllowed} negative votes.`,
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
                label: `Select up to ${pollAccount.plusVotesAllowed} for positive`,
                required: true,
              },
              {
                name: "minusVotes",
                label: `Select up to ${pollAccount.minusVotesAllowed} for negative (optional)` ,
                required: false,
              },
            ],
          },
        ],
      },
    };
    return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
  } catch (e: any) {
    return Response.json(
      { error: `Poll ${pollId} not found on-chain` },
      { status: 404, headers: ACTIONS_CORS_HEADERS }
    );
  }
}

// POST: build unsigned vote transaction and return base64
export async function POST(request: Request) {
  const url = new URL(request.url);
  const pollId = parseInt(url.searchParams.get("pollId") || "1", 10);
  if (isNaN(pollId)) {
    return Response.json(
      { error: "Invalid poll ID" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  const body: ActionPostRequest = await request.json();
  if (!body.account) {
    return Response.json(
      { error: "Missing voter public key" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  let voter: PublicKey;
  try {
    voter = new PublicKey(body.account);
  } catch {
    return Response.json(
      { error: "Invalid voter public key" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  // parse votes
  const requestData = body.data as {
    plusVotes?: string | string[];
    minusVotes?: string | string[];
  };
  const plusVotes = Array.isArray(requestData.plusVotes)
    ? requestData.plusVotes
    : requestData.plusVotes
    ? [requestData.plusVotes]
    : [];
  const minusVotes = Array.isArray(requestData.minusVotes)
    ? requestData.minusVotes
    : requestData.minusVotes
    ? [requestData.minusVotes]
    : [];

  // on-chain checks
  const connection = new anchor.web3.Connection(
    process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com",
    "confirmed"
  );
  const program = createProgram(connection);
  const pollPDA = getPollPDA(pollId);
  let pollAccount;
  try {
    pollAccount = await program.account['poll'].fetch(pollPDA);
  } catch (e: any) {
    return Response.json(
      { error: "Poll fetch failed on-chain", details: e.message },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }

  // build allocations
  const plusAlloc = plusVotes.map((str) => ({
    candidate: new PublicKey(str),
    votes: 1,
  }));
  const minusAlloc = minusVotes.map((str) => ({
    candidate: new PublicKey(str),
    votes: 1,
  }));
  const uniqueCandidates = Array.from(
    new Map(
      [...plusAlloc, ...minusAlloc].map((a) => [
        a.candidate.toString(),
        a.candidate,
      ])
    ).values()
  );
  const remainingAccounts = uniqueCandidates.map((c) => ({
    pubkey: c,
    isWritable: true,
    isSigner: false,
  }));

  // create vote instruction
  let ix;
  try {
    ix = await program.methods
      .vote(pollId, plusAlloc, minusAlloc)
      .accounts({
        signer: voter,
        poll: pollPDA,
        voterRecord: getVoterRecordPDA(pollId, voter),
        systemProgram: SystemProgram.programId,
      } as any)
      .remainingAccounts(remainingAccounts)
      .instruction();
  } catch (e: any) {
    return Response.json(
      { error: "Failed to build vote instruction", details: e.message },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }

  // compose unsigned transaction
  const { blockhash } = await connection.getLatestBlockhash();
  // Build a v0 message so the client can deserialize with VersionedMessage.deserialize()
  const v0Msg = new TransactionMessage({
    payerKey: voter,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  // Return only the message bytes; the client constructs VersionedTransaction and signs
  const transactionBase64 = Buffer.from(v0Msg.serialize()).toString("base64");

  return Response.json(
    {
      transaction: transactionBase64,
      message: `Unsigned v0 message for poll ${pollId}`
    },
    { headers: ACTIONS_CORS_HEADERS }
  );
}
