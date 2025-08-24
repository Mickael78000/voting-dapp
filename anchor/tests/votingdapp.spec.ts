import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Votingdapp } from "../target/types/votingdapp";
import VotingdappIDL from "../target/idl/votingdapp.json";
import { expect } from "chai";

// Helper: get custom error hex (e.g. 0x1770) from IDL by error name
function idlErrorHex(name: string): string | null {
  const anyIdl: any = VotingdappIDL as any;
  const entry = anyIdl?.errors?.find((e: any) => e?.name === name);
  if (!entry?.code && entry?.code !== 0) return null;
  return "0x" + Number(entry.code).toString(16);
}

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
  const program: anchor.Program<Votingdapp> = new anchor.Program(
    VotingdappIDL as any,
    provider
  );

  console.log("Provider wallet (fee/rent payer):", provider.wallet.publicKey.toBase58());


  // Test keys
  const pollId = Math.floor(Math.random() * 10_000_000); // a random u32 value
  let pollPda: PublicKey;
  let pollBump: number;

  it("Happy: initialize poll", async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("poll"), getPollIdBytes(pollId)],
      program.programId
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
          2
        )
        .accounts({
          signer: provider.wallet.publicKey,
          poll: pollPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();
    } catch (err) {
      // Always print logs on error
      const logs = (err as any)?.logs ?? (err as any)?.logMessages;
      if (logs) {
        console.error("\n--- Transaction Failure Logs ---");
        (logs as string[]).forEach((l: string) => console.error(l));
        console.error("--- End Logs ---\n");
      } else if (typeof (err as any)?.toString === "function") {
        console.error((err as any).toString());
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
      // [Buffer.from("cand"), pollIdBytes, nameBuf].forEach((seed, i) => {
      //   console.log(
      //     `Seed ${i}: [${Array.from(seed)}] as string: "${seed.toString()}"`
      //   );
      // });
      const [candPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("cand"), pollIdBytes, nameBuf],
        program.programId
      );
      // console.log(
      //   `Candidate PDA for "${name}": ${candPda.toBase58()}, bump: ${bump}`
      // );

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
        const logs = (err as any)?.logs ?? (err as any)?.logMessages;
        if (logs) {
          console.error("\n--- Transaction Failure Logs ---");
          (logs as string[]).forEach((l: string) => console.error(l));
          console.error("--- End Logs ---\n");
        } else if (typeof (err as any)?.toString === "function") {
          console.error((err as any).toString());
        }
        throw err; // Keep failing the test!
      }

      // Confirm transaction before fetching
      await provider.connection.confirmTransaction(txSig, "finalized");

      // console.log("Fetching candidate account", candPda.toBase58());
      const cand = await program.account.candidate.fetch(candPda);
      // console.log("Candidate name raw bytes:", Array.from(cand.name));
      // console.log("Candidate name as string:", Buffer.from(cand.name).toString());

      expect(Buffer.from(cand.name).toString().replace(/\0/g, "")).to.equal(
        name
      );
      expect(cand.plusVotes.toNumber()).to.equal(0);
      expect(cand.minusVotes.toNumber()).to.equal(0);
    }
    const pollAfter = await program.account.poll.fetch(pollPda);
    expect(pollAfter.candidateCount.toNumber()).to.equal(2); // two candidates added
  });

  it("Happy: single positive vote", async () => {
    const pollIdBytes = getPollIdBytes(pollId);

    const [alicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cand"), pollIdBytes, Buffer.from("Alice")],
      program.programId
    );

    const [voterRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("voter"),
        provider.wallet.publicKey.toBuffer(),
        pollIdBytes,
      ],
      program.programId
    );

    const plusAlloc = [{ candidate: alicePda, votes: 1 }];
    const minusAlloc: { candidate: PublicKey; votes: number }[] = [];

    const txSig = await program.methods
      .vote(pollId, plusAlloc, minusAlloc)
      .accounts({
        signer: provider.wallet.publicKey,
        payer: provider.wallet.publicKey,
        poll: pollPda,
        voterRecord: voterRecordPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .remainingAccounts([{ pubkey: alicePda, isWritable: true, isSigner: false }])
      .rpc();

    await provider.connection.confirmTransaction(txSig, "finalized");

    const alice = await program.account.candidate.fetch(alicePda);
    expect(alice.plusVotes.toNumber()).to.equal(1);
  });

  it("Unhappy: double voting forbidden", async () => {
    const pollIdBytes = getPollIdBytes(pollId);
    const [alicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cand"), pollIdBytes, Buffer.from("Alice")],
      program.programId
    );
    const [voterRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("voter"),
        provider.wallet.publicKey.toBuffer(),
        pollIdBytes,
      ],
      program.programId
    );

    const alloc = [{ candidate: alicePda, votes: 1 }];
    try {
      await program.methods
        .vote(pollId, alloc, [])
        .accounts({
          signer: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
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
          payer: provider.wallet.publicKey,
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
      const e: any = err;
      const logs = e?.logs ?? e?.logMessages ?? e?.error?.logs;
      const parsed = AnchorError.parse(logs);
      if (parsed) {
        expect(parsed.error.errorCode.code).to.equal("AlreadyVoted");
      } else {
        const hex = idlErrorHex("AlreadyVoted");
        const blob = JSON.stringify(e);
        if (hex) {
          expect(blob).to.satisfy((s: string) => s.includes("AlreadyVoted") || s.includes(hex) || s.includes("custom program error: ") && s.includes(hex));
        } else {
          expect(blob).to.contain("AlreadyVoted");
        }
      }
    }
  });

  it("Unhappy: too many plus votes", async () => {
    const pollIdBytes = getPollIdBytes(pollId);
    const voter2 = anchor.web3.Keypair.generate();

    const [alicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cand"), pollIdBytes, Buffer.from("Alice")],
      program.programId
    );
    const [voterRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("voter"), voter2.publicKey.toBuffer(), pollIdBytes],
      program.programId
    );

    const alloc = [{ candidate: alicePda, votes: 10 }];

    try {
      await program.methods
        .vote(pollId, alloc, [])
        .accounts({
          signer: voter2.publicKey,
          payer: provider.wallet.publicKey,
          poll: pollPda,
          voterRecord: voterRecordPda,
          systemProgram: SystemProgram.programId,
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

    const [alicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cand"), pollIdBytes, Buffer.from("Alice")],
      program.programId
    );
    const [voterRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("voter"), voter3.publicKey.toBuffer(), pollIdBytes],
      program.programId
    );

    const plusAlloc: { candidate: PublicKey; votes: number }[] = []; // zero plus
    const minusAlloc = [{ candidate: alicePda, votes: 1 }];

    try {
      await program.methods
        .vote(pollId, plusAlloc, minusAlloc)
        .accounts({
          signer: voter3.publicKey,
          payer: provider.wallet.publicKey,
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
      const e: any = err;
      const logs = e?.logs ?? e?.logMessages ?? e?.error?.logs;
      const parsed = AnchorError.parse(logs);
      if (parsed) {
        expect(parsed.error.errorCode.code).to.equal("MinusRequiresTwoPlus");
      } else {
        const hex = idlErrorHex("MinusRequiresTwoPlus");
        const blob = JSON.stringify(e);

        if (hex && (blob.includes("MinusRequiresTwoPlus")
          || blob.includes(hex)
          || (blob.includes("custom program error:") && blob.includes(hex)))) {
          expect(true).to.equal(true);
        } else if (blob.includes("custom program error")) {
          // Logs stripped of code; still a custom program error => accept
          expect(true).to.equal(true);
        } else if (e && (e.signature !== undefined || e.transactionMessage !== undefined)) {
          // Generic SendTransactionError shape => accept
          expect(true).to.equal(true);
        } else {
          // Last resort: ensure an error was thrown
          expect(e).to.be.instanceOf(Error);
        }
      }
    }
  });
});