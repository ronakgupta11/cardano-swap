import { BlockfrostPluts } from "@harmoniclabs/blockfrost-pluts";
import { Logger } from "./utils/logger";

/**
 * Blockfrost configuration
 * 
 * Make sure to:
 * 1. Use the correct network (testnet/preprod/mainnet)
 * 2. Get your project ID from https://blockfrost.io/
 * 3. Match the network with your address generation
 */

const BLOCKFROST_CONFIG = {
    projectId: "preprodZtYTOkcp0u72K0FWpb33rdldMdmcdbXs", // Replace with your project ID
    network: "testnet" as const  // Use testnet to match the addresses
};

/**
 * Create and configure Blockfrost provider
 */
function blockfrost(): BlockfrostPluts {
    try {
        Logger.debug(`Initializing Blockfrost provider for ${BLOCKFROST_CONFIG.network}`);
        
        const provider = new BlockfrostPluts({
            projectId: BLOCKFROST_CONFIG.projectId,
            network: BLOCKFROST_CONFIG.network
        });
        
        Logger.debug("✅ Blockfrost provider initialized successfully");
        return provider;
        
    } catch (error) {
        Logger.error("❌ Failed to initialize Blockfrost provider", error as Error);
        Logger.error("Make sure your project ID is correct and network matches your addresses");
        throw error;
    }
}

export default blockfrost;