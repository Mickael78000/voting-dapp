import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Votingdapp } from "../target/types/votingdapp";
import  VotingdappIDL  from '../target/idl/votingdapp.json';
import { expect, should } from "chai";
import { SendTransactionError } from "@solana/web3.js";

function getPollIdBytes(id: number): Buffer {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(id);
    return buf;
}

describe("votingdapp", () => {
  let plusAlloc: { candidate: PublicKey; votes: number }[] = [];
  let minusAlloc: { candidate: PublicKey; votes: number }[] = [];

 
  const programId = new PublicKey("HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx");
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program: anchor.Program<Votingdapp> = new anchor.Program(VotingdappIDL, provider);

  // Test keys
  const pollId = Math.floor(Math.random() * 10_000_000); // a random u32 value
  let pollPda: PublicKey;
  let pollBump: number;

  it("Happy: initialize poll", async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("poll"),getPollIdBytes(pollId)],
      program.programId
    );
    pollPda = pda;
    pollBump = bump;

    try {

    await program.methods
      .initializePoll(new anchor.BN(pollId), "Test poll?", new anchor.BN(0), new anchor.BN(999),2)
      .accounts({
        signer: provider.wallet.publicKey,
        poll: pollPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();
       } catch (err) {
    // Always print logs on error
    const logs = err?.logs ?? err?.logMessages;
    if (logs) {
      console.error("\n--- Transaction Failure Logs ---");
      logs.forEach((l: string) => console.error(l));
      console.error("--- End Logs ---\n");
    } else if (typeof err?.toString === 'function') {
      console.error(err.toString());
    }
    throw err; // Keep failing the test!
  }

    const poll = await program.account.poll.fetch(pollPda);
    expect(poll.pollId).to.equal(pollId);
    expect(poll.pollDescription).to.equal("Test poll?");
    expect(poll.candidateCount.toNumber()).to.equal(0);
    expect(poll.winners).to.equal(2);
    expect(poll.plusVotesAllowed).to.be.greaterThan(0);
    expect(poll.minusVotesAllowed).to.be.greaterThan(0);
  });

 it("Happy: initialize candidates", async () => {
  for (const name of ["Alice", "Bob"]) {
    const nameBuf = Buffer.from(name);
    const pollIdBytes = getPollIdBytes(pollId);

    // Log seed bytes and PDA
    [Buffer.from("cand"), pollIdBytes, nameBuf].forEach((seed, i) => {
      console.log(`Seed ${i}: [${Array.from(seed)}] as string: "${seed.toString()}"`);
    });
    const [candPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("cand"), pollIdBytes, nameBuf],
      program.programId
    );
    console.log(`Candidate PDA for "${name}": ${candPda.toBase58()}, bump: ${bump}`);

    // Send transaction
    let txSig;
    try {
      txSig = await program.methods
        .initializeCandidate(name, pollId)
        .accounts({
          signer: provider.wallet.publicKey,
          poll: pollPda,
          candidate: candPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();
    } catch (err) {
      const logs = err?.logs ?? err?.logMessages;
      if (logs) {
        console.error("\n--- Transaction Failure Logs ---");
        logs.forEach((l: string) => console.error(l));
        console.error("--- End Logs ---\n");
      } else if (typeof err?.toString === 'function') {
        console.error(err.toString());
      }
      throw err; // Keep failing the test!
    }

    // Confirm transaction before fetching
    await provider.connection.confirmTransaction(txSig, "finalized");

    // --- Place your logging here ---
    console.log("Fetching candidate account", candPda.toBase58());
    const cand = await program.account.candidate.fetch(candPda);
    console.log("Candidate name raw bytes:", Array.from(cand.name));
    console.log("Candidate name as string:", Buffer.from(cand.name).toString());

    expect(Buffer.from(cand.name).toString().replace(/\0/g, "")).to.equal(name);
    expect(cand.plusVotes.toNumber()).to.equal(0);
    expect(cand.minusVotes.toNumber()).to.equal(0);
  };
  const pollAfter = await program.account.poll.fetch(pollPda);
  expect(pollAfter.candidateCount.toNumber()).to.equal(2); // two candidates added
});



  it("Happy: single positive vote", async () => {
    const pollId = 12345678; // example poll ID
    const pollIdBytes = getPollIdBytes(pollId);

    console.log("pollIdBytes length:", pollIdBytes.length); // should print 4
    console.log("pollIdBytes as array:", Array.from(pollIdBytes)); // e.g., [78, 97, 188, 0]
    console.log("pollIdBytes as hex:", pollIdBytes.toString('hex')); // e.g., '4e61bc00'

    // Rebuild the number to verify little-endian interpretation
    const reconstructedId = pollIdBytes.readUInt32LE(0);
    console.log("Reconstructed pollId:", reconstructedId);
    console.log("Poll PDA:", pollPda.toBase58()); // should print 12345678

    if (pollIdBytes.length === 4 && reconstructedId === pollId) {
      console.log("getPollIdBytes() returns a valid 4-byte little-endian Buffer");
    } else {
      console.error("ERROR: getPollIdBytes() does NOT return a valid 4-byte little-endian Buffer");
    }

    const [alicePda] = PublicKey.findProgramAddressSync(
     [Buffer.from("cand"), getPollIdBytes(pollId), Buffer.from("Alice")],
      program.programId
    );
    console.log("Alice PDA:", alicePda.toBase58());
    const [voterRecordPda] = PublicKey.findProgramAddressSync(
      [
      Buffer.from("voter"),
     provider.wallet.publicKey.toBuffer(),
      getPollIdBytes(pollId),
      ],
      program.programId
    );
    console.log("Voter Record PDA:", voterRecordPda.toBase58());
    
    // build allocations
    const alloc = [{ candidate: alicePda, votes: 1 }];
    
    // but our candidate is Alice, so replace with real PDA
    const name = "Alice";
    const nameBuf = Buffer.from(name);
    
    alloc[0].candidate = alicePda; // replace with real PDA

    await program.methods
      .vote(alloc, [])
      .accounts({
        signer: provider.wallet.publicKey,
        poll: pollPda,
        voterRecord: voterRecordPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .remainingAccounts([{ pubkey: alicePda, isWritable: true, isSigner: false }])
      .rpc();

    const alice = await program.account.candidate.fetch(alicePda);
    expect(alice.plusVotes.toNumber()).to.be.equal(1);
  });

  it("Unhappy: double voting forbidden", async () => {
    const alloc = [{ candidate: pollPda, votes: 1 }];
    // attempt to vote again with same voter
    try {
  await program.methods
    .vote(alloc, [])
    .accounts({
      signer: provider.wallet.publicKey,
      poll: pollPda,
      voterRecord: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .remainingAccounts([{ pubkey: pollPda, isWritable: true, isSigner: false }])
    .rpc();
    } catch (err) {
    const anchorErr = err as AnchorError;
    expect(anchorErr.error.errorCode).to.equal("AlreadyVoted");
  }
  });

  it("Unhappy: too many plus votes", async () => {
    // voter2 for fresh ballot
    const voter2 = anchor.web3.Keypair.generate();
    const airdropSig = await provider.connection.requestAirdrop(
      voter2.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // build allocations exceeding plus limit (poll.plusVotesAllowed default zero)
    const alloc = [{ candidate: pollPda, votes: 10 }];
    try {
     await expect(
      program.methods
      .vote(alloc, [])
      .accounts({
      signer: voter2.publicKey,
      poll: pollPda,
      voterRecord: voter2.publicKey,
      systemProgram: SystemProgram.programId,
       } as any)
      .remainingAccounts([{ pubkey: pollPda, isWritable: true, isSigner: false }])
      .signers([voter2])
     .rpc()
    ).to.throw("TooManyPlus should have failed");
    } finally {
       try {
        await program.methods
        .closeVoterRecord()
        .accounts({
          signer: voter2.publicKey,
          voterRecord: voter2.publicKey,
          destination: voter2.publicKey,
        } as any)
        .signers([voter2])
        .rpc();
      } catch (e) {
    // Ignore errors in cleanup, account might not exist
      }

      // Reset allocations to defaults for next test
      plusAlloc = [];
      minusAlloc = [];
  }
  });

  it("Unhappy: minus requires two plus", async () => {
    const voter3 = anchor.web3.Keypair.generate();
    await provider.connection.requestAirdrop(voter3.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);

    const plusAlloc: { candidate: PublicKey; votes: number }[] = [];; // zero plus
    const minusAlloc = [{ candidate: pollPda, votes: 1 }];
    try {
      await expect(
       program.methods
        .vote(plusAlloc, minusAlloc)
        .accounts({
          signer: voter3.publicKey,
          poll: pollPda,
          voterRecord: voter3.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .remainingAccounts([{ pubkey: pollPda, isWritable: true, isSigner: false }])
        .signers([voter3])
        .rpc()
      ).to.throw("MinusRequiresTwoPlus should have failed");
    } catch (err) {
      const anchorErr = err as AnchorError;
      expect(anchorErr.error.errorCode).to.equal("MinusRequiresTwoPlus");
    }
  });
});
