import { CosmosEvent, CosmosMessage } from "@subql/types-cosmos";
import { Event, Message } from "../types";

export async function handleEvent(event: CosmosEvent) {
    const blockHeight = BigInt(event.block.block.header.height);
    const eventStore = new Event(`${event.block.block.id}-${event.tx.hash}-${event.idx}`);
    eventStore.blockHeight = blockHeight;
    eventStore.txHash = event.tx.hash;
    eventStore.type = event.event.type;
    eventStore.msgType = event.msg.msg.typeUrl;
    const msgData = event.msg.msg.decodedMsg;
    eventStore.data = Object.keys(msgData).map(key => ({ key: key, value: msgData[key] }));
    await eventStore.save();
}

export async function handleMessage(message: CosmosMessage) {
    const blockHeight = BigInt(message.block.block.header.height);
    const messageStore = new Message(`${message.block.block.id}-${message.tx.hash}-${message.idx}`);
    messageStore.blockHeight = blockHeight;
    messageStore.txHash = message.tx.hash;
    messageStore.type = message.msg.typeUrl;
    const msgData = message.msg.decodedMsg;
    messageStore.data = Object.keys(msgData).map(key => ({ key: key, value: msgData[key] }));
    await messageStore.save();
}
