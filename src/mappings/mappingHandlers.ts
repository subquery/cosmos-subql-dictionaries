import { CosmosEvent, CosmosMessage } from "@subql/types-cosmos";
import { Event, EvmLog, EvmTransaction, Message, ChainAliases } from "../types";
import { inputToFunctionSighash, isSuccess, isZero, stripObjectUnicode } from "../utils";

const evmChainId: Record<string, string> = {
    'cronosmainnet_25-1': '25',
    'cronostestnet_338-1':'338'
}

let checkedAliases = false;

async function setAliases() {
    if (checkedAliases) return;

    const cosmosChainId = await (global as any).api.getChainId();
    if(!evmChainId[cosmosChainId]) {
        checkedAliases = true;
        return;
    }

    const chianAliases = ChainAliases.create({
        id: 'evmChainId',
        value: evmChainId[cosmosChainId]
    })

    await chianAliases.save();

    checkedAliases = true;
}

export async function handleEvent(event: CosmosEvent) {
    const blockHeight = BigInt(event.block.block.header.height);
    const eventStore = Event.create({
        id: `${event.block.block.id}-${event.idx}`,
        blockHeight,
        txHash: event.tx?.hash,
        type: event.event.type,
        msgType: event.msg?.msg.typeUrl,
        data: stripObjectUnicode(event.msg?.msg.decodedMsg),
    });
    await eventStore.save();

    // Cronos uses snake case "ethereum_tx"
    if(event.event.type === 'ethereumTx' || event.event.type === 'ethereum_tx') {
       await handleEvmLog(event);
    }
}

export async function handleMessage(message: CosmosMessage) {
    await setAliases();

    const blockHeight = BigInt(message.block.block.header.height);

    // Strip escaped unicode characters
    // Example problem message https://www.mintscan.io/crypto-org/txs/6DB02272D59D920EE9058E59231E9906C240FB82F2E756761CBADCEDF4EBFAE0
    // Example with escaped chars https://www.mintscan.io/osmosis/txs/155E8725A9983F6B696A067BFA5C24D4B0B0ADC6EE6C007B6C080C233B501BA7
    // Not supported by postgres jsonb https://www.postgresql.org/docs/current/datatype-json.html
    const data = stripObjectUnicode(message.msg.decodedMsg);

    const messageStore = Message.create({
        id: `${message.block.block.id}-${message.tx.hash}-${message.idx}`,
        blockHeight,
        txHash: message.tx.hash,
        type: message.msg.typeUrl,
        data,
    });

    await messageStore.save();

    if(message.msg.typeUrl === "/ethermint.evm.v1.MsgEthereumTx") {
        await handleEvmTransaction(message);
    }
}

export async function handleEvmTransaction(message: CosmosMessage) {

    const blockHeight = BigInt(message.block.block.header.height);
    const tx = message.msg.decodedMsg as any;
    const decodedTx = registry.decode(tx.data);

    const func = isZero(decodedTx.data) ? undefined : inputToFunctionSighash(decodedTx.data);

    const txStore = EvmTransaction.create({
        id: `${message.block.block.id}-${message.tx.hash}-${message.idx}`,
        txHash: tx.hash,
        blockHeight,
        from: tx.from,
        to: decodedTx.to,
        func: func,
        success: isSuccess(message.tx.tx.log, message.idx),
    });
    await txStore.save();
}

export async function handleEvmLog(event: CosmosEvent) {
    const log = event.log;
    const blockHeight = BigInt(event.block.block.header.height);
    const evmLogs: EvmLog[] = [];

    // Cronos uses snake case `tx_log`
    const logAttributes = log.events
        .find(evt => evt.type === 'ethereumTx' || evt.type === 'tx_log')
        ?.attributes
    for(const attr of logAttributes) {
        if(attr.key !== 'txLog') {
            continue;
        }

        const tx = JSON.parse(attr.value);

        const evmLog = EvmLog.create({
            id: `${event.block.block.id}-${event.tx.hash}-${tx.logIndex ?? event.idx}`,
            blockHeight,
            address: tx.address,
            topics0: tx.topics?.[0] ?? '',
            topics1: tx.topics?.[1],
            topics2: tx.topics?.[2],
            topics3: tx.topics?.[3],
        })
        evmLogs.push(evmLog);

    }

    await store.bulkCreate('EvmLog', evmLogs);
}
