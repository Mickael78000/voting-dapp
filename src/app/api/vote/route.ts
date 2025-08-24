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
  const RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com'
  const connection = new anchor.web3.Connection(RPC, 'confirmed')
  const publicKey = new PublicKey("HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx");

  // Minimal wallet implementation for AnchorProvider
  const wallet = {
    publicKey,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };

  const provider = new AnchorProvider(connection, wallet);
  const program = new Program<Votingdapp>(VotingdappIDL as any, provider);
  // Fetch all polls
  const pollsRaw = await program.account.poll.all();

  if (pollsRaw.length === 0) {
    // Demo fallback: Alice vs Bob with 2 plus and 1 minus allowed
    interface CustomActionGetResponse extends ActionGetResponse {
      name: string;
      plusVotesAllowed: number;
      minusVotesAllowed: number;
    }

    const demo: CustomActionGetResponse = {
      icon: "https://example.com/voting-icon.jpg",
      // The UI expects a poll name and limits
      name: "Alice vs Bob — Public Policy Preference",
      plusVotesAllowed: 2,
      minusVotesAllowed: 1,
      title: "Public Policy Preference Poll",
      description: "Cast up to 2 positive and 1 negative votes. Alice and Bob each propose programs for: education, security, healthcare, defense, taxes.",
      label: "Vote",
      links: {
        actions: [
          {
            label: "Open Voting Interface",
            href: `/api/vote?pollId=1`,
            type: "post",
          },
        ],
      },
    };

    (demo as any).candidates = [
      { publicKey: "AliceEducation111111111111111111111111111111", name: "Alice - Education" },
      { publicKey: "AliceSecurity1111111111111111111111111111111", name: "Alice - Security" },
      { publicKey: "AliceHealthcare1111111111111111111111111111", name: "Alice - Healthcare" },
      { publicKey: "AliceDefense11111111111111111111111111111111", name: "Alice - Defense" },
      { publicKey: "AliceTaxes1111111111111111111111111111111111", name: "Alice - Taxes" },
      { publicKey: "BobEducation11111111111111111111111111111111", name: "Bob - Education" },
      { publicKey: "BobSecurity111111111111111111111111111111111", name: "Bob - Security" },
      { publicKey: "BobHealthcare111111111111111111111111111111", name: "Bob - Healthcare" },
      { publicKey: "BobDefense1111111111111111111111111111111111", name: "Bob - Defense" },
      { publicKey: "BobTaxes111111111111111111111111111111111111", name: "Bob - Taxes" },
    ];

    return Response.json(demo, { headers: ACTIONS_CORS_HEADERS });
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

  const RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com'
  const connection = new anchor.web3.Connection(RPC, 'confirmed')
  const publicKey = new PublicKey("HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx");

  // Minimal wallet implementation for AnchorProvider
  const wallet = {
    publicKey,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };

  const provider = new AnchorProvider(connection, wallet);
  const program = new Program<Votingdapp>(VotingdappIDL as any, provider);
  // Derive poll PDA correctly
  const [pollPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), getPollIdBytes(pollId)],
    program.programId
  );

  let pollAccount;

  try {
    pollAccount = await program.account.poll.fetch(pollPda);
  } catch {
    // Demo fallback path for pollId=1 (no on-chain poll). Validate locally and return 200.
    if (pollId === 1) {
      const body = (await request.json()) as { 
        account: string; 
        plusAllocations: { candidate: string; votes: number }[]; 
        minusAllocations: { candidate: string; votes: number }[] 
      };

      if (!body?.account) {
        return new Response("Invalid account", { 
          status: 400, 
          headers: ACTIONS_CORS_HEADERS 
        });
      }

      // Validate D21 locally: 2 plus, 1 minus, total <= 3, minus requires 2 plus
      const plusAlloc: { candidate: string; votes: number }[] = body.plusAllocations || [];
      const minusAlloc: { candidate: string; votes: number }[] = body.minusAllocations || [];

      const sumPlus = plusAlloc.reduce((acc, a) => acc + (a.votes || 1), 0);
      const sumMinus = minusAlloc.reduce((acc, a) => acc + (a.votes || 1), 0);

      if (sumPlus > 2) {
        return new Response(`Too many positive votes (max 2)`, { 
          status: 400, 
          headers: ACTIONS_CORS_HEADERS 
        });
      }

      if (sumMinus > 1) {
        return new Response(`Too many negative votes (max 1)`, { 
          status: 400, 
          headers: ACTIONS_CORS_HEADERS 
        });
      }

      if (sumMinus > 0 && sumPlus < 2) {
        return new Response("At least 2 positive votes required to cast negative votes", { 
          status: 400, 
          headers: ACTIONS_CORS_HEADERS 
        });
      }

      if (sumPlus + sumMinus > 3) {
        return new Response(`Total votes must be less than or equal to 3`, { 
          status: 400, 
          headers: ACTIONS_CORS_HEADERS 
        });
      }

      // Accept demo submission
      return Response.json({ ok: true, mode: "demo" }, { 
        headers: ACTIONS_CORS_HEADERS 
      });
    }

    return new Response("Poll not found", { 
      status: 404, 
      headers: ACTIONS_CORS_HEADERS 
    });
  }

  const body = await request.json() as { 
    account: string; 
    plusAllocations: { candidate: string; votes: number }[]; 
    minusAllocations: { candidate: string; votes: number }[] 
  };

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

  const plusAlloc: { candidate: string; votes: number }[] = body.plusAllocations || [];
  const minusAlloc: { candidate: string; votes: number }[] = body.minusAllocations || [];

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
    // Voter record not initialized yet - this is expected for first-time voters
  }

  // Build unique remainingAccounts
  const seen = new Set();
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