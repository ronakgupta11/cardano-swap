import { TxBuilder } from "@harmoniclabs/plu-ts";
import { BlockfrostPluts } from "@harmoniclabs/blockfrost-pluts";

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
export default async function getTxBuilder(Blockfrost: BlockfrostPluts){
    try {
        if (!(_cachedTxBuilder instanceof TxBuilder)) {
            
            const parameters = await Blockfrost.getProtocolParameters();
            _cachedTxBuilder = new TxBuilder(parameters);
        }

        return _cachedTxBuilder;
        
    } catch (error) {
        throw new Error("Failed to fetch protocol parameters from Blockfrost", { cause: error });
    }
}