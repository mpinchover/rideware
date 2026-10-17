import "stream-chat";

declare module "stream-chat" {
  interface CustomChannelData {
    airport?: string;
    destinations?: Record<string, string>;
    destinationStates?: Record<string, string>;
    name?: string;
  }
}
