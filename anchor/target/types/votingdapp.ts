/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/votingdapp.json`.
 */
export type Votingdapp = {
  "address": "AtRF47M4kn2UeJKtnjzTMAkyRAPkJm2AkoVmk7FbrHYg",
  "metadata": {
    "name": "votingdapp",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "closeVoterRecord",
      "discriminator": [
        7,
        242,
        20,
        136,
        143,
        35,
        242,
        97
      ],
      "accounts": [
        {
          "name": "voterRecord",
          "writable": true
        },
        {
          "name": "signer",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "initializeCandidate",
      "discriminator": [
        210,
        107,
        118,
        204,
        255,
        97,
        112,
        26
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "poll",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "pollId"
              }
            ]
          }
        },
        {
          "name": "candidate",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  110,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "pollId"
              },
              {
                "kind": "arg",
                "path": "candidateName"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "candidateName",
          "type": "string"
        },
        {
          "name": "pollId",
          "type": "u32"
        }
      ]
    },
    {
      "name": "initializePoll",
      "docs": [
        "Initialize a new poll with D21 parameters:",
        "- winners: number of seats",
        "- plus_votes_allowed = ⌊2W - (W-2)·φ⌋",
        "- minus_votes_allowed = ⌊plus_votes_allowed / 3⌋"
      ],
      "discriminator": [
        193,
        22,
        99,
        197,
        18,
        33,
        115,
        117
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "poll",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "pollId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "pollId",
          "type": "u64"
        },
        {
          "name": "pollDescription",
          "type": "string"
        },
        {
          "name": "pollStart",
          "type": "u64"
        },
        {
          "name": "pollEnd",
          "type": "u64"
        },
        {
          "name": "winners",
          "type": "u8"
        }
      ]
    },
    {
      "name": "vote",
      "docs": [
        "Redesigned vote instruction to accept dynamic lists of candidates,",
        "and multiple plus/minus allocations."
      ],
      "discriminator": [
        227,
        110,
        155,
        23,
        136,
        126,
        172,
        25
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "poll",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "pollId"
              }
            ]
          }
        },
        {
          "name": "voterRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  111,
                  116,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "signer"
              },
              {
                "kind": "arg",
                "path": "pollId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "plusAllocations",
          "type": {
            "vec": {
              "defined": {
                "name": "voteAllocation"
              }
            }
          }
        },
        {
          "name": "minusAllocations",
          "type": {
            "vec": {
              "defined": {
                "name": "voteAllocation"
              }
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "candidate",
      "discriminator": [
        86,
        69,
        250,
        96,
        193,
        10,
        222,
        123
      ]
    },
    {
      "name": "poll",
      "discriminator": [
        110,
        234,
        167,
        188,
        231,
        136,
        153,
        111
      ]
    },
    {
      "name": "voterRecord",
      "discriminator": [
        178,
        96,
        138,
        116,
        143,
        202,
        115,
        33
      ]
    },
    {
      "name": "voterRecordData",
      "discriminator": [
        223,
        199,
        185,
        121,
        242,
        115,
        207,
        104
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "alreadyVoted",
      "msg": "Voter has already cast a ballot"
    },
    {
      "code": 6001,
      "name": "tooManyPlus",
      "msg": "Allocated more plus votes than allowed"
    },
    {
      "code": 6002,
      "name": "tooManyMinus",
      "msg": "Allocated more minus votes than allowed"
    },
    {
      "code": 6003,
      "name": "invalidTotal",
      "msg": "Total votes exceed candidate count"
    },
    {
      "code": 6004,
      "name": "minusRequiresTwoPlus",
      "msg": "Minus vote requires at least two plus votes"
    },
    {
      "code": 6005,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "candidate",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "plusVotes",
            "type": "u64"
          },
          {
            "name": "minusVotes",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "poll",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pollId",
            "type": "u32"
          },
          {
            "name": "pollDescription",
            "type": "string"
          },
          {
            "name": "pollStart",
            "type": "u64"
          },
          {
            "name": "pollEnd",
            "type": "u64"
          },
          {
            "name": "candidateCount",
            "type": "u64"
          },
          {
            "name": "winners",
            "type": "u8"
          },
          {
            "name": "plusVotesAllowed",
            "type": "u8"
          },
          {
            "name": "minusVotesAllowed",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "voteAllocation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "candidate",
            "type": "pubkey"
          },
          {
            "name": "votes",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "voterRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hasVoted",
            "type": "bool"
          },
          {
            "name": "plusUsed",
            "type": "u8"
          },
          {
            "name": "minusUsed",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "voterRecordData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hasVoted",
            "type": "bool"
          },
          {
            "name": "plusUsed",
            "type": "u8"
          },
          {
            "name": "minusUsed",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
