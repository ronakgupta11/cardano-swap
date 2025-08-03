# Deployment Scripts

This directory contains scripts to deploy the Atomic Swap system contracts.

## Scripts Overview

### 1. `deploy-limit-order-protocol.js`
Deploys only the Limit Order Protocol (LimitOrderProtocol contract).

**Usage:**
```bash
npx hardhat run scripts/deploy-limit-order-protocol.js --network <network>
```

**Configuration:** Uses `limit-order-config.json`

### 2. `deploy-escrow-factory.js`
Deploys the Escrow Factory system including:
- Access Token (MockERC20) if not provided
- Escrow Factory
- Sets the Limit Order Protocol address in the Escrow Factory

**Prerequisites:** Requires Limit Order Protocol to be deployed first.

**Usage:**
```bash
npx hardhat run scripts/deploy-escrow-factory.js --network <network>
```

**Configuration:** Uses `deploy-config.json`

### 3. `deploy-complete-system.js` (Recommended)
Deploys the entire system in the correct order:
1. Limit Order Protocol
2. Access Token (if needed)
3. Escrow Factory
4. Configures all connections

**Usage:**
```bash
npx hardhat run scripts/deploy-complete-system.js --network <network>
```

## Configuration Files

### `limit-order-config.json`
```json
{
  "name": "Atomic Swap Limit Order Protocol",
  "version": "1.0.0"
}
```

### `deploy-config.json`
```json
{
  "accessTokenAddress": "0x...", // Optional: Use existing token
  "owner": "0x...", // Optional: Contract owner (defaults to deployer)
  "rescueDelaySrc": 604800, // 7 days in seconds
  "rescueDelayDst": 604800, // 7 days in seconds
  "limitOrderProtocolAddress": "0x..." // Optional: Use existing LOP
}
```

## Deployment Order

If deploying individually:

1. **First:** Deploy Limit Order Protocol
   ```bash
   npx hardhat run scripts/deploy-limit-order-protocol.js --network <network>
   ```

2. **Second:** Deploy Escrow Factory system
   ```bash
   npx hardhat run scripts/deploy-escrow-factory.js --network <network>
   ```

Or use the complete system script:
```bash
npx hardhat run scripts/deploy-complete-system.js --network <network>
```

## Output Files

All scripts create deployment files in the `deployments/` directory:

- `limit-order-<network>-<chainId>.json` - Detailed LOP deployment
- `limit-order-addresses-<network>.json` - Simple LOP addresses
- `cardano-<network>-<chainId>.json` - Detailed escrow deployment
- `addresses-<network>.json` - Simple escrow addresses
- `complete-system-<network>-<chainId>.json` - Complete system deployment
- `all-addresses-<network>.json` - All contract addresses

## Example

Deploy to Sepolia testnet:
```bash
npx hardhat run scripts/deploy-complete-system.js --network sepolia
```

This will create files like:
- `deployments/complete-system-sepolia-11155111.json`
- `deployments/all-addresses-sepolia.json`

## Contract Interactions

After deployment, the system is fully configured:

1. **Limit Order Protocol** - Entry point for order execution
2. **Escrow Factory** - Creates escrow contracts for swaps
3. **Access Token** - Required for factory operations

The Escrow Factory is automatically configured with the Limit Order Protocol address, enabling seamless integration.
