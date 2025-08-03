// import { 
//     Address, 
//     Credential, 
//     PrivateKey, 
//     Script,
//     ScriptType,
//     pBSToData,
//     pByteString
// } from "@harmoniclabs/plu-ts";

// import SwapRedeemer from "../SwapRedeemer";
// import getTxBuilder from "./getTxBuilder";
// import { BlockfrostPluts } from "@harmoniclabs/blockfrost-pluts";
// import blockfrost from "./blockfrost";
// import { readFile } from "fs/promises";

// async function publicWithdraw(Blockfrost: BlockfrostPluts) {
//     const txBuilder = await getTxBuilder(Blockfrost);
    
//     const scriptFile = await readFile("./testnet/atomic-swap.plutus.json", { encoding: "utf-8" });
//     const script = Script.fromCbor(JSON.parse(scriptFile).cborHex, ScriptType.PlutusV3);
//     const scriptAddr = new Address("testnet", Credential.script(script.hash));

//     // Any user can perform public withdrawal
//     const publicWithdrawerPrivateKeyFile = await readFile("./testnet/payment3.skey", { encoding: "utf-8" });
//     const publicWithdrawerPrivateKey = PrivateKey.fromCbor(JSON.parse(publicWithdrawerPrivateKeyFile).cborHex);
//     const publicWithdrawerAddr = await readFile("./testnet/address3.addr", { encoding: "utf-8" });
//     const publicWithdrawerAddress = Address.fromString(publicWithdrawerAddr);

//     // Original maker's address (to send tokens to)
//     const makerAddr = await readFile("./testnet/address1.addr", { encoding: "utf-8" });
//     const makerAddress = Address.fromString(makerAddr);

//     // Secret found from the blockchain (previously revealed)
//     const secret = "my-secret-phrase-12345";
//     const secretBytes = Buffer.from(secret, 'utf8');

//     const scriptUtxos = await Blockfrost.addressUtxos(scriptAddr);
//     const swapUtxo = scriptUtxos[0];

//     if (!swapUtxo) {
//         throw new Error("No swap UTXO found for public withdrawal");
//     }

//     const publicWithdrawerUtxos = await Blockfrost.addressUtxos(publicWithdrawerAddress);
//     const collateralUtxo = publicWithdrawerUtxos.find(utxo => utxo.resolved.value.lovelaces >= 5_000_000)!;

//     // Extract values from the swap UTXO
//     const totalValue = swapUtxo.resolved.value;
//     const safetyDepositAmount = totalValue.lovelaces; // Assume ADA is the safety deposit
//     const tokenValue = totalValue.sub(Value.lovelaces(safetyDepositAmount));

//     let tx = await txBuilder.buildSync({
//         inputs: [
//             { 
//                 utxo: swapUtxo,
//                 inputScript: {
//                     script: script,
//                     datum: "inline",
//                     redeemer: SwapRedeemer.Withdraw({ 
//                         secret: pBSToData(pByteString(secretBytes))
//                     })
//                 }
//             }
//         ],
//         collaterals: [collateralUtxo],
//         outputs: [
//             {
//                 address: makerAddress,
//                 value: tokenValue // Send tokens to maker
//             },
//             {
//                 address: publicWithdrawerAddress,
//                 value: Value.lovelaces(safetyDepositAmount) // Safety deposit to public withdrawer
//             }
//         ],
//         changeAddress: publicWithdrawerAddress,
//         // Must be after the deadline for public withdrawal
//         validInterval: {
//             invalidBefore: Date.now() + 3600000, // After deadline
//             invalidAfter: Date.now() + 7200000
//         }
//     });

//     await tx.signWith(publicWithdrawerPrivateKey);
//     const submittedTx = await Blockfrost.submitTx(tx);
    
//     console.log("Public withdrawal successful:", submittedTx);
//     console.log("Safety deposit claimed by public withdrawer");
// }

// if (process.argv[1].includes("publicWithdraw")) {
//     publicWithdraw(blockfrost());
// }
