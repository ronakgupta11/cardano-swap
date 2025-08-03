import { 
    Address, 
    Credential, 
    PrivateKey, 
    Value, 
    pBSToData, 
    pByteString, 
    pIntToData,
    CredentialType,
    PublicKey,
    Script,
    ScriptType
} from "@harmoniclabs/plu-ts";

import { EscrowDatum } from "../MyDatum";
import { AuthVaultRedeemer,scriptLOP } from "../lopContract";
import getTxBuilder from "./getTxBuilder";
import blockfrost from "./blockfrost";
import { createHash } from "crypto";
import { scriptEscrow } from "../contract";

// Import utilities
import { Logger } from "./utils/logger";
import { SwapError, NetworkError, InsufficientFundsError, ValidationError } from "./utils/errors";
import { UTxOUtils } from "./utils/utxo";
import { FileUtils } from "./utils/fileUtils";


/**
 * Configuration for creating escrow from AuthVault
 */
interface CreateEscrowConfig {
    secret: string;
    safetyDeposit: bigint;       // Safety deposit amount (lovelaces)
    deadlineOffset: number;      // Hours from now for resolver deadline
    cancelOffset: number;        // Additional hours for cancel deadline
    publicOffset: number;        // Additional hours for public deadline
    utxoSelection?: {            // Optional UTXO selection criteria
        txHash?: string;         // Select by transaction hash
        outputIndex?: number;    // Select by output index
        exactValue?: bigint;     // Select by exact value
        index?: number;          // Select by array index (fallback)
    };
}

/**
 * Create escrow by combining AuthVault funds with resolver's safety deposit
 */
async function createEscrowFromAuthVault(config?: Partial<CreateEscrowConfig>): Promise<void> {
    const defaultConfig: CreateEscrowConfig = {
        secret: "my-secret-phrase-12345", // You should generate this or get from user
        safetyDeposit: BigInt(5_000_000), // 5 ADA safety deposit
        deadlineOffset: 1,    // 1 hour
        cancelOffset: 2,      // 2 hours total
        publicOffset: 3       // 3 hours total
    };

    const finalConfig = { ...defaultConfig, ...config };
    
    Logger.info("🤝 Starting escrow creation from AuthVault");
    Logger.info(`🔑 Using secret: ${finalConfig.secret}`);
    Logger.info(`💰 Safety deposit: ${Number(finalConfig.safetyDeposit) / 1_000_000} ADA`);
    Logger.info(`⏰ Resolver deadline: ${finalConfig.deadlineOffset} hour(s) from now`);

    try {
        // Initialize services
        const Blockfrost = blockfrost();
        const txBuilder = await getTxBuilder(Blockfrost);
        
        // Load scripts and addresses
        // Use the freshly compiled AuthVault with correct escrow script hash baked in
        const authVaultScript = scriptLOP;
        const authVaultAddr = new Address("testnet", new Credential(CredentialType.Script, authVaultScript.hash));
        
        // Use the same escrow script that was used to compile the AuthVault
        const escrowAddr = new Address("testnet", new Credential(CredentialType.Script, scriptEscrow.hash));
        
        Logger.info(`🏦 AuthVault address: ${authVaultAddr.toString()}`);
        Logger.info(`📜 Escrow address: ${escrowAddr.toString()}`);
        
        // CRITICAL DEBUG: Check script hash matching
        Logger.info("🔍 SCRIPT HASH DEBUG:");
        Logger.info(`   AuthVault script hash (NO LONGER PARAMETERIZED): ${authVaultScript.hash.toString()}`);
        Logger.info(`   Escrow script hash (from contract.ts): ${scriptEscrow.hash.toString()}`);
        Logger.info("");
        Logger.info("✅ NEW APPROACH - ESCROW SCRIPT HASH IN DATUM:");
        Logger.info("   The AuthVault script hash is now constant (not parameterized)");
        Logger.info("   The expected escrow script hash is stored in the AuthVault datum");
        Logger.info(`   Escrow script hash we're sending output to: ${scriptEscrow.hash.toString()}`);
        Logger.info("   This should work because the datum contains the correct escrow script hash!");;

        // Load resolver's credentials (payment2 is the resolver)
        const resolverPrivateKey = await FileUtils.loadPrivateKey("./testnet/payment2.skey");
        const resolverAddress = await FileUtils.loadAddress("./testnet/address2.addr");
        const resolverPkh = resolverPrivateKey.derivePublicKey().hash;
        Logger.info(`👤 Resolver address: ${resolverAddress.toString()}`);
        Logger.info(`🔑 Resolver PKH: ${resolverPkh.toString()}`);

        // Generate hashlock
        const hashlock = createHash('sha256').update(finalConfig.secret).digest();
        Logger.info(`🔒 Generated hashlock: ${hashlock.toString('hex')}`);

        // Find AuthVault UTXO with flexible selection
        Logger.info("🔍 Fetching UTXOs from AuthVault...");
        const authVaultUtxos = await Blockfrost.addressUtxos(authVaultAddr.toString());
        
        if (authVaultUtxos.length === 0) {
            throw new NetworkError("No UTXOs found at AuthVault address. Make sure the maker has locked funds first.");
        }

        // Log available UTXOs for debugging
        Logger.info(`📋 Found ${authVaultUtxos.length} AuthVault UTXO(s):`);
        authVaultUtxos.forEach((utxo, index) => {
            const value = Number(UTxOUtils.getLovelaces(utxo.resolved.value)) / 1_000_000;
            const txHash = utxo.utxoRef.id.toString();
            const outputIndex = utxo.utxoRef.index;
            Logger.info(`   [${index}] TxHash: ${txHash.slice(0, 16)}...${txHash.slice(-4)} #${outputIndex} - ${value} ADA`);
        });

        // Select UTXO based on configuration
        let authVaultUtxo;
        const selection = finalConfig.utxoSelection;

        if (selection?.txHash && selection?.outputIndex !== undefined) {
            // Select by transaction hash and output index (most precise)
            authVaultUtxo = authVaultUtxos.find(utxo => 
                utxo.utxoRef.id.toString() === selection.txHash && 
                utxo.utxoRef.index === selection.outputIndex
            );
            if (!authVaultUtxo) {
                throw new ValidationError(`No UTXO found with txHash: ${selection.txHash} and index: ${selection.outputIndex}`);
            }
            Logger.info(`✅ Selected UTXO by txHash and index`);
        } else if (selection?.exactValue) {
            // Select by exact value
            authVaultUtxo = authVaultUtxos.find(utxo => 
                UTxOUtils.getLovelaces(utxo.resolved.value) === selection.exactValue
            );
            if (!authVaultUtxo) {
                throw new ValidationError(`No UTXO found with exact value: ${Number(selection.exactValue) / 1_000_000} ADA`);
            }
            Logger.info(`✅ Selected UTXO by exact value: ${Number(selection.exactValue) / 1_000_000} ADA`);
        } else if (selection?.index !== undefined) {
            // Select by array index
            if (selection.index >= authVaultUtxos.length) {
                throw new ValidationError(`UTXO index ${selection.index} out of range (0-${authVaultUtxos.length - 1})`);
            }
            authVaultUtxo = authVaultUtxos[selection.index];
            Logger.info(`✅ Selected UTXO by index: ${selection.index}`);
        } else {
            // Default: select the first UTXO
            authVaultUtxo = authVaultUtxos[0];
            Logger.info(`✅ Selected first UTXO (default behavior)`);
        }

        const escrowAmount = UTxOUtils.getLovelaces(authVaultUtxo.resolved.value);
        Logger.success(`📍 Using AuthVault UTXO: ${authVaultUtxo.utxoRef.id.toString().slice(0, 16)}...#${authVaultUtxo.utxoRef.index} with ${Number(escrowAmount) / 1_000_000} ADA`);

        // Parse the AuthVault datum to get maker's PKH
        const authVaultDatum = authVaultUtxo.resolved.datum;
        if (!authVaultDatum) {
            throw new ValidationError("AuthVault UTXO must have a datum");
        }

        // For this example, we'll assume we know the maker's PKH
        // In a real implementation, you'd parse the datum properly
        const makerPublicKey = await FileUtils.loadPublicKey("./testnet/payment1.vkey");
        const makerPkh = makerPublicKey.hash;
        Logger.info(`👤 Maker PKH from datum: ${makerPkh.toString()}`);

        // Get resolver UTXOs for safety deposit and fees
        Logger.info("🔍 Fetching resolver UTXOs for safety deposit...");
        const resolverUtxos = await Blockfrost.addressUtxos(resolverAddress.toString());
        
        if (resolverUtxos.length === 0) {
            throw new NetworkError("No UTXOs found at resolver address for safety deposit and fees.");
        }

        UTxOUtils.logUtxoInfo(resolverUtxos, resolverAddress.toString());
        
        // Find UTXO for safety deposit + fees
        const requiredForSafetyAndFees = finalConfig.safetyDeposit + BigInt(5_000_000); // Add buffer for fees
        const resolverUtxo = UTxOUtils.findUtxoWithFunds(resolverUtxos, requiredForSafetyAndFees);
        Logger.success(`Selected resolver UTXO with ${Number(UTxOUtils.getLovelaces(resolverUtxo.resolved.value)) / 1_000_000} ADA`);

        // Calculate deadlines
        const now = Date.now();
        const resolverDeadline = now + (finalConfig.deadlineOffset * 3600000);
        const cancelDeadline = now + (finalConfig.cancelOffset * 3600000);
        const publicDeadline = now + (finalConfig.publicOffset * 3600000);

        Logger.info("📅 Swap timeline:");
        Logger.info(`  - Resolver deadline: ${new Date(resolverDeadline).toISOString()}`);
        Logger.info(`  - Cancel deadline: ${new Date(cancelDeadline).toISOString()}`);
        Logger.info(`  - Public deadline: ${new Date(publicDeadline).toISOString()}`);

        // Build transaction that spends from both AuthVault and resolver
        Logger.info("🏗️  Building escrow creation transaction...");
        
        const totalEscrowValue = escrowAmount + finalConfig.safetyDeposit;
        
        // Debug: Log what we're sending vs what the script expects
        Logger.info("🔍 Transaction Debug Info:");
        Logger.info(`   Total escrow value: ${Number(totalEscrowValue) / 1_000_000} ADA (${totalEscrowValue} lovelaces)`);
        Logger.info(`   Safety deposit required: ${Number(finalConfig.safetyDeposit) / 1_000_000} ADA (${finalConfig.safetyDeposit} lovelaces)`);
        Logger.info(`   Escrow amount from AuthVault: ${Number(escrowAmount) / 1_000_000} ADA (${escrowAmount} lovelaces)`);
        Logger.info(`   Output address: ${escrowAddr.toString()}`);
        Logger.info(`   Expected script hash by AuthVault: ${scriptEscrow.hash.toString()}`);
        Logger.info(`   Maker PKH: ${makerPkh.toString()}`);
        Logger.info(`   Resolver PKH: ${resolverPkh.toString()}`);
        
        const tx = txBuilder.buildSync({
            inputs: [
                // Input 1: Spend from AuthVault with redeemer (script parameters handled in compilation)
                { 
                    utxo: UTxOUtils.convertUtxo(authVaultUtxo),
                    inputScript: {
                        script: authVaultScript,
                        datum: "inline",
                        redeemer: (() => {
                            const redeemer = AuthVaultRedeemer.CreateEscrow({
                                resolver_pkh: pBSToData.$(pByteString(resolverPkh.toBuffer())),
                                safety_deposit_amount: pIntToData.$(Number(finalConfig.safetyDeposit))
                            });
                            Logger.info("🔍 Redeemer Debug:");
                            Logger.info(`   Resolver PKH in redeemer: ${resolverPkh.toString()}`);
                            Logger.info(`   Safety deposit in redeemer: ${Number(finalConfig.safetyDeposit)}`);
                            return redeemer;
                        })()
                    }
                },
                // Input 2: Spend from resolver's wallet for safety deposit
                { 
                    utxo: UTxOUtils.convertUtxo(resolverUtxo)
                }
            ],
            collaterals: [UTxOUtils.convertUtxo(resolverUtxo)],
            outputs: [
                // Output 1: Create the final escrow UTXO
                {
                    address: escrowAddr.toString(),
                    value: Value.lovelaces(totalEscrowValue),
                    datum: (() => {
                        const datum = EscrowDatum.EscrowDatum({
                            hashlock: pBSToData.$(pByteString(hashlock)),
                            maker_pkh: pBSToData.$(pByteString(makerPkh.toBuffer())),
                            resolver_pkh: pBSToData.$(pByteString(resolverPkh.toBuffer())),
                            resolver_unlock_deadline: pIntToData.$(resolverDeadline),
                            resolver_cancel_deadline: pIntToData.$(cancelDeadline),
                            public_cancel_deadline: pIntToData.$(publicDeadline),
                            safety_deposit: pIntToData.$(Number(finalConfig.safetyDeposit))
                        });
                        Logger.info("🔍 Escrow Datum Debug:");
                        Logger.info(`   Hashlock: ${hashlock.toString('hex')}`);
                        Logger.info(`   Maker PKH: ${makerPkh.toString()}`);
                        Logger.info(`   Resolver PKH: ${resolverPkh.toString()}`);
                        Logger.info(`   Resolver deadline: ${resolverDeadline} (${new Date(resolverDeadline).toISOString()})`);
                        Logger.info(`   Cancel deadline: ${cancelDeadline} (${new Date(cancelDeadline).toISOString()})`);
                        Logger.info(`   Public deadline: ${publicDeadline} (${new Date(publicDeadline).toISOString()})`);
                        Logger.info(`   Safety deposit: ${Number(finalConfig.safetyDeposit)}`);
                        return datum;
                    })()
                }
            ],
            changeAddress: resolverAddress.toString(),
            requiredSigners: [resolverPkh] // Only resolver needs to sign
        });

        // Sign and submit transaction
        Logger.info("✍️  Signing transaction...");
        await tx.signWith(resolverPrivateKey);
        
        Logger.info("📡 Submitting transaction to network...");
        const submittedTx = await Blockfrost.submitTx(tx.toCbor().toString());
        
        // Success output
        Logger.success("🎉 Escrow created successfully from AuthVault!");
        Logger.info(`📝 Transaction hash: ${submittedTx}`);
        Logger.info(`🔑 SECRET: ${finalConfig.secret}`);
        Logger.info(`🔒 Hashlock: ${hashlock.toString('hex')}`);
        Logger.info(`📍 Escrow address: ${escrowAddr.toString()}`);
        Logger.info(`💰 Total escrow value: ${Number(totalEscrowValue) / 1_000_000} ADA`);
        Logger.info(`   - From maker (AuthVault): ${Number(escrowAmount) / 1_000_000} ADA`);
        Logger.info(`   - From resolver (safety deposit): ${Number(finalConfig.safetyDeposit) / 1_000_000} ADA`);
        Logger.warn("⚠️  Store the secret securely - you'll need it to withdraw funds!");
        
    } catch (error) {
        Logger.error("❌ Failed to create escrow from AuthVault", error as Error);
        
        if (error instanceof InsufficientFundsError) {
            Logger.error("💰 Insufficient funds:");
            Logger.error(`   Required: ${Number(error.details.required) / 1_000_000} ADA`);
            Logger.error(`   Available: ${Number(error.details.available) / 1_000_000} ADA`);
        } else if (error instanceof NetworkError) {
            Logger.error("🌐 Network error:");
            if (error.message.includes("No UTXOs found at AuthVault address")) {
                Logger.error("   Make sure:");
                Logger.error("   1. The maker has locked funds in the AuthVault first");
                Logger.error("   2. The AuthVault script is deployed correctly");
            }
        } else if (error instanceof ValidationError) {
            Logger.error("🔍 Validation error:");
            Logger.error(`   ${error.message}`);
        } else if (error instanceof Error) {
            if (error.message.includes("script execution failed")) {
                Logger.error("💻 Script validation failed. Check:");
                Logger.error("   1. The resolver has the correct permissions");
                Logger.error("   2. The AuthVault validation logic");
                Logger.error("   3. The safety deposit amount matches expectations");
            }
        }
        
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    createEscrowFromAuthVault();
}

export default createEscrowFromAuthVault;
