#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

declare_id!("HaV1HXC62zmRYUGDo8XT4kbPY7EMfwFkMZcwjKCF7gxx");

#[program]
pub mod votingdapp {
    use super::*;

    /// Initialize a new poll with D21 parameters:
    /// - winners: number of seats
    /// - plus_votes_allowed = ⌊2W - (W-2)·φ⌋
    /// - minus_votes_allowed = ⌊plus_votes_allowed / 3⌋
    pub fn initialize_poll(
        ctx: Context<InitializePoll>,
        poll_id: u64,
        poll_description: String,
        poll_start: u64,
        poll_end: u64,
        winners: u8,
    ) -> Result<()> {
        msg!("Hello world");
        let poll = &mut ctx.accounts.poll;
        poll.poll_id = poll_id as u32;
        poll.poll_description = poll_description;
        poll.poll_start = poll_start;
        poll.poll_end = poll_end;
        poll.candidate_count = 0;
        poll.winners = winners;
        // D21 formula for allowed votes
        let phi = 1.618_f64;
        let raw = 2.0 * winners as f64 - (winners as f64 - 2.0) * phi;
        poll.plus_votes_allowed = raw.floor() as u8;
        poll.minus_votes_allowed = poll.plus_votes_allowed / 3;
        Ok(())
    }

    pub fn initialize_candidate(
        ctx: Context<InitializeCandidate>,
        candidate_name: String,
        _poll_id: u32,
    ) -> Result<()> {
        let candidate = &mut ctx.accounts.candidate;
        let poll = &mut ctx.accounts.poll;

        // Log candidate name and bytes
    // msg!("Rust/Anchor: candidate_name: {:?}", candidate_name);
    // msg!("Rust/Anchor: candidate_name.as_bytes(): {:?}", candidate_name.as_bytes());
    // msg!("Rust/Anchor: poll_id.to_le_bytes(): {:?}", poll.poll_id.to_le_bytes());


        poll.candidate_count = poll
            .candidate_count
            .checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
        let mut name_array = [0u8; 32];
        let name_bytes = candidate_name.as_bytes();
        let len = std::cmp::min(name_bytes.len(), 32);
        name_array[..len].copy_from_slice(&name_bytes[..len]);
        candidate.name = name_array;
        candidate.plus_votes = 0;
        candidate.minus_votes = 0;
        Ok(())
    }

    /// Redesigned vote instruction to accept dynamic lists of candidates,
    /// and multiple plus/minus allocations.
    pub fn vote<'info>(
        ctx: Context<'_, '_, 'info, 'info, CastBallot<'info>>,
        _poll_id: u32,
        plus_allocations: Vec<VoteAllocation>,
        minus_allocations: Vec<VoteAllocation>,
    ) -> Result<()> {
        msg!("Vote instruction started");
        msg!("Number of plus allocations: {}", plus_allocations.len());
        msg!("Number of minus allocations: {}", minus_allocations.len());

        // Print all candidate Pubkeys and votes
        for alloc in &plus_allocations {
            msg!("Plus vote for candidate {:?}", alloc.candidate);
            msg!("Votes: {}", alloc.votes);
        }
        for alloc in &minus_allocations {
            msg!("Minus vote for candidate {:?}", alloc.candidate);
            msg!("Votes: {}", alloc.votes);
        }
        
        // Print all account keys received in remaining_accounts
        for (i, acct) in ctx.remaining_accounts.iter().enumerate() {
            msg!("Remaining account #{}: {:?}", i, acct.key());
        }
        let poll = &ctx.accounts.poll;
        let voter = &mut ctx.accounts.voter_record;

        // // Borrow remaining_accounts once with the `'info` lifetime
        // let remaining: &'info [AccountInfo<'info>] = ctx.remaining_accounts;

        // Prevent double voting
        require!(!voter.has_voted, ErrorCode::AlreadyVoted);
    
        // Sum votes
        let sum_plus: u8 = plus_allocations.iter().map(|alloc| alloc.votes).sum();
        let sum_minus: u8 = minus_allocations.iter().map(|alloc| alloc.votes).sum();
    
        // D21 constraints
        require!(sum_plus <= poll.plus_votes_allowed, ErrorCode::TooManyPlus);
        require!(sum_minus <= poll.minus_votes_allowed, ErrorCode::TooManyMinus);
        require!(
            (sum_plus as u16 + sum_minus as u16) < poll.candidate_count as u16,
            ErrorCode::InvalidTotal
        );
        if sum_minus > 0 {
            require!(sum_plus >= 2, ErrorCode::MinusRequiresTwoPlus);
        }

        
    
        // Tally plus votes by scanning remaining_accounts
        for allocation in plus_allocations {
            let cand_key = allocation.candidate;
        let plus = allocation.votes;
            let idx = ctx.remaining_accounts
                .iter()
                .position(|acct| acct.key == &cand_key)
                .expect("Missing candidate account");
            let mut candidate: Account<Candidate> = Account::try_from(&ctx.remaining_accounts[idx])?;
            candidate.plus_votes = candidate.plus_votes.checked_add(plus as u64).unwrap();
            candidate.exit(&crate::ID)?;
        }
    
        // Tally minus votes similarly
        for allocation in minus_allocations {
            let cand_key = allocation.candidate;
            let minus = allocation.votes;
            let idx = ctx.remaining_accounts
                .iter()
                .position(|acct| acct.key == &cand_key)
                .expect("Missing candidate account");
            let mut candidate: Account<Candidate> = Account::try_from(&ctx.remaining_accounts[idx])?;
            candidate.minus_votes = candidate.minus_votes.checked_add(minus as u64).unwrap();
            candidate.exit(&crate::ID)?;
        }
    
        // Mark the voter record
        voter.has_voted = true;
        voter.plus_used = sum_plus;
        voter.minus_used = sum_minus;
    
        Ok(())
    }
    pub fn close_voter_record(_ctx: Context<CloseVoterRecord>) -> Result<()> {
    // No specific logic needed, Anchor auto handles closing
        msg!("Hello world");

    Ok(())
}
    
}

#[derive(Accounts)]
#[instruction(
    poll_id: u32,
    poll_description: String,
    poll_start: u64,
    poll_end: u64,
    winners: u8
)]
pub struct InitializePoll<'info> {
    /// CHECK: This is the user signing the transaction, verified by the runtime
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init,
        payer = signer,
        space = 8 + Poll::INIT_SPACE,
        seeds = [b"poll", &poll_id.to_le_bytes()],
        bump
    )]
    pub poll: Account<'info, Poll>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(candidate_name: String, poll_id: u32)]
pub struct InitializeCandidate<'info> {
    /// CHECK: This is the user signing the transaction, verified by the runtime
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"poll", &poll_id.to_le_bytes()],
        bump
    )]
    pub poll: Account<'info, Poll>,
    #[account(
        init,
        payer = signer,
        space = 8 + Candidate::INIT_SPACE,
        seeds = [b"cand", &poll_id.to_le_bytes(), candidate_name.as_bytes()],
        bump
    )]

    pub candidate: Account<'info, Candidate>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(poll_id: u32)]
pub struct CastBallot<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    
    #[account(
        seeds = [b"poll", &poll_id.to_le_bytes()],
        bump
    )]
    pub poll: Account<'info, Poll>,
    
    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + VoterRecord::INIT_SPACE,
        seeds = [b"voter", signer.key().as_ref(), &poll_id.to_le_bytes()],
        bump
    )]
    pub voter_record: Account<'info, VoterRecord>,
    
    pub system_program: Program<'info, System>,
    
    // Candidate PDAs are supplied via ctx.remaining_accounts
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct VoteAllocation {
    pub candidate: Pubkey,
    pub votes: u8,
}

#[derive(Accounts)]
pub struct CloseVoterRecord<'info> {
    #[account(mut, close = signer)]
    pub voter_record: Account<'info, VoterRecordData>,
    /// CHECK: This is the user signing the transaction, verified by the runtime
    #[account(signer)]
    pub signer: AccountInfo<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Candidate {
    pub name: [u8; 32],
    pub plus_votes: u64,
    pub minus_votes: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Poll {
    pub poll_id: u32,
    #[max_len(100)]
    pub poll_description: String,
    pub poll_start: u64,
    pub poll_end: u64,
    pub candidate_count: u64,
    pub winners: u8,
    pub plus_votes_allowed: u8,
    pub minus_votes_allowed: u8,
}

#[account]
#[derive(InitSpace)]
pub struct VoterRecord {
    pub has_voted: bool,
    pub plus_used: u8,
    pub minus_used: u8,
}

#[account]
pub struct VoterRecordData {
    pub has_voted: bool,
    pub plus_used: u8,
    pub minus_used: u8,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Voter has already cast a ballot")]
    AlreadyVoted,
    #[msg("Allocated more plus votes than allowed")]
    TooManyPlus,
    #[msg("Allocated more minus votes than allowed")]
    TooManyMinus,
    #[msg("Total votes exceed candidate count")]
    InvalidTotal,
    #[msg("Minus vote requires at least two plus votes")]
    MinusRequiresTwoPlus,
    #[msg("Arithmetic overflow")]
    Overflow,
}
