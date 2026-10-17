import { StreamChat } from "stream-chat";

export function streamServer() {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    client: StreamChat.getInstance(apiKey, apiSecret),
  };
}
