import { ACTIONS_CORS_HEADERS } from "@solana/actions";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import VotingdappIDL from "@/../anchor/target/idl/votingdapp.json";
import { Votingdapp } from "@votingdapp/votingdapp-exports";

const PROGRAM_ID = new PublicKey("HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx");

// Copy your helper functions here
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

function createProgram(connection: anchor.web3.Connection): Program<any> {
  const wallet = {
    publicKey: PROGRAM_ID,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const provider = new AnchorProvider(connection, wallet);
  return new Program(VotingdappIDL as any, provider);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pollId = parseInt(url.searchParams.get("pollId") || "2", 10);
  
  try {
    const connection = new anchor.web3.Connection(
      process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );

    const program: Program<Votingdapp> = createProgram(connection) as Program<Votingdapp>;
    const pollPDA = getPollPDA(pollId);

    console.log(`[DIAG] Poll PDA: ${pollPDA.toString()}`);
    
    // Test 1: Check if poll exists
    let pollExists = false;
    let pollData = null;
    try {
      pollData = await program.account.poll.fetch(pollPDA);
      pollExists = true;
      console.log(`[DIAG] Poll exists:`, pollData);
    } catch (e: any) {
      console.log(`[DIAG] Poll does not exist:`, e.message);
    }
    
    // Test 2: Get ALL candidates
    let allCandidates: any[] = [];
    try {
      allCandidates = await program.account.candidate.all();
      console.log(`[DIAG] Total candidates in program:`, allCandidates.length);
    } catch (e: any) {
      console.log(`[DIAG] Error fetching candidates:`, e.message);
    }
    
    // Test 3: Check specific candidate PDAs for Poll 2
    const expectedCandidates = [
      "Tech Innovation Focus",
      "Environmental Protection", 
      "Balanced Approach",
      "Economic Growth Priority",
      "Renewable Energy Push"
    ];
    
    const candidateChecks = expectedCandidates.map(name => {
      const expectedPDA = getCandidatePDA(pollId, name);
      const found = allCandidates.find(c => c.publicKey.equals(expectedPDA));
      return {
        name,
        expectedPDA: expectedPDA.toString(),
        found: !!found,
        actualData: found ? {
          name: Buffer.from(found.account.name).toString().replace(/\0/g, ""),
          rawName: Array.from(found.account.name).slice(0, 32)
        } : null
      };
    });
    
    return Response.json({
      pollId,
      pollPDA: pollPDA.toString(),
      pollExists,
      pollData: pollData ? {
        pollDescription: pollData.pollDescription,
        plusVotesAllowed: pollData.plusVotesAllowed,
        minusVotesAllowed: pollData.minusVotesAllowed,
        candidateCount: pollData.candidateCount?.toString(),
        winners: pollData.winners
      } : null,
      totalCandidates: allCandidates.length,
      candidateChecks,
      allCandidatesKeys: allCandidates.map(c => c.publicKey.toString()),
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
    }, { headers: ACTIONS_CORS_HEADERS });
    
  } catch (error: any) {
    return Response.json({ 
      error: error.message, 
      stack: error.stack,
      pollId 
    }, { headers: ACTIONS_CORS_HEADERS });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: ACTIONS_CORS_HEADERS });
}
