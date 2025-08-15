import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Votingdapp } from "../target/types/votingdapp";
import  VotingdappIDL  from '../target/idl/votingdapp.json';
import { expect, should } from "chai";

function getPollIdBytes(id: number): Buffer {
  return Buffer.from([id, 0, 0, 0]); // u32 little-endian
}

describe("votingdapp", () => {
  let plusAlloc: { candidate: PublicKey; votes: number }[] = [];
  let minusAlloc: { candidate: PublicKey; votes: number }[] = [];

 
  const programId = new PublicKey("AtRF47M4kn2UeJKtnjzTMAkyRAPkJm2AkoVmk7FbrHYg");
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program: anchor.Program<Votingdapp> = new anchor.Program(VotingdappIDL, provider);

  // Test keys
  const pollId = 42;
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

    await program.methods
      .initializePoll(new anchor.BN(pollId), "Test poll?", new anchor.BN(0), new anchor.BN(999))
      .accounts({
        signer: provider.wallet.publicKey,
        poll: pollPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    const poll = await program.account.poll.fetch(pollPda);
    expect(poll.pollId).to.equal(42);
    expect(poll.pollDescription).to.equal("Test poll?");
    expect(poll.candidateCount.toNumber()).to.equal(0);
    expect(poll.winners).to.equal(2);
    expect(poll.plusVotesAllowed).to.be.greaterThan(0);
    expect(poll.minusVotesAllowed).to.be.greaterThan(0);
  });

  it("Happy: initialize candidates", async () => {
    for (const name of ["Alice", "Bob"]) {
      const nameBuf = Buffer.from(name);
      const [candPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cand"), getPollIdBytes(pollId), nameBuf],
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

      await new Promise(resolve => setTimeout(resolve, 500));

      const cand = await program.account.candidate.fetch(candPda);
      expect(Buffer.from(cand.name).toString().replace(/\0/g, "")).to.equal(name);
      expect(cand.plusVotes.toNumber()).to.equal(0);
      expect(cand.minusVotes.toNumber()).to.equal(0);
    }
  });

  it("Happy: single positive vote", async () => {
    // build allocations
    const alloc = [{ candidate: provider.wallet.publicKey, votes: 1 }];
    // but our candidate is Alice, so replace with real PDA
    const name = "Alice";
    const nameBuf = Buffer.from(name);
    const [alicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cand"), getPollIdBytes(pollId), nameBuf],
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
