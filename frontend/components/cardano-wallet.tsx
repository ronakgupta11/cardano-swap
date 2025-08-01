"use client"
import "@meshsdk/react/styles.css"

import { CardanoWallet } from "@meshsdk/react"
export default function CardanoWalletButton (){
    return <CardanoWallet
        label={"Connect to cardano"}
        persist={true}
        onConnected={()=>{console.log('on connected')}}

      />
    
}