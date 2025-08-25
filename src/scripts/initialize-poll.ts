import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import VotingdappIDL from "@/../anchor/target/idl/votingdapp.json";
import { Votingdapp } from "anchor/target/types/votingdapp";

const PROGRAM_ID = new PublicKey("HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx");

async function initializePoll(
  pollId: number,
  description: string,
  winners: number,
  startTime?: number,
  endTime?: number
) {
  const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
  const connection = new anchor.web3.Connection(RPC, "confirmed");
  
  // Load wallet keypair (you'll need to provide your keypair file)
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(require('fs').readFileSync('~/.config/solana/id.json', 'utf8')))
  );
  
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program(VotingdappIDL as any, provider) as Program<Votingdapp>;

  // Calculate PDAs
  const pollIdBytes = Buffer.alloc(8);
  pollIdBytes.writeBigUInt64LE(BigInt(pollId), 0);
  
  const [pollPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), pollIdBytes.subarray(0, 4)], // Use first 4 bytes as u32
    PROGRAM_ID
  );

  const now = Math.floor(Date.now() / 1000);
  const pollStart = startTime || now;
  const pollEnd = endTime || (now + 7 * 24 * 60 * 60); // 7 days from now

  try {
    const signature = await program.methods
      .initializePoll(
        new anchor.BN(pollId),
        description,
        new anchor.BN(pollStart),
        new anchor.BN(pollEnd),
        winners
      )
      .accounts({
        signer: wallet.publicKey,
        poll: pollPDA,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    console.log(`Poll ${pollId} initialized successfully!`);
    console.log(`Transaction signature: ${signature}`);
    console.log(`Poll PDA: ${pollPDA.toString()}`);
    
    // Fetch and display poll data
    const pollAccount = await program.account.poll.fetch(pollPDA);
    console.log(`Plus votes allowed: ${pollAccount.plusVotesAllowed}`);
    console.log(`Minus votes allowed: ${pollAccount.minusVotesAllowed}`);
    
  } catch (error) {
    console.error("Error initializing poll:", error);
  }
}

// Initialize Poll 2
initializePoll(
  2,
  "Tech vs Environment Policy Debate",
  3, // 3 winners
  Math.floor(Date.now() / 1000), // Start now
  Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60 // End in 14 days
);
async function initializeCandidate(
  pollId: number,
  candidateName: string,
  wallet: Wallet
) {
  // ... (same setup as above)
  
  const pollIdBytes = Buffer.alloc(4);
  pollIdBytes.writeUInt32LE(pollId, 0);
  
  const [pollPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), pollIdBytes],
    PROGRAM_ID
  );
  
  const [candidatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("cand"), pollIdBytes, Buffer.from(candidateName)],
    PROGRAM_ID
  );

  const signature = await program.methods
    .initializeCandidate(candidateName, pollId)
    .accounts({
      signer: wallet.publicKey,
      poll: pollPDA,
      candidate: candidatePDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`Candidate "${candidateName}" added to poll ${pollId}`);
  console.log(`Transaction signature: ${signature}`);
}

// Add candidates for Poll 2
const candidates = [
  "Tech Innovation Focus",
  "Environmental Protection",
  "Balanced Approach",
  "Economic Growth Priority",
  "Renewable Energy Push"
];

const wallet = new Wallet(keypair); // assuming keypair is defined elsewhere

for (const candidate of candidates) {
  await initializeCandidate(2, candidate, wallet);
}
