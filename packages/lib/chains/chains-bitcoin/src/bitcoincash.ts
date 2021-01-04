import { MintChainStatic } from "@renproject/interfaces";
import { Callable, utilsWithChainNetwork } from "@renproject/utils";
import {
    toCashAddress,
    isMainnetAddress,
    isTestnetAddress,
    isValidAddress,
} from "bchaddrjs";
import { Networks, Opcode, Script } from "bitcore-lib-cash";
import base58 from "bs58";
import { BCHHandler } from "send-crypto/build/main/handlers/BCH/BCHHandler";

import { BtcAddress, BtcNetwork, BtcTransaction } from "./base";
import { BitcoinClass } from "./bitcoin";
import { createAddress, pubKeyScript } from "./script";

export class BitcoinCashClass extends BitcoinClass {
    public static chain = "BitcoinCash";
    public chain = BitcoinCashClass.chain;
    public name = BitcoinCashClass.chain;
    public legacyName = "Bch";

    public static asset = "BCH";
    public asset = "BCH";
    public static utils = {
        p2shPrefix: {
            mainnet: Buffer.from([0x05]),
            testnet: Buffer.from([0xc4]),
        },
        getUTXO: BCHHandler.getUTXO,
        getUTXOs: BCHHandler.getUTXOs,
        getTransactions: BCHHandler.getTransactions,
        createAddress: createAddress(
            Networks,
            Opcode,
            Script,
            (bytes: Buffer) => toCashAddress(base58.encode(bytes)),
        ),
        calculatePubKeyScript: pubKeyScript(Networks, Opcode, Script),
        addressIsValid: (
            address: BtcAddress | string,
            network: BtcNetwork = "mainnet",
        ) =>
            isValidAddress(address) &&
            (network === "mainnet"
                ? isMainnetAddress(address)
                : network === "testnet"
                ? isTestnetAddress(address)
                : true),

        addressExplorerLink: (
            address: BtcAddress | string,
            network: BtcNetwork = "mainnet",
        ): string | undefined => {
            if (network === "mainnet") {
                return `https://explorer.bitcoin.com/bch/address/${address}`;
            } else if (network === "testnet") {
                return `https://explorer.bitcoin.com/tbch/address/${address}`;
            }
            return undefined;
        },

        transactionExplorerLink: (
            tx: BtcTransaction | string,
            network: BtcNetwork = "mainnet",
        ): string | undefined => {
            const txHash = typeof tx === "string" ? tx : tx.txHash;

            if (network === "mainnet") {
                return `https://explorer.bitcoin.com/bch/tx/${txHash}`;
            } else if (network === "testnet") {
                return `https://explorer.bitcoin.com/tbch/tx/${txHash}`;
            }
            return undefined;
        },
    };

    public utils = utilsWithChainNetwork(
        BitcoinCashClass.utils,
        () => this.chainNetwork,
    );
}

export type BitcoinCash = BitcoinCashClass;
export const BitcoinCash = Callable(BitcoinCashClass);

const _: MintChainStatic<BtcTransaction, BtcAddress, BtcNetwork> = BitcoinCash;
