export interface StoredConversationMessage {
  role: string;
  content: string;
}

/**
 * Repairs conversations written by the old streaming UI, which appended a new
 * assistant bubble for every partial chunk instead of updating one bubble.
 */
export function collapseStreamingMessageDuplicates<T extends StoredConversationMessage>(messages: T[]): T[] {
  const repaired: T[] = [];
  for (const message of messages) {
    const previous = repaired.at(-1);
    if (previous?.role === 'assistant' && message.role === 'assistant') {
      if (message.content.startsWith(previous.content)) {
        repaired[repaired.length - 1] = message;
        continue;
      }
      if (previous.content.startsWith(message.content)) continue;
    }
    repaired.push(message);
  }
  return repaired;
}
