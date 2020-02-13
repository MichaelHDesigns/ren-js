import {
    newPromiEvent, Ox, PromiEvent, ShiftOutParams, ShiftOutParamsAll, TxStatus, UnmarshalledBurnTx,
} from "@renproject/ren-js-common";
import BigNumber from "bignumber.js";
import Web3 from "web3";
import { TransactionConfig } from "web3-core";

import { payloadToABI } from "./lib/abi";
import { processShiftOutParams } from "./lib/processParams";
import { forwardEvents, RenWeb3Events, Web3Events } from "./lib/promievent";
import {
    BURN_TOPIC, generateShiftOutTxHash, ignoreError, renTxHashToBase64, waitForReceipt,
    withDefaultAccount,
} from "./lib/utils";
import { ResponseQueryBurnTx } from "./renVM/jsonRPC";
import { ShifterNetwork, unmarshalBurnTx } from "./renVM/shifterNetwork";
import { NetworkDetails } from "./types/networks";

export class ShiftOutObject {
    private readonly params: ShiftOutParamsAll;
    private readonly renVMNetwork: ShifterNetwork;
    private readonly network: NetworkDetails;

    constructor(_renVMNetwork: ShifterNetwork, _network: NetworkDetails, _params: ShiftOutParams) {
        this.renVMNetwork = _renVMNetwork;
        this.network = _network;
        this.params = processShiftOutParams(this.network, _params);
    }

    public readFromEthereum = (txConfig?: TransactionConfig): PromiEvent<ShiftOutObject, Web3Events & RenWeb3Events> => {

        const promiEvent = newPromiEvent<ShiftOutObject, Web3Events & RenWeb3Events>();

        (async () => {

            if (this.params.renTxHash) {
                return this;
            }

            const { web3Provider, contractCalls } = this.params;
            let { burnReference } = this.params;
            let ethTxHash = this.params.ethTxHash;

            // There are three parameter configs:
            // Situation (1): A `burnReference` is provided
            // Situation (2): Contract call details are provided
            // Situation (3): A txHash is provided

            // For (1), we don't have to do anything.
            if (!burnReference && burnReference !== 0) {

                if (!web3Provider) {
                    throw new Error("Must provide burn reference ID or web3 provider.");
                }

                const web3 = new Web3(web3Provider);

                // Handle situation (2)
                // Make a call to the provided contract and Pass on the
                // transaction hash.
                if (contractCalls) {

                    for (let i = 0; i < contractCalls.length; i++) {
                        const contractCall = contractCalls[i];
                        const last = i === contractCalls.length - 1;

                        const { contractParams, contractFn, sendTo, txConfig: txConfigParam } = await contractCall;

                        const callParams = [
                            ...(contractParams || []).map(value => value.value),
                        ];

                        const ABI = payloadToABI(contractFn, contractParams);
                        const contract = new web3.eth.Contract(ABI, sendTo);

                        const tx = contract.methods[contractFn](
                            ...callParams,
                        ).send(await withDefaultAccount(web3, {
                            ...txConfigParam,
                            ...{
                                value: txConfigParam && txConfigParam.value ? txConfigParam.value.toString() : undefined,
                                gasPrice: txConfigParam && txConfigParam.gasPrice ? txConfigParam.gasPrice.toString() : undefined,
                            },

                            ...txConfig,
                        }));

                        if (last) {
                            forwardEvents(tx, promiEvent);
                        }

                        ethTxHash = await new Promise((resolve, reject) => tx
                            .on("transactionHash", resolve)
                            .catch((error: Error) => {
                                // tslint:disable-next-line: no-console
                                try { if (ignoreError(error)) { console.error(String(error)); return; } } catch (_error) { /* Ignore _error */ }
                                reject(error);
                            })
                        );
                    }
                }

                if (!ethTxHash) {
                    throw new Error("Must provide txHash or contract call details.");
                }

                // Handle (3) and continue handling (2)
                // Given a transaction hash, look through the receipts for a
                // ShiftOut event.
                // @dev WARNING: If multiple shiftOuts are present, ShiftOut
                // should be called for each one, passing in the reference IDs.
                const receipt = await waitForReceipt(web3, ethTxHash);

                if (!receipt.logs) {
                    throw Error("No events found in transaction");
                }

                for (const [, event] of Object.entries(receipt.logs)) {
                    if (event.topics[0] === BURN_TOPIC) {
                        burnReference = event.topics[1] as string;
                        break;
                    }
                }

                if (!burnReference && burnReference !== 0) {
                    throw Error("No reference ID found in logs");
                }
            }

            this.params.burnReference = burnReference;

            return this;

        })().then(promiEvent.resolve).catch(promiEvent.reject);

        // TODO: Look into why .catch isn't being called on tx
        promiEvent.on("error", (error) => {
            // tslint:disable-next-line: no-console
            try { if (ignoreError(error)) { console.error(String(error)); return; } } catch (_error) { /* Ignore _error */ }
            promiEvent.reject(error);
        });

        return promiEvent;
    }

    public renTxHash = () => {
        const renTxHash = this.params.renTxHash;
        if (renTxHash) {
            return renTxHashToBase64(renTxHash);
        }

        if (!this.params.burnReference && this.params.burnReference !== 0) {
            throw new Error("Must call `readFromEthereum` before calling `renTxHash`");
        }
        const burnReference = new BigNumber(this.params.burnReference).toFixed();
        return generateShiftOutTxHash(this.params.sendToken, burnReference);
    }

    public queryTx = async () =>
        unmarshalBurnTx(await this.renVMNetwork.queryTX(Ox(Buffer.from(this.renTxHash(), "base64"))))

    public submitToRenVM = (): PromiEvent<UnmarshalledBurnTx, { renTxHash: [string], status: [TxStatus] }> => {
        const promiEvent = newPromiEvent<UnmarshalledBurnTx, { renTxHash: [string], status: [TxStatus] }>();

        (async () => {
            const { burnReference } = this.params;
            if (!this.params.renTxHash && (!burnReference && burnReference !== 0)) {
                throw new Error("Must call `readFromEthereum` before calling `submitToRenVM`");
            }

            const renTxHash = this.renTxHash();

            // const renTxHash = await this.renVMNetwork.submitTokenFromEthereum(this.params.sendToken, burnReference);
            promiEvent.emit("renTxHash", renTxHash);

            const response = await this.renVMNetwork.waitForTX<ResponseQueryBurnTx>(
                Ox(Buffer.from(renTxHash, "base64")),
                (status) => {
                    promiEvent.emit("status", status);
                },
                () => promiEvent._isCancelled(),
            );
            return unmarshalBurnTx(response);
        })().then(promiEvent.resolve).catch(promiEvent.reject);

        return promiEvent;
    }
}
