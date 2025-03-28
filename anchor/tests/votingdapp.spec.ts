import * as anchor from '@coral-xyz/anchor'
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { Program } from '@coral-xyz/anchor'
import { PublicKey} from '@solana/web3.js'
import { Votingdapp } from '../target/types/votingdapp'

const IDL = require('../target/idl/votingdapp.json');

const votingAddress = new PublicKey("D8hDDU3nprHsJ9kzfgEu8AzyxoyvBopUwPDJhTHvt4iS");

describe('Votingdapp', () => {

  let context ;
  let provider;
  anchor.setProvider(anchor.AnchorProvider.env());
  let votingProgram = anchor.workspace.Votingdapp as Program<Votingdapp>;

  beforeAll(async() => {
    context = await startAnchor("", [{name: "votingdapp", programId: votingAddress}], []);
    provider = new BankrunProvider(context);
    votingProgram = new Program<Votingdapp>(
      IDL,
      provider,
    );

    })
  
  it('Initialize Poll', async()  => {
      await votingProgram.methods.initializePoll(
      new anchor.BN(1),
      "What is your favorite type of peanut butter?",
      new anchor.BN(0),
      new anchor.BN(1842575348),
    ).rpc();

    const [pollAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, 'le', 8)],
      votingAddress,
    );

    const poll = await votingProgram.account.poll.fetch(pollAddress);

    console.log(poll);

    expect(poll.pollId.toNumber()).toBe(1);
    expect(poll.pollDescription).toBe("What is your favorite type of peanut butter?");
    expect(poll.pollStart.toNumber()).toBeLessThan(poll.pollEnd.toNumber());

    });

  it("initialize candidate", async() => {
    await votingProgram.methods.initializeCandidate(
      "Creamy",
      new anchor.BN(1),
    ).rpc();
    await votingProgram.methods.initializeCandidate(
      "Crunchy",
      new anchor.BN(1),
    ).rpc();

    const [crunchyAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, 'le', 8), Buffer.from("Crunchy")],
      votingAddress,
    );

    const crunchyCandidate = await votingProgram.account.candidate.fetch(crunchyAddress);
    console.log(crunchyCandidate);
    expect(crunchyCandidate.candidateVotes.toNumber()).toEqual(0);

    const [creamyAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, 'le', 8), Buffer.from("Creamy")],
      votingAddress,
    );

    const creamyCandidate = await votingProgram.account.candidate.fetch(creamyAddress);
    console.log(creamyCandidate);
    expect(creamyCandidate.candidateVotes.toNumber()).toEqual(0);
    });

  it("initialize vote", async() => {
    await votingProgram.methods
    .vote("Creamy",
      new anchor.BN(1))
    .rpc()
    
    const [creamyAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, 'le', 8), Buffer.from("Creamy")],
      votingAddress,
    );
    
    const creamyCandidate = await votingProgram.account.candidate.fetch(creamyAddress);
    console.log(creamyCandidate);
    expect(creamyCandidate.candidateVotes.toNumber()).toEqual(1);

    });
});
