# Two-Phase Atomic Swap Implementation

This implementation provides a two-phase approach for ETH ↔ Cardano ADA atomic swaps as requested:

1. **PreInteraction** (Phase 1) - Called by maker
2. **PostInteraction** (Phase 2) - Called by resolver

## Architecture Overview

```
Maker (ETH) ──────────► Resolver (ADA)
    │                        │
    ▼                        ▼
PreInteraction          PostInteraction
    │                        │
    ▼                        ▼
Validates Order         Transfers ETH to Escrow
Sends ETH to LOP        Creates Escrow Contract
```

## Flow Description

The requested flow handles both ETH and ERC20 tokens with two separate functions:

- **PreInteraction**: Called by maker, validates signed order and maker sends ETH if makingAsset is ETH
- **PostInteraction**: Called by resolver, transfers ETH from LOP to escrowFactory

## Contracts

### LimitOrderProtocol (InteractionManager.sol)
- `preInteraction(bytes32 orderHash, address asset, uint256 amount)` - Phase 1
- `postInteraction(bytes32 orderHash, address escrowFactory, uint256 safetyDeposit)` - Phase 2
- Supports both ETH (address(0)) and ERC20 tokens
- EIP-712 signature validation
- Order replay protection

### EscrowFactory.sol
- `postInteraction()` function made payable
- Handles ETH transfers from LOP contract
- Creates escrow contracts for cross-chain swaps

## Scripts

### 1. Order Creation
```bash
npx hardhat run scripts/create-signed-order.js
```
Creates and signs an order for ETH → ADA swap.

### 2. Phase 1 - Maker PreInteraction
```bash
npx hardhat run scripts/maker-preinteraction.js
```
- Validates the signed order
- Checks maker's ETH balance
- Calls `preInteraction()` with ETH value
- Saves preinteraction status

### 3. Phase 2 - Resolver PostInteraction
```bash
npx hardhat run scripts/resolver-postinteraction.js
```
- Verifies order was validated in Phase 1
- Pre-funds safety deposit to escrow address
- Calls `postInteraction()` to transfer ETH to escrow
- Saves postinteraction status

### 4. Complete Flow Test
```bash
npx hardhat run scripts/test-complete-flow.js
```
Runs all three steps in sequence for end-to-end testing.

## Key Features

### ETH Handling
- Native ETH transfers (address(0) as asset identifier)
- No approval needed for ETH transfers
- Direct value transfer in transactions

### ERC20 Handling
- Standard approval + transferFrom pattern
- Asset address identification
- Allowance checking

### Order Validation
- EIP-712 signature verification
- Order hash uniqueness
- Replay attack prevention
- Asset and amount validation

### Safety Features
- Balance checks before transactions
- Order validation state tracking
- Error handling and rollbacks
- Comprehensive logging

## File Structure

```
scripts/
├── create-signed-order.js        # Creates and signs orders
├── maker-preinteraction.js       # Phase 1 - Maker validation
├── resolver-postinteraction.js   # Phase 2 - Resolver completion
└── test-complete-flow.js         # Complete flow test

orders/                           # Generated signed orders
├── signed-order-hardhat.json
└── signed-order-sepolia.json

preinteractions/                  # Phase 1 results
├── preinteraction-status-hardhat.json
└── preinteraction-status-sepolia.json

postinteractions/                 # Phase 2 results
├── postinteraction-info-hardhat.json
└── postinteraction-info-sepolia.json
```

## Example Order

```json
{
  "maker": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "makerAsset": "0x0000000000000000000000000000000000000000",
  "makingAmount": "1000000000000000000",
  "takerAsset": "0x0000000000000000000000000000000000000000",
  "takingAmount": "5000000000000000000",
  "cardanoAddress": "addr1...",
  "adaAmount": "100000000",
  "safetyDeposit": "500000000000000000",
  "hashlock": "0x1234...",
  "orderHash": "0x5678...",
  "signature": "0x9abc..."
}
```

## Testing

1. **Deploy contracts:**
   ```bash
   npx hardhat run scripts/deploy-complete-system.js
   ```

2. **Run complete flow:**
   ```bash
   npx hardhat run scripts/test-complete-flow.js
   ```

3. **Individual testing:**
   ```bash
   # Step by step
   npx hardhat run scripts/create-signed-order.js
   npx hardhat run scripts/maker-preinteraction.js
   npx hardhat run scripts/resolver-postinteraction.js
   ```

## Next Steps

After successful completion of both phases:

1. **Cardano Side**: Resolver sends ADA to maker's Cardano address
2. **Secret Reveal**: Maker reveals hashlock secret once ADA received
3. **ETH Claim**: Resolver uses secret to claim ETH from escrow contract
4. **Completion**: Atomic swap successfully completed

This implements exactly the flow you requested: "pre interaction is called by maker, that validates the signed order and maker send the eth value with is if makkinAsset is ETh, the resolver calls the postInteraction that will transfer the eth from lop to escrowFactory"
