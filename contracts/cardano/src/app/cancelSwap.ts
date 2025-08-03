// import { 
//     Address, 
//     Credential, 
//     PrivateKey, 
//     Script,
//     ScriptType
// } from "@harmoniclabs/plu-ts";

// import SwapRedeemer from "../SwapRedeemer";
// import getTxBuilder from "./getTxBuilder";
// import { BlockfrostPluts } from "@harmoniclabs/blockfrost-pluts";
// import blockfrost from "./blockfrost";
// import { readFile } from "fs/promises";

// async function cancelSwap(Blockfrost: BlockfrostPluts) {
//     const txBuilder = await getTxBuilder(Blockfrost);
    
//     // Read compiled script
//     const scriptFile = await readFile("./testnet/atomic-swap.plutus.json", { encoding: "utf-8" });
//     const script = Script.fromCbor(JSON.parse(scriptFile).cborHex, ScriptType.PlutusV3);
//     const scriptAddr = new Address("testnet", Credential.script(script.hash));

//     // Read maker's keys (only maker can cancel)
//     const makerPrivateKeyFile = await readFile("./testnet/payment1.skey", { encoding: "utf-8" });
//     const makerPrivateKey = PrivateKey.fromCbor(JSON.parse(makerPrivateKeyFile).cborHex);
//     const makerAddr = await readFile("./testnet/address1.addr", { encoding: "utf-8" });
//     const makerAddress = Address.fromString(makerAddr);

//     // Find the swap UTXO
//     const scriptUtxos = await Blockfrost.addressUtxos(scriptAddr);
//     const swapUtxo = scriptUtxos[0];

//     if (!swapUtxo) {
//         throw new Error("No swap UTXO found to cancel");
//     }

//     // Get collateral
//     const makerUtxos = await Blockfrost.addressUtxos(makerAddress);
//     const collateralUtxo = makerUtxos.find(utxo => utxo.resolved.value.lovelaces >= 5_000_000)!;

//     // Build cancellation transaction (must be after deadline)
//     let tx = await txBuilder.buildSync({
//         inputs: [
//             { 
//                 utxo: swapUtxo,
//                 inputScript: {
//                     script: script,
//                     datum: "inline",
//                     redeemer: SwapRedeemer.Cancel({}) // Cancel redeemer
//                 }
//             }
//         ],
//         collaterals: [collateralUtxo],
//         outputs: [
//             {
//                 address: makerAddress,
//                 value: swapUtxo.resolved.value // Return all funds to maker
//             }
//         ],
//         changeAddress: makerAddress,
//         // Set validity interval to be after the deadline
//         validInterval: {
//             invalidBefore: Date.now() + 3600000, // 1 hour from now (after deadline)
//             invalidAfter: Date.now() + 7200000    // 2 hours from now
//         },
//         requiredSigners: [makerAddress.paymentCreds.hash] // Maker must sign
//     });

//     await tx.signWith(makerPrivateKey);
//     const submittedTx = await Blockfrost.submitTx(tx);
    
//     console.log("Swap cancelled successfully:", submittedTx);
// }

// if (process.argv[1].includes("cancelSwap")) {
//     cancelSwap(blockfrost());
// }
