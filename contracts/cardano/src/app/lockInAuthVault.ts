import { 
    Address, 
    Credential, 
    PrivateKey, 
    Value, 
    pBSToData, 
    pByteString,
    pIntToData,
    CredentialType,
    Script,
    ScriptType
} from "@harmoniclabs/plu-ts";

import { AuthVaultDatum } from "../lopContract";
import getTxBuilder from "./getTxBuilder";
import blockfrost from "./blockfrost";

// Import utilities
import { Logger } from "./utils/logger";
import { SwapError, NetworkError, InsufficientFundsError } from "./utils/errors";
import { UTxOUtils } from "./utils/utxo";
import { FileUtils } from "./utils/fileUtils";

/**
 * Configuration for locking funds in AuthVault
 */
interface LockConfig {
    escrowAmount: bigint;        // Amount to lock for escrow (lovelaces)
}

/**
 * Lock maker's funds in the AuthVault
 */
async function lockInAuthVault(config?: Partial<LockConfig>): Promise<void> {
    const defaultConfig: LockConfig = {
        escrowAmount: BigInt(10_000_000), // 10 ADA
    };

    const finalConfig = { ...defaultConfig, ...config };
    
    Logger.info("🔒 Starting AuthVault lock process");
    Logger.info(`📦 Locking amount: ${Number(finalConfig.escrowAmount) / 1_000_000} ADA`);

    try {
        // Initialize services
        const Blockfrost = blockfrost();
        const txBuilder = await getTxBuilder(Blockfrost);
        
        // Load AuthVault script (you'll need to compile this separately)
        // For now, we'll use a placeholder - you'd need to compile the authVaultValidator
        const authVaultScript = await FileUtils.loadScript("./testnet/auth-vault.plutus.json", ScriptType.PlutusV3);
        const authVaultAddr = new Address("testnet", new Credential(CredentialType.Script, authVaultScript.hash));
        Logger.info(`🏦 AuthVault address: ${authVaultAddr.toString()}`);

        // Load escrow script from JSON file
        const escrowScript = await FileUtils.loadScript("./testnet/atomic-swap.plutus.json", ScriptType.PlutusV3);
        Logger.info(`📜 Escrow script loaded from JSON file`);
        Logger.info(`🔑 Escrow script hash: ${escrowScript.hash.toString()}`);

        // Load maker's credentials
        const makerPrivateKey = await FileUtils.loadPrivateKey("./testnet/payment1.skey");
        const makerAddress = await FileUtils.loadAddress("./testnet/address1.addr");
        const makerPkh = makerPrivateKey.derivePublicKey().hash;
        Logger.info(`👤 Maker address: ${makerAddress.toString()}`);
        Logger.info(`🔑 Maker PKH: ${makerPkh.toString()}`);

        // Fetch and validate UTXOs
        Logger.info("🔍 Fetching UTXOs for maker address...");
        const utxos = await Blockfrost.addressUtxos(makerAddress.toString());
        
        if (utxos.length === 0) {
            throw new NetworkError("No UTXOs found at the maker address. Ensure the address has funds.");
        }

        UTxOUtils.logUtxoInfo(utxos, makerAddress.toString());

        // Find suitable UTXO for locking
        const requiredAmount = finalConfig.escrowAmount + BigInt(3_000_000); // Add buffer for fees
        const selectedUtxo = UTxOUtils.findUtxoWithFunds(utxos, requiredAmount);
        
        Logger.success(`Selected UTXO with ${Number(UTxOUtils.getLovelaces(selectedUtxo.resolved.value)) / 1_000_000} ADA`);

        // Build transaction to lock funds in AuthVault
        Logger.info("🏗️  Building AuthVault lock transaction...");
        Logger.info("🔍 AuthVault Datum Info:");
        Logger.info(`   Maker PKH: ${makerPkh.toString()}`);
        Logger.info(`   Expected Escrow Script Hash: ${escrowScript.hash.toString()}`);
        Logger.info("   This AuthVault will now validate outputs sent to this specific escrow script!");
        
        const tx = txBuilder.buildSync({
            inputs: [{ 
                utxo: UTxOUtils.convertUtxo(selectedUtxo)
            }],
            collaterals: [UTxOUtils.convertUtxo(selectedUtxo)],
            outputs: [{
                address: authVaultAddr.toString(),
                value: Value.lovelaces(finalConfig.escrowAmount),
                datum: AuthVaultDatum.AuthVaultDatum({
                    maker_pkh: pBSToData.$(pByteString(makerPkh.toBuffer())),
                    expected_escrow_script_hash: pBSToData.$(pByteString(escrowScript.hash.toBuffer())),
                    maker_input_value: pIntToData.$(Number(finalConfig.escrowAmount))
                })
            }],
            changeAddress: makerAddress.toString()
        });

        // Sign and submit transaction
        Logger.info("✍️  Signing transaction...");
        await tx.signWith(makerPrivateKey);
        
        Logger.info("📡 Submitting transaction to network...");
        const submittedTx = await Blockfrost.submitTx(tx.toCbor().toString());
        
        // Success output
        Logger.success("🎉 Funds locked in AuthVault successfully!");
        Logger.info(`📝 Transaction hash: ${submittedTx}`);
        Logger.info(`🏦 AuthVault address: ${authVaultAddr.toString()}`);
        Logger.info(`💰 Locked amount: ${Number(finalConfig.escrowAmount) / 1_000_000} ADA`);
        Logger.info(`🔑 Maker PKH: ${makerPkh.toString()}`);
        Logger.warn("⚠️  Now a resolver can use these funds along with their safety deposit to create the final escrow!");
        
    } catch (error) {
        Logger.error("❌ Failed to lock funds in AuthVault", error as Error);
        
        if (error instanceof InsufficientFundsError) {
            Logger.error("💰 Insufficient funds:");
            Logger.error(`   Required: ${Number(error.details.required) / 1_000_000} ADA`);
            Logger.error(`   Available: ${Number(error.details.available) / 1_000_000} ADA`);
        } else if (error instanceof NetworkError) {
            Logger.error("🌐 Network error - check your connection and Blockfrost configuration");
        } else if (error instanceof Error) {
            if (error.message.includes("404") || error.message.includes("Not Found")) {
                Logger.error("🔍 Address not found. Possible causes:");
                Logger.error("   1. Network mismatch (testnet address with preprod Blockfrost)");
                Logger.error("   2. Address hasn't been funded yet");
                Logger.error("   3. Invalid Blockfrost project ID");
            }
        }
        
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    lockInAuthVault();
}

export default lockInAuthVault;
