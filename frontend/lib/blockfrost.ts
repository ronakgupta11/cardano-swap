import { BlockfrostPluts } from "@harmoniclabs/blockfrost-pluts";

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
    network: "testnet" as string   // Use testnet to mat  ch the addresses
};

/**
 * Create and configure Blockfrost provider
 */
function blockfrost(): BlockfrostPluts {
    try {
        
        const provider = new BlockfrostPluts({
            projectId: BLOCKFROST_CONFIG.projectId,
            network: BLOCKFROST_CONFIG.network as any
        });
        
        return provider;
        
    } catch (error) {
        throw new Error("Failed to create Blockfrost provider", { cause: error });
    }
}

export default blockfrost;