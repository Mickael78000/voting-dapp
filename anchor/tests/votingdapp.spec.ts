import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Votingdapp } from "../target/types/votingdapp";
import jest from "jest";

describe("votingdapp", () => {
  let plusAlloc: { candidate: PublicKey; votes: number }[] = [];
  let minusAlloc: { candidate: PublicKey; votes: number }[] = [];

  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Votingdapp as Program<Votingdapp>;

  // Test keys
  const pollId = new anchor.BN(42);
  let pollPda: PublicKey;
  let pollBump: number;

  it("Happy: initialize poll", async () => {
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("poll"), pollId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    pollPda = pda;
    pollBump = bump;

    await program.methods
      .initializePoll(pollId, "Test poll?", new anchor.BN(0), new anchor.BN(999))
      .accounts({
        signer: provider.wallet.publicKey,
        poll: pollPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    const poll = await program.account.poll.fetch(pollPda);
    expect(poll.pollId.toNumber()).toBe(42);
    expect(poll.pollDescription).toBe("Test poll?");
    expect(poll.candidateCount.toNumber()).toBe(0);
  });

  it("Happy: initialize candidates", async () => {
    for (const name of ["Alice", "Bob"]) {
      const nameBuf = Buffer.from(name);
      const [candPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cand"), pollId.toArrayLike(Buffer, "le", 8), nameBuf],
        program.programId
      );

      await program.methods
        .initializeCandidate(name, pollId)
        .accounts({
          signer: provider.wallet.publicKey,
          poll: pollPda,
          candidate: candPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      const cand = await program.account.candidate.fetch(candPda);
      expect(Buffer.from(cand.name).toString().replace(/\0/g, "")).toBe(name);
      expect(cand.plusVotes.toNumber()).toBe(0);
      expect(cand.minusVotes.toNumber()).toBe(0);
    }
  });

  it("Happy: single positive vote", async () => {
    // build allocations
    const alloc = [{ candidate: provider.wallet.publicKey, votes: 1 }];
    // but our candidate is Alice, so replace with real PDA
    const name = "Alice";
    const nameBuf = Buffer.from(name);
    const [alicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cand"), pollId.toArrayLike(Buffer, "le", 8), nameBuf],
      program.programId
    );
    alloc[0].candidate = alicePda;

    await program.methods
      .vote(alloc, [])
      .accounts({
        signer: provider.wallet.publicKey,
        poll: pollPda,
        voterRecord: provider.wallet.publicKey, // PDA derived by program
        systemProgram: SystemProgram.programId,
      } as any)
      .remainingAccounts([{ pubkey: alicePda, isWritable: true, isSigner: false }])
      .rpc();

    const alice = await program.account.candidate.fetch(alicePda);
    expect(alice.plusVotes.toNumber()).toBe(1);
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
    expect(anchorErr.error.errorCode).toBe("AlreadyVoted");
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
    ).rejects.toThrow("TooManyPlus should have failed");
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
      ).rejects.toThrow("MinusRequiresTwoPlus should have failed");
    } catch (err) {
      const anchorErr = err as AnchorError;
      expect(anchorErr.error.errorCode).toBe("MinusRequiresTwoPlus");
    }
  });
});
