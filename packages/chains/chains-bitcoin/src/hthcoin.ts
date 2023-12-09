import {
    ChainStatic,
    RenNetwork,
    RenNetworkDetails,
    RenNetworkString,
} from "@renproject/interfaces";
import { Callable, utilsWithChainNetwork } from "@renproject/utils";
import base58 from "bs58";

import { Insight } from "./APIs/insight";
import { BtcAddress, BtcNetwork, BtcTransaction } from "./base";
import { BitcoinClass } from "./bitcoin";
import { createAddress, pubKeyScript } from "./script";
import { validateAddress } from "./utils";

export class HthClass extends BitcoinClass {
    public static chain = "HthCoin";
    public chain = HthClass.chain;
    public name = HthClass.chain;

    // APIs
    public withDefaultAPIs = (network: BtcNetwork): this => {
        switch (network) {
            case "mainnet":
                // prettier-ignore
                return this
                    .withAPI(Insight(""))
                    .withAPI(Insight(""))
            case "testnet":
                // prettier-ignore
                return this
                    .withAPI(Insight(""));
            case "regtest":
                throw new Error(`Regtest is currently not supported.`);
        }
    };

    public static asset = "HTH";
    public asset = HthClass.asset;

    public static utils = {
        resolveChainNetwork: BitcoinClass.utils.resolveChainNetwork,
        p2shPrefix: {
            // Source: https://github.com/digicontributer/digibyte-js/blob/27156cd1cb4430c4a4959f46e809629846694434/lib/networks.js
            mainnet: Buffer.from([0x3f]),
            testnet: Buffer.from([0x8c]),
        },
        createAddress: createAddress(base58.encode, Networks, Opcode, Script),
        calculatePubKeyScript: pubKeyScript(Networks, Opcode, Script),
        addressIsValid: (
            address: BtcAddress | string,
            network:
                | RenNetwork
                | RenNetworkString
                | RenNetworkDetails
                | BtcNetwork = "mainnet",
        ) =>
            validateAddress(
                address,
                HthClass.asset,
                HthCoin.utils.resolveChainNetwork(network),
            ),

        addressExplorerLink: (
            address: BtcAddress | string,
            network:
                | RenNetwork
                | RenNetworkString
                | RenNetworkDetails
                | BtcNetwork = "mainnet",
        ): string | undefined => {
            switch (Dogecoin.utils.resolveChainNetwork(network)) {
                case "mainnet":
                    return `https://bitblocks.cc/tx/XBB/${txHash}/`;
                case "testnet":
                    return `https://bitblocks.cc/tx/XBB/${txHash}/`;
                case "regtest":
                    return undefined;
            }
        },

        transactionExplorerLink: (
            tx: BtcTransaction | string,
            network:
                | RenNetwork
                | RenNetworkString
                | RenNetworkDetails
                | BtcNetwork = "mainnet",
        ): string | undefined => {
            const txHash = typeof tx === "string" ? tx : tx.txHash;

            switch (HthCoin.utils.resolveChainNetwork(network)) {
                case "mainnet":
                    return `https://bitblocks.cc/tx/XBB/${txHash}/`;
                case "testnet":
                    return `https://bitblocks.cc/tx/XBB/${txHash}/`;
                case "regtest":
                    return undefined;
            }
        },
    };

    public utils = utilsWithChainNetwork(
        HthClass.utils,
        () => this.chainNetwork,
    );
}

export type HthCoin = HthClass;
export const Bitblocks = Callable(HthClass);

const _: ChainStatic<BtcTransaction, BtcAddress, BtcNetwork> = HthCoin;
