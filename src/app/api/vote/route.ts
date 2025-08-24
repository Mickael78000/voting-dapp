import {
  ActionGetResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
} from "@solana/actions";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider} from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  TransactionMessage,
  Transaction
} from "@solana/web3.js";
import VotingdappIDL from "@/../anchor/target/idl/votingdapp.json";
import { Votingdapp } from "anchor/target/types/votingdapp";
// import { publicKey } from "@coral-xyz/anchor/dist/cjs/utils";
// const { Transaction } = require('@coral-xyz/anchor/dist/cjs/spl_governance');

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: ACTIONS_CORS_HEADERS });
}

// Helper: 4-byte LE poll ID
function getPollIdBytes(pollId: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(pollId, 0);
  return buf;
}

export async function GET(request: Request) {
  const connection = new anchor.web3.Connection(
    "http://127.0.0.1:8899",
    "confirmed"
  );
  
  const publicKey = new PublicKey("HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx");
    // Minimal wallet implementation for AnchorProvider
    const wallet = {
      publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };
    const provider = new AnchorProvider(connection, wallet);
    const program = new Program<Votingdapp>(VotingdappIDL as any, { connection });

  // Fetch all polls
  const pollsRaw = await program.account.poll.all();
  if (pollsRaw.length === 0) {
    const noPolls: ActionGetResponse = {
      icon: "https://example.com/voting-icon.jpg",
      title: "D21 Voting System",
      description: "No active polls available at the moment.",
      label: "Check Later",
      links: { actions: [] },
    };
    return Response.json(noPolls, { headers: ACTIONS_CORS_HEADERS });
  }

  // Use first poll
  const pollAccount = pollsRaw[0].account;
  const pollId = pollAccount.pollId;
  const pollPda = pollsRaw[0].publicKey;

  // Fetch all candidates
  const candidatesRaw = await program.account.candidate.all();
  const candidates = candidatesRaw
    .filter((c) => {
      // Derive PDA from on-chain name & pollId seed
      // Trim zero padding
      const nameBytes = Buffer.from(c.account.name).slice(
        0,
        c.account.name.findIndex((b) => b === 0) >= 0
          ? c.account.name.findIndex((b) => b === 0)
          : 32
      );
      const seed = [
        Buffer.from("cand"),
        getPollIdBytes(pollId),
        Buffer.from(nameBytes),
      ];
      const [derived] = PublicKey.findProgramAddressSync(
        seed,
        program.programId
      );
      return derived.equals(c.publicKey);
    })
    .map((c) => ({
      publicKey: c.publicKey.toString(),
      name: Buffer.from(c.account.name)
        .toString()
        .replace(/\0/g, ""),
    }));

  const response: ActionGetResponse = {
    icon: "https://example.com/voting-icon.jpg",
    title: `Poll ${pollId}`,
    description: `Cast up to ${pollAccount.plusVotesAllowed} positive and ${pollAccount.minusVotesAllowed} negative votes.`,
    label: "Vote",
    links: {
      actions: [
        {
          label: "Open Voting Interface",
          href: `/api/vote?pollId=${pollId}`,
          type: "post",
        },
      ],
    },
  };

  // Include candidates list
  (response as any).candidates = candidates;

  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const pollIdParam = url.searchParams.get("pollId");
  if (!pollIdParam) {
    return new Response("Missing poll ID", {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
  const pollId = parseInt(pollIdParam, 10);
  if (isNaN(pollId)) {
        return new Response("Invalid poll ID", {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }

  const connection = new anchor.web3.Connection(
    "http://127.0.0.1:8899",
    "confirmed"
  );
  const publicKey = new PublicKey("HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx");
  // Minimal wallet implementation for AnchorProvider
  const wallet = {
    publicKey,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const provider = new AnchorProvider(connection, wallet);
    const program = new Program<Votingdapp>(VotingdappIDL as any, { connection });

  // Derive poll PDA correctly
  const [pollPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), getPollIdBytes(pollId)],
    program.programId
  );
  let pollAccount;
  try {
    pollAccount = await program.account.poll.fetch(pollPda);
  } catch {
    return new Response("Poll not found", {
      status: 404,
      headers: ACTIONS_CORS_HEADERS,
    });
  }

  const body = await request.json() as { account: string; plusAllocations: any; minusAllocations: any };
  if (!body?.account) {
    return new Response("Invalid account", {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
  let voter: PublicKey;
  try {
    voter = new PublicKey(body.account);
  } catch {
    return new Response("Invalid account", {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }

  const plusAlloc: { candidate: string; votes: number }[] =
    body.plusAllocations || [];
  const minusAlloc: { candidate: string; votes: number }[] =
    body.minusAllocations || [];

  // Sum votes
  const sumPlus = plusAlloc.reduce((acc, a) => acc + (a.votes || 1), 0);
  const sumMinus = minusAlloc.reduce((acc, a) => acc + (a.votes || 1), 0);

  // Enforce D21
  if (sumPlus > pollAccount.plusVotesAllowed) {
    return new Response(
      `Too many positive votes (max ${pollAccount.plusVotesAllowed})`,
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }
  if (sumMinus > pollAccount.minusVotesAllowed) {
    return new Response(
      `Too many negative votes (max ${pollAccount.minusVotesAllowed})`,
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }
  if (sumPlus + sumMinus >= pollAccount.candidateCount.toNumber()) {
    return new Response(
      `Total votes must be less than ${pollAccount.candidateCount}`,
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }
  if (sumMinus > 0 && sumPlus < 2) {
    return new Response(
      "At least 2 positive votes required to cast negative votes",
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  // Prevent double voting
  const [voterRecordPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("voter"),
      voter.toBuffer(),
      getPollIdBytes(pollId),
    ],
    program.programId
  );
  try {
    const vr = await program.account.voterRecord.fetch(voterRecordPda);
    if (vr.hasVoted) {
      return new Response("Voter has already cast a ballot", {
        status: 400,
        headers: ACTIONS_CORS_HEADERS,
      });
    }
  } catch {
    // not initialized yet
  }

  // Build unique remainingAccounts
  const seen = new Set<string>();
  const remainingAccounts = [];
  for (const a of [...plusAlloc, ...minusAlloc]) {
    if (!seen.has(a.candidate)) {
      seen.add(a.candidate);
      remainingAccounts.push({
        pubkey: new PublicKey(a.candidate),
        isWritable: true,
        isSigner: false,
      });
    }
  }

  const formattedPlus = plusAlloc.map((a) => ({
    candidate: new PublicKey(a.candidate),
    votes: a.votes || 1,
  }));
  const formattedMinus = minusAlloc.map((a) => ({
    candidate: new PublicKey(a.candidate),
    votes: a.votes || 1,
  }));

  const ix = await program.methods
    .vote(pollId, formattedPlus, formattedMinus)
    .accounts({
      signer: voter,
      poll: pollPda,
      voterRecord: voterRecordPda,
      systemProgram: SystemProgram.programId,
    } as any)
    .remainingAccounts(remainingAccounts)
    .instruction();

  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: voter,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToLegacyMessage();
  const tx = new anchor.web3.Transaction(message);
  const response = await createPostResponse({
    fields: { type: "transaction", transaction: tx },
  });
  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}
