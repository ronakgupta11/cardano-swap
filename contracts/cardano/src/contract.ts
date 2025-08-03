import { 
    Address, 
    compile, 
    Credential, 
    pfn, 
    Script,
    psha2_256,
    ptraceIfFalse,
    pdelay,
    pStr, 
    ScriptType, 
    PScriptContext, 
    unit, 
    passert, 
    plet, 
    pmatch, 
    perror, 
    PMaybe, 
    data,
    punsafeConvertType,
    pBool
} from "@harmoniclabs/plu-ts";
import { EscrowDatum } from "./MyDatum";
import { EscrowRedeemer } from "./MyRedeemer";

/**
 * Atomic Swap Escrow Contract
 * 
 * This contract implements a hash-time-locked contract (HTLC) for atomic swaps.
 * It allows for secure, trustless exchange of assets between parties.
 * 
 * Features:
 * - Secret-based withdrawal with timelock
 * - Resolver-exclusive period before deadline
 * - Public withdrawal after deadline
 * - Cancel functionality for resolver
 */
export const escrow = pfn([
    PScriptContext.type
], unit)
(({ redeemer, tx, purpose }) => {
    
    // Extract datum from spending purpose
    const maybeDatum = plet(
        pmatch(purpose)
            .onSpending(({ datum }) => datum)
            ._(_ => perror(PMaybe(data).type))
    );

    // Convert to typed datum
    const datum = plet(punsafeConvertType(maybeDatum.unwrap, EscrowDatum.type));
    
    // Convert redeemer to typed format
    const redeemerData = plet(punsafeConvertType(redeemer, EscrowRedeemer.type));

    // Validation helpers
    const isSecretValid = (secret: any) => 
        psha2_256.$(secret).eq(datum.hashlock);

    const signedByMaker = tx.signatories.some(datum.maker_pkh.eq);
    const signedByResolver = tx.signatories.some(datum.resolver_pkh.eq);

    // Time validation - convert datum milliseconds to POSIX seconds
    const beforeResolverDeadline = plet(
        pmatch(tx.interval.to.bound)
            .onPFinite(({ n: upperInterval }) => 
                upperInterval.ltEq(datum.resolver_unlock_deadline.div(1000))
            )
            ._(_ => pBool(false))
    );

    const afterResolverDeadline = plet(
        pmatch(tx.interval.from.bound)
            .onPFinite(({ n: lowerInterval }) => 
                datum.resolver_unlock_deadline.div(1000).lt(lowerInterval)
            )
            ._(_ => pBool(false))
    );

    // Timelock and signature validation logic
    const timeAndSigValidation = plet(
        // Before deadline: resolver must sign
        ptraceIfFalse.$(pdelay(pStr("Before deadline: resolver signature required")))
            .$(beforeResolverDeadline.and(signedByResolver))
        .or(
            // After deadline: anyone can withdraw
            ptraceIfFalse.$(pdelay(pStr("After deadline: public withdrawal allowed")))
                .$(afterResolverDeadline)
        )
    );

    // Main validation logic
    return pmatch(redeemerData)
        .onWithdraw(({ secret }) => {
            const secretIsValid = isSecretValid(secret);
            
            return passert.$(
                ptraceIfFalse.$(pdelay(pStr("Invalid secret hash")))
                    .$(secretIsValid)
                .and(
                    ptraceIfFalse.$(pdelay(pStr("Timelock validation failed")))
                        .$(timeAndSigValidation)
                )
            );
        })
        .onCancel(_ => {
            return passert.$(
                ptraceIfFalse.$(pdelay(pStr("Cancel: must be signed by resolver")))
                    .$(signedByResolver)
            );
        });
});




/**
 * Compiled contract and utility addresses
 */

// Compile the contract
export const compiledEscrow = compile(escrow);

// Create script instance
export const scriptEscrow = new Script(
    ScriptType.PlutusV3,
    compiledEscrow
);

// Mainnet script address
export const scriptMainnetAddr = new Address(
    "mainnet",
    Credential.script(scriptEscrow.hash)
);

// Testnet script address
export const scriptTestnetAddr = new Address(
    "testnet",
    Credential.script(scriptEscrow.hash.clone())
);





