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
    network: "testnet"   // Use testnet to match the addresses
};

/**
 * Create and configure Blockfrost provider
 */
function blockfrost() {
    try {
        
        const provider = new BlockfrostPluts({
            projectId: BLOCKFROST_CONFIG.projectId,
            network: BLOCKFROST_CONFIG.network
        });
        
        return provider;
        
    } catch (error) {
        throw error;
    }
}

export default blockfrost;