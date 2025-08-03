import { 
    pfn,
    pstruct,
    bs,
    int,
    str,
    bool,
    PPubKeyHash,
    PScriptContext, 
    PAddress,
    PCurrencySymbol,
    PTokenName,
    PValue,
    plet, 
    pmatch, 
    passert,
    perror,
    psha2_256,
    ptraceIfFalse,
    pdelay,
    pData,
    pByteString,
    pif,
    compile,
    Script,
    ScriptType,
    Address,
    Credential,
    pStr,
    pBool,
    Value,
    data,
    punsafeConvertType,
    PMaybe,
    unit,
    ptrace,
    pString
} from "@harmoniclabs/plu-ts";

export const AuthVaultDatum = pstruct({
    AuthVaultDatum: {
        maker_pkh: PPubKeyHash.type,
        expected_escrow_script_hash: bs,
        maker_input_value: int
    }
});

export const AuthVaultRedeemer = pstruct({
    CreateEscrow: {
        resolver_pkh: PPubKeyHash.type,
        safety_deposit_amount: int
    }
});

export const authVaultValidator = pfn([
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
    const datum = plet(punsafeConvertType(maybeDatum.unwrap, AuthVaultDatum.type));
    
    // Convert redeemer to typed format
    const redeemerData = plet(punsafeConvertType(redeemer, AuthVaultRedeemer.type));
    
    return pmatch(redeemerData)
        .onCreateEscrow(({ resolver_pkh, safety_deposit_amount }) => {
            
            /**
             * 1. Get the value of the UTXO being spent (AuthVault input)
             */
        const inputValue = plet(
            pmatch(datum)
                .onAuthVaultDatum(({ maker_input_value }) => maker_input_value)
        );

            /**
             * 2. Calculate expected escrow output value
             */
            const expectedEscrowValue = plet(
                inputValue.add(safety_deposit_amount)
            );

            /**
             * 3. Verify resolver is signing the transaction
             */
            const signedByResolver = plet(
                tx.signatories.some(resolver_pkh.eq)
            );

            /**
             * 4. Verify escrow output exists with correct value
             */
            const hasValidEscrowOutput = plet(
                tx.outputs.some(output => {
                    // Check if output is sent to the expected escrow script
                    const isEscrowScript = pmatch(output.address.credential)
                        .onPScriptCredential(({ valHash }) => 
                            pmatch(datum)
                                .onAuthVaultDatum(({ expected_escrow_script_hash }) => 
                                    valHash.eq(expected_escrow_script_hash)
                                )
                        )
                        ._(_ => pBool(false));

                    // Check if the value equals exactly: maker's input + safety deposit
                    const hasExactValue = output.value.lovelaces.eq(expectedEscrowValue);

                    // Both conditions must be true for this output
                    return isEscrowScript.and(hasExactValue);
                })
            );

            // Combine all validations with helpful error messages
            return passert.$(
                ptraceIfFalse.$(pdelay(pStr("ERROR: Resolver must sign the transaction")))
                    .$(signedByResolver)
                .and(
                    ptraceIfFalse.$(pdelay(pStr("ERROR: No escrow output with exact value (maker input + safety deposit)")))
                        .$(hasValidEscrowOutput)
                )
            );
        });
});

/**
 * Compiled contract and utility addresses
 */

import { scriptEscrow } from "./contract";

console.log("🔍 DEBUG: Script hash being baked into AuthVault at compilation time:");
console.log(`   scriptEscrow.hash: ${scriptEscrow.hash.toString()}`);
console.log(`   scriptEscrow.hash buffer: ${Buffer.from(scriptEscrow.hash.toBuffer()).toString('hex')}`);

export const compiledLOP = compile(authVaultValidator);

export const scriptLOP = new Script(
    ScriptType.PlutusV3,
    compiledLOP
);  

export const scriptMainnetAddr = new Address(
    "mainnet",
    Credential.script(scriptLOP.hash)
);

export const scriptTestnetAddr = new Address(
    "testnet",
    Credential.script(scriptLOP.hash.clone())
);
