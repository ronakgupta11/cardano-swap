import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js'; 

/**
 * @description Sequelize model for tracking cross-chain atomic swap orders.
 * This model is designed to store all necessary information for swaps
 * between EVM and Cardano chains, including on-chain and off-chain data.
 */
const Order = sequelize.define('Order', {
  // Core Identifiers
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    comment: 'Unique identifier for the order.'
  },
  status: {
    type: DataTypes.ENUM(
      'pending',      // Order created by user, waiting for a resolver.
      'depositing',   // Resolver has accepted, escrows are being created.
      'withdrawing',  // Both escrows are funded, secret revealed, withdrawals in progress.
      'completed',    // Both parties have received their funds.
      'failed',       // An unrecoverable error occurred.
      'expired',      // Order was not filled before its expiration time.
      'cancelled'     // Order was cancelled after being filled.
    ),
    defaultValue: 'pending',
    allowNull: false,
    comment: 'The current lifecycle status of the swap order.'
  },

  // Chain & Asset Information
  fromChain: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'from_chain',
    comment: 'The source blockchain (e.g., "EVM", "Cardano").'
  },
  toChain: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'to_chain',
    comment: 'The destination blockchain (e.g., "Cardano", "EVM").'
  },
  fromToken: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'from_token',
    comment: 'The asset being sent from the source chain.'
  },
  toToken: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'to_token',
    comment: 'The asset being received on the destination chain.'
  },
  fromAmount: {
    type: DataTypes.STRING, // Use STRING to handle large numbers without precision loss.
    allowNull: false,
    field: 'from_amount',
    comment: 'The amount of fromToken to be swapped.'
  },
  toAmount: {
    type: DataTypes.STRING, // Use STRING for large numbers.
    allowNull: false,
    field: 'to_amount',
    comment: 'The amount of toToken to be received.'
  },

  // Participant Addresses
  makerSrcAddress: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'maker_address',
    comment: 'The address of the user creating the order.'
  },
  makerDstAddress: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'recipient_address',
    comment: 'The final address to receive the toToken.'
  },
  resolverAddress: {
    type: DataTypes.STRING,
    allowNull: true, // Null until a resolver accepts the order.
    field: 'resolver_address',
    comment: 'The address of the resolver who filled the order.'
  },

  // Atomic Swap Primitives
  hashlock: {
    type: DataTypes.STRING(66), // 32 bytes hex string with 0x prefix (sha256)
    allowNull: false,
    comment: 'The SHA-256 hash of the secret, used to link the two escrows.'
  },
  salt:{
    type: DataTypes.INTEGER, // 32 bytes hex string (salt)
    allowNull: false,
    comment: 'A random salt used to csign order data and prevent replay attacks.'
  },
  orderHash: {
    type: DataTypes.STRING(66), // 32 bytes hex string (EIP-712 order hash)
    allowNull: false,
    unique: true,
    comment: 'The EIP-712 hash of the order data, used for signing.'
  },
    // EIP-712 Signature
  signature: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: "The Maker's EIP-712 signature of the order data."
  },

  // Transaction Tracking
  srcEscrowTxHash: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'src_escrow_tx_hash',
    comment: 'Transaction hash for the escrow creation on the source chain.'
  },
  dstEscrowTxHash: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'dst_escrow_tx_hash',
    comment: 'Transaction hash for the escrow creation on the destination chain.'
  },
  srcWithdrawTxHash: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'src_withdraw_tx_hash',
    comment: 'Transaction hash for the withdrawal on the source chain.'
  },
  dstWithdrawTxHash: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'dst_withdraw_tx_hash',
    comment: 'Transaction hash for the withdrawal on the destination chain.'
  },

  // Financials & Timestamps
  relayerFee: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'relayer_fee',
    comment: 'Fee charged by the relayer service for facilitating the swap.'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'expires_at',
    comment: 'Timestamp after which the off-chain order is no longer valid.'
  }
}, {
  tableName: 'orders',
  underscored: true,
  timestamps: true, // Adds createdAt and updatedAt fields automatically
  indexes: [
    { fields: ['status'] },
    { fields: ['maker_address'] },
    { fields: ['resolver_address'] },
    { fields: ['hashlock'] }
  ]
});

export default Order;
