import {
  ActionGetResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  ActionPostRequest,
  ActionError,
} from "@solana/actions";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  TransactionMessage,
  Transaction,
} from "@solana/web3.js";
import VotingdappIDL from "@/../anchor/target/idl/votingdapp.json";
import { Votingdapp } from "anchor/target/types/votingdapp";

// Program ID from lib.rs
const PROGRAM_ID = new PublicKey("HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx");

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: ACTIONS_CORS_HEADERS });
}

// Helper: 4-byte LE poll ID
function getPollIdBytes(pollId: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(pollId, 0);
  return buf;
}

// Helper: Get poll PDA
function getPollPDA(pollId: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), getPollIdBytes(pollId)],
    PROGRAM_ID
  )[0];
}

// Helper: Get candidate PDA
function getCandidatePDA(pollId: number, candidateName: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cand"), getPollIdBytes(pollId), Buffer.from(candidateName)],
    PROGRAM_ID
  )[0];
}

// Helper: Get voter record PDA
function getVoterRecordPDA(pollId: number, voterKey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("voter"), voterKey.toBuffer(), getPollIdBytes(pollId)],
    PROGRAM_ID
  )[0];
}

// Helper: Create program instance
function createProgram(connection: anchor.web3.Connection) {
  const publicKey = PROGRAM_ID;
  const wallet = {
    publicKey,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const provider = new AnchorProvider(connection, wallet);
  return new Program(VotingdappIDL as any, provider) as Program<Votingdapp>;
}

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

  const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const program = createProgram(connection);

  try {
    // Try to fetch the poll from blockchain
    const pollPDA = getPollPDA(pollId);
    let pollAccount;
    let candidates: Array<{ publicKey: string; name: string }> = [];
    
    try {
      pollAccount = await program.account.poll.fetch(pollPDA);
      
      // Fetch candidates for this poll
      const candidatesRaw = await program.account.candidate.all();
      candidates = candidatesRaw
        .filter((c) => {
          // Derive PDA to verify this candidate belongs to our poll
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

      // Create response with actual blockchain data
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
      // Poll doesn't exist on-chain, provide demo data
      console.log("Poll not found on-chain, providing demo data");
      
      const demoCandidates = [
        "Alice - Education", "Alice - Security", "Alice - Healthcare", 
        "Alice - Defense", "Alice - Taxes",
        "Bob - Education", "Bob - Security", "Bob - Healthcare", 
        "Bob - Defense", "Bob - Taxes"
      ].map(name => ({
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
        title: "Alice vs Bob — Public Policy Preference Poll",
        description: "D21 Voting System Demo - Cast up to 2 positive and 1 negative votes. Choose your preferred policies across 5 key areas: education, security, healthcare, defense, and taxes.",
        label: "Vote",
        name: "Alice vs Bob — Public Policy Preferences",
        plusVotesAllowed: 2,
        minusVotesAllowed: 1,
        candidates: demoCandidates,
        links: {
          actions: [
            {
              label: "Cast Your Votes",
              href: `/api/vote?pollId=${pollId}`,
              type: "post",
              parameters: [
                {
                  name: "plusVotes",
                  label: "Select up to 2 candidates for positive votes",
                  required: true,
                },
                {
                  name: "minusVotes",
                  label: "Select up to 1 candidate for negative votes (optional)",
                  required: false,
                },
              ],
            },
          ],
        },
      };

      return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
    }

  } catch (error) {
    console.error("Error in GET handler:", error);
    return Response.json(
      { error: "Failed to load poll data" },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }
}

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

    // Parse vote data from request
    interface VoteData {
      plusVotes?: any;
      minusVotes?: any;
    }

    const requestData = body.data as VoteData;
    const plusVoteCandidates: string[] = Array.isArray(requestData.plusVotes) 
      ? requestData.plusVotes 
      : (requestData.plusVotes ? [requestData.plusVotes] : []);
    const minusVoteCandidates: string[] = Array.isArray(requestData.minusVotes) 
      ? requestData.minusVotes 
      : (requestData.minusVotes ? [requestData.minusVotes] : []);

    // Validate that we have at least some votes
    if (plusVoteCandidates.length === 0) {
      return Response.json(
        { error: "At least one positive vote is required" },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    // Try to get poll data
    const pollPDA = getPollPDA(pollId);
    let pollAccount;
    
    try {
      pollAccount = await program.account.poll.fetch(pollPDA);
    } catch {
      // Demo mode for poll ID 1
      if (pollId === 1) {
        return handleDemoVote(plusVoteCandidates, minusVoteCandidates);
      }
      
      return Response.json(
        { error: "Poll not found" },
        { status: 404, headers: ACTIONS_CORS_HEADERS }
      );
    }

    // Validate vote constraints
    const sumPlus = plusVoteCandidates.length;
    const sumMinus = minusVoteCandidates.length;

    if (sumPlus > pollAccount.plusVotesAllowed) {
      return Response.json(
        { error: `Too many positive votes (max ${pollAccount.plusVotesAllowed})` },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    if (sumMinus > pollAccount.minusVotesAllowed) {
      return Response.json(
        { error: `Too many negative votes (max ${pollAccount.minusVotesAllowed})` },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    if (sumPlus + sumMinus >= pollAccount.candidateCount.toNumber()) {
      return Response.json(
        { error: `Total votes must be less than ${pollAccount.candidateCount}` },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    if (sumMinus > 0 && sumPlus < 2) {
      return Response.json(
        { error: "At least 2 positive votes required to cast negative votes" },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    // Check if voter has already voted
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
      // Voter record doesn't exist yet - this is expected for first-time voters
    }

    // Convert candidate strings to PublicKeys and create vote allocations
    const plusAllocations = plusVoteCandidates.map(candidateStr => {
      try {
        return {
          candidate: new PublicKey(candidateStr),
          votes: 1,
        };
      } catch {
        throw new Error(`Invalid candidate public key: ${candidateStr}`);
      }
    });

    const minusAllocations = minusVoteCandidates.map(candidateStr => {
      try {
        return {
          candidate: new PublicKey(candidateStr),
          votes: 1,
        };
      } catch {
        throw new Error(`Invalid candidate public key: ${candidateStr}`);
      }
    });

    // Build remaining accounts (all voted candidate PDAs)
    const allVotedCandidates = [
      ...plusAllocations.map(a => a.candidate),
      ...minusAllocations.map(a => a.candidate),
    ];

    // Remove duplicates
    const uniqueCandidates = Array.from(
      new Map(allVotedCandidates.map(key => [key.toString(), key])).values()
    );

    const remainingAccounts = uniqueCandidates.map(candidateKey => ({
      pubkey: candidateKey,
      isWritable: true,
      isSigner: false,
    }));

    // Create the vote instruction
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

    // Create transaction
    const { blockhash } = await connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: voter,
      recentBlockhash: blockhash,
      instructions: [instruction],
    }).compileToLegacyMessage();

    const transaction = new Transaction(message);

    // Return the transaction using Solana Actions format
    const response = await createPostResponse({
      fields: {
        type: "transaction",
        transaction,
        message: `Submitting ${sumPlus} positive and ${sumMinus} negative votes to poll ${pollId}`,
      },
    });

    return Response.json(response, { headers: ACTIONS_CORS_HEADERS });

  } catch (error: any) {
    console.error("Error in POST handler:", error);
    
    // Handle specific program errors
    let errorMessage = "Failed to create vote transaction";
    if (error.message?.includes("Invalid candidate public key")) {
      errorMessage = error.message;
    } else if (error.message?.includes("TooManyPlus")) {
      errorMessage = "Too many positive votes";
    } else if (error.message?.includes("TooManyMinus")) {
      errorMessage = "Too many negative votes";
    } else if (error.message?.includes("MinusRequiresTwoPlus")) {
      errorMessage = "At least 2 positive votes required for negative votes";
    } else if (error.message?.includes("AlreadyVoted")) {
      errorMessage = "You have already voted in this poll";
    }

    return Response.json(
      { error: errorMessage },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }
}

// Handle demo voting for poll ID 1 when no on-chain poll exists
function handleDemoVote(
  plusVoteCandidates: string[], 
  minusVoteCandidates: string[]
): Response {
  const sumPlus = plusVoteCandidates.length;
  const sumMinus = minusVoteCandidates.length;

  // Demo constraints: 2 plus, 1 minus max
  if (sumPlus > 2) {
    return Response.json(
      { error: "Too many positive votes (max 2)" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  if (sumMinus > 1) {
    return Response.json(
      { error: "Too many negative votes (max 1)" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  if (sumMinus > 0 && sumPlus < 2) {
    return Response.json(
      { error: "At least 2 positive votes required to cast negative votes" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  if (sumPlus + sumMinus > 3) {
    return Response.json(
      { error: "Total votes must be 3 or less" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  // In demo mode, just return success
  return Response.json(
    { 
      message: "Demo vote recorded successfully! No blockchain transaction required.",
      mode: "demo",
      votes: {
        plus: plusVoteCandidates,
        minus: minusVoteCandidates,
      }
    },
    { headers: ACTIONS_CORS_HEADERS }
  );
}