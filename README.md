# Cross-Chain Atomic Swap: EVM ↔ Cardano

A comprehensive atomic swap implementation enabling trustless cross-chain token exchanges between EVM-compatible networks and Cardano. This system implements Hash-Time-Locked Contracts (HTLCs) to ensure atomic execution - either both parties receive their desired tokens, or the swap is safely cancelled with funds returned.

## 🌟 Overview

This project enables secure, decentralized cross-chain swaps between EVM and Cardano networks through two distinct swap flows:

1. **EVM → Cardano**: Maker locks tokens on EVM, Resolver facilitates swap via Cardano
2. **Cardano → EVM**: Maker locks tokens on Cardano, Resolver facilitates swap via EVM

The system uses a sophisticated relayer architecture with safety deposits, timelock mechanisms, and cryptographic secret sharing to ensure trustless execution.

## 🏗️ Architecture

```mermaid
graph TB
    subgraph "EVM → Cardano Flow"
        A[Maker Signs Order] --> B[LOP Pre-Interaction]
        B --> C[Resolver Post-Interaction]
        C --> D[Source Escrow Created]
        D --> E[Destination Escrow Created]
        E --> F[Secret Shared]
        F --> G[Withdrawals Complete]
    end
    
    subgraph "Cardano → EVM Flow"
        H[Maker Locks in AuthVault] --> I[Resolver Creates Source Escrow]
        I --> J[Source Funds Unlocked]
        J --> K[Destination Escrow Created]
        K --> L[Secret Shared]
        L --> M[Withdrawals Complete]
    end
```

## 📋 Table of Contents

- [Core Concepts](#core-concepts)
- [EVM → Cardano Swap Flow](#evm--cardano-swap-flow)
- [Cardano → EVM Swap Flow](#cardano--evm-swap-flow)
- [Smart Contracts](#smart-contracts)
- [Backend Architecture](#backend-architecture)
- [Frontend Interface](#frontend-interface)
- [Setup & Installation](#setup--installation)
- [Running the Project](#running-the-project)
- [API Reference](#api-reference)

## 🎯 Core Concepts

### Hash-Time-Locked Contracts (HTLCs)

The foundation of our atomic swap system:
- **Hashlock**: A secret known only to the maker, used to unlock funds
- **Timelock**: Deadline-based conditions ensuring timely execution
- **Atomic Execution**: Either all parties receive their tokens, or funds are returned

### Key Participants

- **Maker**: Initiates the swap order and locks initial funds
- **Resolver**: Facilitates the cross-chain swap by providing liquidity
- **Relayer**: Monitors transactions and shares secrets between chains

### Safety Mechanisms

- **Safety Deposits**: Resolvers stake funds to ensure honest behavior
- **Timelock Cascades**: Multiple deadlines for different actions
- **Public Withdrawal**: Anyone can complete a stalled swap and claim safety deposits
- **Cancellation Periods**: Mechanisms to safely abort failed swaps

## 🔄 EVM → Cardano Swap Flow

### Phase 1: Order Creation & Source Chain Setup

#### 1. Maker Creates Signed Order

The maker initiates the swap by creating a detailed order containing:

```typescript
interface SwapOrder {
  fromToken: string;      // Token address on source chain
  toToken: string;        // Token identifier on destination chain  
  fromAmount: bigint;     // Amount to swap
  toAmount: bigint;       // Expected return amount
  hashlock: string;       // SHA-256 hash of secret
  makerAddress: string;   // Maker's address
  deadline: number;       // Expiration timestamp
  salt: string;          // Unique identifier
}
```

**Code Reference**: `frontend/components/swap-interface.tsx` - `handleCreateOrder()`

#### 2. Limit Order Protocol (LOP) Pre-Interaction

The maker calls the LOP contract's pre-interaction function:

**For ETH swaps:**
```solidity
function preInteraction(
    bytes32 orderHash,
    address asset,        // address(0) for ETH
    uint256 amount
) external payable {
    // Validates order signature
    // Locks ETH in LOP contract
    // Marks order as pre-validated
}
```

**For ERC20 swaps:**
```solidity
// Maker must first approve tokens to LOP
token.approve(lopAddress, amount);
lop.preInteraction(orderHash, tokenAddress, amount);
```

**Code Reference**: `contracts/evm/contracts/LimitOrderProtocol.sol`

#### 3. Resolver Post-Interaction

The resolver executes the swap by:

1. **Pre-funding the Source Escrow**: Using CREATE2, the resolver calculates the future escrow address and sends safety deposit directly to it
2. **Calling Post-Interaction**: Triggers the LOP to transfer maker's tokens to the escrow

```solidity
function postInteraction(
    bytes32 orderHash,
    address escrowFactory,
    uint256 safetyDeposit
) external {
    // Transfers maker's tokens from LOP to escrow
    // Creates EscrowSrc proxy contract
    // Validates safety deposit was pre-funded
}
```

**Code Reference**: `contracts/evm/contracts/EscrowFactory.sol` - `_postInteraction()`

### Phase 2: Cross-Chain Escrow Creation

#### 4. Source Escrow Deployment

The `EscrowFactory` creates a minimal proxy (EIP-1167) pointing to the `EscrowSrc` implementation:

```solidity
contract EscrowSrc {
    struct EscrowData {
        bytes32 hashlock;
        address maker;
        address resolver;
        uint256 deadline;
        address asset;
        uint256 amount;
    }
    
    function withdraw(bytes32 secret) external {
        require(sha256(secret) == hashlock, "Invalid secret");
        require(block.timestamp <= deadline, "Deadline passed");
        // Transfer tokens to resolver
    }
}
```

**Code Reference**: `contracts/evm/contracts/EscrowSrc.sol`

#### 5. Destination Escrow Creation (Cardano)

The resolver creates an equivalent escrow on Cardano:

```typescript
// Using PluTS framework
const escrowDatum = {
    hashlock: hashlockBytes,
    maker: makerPubKeyHash,
    resolver: resolverPubKeyHash,
    deadline: deadlineSlot,
    amount: escrowAmount
};

// Create transaction locking funds at validator script address
const tx = await createEscrowTransaction(escrowDatum, resolverFunds);
```

**Code Reference**: `contracts/cardano/src/contract.ts` - `escrow` validator

### Phase 3: Secret Sharing & Withdrawal

#### 6. Secret Revelation

The backend monitoring service detects both escrows and shares the secret:

```typescript
// backend/services/monitorService.js
async function shareSecret(orderId, secret) {
    // Verify both escrows exist
    // Share secret via WebSocket to frontend
    // Update order status in database
}
```

**Code Reference**: `backend/services/monitorService.js`

#### 7. Withdrawal Execution

**Resolver withdraws from Source (EVM):**
```solidity
escrowSrc.withdraw(secret);  // Gets maker's tokens + safety deposit back
```

**Maker withdraws from Destination (Cardano):**
```typescript
// Using the revealed secret
const withdrawTx = await withdrawFromCardanoEscrow(secret);
```

## 🔄 Cardano → EVM Swap Flow

### Phase 1: Authorization Vault Setup

#### 1. Maker Locks Funds in AuthVault

Unlike EVM, Cardano uses a two-phase authorization system:

```typescript
// AuthVault - Pre-authorization contract
const authVaultDatum = {
    ownerPubKeyHash: makerPubKeyHash,
    authorizedAmount: swapAmount
};

// Maker locks funds in AuthVault one-time
const lockTx = await lockInAuthVault(authVaultDatum, makerFunds);
```

**Code Reference**: `contracts/cardano/src/lopContract.ts`

### Phase 2: Resolver-Initiated Escrow

#### 2. Resolver Creates Source Escrow & Unlocks Funds

The resolver builds a single transaction that:
- Unlocks maker's funds from AuthVault using signed order
- Creates source escrow with unlocked funds + safety deposit

```typescript
const createEscrowTx = {
    inputs: [
        authVaultUTXO,           // Maker's locked funds
        resolverSafetyDepositUTXO // Resolver's safety deposit
    ],
    outputs: [
        escrowUTXO               // Combined escrow output
    ],
    redeemers: [
        { signedOrder }          // Signed authorization from maker
    ]
};
```

#### 3. Destination Escrow Creation (EVM)

Similar to the reverse flow, resolver creates EVM escrow:

```solidity
function createDstEscrow(
    IBaseEscrow.Immutables calldata immutables
) external payable returns (address escrow) {
    // Create EscrowDst proxy
    // Lock resolver's tokens + safety deposit
    escrow = _deployEscrow(ESCROW_DST_IMPLEMENTATION, immutables, msg.value);
}
```

### Phase 3: Completion

The secret sharing and withdrawal process mirrors the EVM → Cardano flow but in reverse.

## 📜 Smart Contracts

### EVM Contracts (`contracts/evm/`)

#### LimitOrderProtocol.sol
- **Purpose**: Manages order validation and two-phase interaction system
- **Key Functions**:
  - `preInteraction()`: Validates and locks maker funds
  - `postInteraction()`: Transfers funds to escrow factory
  - `fillOrder()`: Direct order filling without escrow

#### EscrowFactory.sol  
- **Purpose**: Factory for creating escrow contracts using minimal proxies
- **Key Features**:
  - CREATE2 deterministic addresses
  - Gas-efficient proxy deployment
  - Safety deposit validation
- **Key Functions**:
  - `_deployEscrow()`: Creates minimal proxy escrow
  - `addressOfEscrowSrc/Dst()`: Pre-computes escrow addresses

#### EscrowSrc.sol & EscrowDst.sol
- **Purpose**: HTLC implementation for each swap direction
- **Key Functions**:
  - `withdraw(bytes32 secret)`: Claim funds with secret
  - `cancel()`: Return funds after timeout
  - `publicWithdraw()`: Anyone can complete after deadline

#### BaseEscrow.sol
- **Purpose**: Common escrow functionality and timelock management
- **Features**:
  - Timelock cascade system
  - Safety deposit mechanics
  - Emergency rescue functions

### Cardano Contracts (`contracts/cardano/`)

#### contract.ts (Main Validator)
- **Purpose**: HTLC validator for Cardano-side escrows
- **Logic**: PluTS-based smart contract implementing:
  - Secret validation via SHA-256
  - Timelock enforcement
  - Role-based permissions

```typescript
const escrow = pfn([PScriptContext.type], unit)
(({ redeemer, tx, purpose }) => {
    // Extract datum from UTXO
    // Validate secret or timelock conditions
    // Ensure proper signatures
    return validationResult;
});
```

#### lopContract.ts (Authorization Vault)
- **Purpose**: Pre-authorization system for "fire-and-forget" orders
- **Features**:
  - One-time fund locking
  - Signature-based unlocking
  - Integration with main escrow system

## 🖥️ Backend Architecture

### Core Services (`backend/services/`)

#### monitorService.js
- **Purpose**: Monitors blockchain events and coordinates swaps
- **Key Functions**:
  - `monitorEVMTransactions()`: Watches for escrow deployments
  - `monitorCardanoTransactions()`: Tracks Cardano UTXO changes
  - `shareSecret()`: Coordinates secret revelation

#### orderService.js
- **Purpose**: Manages swap order lifecycle
- **Key Functions**:
  - `createOrder()`: Validates and stores new orders
  - `acceptOrder()`: Assigns resolver to order
  - `updateOrderStatus()`: Tracks swap progress

#### relayerService.js
- **Purpose**: Handles cross-chain communication
- **Key Functions**:
  - `bridgeSecret()`: Shares secrets between chains
  - `validateEscrows()`: Confirms escrow deployments

#### websocketService.js
- **Purpose**: Real-time communication with frontend
- **Features**:
  - Order status updates
  - Secret sharing notifications
  - Transaction confirmations

### Database Schema (`backend/models/`)

```javascript
// Order.js
const Order = sequelize.define('Order', {
    id: { type: DataTypes.UUID, primaryKey: true },
    fromChain: DataTypes.STRING,
    toChain: DataTypes.STRING,
    fromToken: DataTypes.STRING,
    toToken: DataTypes.STRING,
    fromAmount: DataTypes.STRING,
    toAmount: DataTypes.STRING,
    hashlock: DataTypes.STRING,
    secret: DataTypes.STRING,
    status: DataTypes.ENUM('pending', 'accepted', 'completed', 'failed'),
    makerSrcAddress: DataTypes.STRING,
    makerDstAddress: DataTypes.STRING,
    resolverAddress: DataTypes.STRING,
    escrowSrcAddress: DataTypes.STRING,
    escrowDstAddress: DataTypes.STRING,
    srcEscrowTxHash: DataTypes.STRING,
    dstEscrowTxHash: DataTypes.STRING,
    srcWithdrawTxHash: DataTypes.STRING,
    dstWithdrawTxHash: DataTypes.STRING
});
```

### API Endpoints (`backend/routes/`)

#### Orders API (`routes/orders.js`)
- `GET /api/orders` - List available orders
- `POST /api/orders` - Create new swap order
- `GET /api/orders/:id` - Get order details
- `POST /api/orders/:id/accept` - Accept order as resolver
- `PATCH /api/orders/:id/tx-hash` - Update transaction hashes

#### Relayer API (`routes/relayer.js`)
- `POST /api/relayer/secret` - Submit secret for sharing
- `GET /api/relayer/status/:orderId` - Get swap status

## 🎨 Frontend Interface

### Core Components (`frontend/components/`)

#### swap-interface.tsx
- **Purpose**: Main swap creation interface
- **Features**:
  - Token selection and amount input
  - Order signing with wallet integration
  - Real-time price feeds and validation

#### orders-dashboard.tsx
- **Purpose**: Order management and monitoring
- **Features**:
  - Order history and status tracking
  - Role-based views (maker vs resolver)
  - Filtering and sorting capabilities

#### order-detail.tsx
- **Purpose**: Detailed swap progress tracking
- **Features**:
  - Step-by-step progress visualization
  - Transaction link generation
  - Action buttons for order progression
  - Real-time updates via WebSocket

#### Wallet Components
- **ethereum-wallet.tsx**: EVM wallet integration using wagmi/ConnectKit
- **cardano-wallet.tsx**: Cardano wallet integration using MeshSDK

### State Management (`frontend/context/`)

#### WalletContext.tsx
- **Purpose**: Global wallet state management
- **Features**:
  - Multi-chain wallet connections
  - Address synchronization
  - Network switching

### Utilities (`frontend/lib/`)

#### meshUtils.ts & ethUtils.ts
- **Purpose**: Blockchain-specific utility functions
- **Features**:
  - Transaction building and signing
  - Address validation and conversion
  - Network configuration

#### blockfrost.ts & wagmi.ts
- **Purpose**: Blockchain provider configurations
- **Features**:
  - RPC endpoint management
  - Query client setup
  - Network parameters

## 🚀 Setup & Installation

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Blockfrost API key (for Cardano)
- Infura/Alchemy API key (for EVM)

### 1. Clone Repository

```bash
git clone <repository-url>
cd cardano-swap
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Install EVM contract dependencies
cd ../contracts/evm
npm install

# Install Cardano contract dependencies
cd ../cardano
npm install
```

### 3. Environment Configuration

Create `.env` files in each directory:

#### Backend `.env`
```env
DATABASE_URL=postgresql://username:password@localhost:5432/cardano_swap
BLOCKFROST_API_KEY=your_blockfrost_key
INFURA_API_KEY=your_infura_key
JWT_SECRET=your_jwt_secret
PORT=3000
```

#### Frontend `.env.local`
```env
NEXT_PUBLIC_BLOCKFROST_API_KEY=your_blockfrost_key
NEXT_PUBLIC_INFURA_API_KEY=your_infura_key
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
```

#### EVM Contracts `.env`
```env
PRIVATE_KEY=your_deployment_private_key
INFURA_API_KEY=your_infura_key
ETHERSCAN_API_KEY=your_etherscan_key
```

### 4. Database Setup

```bash
cd backend
# Create PostgreSQL database
createdb cardano_swap

# The application will auto-create tables on first run
```

## 🏃‍♂️ Running the Project

### 1. Compile Smart Contracts

#### EVM Contracts
```bash
cd contracts/evm
npm run compile
# or
npx hardhat compile
```

#### Cardano Contracts
```bash
cd contracts/cardano
npm run build
node dist/index.js  # Generates compiled Plutus scripts
```

### 2. Deploy EVM Contracts (Optional for local testing)

```bash
cd contracts/evm
npx hardhat run scripts/deploy.js --network sepolia
```

### 3. Start Backend Server

```bash
cd backend
npm run dev  # Development mode with auto-reload
# or
npm start   # Production mode
```

The backend will be available at `http://localhost:3000`

### 4. Start Frontend Application

```bash
cd frontend
npm run dev  # Development mode
# or
npm run build && npm start  # Production mode
```

The frontend will be available at `http://localhost:3001`

### 5. Verify Setup

1. **Backend Health**: Visit `http://localhost:3000/api/health`
2. **Frontend**: Visit `http://localhost:3001`
3. **WebSocket**: Check browser console for WebSocket connection logs
4. **Database**: Verify tables are created in PostgreSQL

## 📡 API Reference

### Order Management

#### Create Order
```http
POST /api/orders
Content-Type: application/json

{
  "fromChain": "EVM",
  "toChain": "Cardano", 
  "fromToken": "ETH",
  "toToken": "ADA",
  "fromAmount": "1000000000000000000",
  "toAmount": "500000000",
  "hashlock": "0x...",
  "makerSrcAddress": "0x...",
  "makerDstAddress": "addr1..."
}
```

#### Get Order Details
```http
GET /api/orders/:orderId

Response:
{
  "id": "uuid",
  "status": "pending|accepted|completed|failed",
  "fromChain": "EVM",
  "toChain": "Cardano",
  "steps": [
    {
      "step": 1,
      "description": "Order Created",
      "status": "completed",
      "href": "https://etherscan.io/tx/0x..."
    }
  ],
  "srcEscrowTxHash": "0x...",
  "dstEscrowTxHash": "cardano_tx_hash"
}
```

### WebSocket Events

#### Connection
```javascript
const ws = new WebSocket('ws://localhost:3000');

// Subscribe to order updates
ws.send(JSON.stringify({
  type: 'subscribe',
  orderId: 'uuid',
  role: 'maker' // or 'resolver'
}));
```

#### Events
```javascript
// Order status update
{
  type: 'order_update',
  orderId: 'uuid',
  status: 'accepted',
  data: { resolverAddress: '0x...' }
}

// Secret shared
{
  type: 'secret_shared',
  orderId: 'uuid',
  secret: 'revealed_secret_string'
}

// Transaction confirmed
{
  type: 'transaction_confirmed',
  orderId: 'uuid',
  txHash: '0x...',
  type: 'src_escrow' // or 'dst_escrow', 'src_withdraw', 'dst_withdraw'
}
```

## 🔧 Development

### Testing

#### Unit Tests
```bash
# Backend tests
cd backend
npm test

# Frontend tests  
cd frontend
npm test

# Contract tests
cd contracts/evm
npx hardhat test
```

#### Integration Tests
```bash
# End-to-end swap testing
cd backend
npm run test:integration
```

### Debugging

#### Backend Logs
The backend uses structured logging with different levels:
```bash
# Enable debug logs
DEBUG=* npm run dev

# Filter specific modules
DEBUG=monitor:*,websocket:* npm run dev
```

#### Frontend Development
```bash
# Enable verbose logging
NEXT_PUBLIC_DEBUG=true npm run dev
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 🛡️ Security Considerations

### Smart Contract Security
- All contracts use OpenZeppelin libraries for standard functionality
- Timelock mechanisms prevent funds from being locked permanently
- Safety deposits ensure honest behavior from resolvers
- Emergency rescue functions for edge cases

### Key Management
- Private keys are never stored in the application
- Wallet integration handles all signing operations
- Secrets are generated client-side and shared securely

### Network Security
- WebSocket connections use secure protocols in production
- API endpoints validate all inputs
- Database queries use parameterized statements

## 📈 Monitoring & Analytics

### Health Monitoring
- Backend health checks at `/api/health`
- Database connection monitoring
- Blockchain RPC endpoint status

### Metrics
- Order completion rates
- Average swap times
- Network fee tracking
- Resolver performance analytics

## 🤝 Support

For issues, questions, or contributions:
- GitHub Issues: Create detailed bug reports
- Documentation: Check inline code comments
- Examples: Reference test files for usage patterns

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---
