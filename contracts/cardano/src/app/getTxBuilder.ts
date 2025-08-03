import { TxBuilder } from "@harmoniclabs/plu-ts";
import { BlockfrostPluts } from "@harmoniclabs/blockfrost-pluts";
import { Logger } from "./utils/logger";
import { NetworkError } from "./utils/errors";

/**
 * Cached transaction builder to avoid multiple API calls
 * 
 * We cache the TxBuilder instance after the first call to avoid
 * repeatedly fetching protocol parameters from the network.
 */
let _cachedTxBuilder: TxBuilder | undefined = undefined;

/**
 * Get or create a transaction builder with protocol parameters
 */
export default async function getTxBuilder(Blockfrost: BlockfrostPluts): Promise<TxBuilder> {
    try {
        if (!(_cachedTxBuilder instanceof TxBuilder)) {
            Logger.debug("🔧 Fetching protocol parameters for transaction builder...");
            
            const parameters = await Blockfrost.getProtocolParameters();
            _cachedTxBuilder = new TxBuilder(parameters);
            
            Logger.debug("✅ Transaction builder created and cached");
        } else {
            Logger.debug("♻️  Using cached transaction builder");
        }

        return _cachedTxBuilder;
        
    } catch (error) {
        Logger.error("❌ Failed to create transaction builder", error as Error);
        throw new NetworkError("Failed to fetch protocol parameters from Blockfrost", error);
    }
}