
# Solana Bootcamp - Voting DApp

Discover full-stack web3 voting dapp on Solana.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)
- [Credits](#credits)
- [Contact](#contact)

## Installation

Instructions on how to install and set up this project:

rustc 1.85.0 (4d91de4e4 2025-02-17)
cargo 1.85.0 (d73d2caf9 2024-12-31)
npm 10.9.2

First install:
```sh
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
```
You'll have automatically:
- anchor-cli 0.30.1
- solana-cli 2.1.14
- Node.js v23.10.0
- Yarn 1.22.22

Also install:/
Next.js v14.2.26/
avm 0.31.0/

Change the version of Solana-CLI: 
```sh
agave-install init 2.0.25
```
For the front-end (with the url for more informations):
```sh
npm add @solana/actions
```
https://solana.com/fr/developers/guides/advanced/actions

Create a scaffold:
```sh
npx create-solana-dapp
```

```sh
# Example
git clone https://github.com/yourusername/yourproject.git
cd yourproject
npm install
## Dependencies

This project uses the following dependencies:

- **Node Package Manager (NPM)**: [Installation Guide](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- **Anchor**: [Installation Guide](https://project-serum.github.io/anchor/getting-started/installation.html)
- **Solana CLI**: [Installation Guide](https://docs.solana.com/cli/install-solana-cli-tools)
- **AVM**: [Installation Guide](https://github.com/ava-labs/avalanchego#install-avalanche-cli)

Make sure to install all of these dependencies before running the project.
