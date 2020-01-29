import {
    BurnContractCallSimple, Chain, DetailedContractCall, RenContract, ShiftInFromDetails,
    ShiftInParams, ShiftInParamsAll, ShiftOutParams, ShiftOutParamsAll,
} from "@renproject/ren-js-common";
import Web3 from "web3";

import { parseRenContract } from "../types/assets";
import { NetworkDetails } from "../types/networks";
import { getAssetSymbol, toBigNumber, utils } from "./utils";

export const resolveSendTo = <T extends ShiftInParams | ShiftOutParams>(params: T, { shiftIn }: { shiftIn: boolean }): T => {
    if ((params as ShiftInFromDetails | ShiftOutParams).sendToken) {
        (params as ShiftInFromDetails | ShiftOutParams).sendToken = ((): RenContract => {
            const token = (params as ShiftInFromDetails | ShiftOutParams).sendToken;
            switch (token) {
                case "BTC":
                    return shiftIn ? RenContract.Btc2Eth : RenContract.Eth2Btc;
                case "BCH":
                    return shiftIn ? RenContract.Bch2Eth : RenContract.Eth2Bch;
                case "ZEC":
                    return shiftIn ? RenContract.Zec2Eth : RenContract.Eth2Zec;
                default:
                    return token;
            }
        })();
    }
    return params;
};

/**
 * `resolveContractCall` simplifies the arguments required by RenJS by allowing
 * developers to pass in a non-contract address as the `sendTo` field.
 * This function checks if this is the case and makes the required changes to
 * the parameters;
 */
export const resolveContractCall = <T extends ShiftOutParamsAll | ShiftInParamsAll>(network: NetworkDetails, sendToken: RenContract, params: T): T => {

    if (params.contractCalls) {
        // Check that the params are accompanied by a function name
        for (const singleContractCall of params.contractCalls) {
            if (singleContractCall.hasOwnProperty("then")) {
                continue;
            }
            if (!(singleContractCall as DetailedContractCall).sendTo) {
                throw new Error("Send address must be provided with contract parameters.");
            }
            if (!(singleContractCall as DetailedContractCall).contractFn) {
                throw new Error("Contract function name must be provided with contract parameters.");
            }
        }

        return params;
    }

    const contractCall = (params as ShiftInParams as DetailedContractCall);

    if (!contractCall.sendTo) {
        return params;
    }

    // Check that the params are accompanied by a function name
    if (contractCall.contractParams && !contractCall.contractFn) {
        throw new Error("Contract function name must be provided with contract parameters.");
    }

    // Check if the RenJS has been passed in the contract call details
    if (contractCall.contractFn) {
        return {
            ...params,
            contractCalls: [{
                sendTo: contractCall.sendTo,
                contractParams: contractCall.contractParams || [],
                contractFn: contractCall.contractFn,
                txConfig: contractCall.txConfig,
            }],
        };
    }

    // The contract call hasn't been provided - but `sendTo` has. We overwrite
    // the contract call with a simple adapter call.

    const renContract = parseRenContract(sendToken);
    if (renContract.to === Chain.Ethereum) {
        // Shift in
        return {
            ...params,
            contractCalls: [{
                sendTo: network.contracts.addresses.shifter.BasicAdapter.address,
                contractFn: "shiftIn",
                contractParams: [
                    { type: "address", name: "_shifterRegistry", value: network.contracts.addresses.shifter.ShifterRegistry.address },
                    { type: "string", name: "_symbol", value: getAssetSymbol(renContract.asset) },
                    { type: "address", name: "_address", value: contractCall.sendTo },
                ],
                txConfig: contractCall.txConfig,
            }],
        };
    } else {
        // Shift out

        const simpleContractCall = (params as ShiftInParams as BurnContractCallSimple);

        if (!simpleContractCall.sendAmount) {
            throw new Error(`Send amount must be provided in order to send directly to an address.`);
        }

        const addressToHex = utils[parseRenContract(sendToken).asset as "BTC" | "ZEC" | "BCH"].addressToHex(simpleContractCall.sendTo);

        const approve = new Promise(async (resolve) => {
            const web3 = new Web3((params as ShiftOutParamsAll).web3Provider);
            const shifterRegistry = new web3.eth.Contract(network.contracts.addresses.shifter.ShifterRegistry.abi, network.contracts.addresses.shifter.ShifterRegistry.address);
            const contract = parseRenContract(sendToken);
            const shiftedTokenAddress = await shifterRegistry.methods.getTokenBySymbol(getAssetSymbol(contract.asset)).call();
            resolve({
                sendTo: shiftedTokenAddress,
                contractFn: "approve",
                contractParams: [
                    { type: "address", name: "spender", value: network.contracts.addresses.shifter.BasicAdapter.address },
                    { type: "uint256", name: "amount", value: toBigNumber(simpleContractCall.sendAmount).toFixed() },
                ],
                txConfig: contractCall.txConfig,
            });
        });

        return {
            ...params,
            contractCalls: [
                approve,
                {
                    sendTo: network.contracts.addresses.shifter.BasicAdapter.address,
                    contractFn: "shiftOut",
                    contractParams: [
                        { type: "address", name: "_shifterRegistry", value: network.contracts.addresses.shifter.ShifterRegistry.address },
                        { type: "string", name: "_symbol", value: getAssetSymbol(renContract.asset) },
                        { type: "bytes", name: "_to", value: addressToHex },
                        { type: "uint256", name: "_amount", value: toBigNumber(simpleContractCall.sendAmount).toFixed() },
                    ],
                    txConfig: { gas: 200000, ...contractCall.txConfig },
                }]
        };
    }
};
