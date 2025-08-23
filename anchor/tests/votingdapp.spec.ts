import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Votingdapp } from "../target/types/votingdapp";
import VotingdappIDL from "../target/idl/votingdapp.json";
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

  const programId = new PublicKey(
    "HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx",
  );
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program: anchor.Program<Votingdapp> = new anchor.Program(
    VotingdappIDL as any,
    provider,
  );

  // Test keys
  const pollId = Math.floor(Math.random() * 10_000_000); // a random u32 value
  let pollPda: PublicKey;
  let pollBump: number;

  it("Happy: initialize poll", async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("poll"), getPollIdBytes(pollId)],
      program.programId,
    );
    pollPda = pda;
    pollBump = bump;

    try {
      await program.methods
        .initializePoll(
          new anchor.BN(pollId),
          "Test poll?",
          new anchor.BN(0),
          new anchor.BN(999),
          2,
        )
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
      } else if (typeof err?.toString === "function") {
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
        console.log(
          `Seed ${i}: [${Array.from(seed)}] as string: "${seed.toString()}"`,
        );
      });
      const [candPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("cand"), pollIdBytes, nameBuf],
        program.programId,
      );
      console.log(
        `Candidate PDA for "${name}": ${candPda.toBase58()}, bump: ${bump}`,
      );

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
        } else if (typeof err?.toString === "function") {
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
      console.log(
        "Candidate name as string:",
        Buffer.from(cand.name).toString(),
      );

      expect(Buffer.from(cand.name).toString().replace(/\0/g, "")).to.equal(
        name,
      );
      expect(cand.plusVotes.toNumber()).to.equal(0);
      expect(cand.minusVotes.toNumber()).to.equal(0);
    }
    const pollAfter = await program.account.poll.fetch(pollPda);
    expect(pollAfter.candidateCount.toNumber()).to.equal(2); // two candidates added
  });

  it("Happy: single positive vote", async () => {
    // REMOVE: const pollId = 12345678;
    const pollIdBytes = getPollIdBytes(pollId);

    const [alicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cand"), pollIdBytes, Buffer.from("Alice")],
      program.programId,
    );

    const [voterRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("voter"), provider.wallet.publicKey.toBuffer(), pollIdBytes],
      program.programId,
    );

    const plusAlloc = [{ candidate: alicePda, votes: 1 }];
    const minusAlloc: { candidate: PublicKey; votes: number }[] = [];

    const txSig = await program.methods
      .vote(pollId, plusAlloc, minusAlloc)
      .accounts({
        signer: provider.wallet.publicKey,
        poll: pollPda,
        voterRecord: voterRecordPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .remainingAccounts([
        { pubkey: alicePda, isWritable: true, isSigner: false },
      ])
      .rpc();

    // Ensure the write is finalized before fetching
    await provider.connection.confirmTransaction(txSig, "finalized");

    const alice = await program.account.candidate.fetch(alicePda);
    expect(alice.plusVotes.toNumber()).to.equal(1);
  });

  it("Unhappy: double voting forbidden", async () => {
    const pollIdBytes = getPollIdBytes(pollId);
    const [alicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cand"), pollIdBytes, Buffer.from("Alice")],
      program.programId,
    );
    const [voterRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("voter"), provider.wallet.publicKey.toBuffer(), pollIdBytes],
      program.programId,
    );

    const alloc = [{ candidate: alicePda, votes: 1 }];
    try {
      await program.methods
        .vote(pollId, alloc, [])
        .accounts({
          signer: provider.wallet.publicKey,
          poll: pollPda,
          voterRecord: voterRecordPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .remainingAccounts([
          { pubkey: alicePda, isWritable: true, isSigner: false },
        ])
        .rpc();

      // Second vote attempt with same voter
      await program.methods
        .vote(pollId, alloc, [])
        .accounts({
          signer: provider.wallet.publicKey,
          poll: pollPda,
          voterRecord: voterRecordPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .remainingAccounts([
          { pubkey: alicePda, isWritable: true, isSigner: false },
        ])
        .rpc();

      throw new Error("AlreadyVoted should have failed");
    } catch (err) {
      const anchorErr = err as AnchorError;
      expect(anchorErr.error.errorCode.code).to.equal("AlreadyVoted");
    }
  });

  it("Unhappy: too many plus votes", async () => {
    const pollIdBytes = getPollIdBytes(pollId);
    const voter2 = anchor.web3.Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        voter2.publicKey,
        0.01 * anchor.web3.LAMPORTS_PER_SOL,
      ),
    );

    const [alicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cand"), pollIdBytes, Buffer.from("Alice")],
      program.programId,
    );
    const [voterRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("voter"), voter2.publicKey.toBuffer(), pollIdBytes],
      program.programId,
    );

    const alloc = [{ candidate: alicePda, votes: 10 }];

    try {
      await program.methods
        .vote(pollId, alloc, [])
        .accounts({
          /* ... */
        } as any)
        .remainingAccounts([
          { pubkey: alicePda, isWritable: true, isSigner: false },
        ])
        .signers([voter2])
        .rpc();
      throw new Error("TooManyPlus should have failed");
    } catch (err) {
      // Optionally inspect logs or AnchorError
      // const anchorErr = err as AnchorError;
      // expect(anchorErr.error.errorCode).to.equal("TooManyPlus");
    }
  });

  it("Unhappy: minus requires two plus", async () => {
    const pollIdBytes = getPollIdBytes(pollId);
    const voter3 = anchor.web3.Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        voter3.publicKey,
        0.01 * anchor.web3.LAMPORTS_PER_SOL,
      ),
    );

    const [alicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cand"), pollIdBytes, Buffer.from("Alice")],
      program.programId,
    );
    const [voterRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("voter"), voter3.publicKey.toBuffer(), pollIdBytes],
      program.programId,
    );

    const plusAlloc: { candidate: PublicKey; votes: number }[] = []; // zero plus
    const minusAlloc = [{ candidate: alicePda, votes: 1 }];

    try {
      await program.methods
        .vote(pollId, plusAlloc, minusAlloc)
        .accounts({
          signer: voter3.publicKey,
          poll: pollPda,
          voterRecord: voterRecordPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .remainingAccounts([
          { pubkey: alicePda, isWritable: true, isSigner: false },
        ])
        .signers([voter3])
        .rpc();
      throw new Error("MinusRequiresTwoPlus should have failed");
    } catch (err) {
      const anchorErr = err as AnchorError;
      expect(anchorErr.error.errorCode).to.equal("MinusRequiresTwoPlus");
    }
  });
});
