// scripts/initialize-poll.js

const path = require("path");
const fs = require("fs");
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");

// Load wallet keypair for signing transactions
function loadKeypair() {
  const keypairPath = path.resolve(
    process.env.HOME || "",
    ".config/solana/id.json"
  );
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  return Keypair.fromSecretKey(new Uint8Array(secret));
}

// Load the IDL JSON synchronously
function loadIdl() {
  const idlPath = path.resolve(
    __dirname,
    "../anchor/target/idl/votingdapp.json"
  );
  const raw = fs.readFileSync(idlPath, "utf8");
  return JSON.parse(raw);
}

async function initializePoll(
  program,
  wallet,
  pollId,
  description,
  winners,
  startTime,
  endTime
) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(pollId, 0);

  const [pollPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), buf],
    PROGRAM_ID
  );

  const now = Math.floor(Date.now() / 1000);
  const pollStart = startTime || now;
  const pollEnd = endTime || now + 7 * 24 * 60 * 60;

  const txSig = await program.methods
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
    })
    .rpc();

  console.log(`✔ Poll ${pollId} initialized: ${txSig}`);

  const pollAccount = await program.account.poll.fetch(pollPDA);
  console.log(`  + plusVotesAllowed: ${pollAccount.plusVotesAllowed}`);
  console.log(`  + minusVotesAllowed: ${pollAccount.minusVotesAllowed}`);
}

async function ensurePollExists(program, wallet, pollId, description, winners, startTime, endTime) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(pollId, 0);
  const [pollPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), buf],
    PROGRAM_ID
  );
  try {
    await program.account.poll.fetch(pollPDA);
    console.log(`ℹ Poll ${pollId} already exists at ${pollPDA.toBase58()}; skipping initialization.`);
  } catch (_) {
    await initializePoll(program, wallet, pollId, description, winners, startTime, endTime);
  }
}

async function initializeCandidate(program, wallet, pollId, candidateName) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(pollId, 0);

  const [pollPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), buf],
    PROGRAM_ID
  );
  const [candidatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("cand"), buf, Buffer.from(candidateName)],
    PROGRAM_ID
  );

  // Check existence to keep script idempotent and avoid affecting other polls
  try {
    await program.account.candidate.fetch(candidatePDA);
    console.log(`ℹ Candidate "${candidateName}" already exists; skipping.`);
    return;
  } catch (_) {
    // proceed to create
  }

  const txSig = await program.methods
    .initializeCandidate(candidateName, pollId)
    .accounts({
      signer: wallet.publicKey,
      poll: pollPDA,
      candidate: candidatePDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`✔ Candidate "${candidateName}" added: ${txSig}`);
}

async function main() {
  // Program ID from lib.rs
  global.PROGRAM_ID = new PublicKey(
    "HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx"
  );

  const idl = loadIdl();
  const keypair = loadKeypair();
  const wallet = new anchor.Wallet(keypair);

  const connection = new anchor.web3.Connection(
    process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com",
    "confirmed"
  );
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  const program = new anchor.Program(idl, provider);

  // Parse pollId from CLI (default 2 to preserve existing behavior)
  const argPollId = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;
  const pollId = Number.isInteger(argPollId) ? argPollId : 2;

  // Configure per-poll defaults
  let description;
  let winners;
  let candidates;

  if (pollId === 1) {
    description = "Alice vs Bob — Public Policy Preferences";
    winners = 5;
    const topics = ["Education", "Security", "Healthcare", "Defense", "Taxes"];
    const alice = topics.map((t) => `Alice - ${t}`);
    const bob = topics.map((t) => `Bob - ${t}`);
    candidates = [...alice, ...bob];
  } else {
    // existing sample for poll 2 (unchanged)
    description = "Tech vs Environment Policy Debate";
    winners = 3;
    candidates = [
      "Tech Innovation Focus",
      "Environmental Protection",
      "Balanced Approach",
      "Economic Growth Priority",
      "Renewable Energy Push",
    ];
  }

  // Create poll only if missing (so we don't overwrite existing state)
  await ensurePollExists(program, wallet, pollId, description, winners, [], []);

  // Add candidates idempotently
  for (const name of candidates) {
    await initializeCandidate(program, wallet, pollId, name);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("🎉 All done!");
}

main().catch((err) => {
  console.error("Initialization failed:", err);
  process.exit(1);
});
