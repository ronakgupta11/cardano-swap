# Atomic Swap Implementation for Cardano

This repository contains a complete implementation of atomic swaps on the Cardano blockchain using hash-time-locked contracts (HTLCs) with the [`plu-ts` library](https://github.com/HarmonicLabs/plu-ts).

## Features

- ✅ **Hash-Time-Locked Contracts (HTLC)**: Secure atomic swaps using secrets and timelock conditions
- ✅ **Resolver-based withdrawals**: Time-locked exclusive withdrawal period for designated resolver
- ✅ **Public withdrawals**: Anyone can withdraw after deadline expires
- ✅ **Cancellation mechanism**: Resolver can cancel swaps under specific conditions
- ✅ **Comprehensive logging**: Detailed logs with different levels (info, error, debug, success)
- ✅ **Type-safe utilities**: Robust error handling and validation
- ✅ **Plutus v3**: Uses the latest Cardano smart contract capabilities

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Project
```bash
npm run build
```

### 3. Compile the Smart Contract
```bash
node dist/index.js
```
This generates the compiled script at `./testnet/atomic-swap.plutus.json`

### 4. Set up Testnet Keys (if not already done)
Make sure you have the following files in `./testnet/`:
- `payment1.skey` - Maker's private key
- `payment1.vkey` - Maker's public key  
- `address1.addr` - Maker's address
- `payment2.skey` - Resolver's private key
- `payment2.vkey` - Resolver's public key
- `address2.addr` - Resolver's address

### 5. Configure Blockfrost
Update `src/app/blockfrost.ts` with your Blockfrost project ID:
```typescript
const BLOCKFROST_CONFIG = {
    projectId: "your-testnet-project-id-here",
    network: "testnet" as const
};
```

## Usage

### Create a Swap Escrow
```bash
node dist/app/createSwapEscrow.js
```

Or programmatically:
```typescript
import { createSwapEscrow } from './src';

await createSwapEscrow({
    secret: "my-secret-phrase",
    escrowAmount: BigInt(10_000_000), // 10 ADA
    deadlineOffset: 1, // 1 hour from now
    cancelOffset: 2,   // 2 hours for cancel deadline
    publicOffset: 3    // 3 hours for public deadline
});
```

### Withdraw from Swap
```bash
node dist/app/withdrawFromSwap.js
```

Or programmatically:
```typescript
import { withdrawFromSwap } from './src';

await withdrawFromSwap({
    secret: "my-secret-phrase",
    validityWindowSlots: 100
});
```

### Cancel a Swap
```bash
node dist/app/cancelSwapRefactored.js
```

Or programmatically:
```typescript
import { cancelSwap } from './src';

await cancelSwap({
    validityWindowSlots: 100
});
```

## Architecture

### Contract Logic (`src/contract.ts`)
The main smart contract implementing HTLC logic with:
- Secret-based validation using SHA-256 hashing
- Time-based conditions using Cardano's validity intervals
- Role-based permissions (maker vs resolver)

### Core Components

#### Data Types
- `EscrowDatum`: On-chain data structure containing hashlock, participant PKHs, and deadlines
- `EscrowRedeemer`: Actions available (Withdraw with secret, Cancel)

#### Utilities
- **Logger**: Structured logging with timestamps and log levels
- **UTxOUtils**: UTXO selection and conversion helpers
- **SwapValidation**: Secret validation, PKH verification, timelock checks
- **FileUtils**: Safe file operations for keys and addresses
- **Error Types**: Custom error classes for better error handling

### File Structure
```
src/
├── contract.ts              # Main smart contract
├── MyDatum/index.ts        # Datum structure
├── MyRedeemer/index.ts     # Redeemer structure  
├── index.ts               # Main exports
└── app/
    ├── createSwapEscrow.ts   # Create new swap
    ├── withdrawFromSwap.ts   # Withdraw using secret
    ├── cancelSwapRefactored.ts # Cancel swap
    ├── blockfrost.ts         # Blockfrost configuration
    ├── getTxBuilder.ts       # Transaction builder
    └── utils/
        ├── logger.ts         # Logging utility
        ├── errors.ts         # Custom error types
        ├── utxo.ts          # UTXO utilities
        ├── validation.ts     # Validation helpers
        └── fileUtils.ts      # File operations
```

## Debugging

Enable debug logging:
```bash
DEBUG=true node dist/app/createSwapEscrow.js
```

## Error Handling

The system includes comprehensive error handling:
- **NetworkError**: Blockfrost API issues, network connectivity
- **ValidationError**: Invalid inputs, mismatched credentials
- **InsufficientFundsError**: Not enough UTXOs for transactions
- **TimelockError**: Timelock validation failures

## Documentation

- [plu-ts Documentation](https://www.harmoniclabs.tech/plu-ts-docs/index.html)
- [Blockfrost API](https://blockfrost.io/)

## Contributing

Feel free to contribute to the [`plu-ts-docs` repository](https://github.com/HarmonicLabs/plut-ts-docs)

## Run in demeter.run

demeter.run is a browser environment that allows you to set up environments of cardano applications in seconds.

You can use demeter.run to set up your environment for a `plu-ts` project too!

[![Code in Cardano Workspace](https://demeter.run/code/badge.svg)](https://demeter.run/code?repository=https://github.com/HarmonicLabs/plu-ts-starter&template=typescript)

## Consultancy and Audits

For smart contract consultancy and audits, you can send a mail to [harmoniclabs@protonmail.com](mailto:harmoniclabs@protonmail.com)
