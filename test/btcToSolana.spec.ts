import BigNumber from "bignumber.js";
import chai from "chai";
import { config as loadDotEnv } from "dotenv";
import { InputChainTransaction } from "packages/utils/build/main";

import { Connection } from "@solana/web3.js";

import { Bitcoin } from "../packages/chains/chains-bitcoin/src";
import { Ethereum } from "../packages/chains/chains-ethereum/src";
import { makeTestSigner } from "../packages/chains/chains-solana/build/main/utils";
import { Solana } from "../packages/chains/chains-solana/src";
import { renTestnet } from "../packages/chains/chains-solana/src/networks";
import RenJS from "../packages/ren/src";
import { RenNetwork } from "../packages/utils/src";
import { printChain, sendFunds } from "./testUtils";

chai.should();

loadDotEnv();

describe("BTC/toSolana", () => {
    it.only("BTC/toSolana", async function () {
        this.timeout(100000000000);

        const network = RenNetwork.Testnet;
        const asset = Bitcoin.assets.BTC;
        const from = new Bitcoin({ network });
        const to = new Solana({
            network: renTestnet,
            provider: new Connection(renTestnet.endpoint),
            signer: makeTestSigner(
                Buffer.from(process.env.TESTNET_SOLANA_KEY, "hex"),
            ),
        });

        const renJS = new RenJS(network).withChains(from, to);

        const gateway = await renJS.gateway({
            asset,
            from: from.GatewayAddress(),
            to: to.Account(),
            nonce: 4,
        });

        const decimals = from.assetDecimals(asset);

        const minimumAmount = gateway.fees.minimumAmount.shiftedBy(-decimals);
        const receivedAmount = gateway.fees
            .estimateOutput(gateway.fees.minimumAmount)
            .shiftedBy(-decimals);

        console.log(
            `Deposit at least ${minimumAmount.toFixed()} ${asset} to ${
                gateway.gatewayAddress
            } (to receive at least ${receivedAmount.toFixed()})`,
        );

        for (const setupKey of Object.keys(gateway.inSetup)) {
            const setup = gateway.inSetup[setupKey];
            console.log(
                `[${printChain(gateway.fromChain.chain)}⇢${printChain(
                    gateway.toChain.chain,
                )}]: Calling ${setupKey} setup for ${String(setup.chain)}`,
            );
            setup.eventEmitter.on("progress", console.log);
            await setup.submit();
        }

        await sendFunds(asset, gateway.gatewayAddress, minimumAmount.times(5));

        let foundDeposits = 0;

        await new Promise<void>((resolve, reject) => {
            gateway.on("transaction", (tx) => {
                (async () => {
                    foundDeposits += 1;

                    const { amount, asset } = tx.in.progress
                        .transaction as InputChainTransaction;

                    console.log(
                        `[${printChain(gateway.fromChain.chain)}⇢${printChain(
                            gateway.toChain.chain,
                        )}][${tx.hash}]: Received ${new BigNumber(
                            amount,
                        ).shiftedBy(-decimals)} ${asset}`,
                    );

                    await RenJS.defaultDepositHandler(tx);

                    foundDeposits -= 1;

                    console.log(
                        `[${printChain(from.chain)}⇢${printChain(
                            to.chain,
                        )}][${tx.hash.slice(0, 6)}] Done.${
                            tx.renVM.progress.response &&
                            tx.renVM.progress.response.tx.out
                                ? ` Received ${tx.renVM.progress.response.tx.out.amount
                                      .shiftedBy(-decimals)
                                      .toFixed()}`
                                : ""
                        } (${foundDeposits} other deposits remaining)`,
                        tx.out.progress.transaction?.txidFormatted,
                    );

                    if (foundDeposits === 0) {
                        resolve();
                    }
                })().catch(reject);
            });
        });
    });
});
