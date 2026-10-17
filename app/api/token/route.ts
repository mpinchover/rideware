import type { NextRequest } from "next/server";
import { streamServer } from "../stream";

const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!userId || !USER_ID.test(userId) || !name || name.length > 40) {
    return Response.json({ error: "A name and rider id are required." }, { status: 400 });
  }

  const stream = streamServer();
  if (!stream) {
    return Response.json({ error: "Chat is not configured." }, { status: 500 });
  }

  await stream.client.upsertUsers([{ id: userId, name, role: "user" }]);
  try {
    const channels = await stream.client.queryChannels(
      { type: "messaging", members: { $in: [userId] } },
      {},
      { limit: 30, state: false, watch: false },
    );
    await Promise.all(
      channels
        .filter((channel) => typeof channel.data?.name === "string" && channel.data.name.length > 0)
        .map((channel) => channel.updatePartial({ unset: ["name"] })),
    );
  } catch (cause) {
    console.error(
      "chat name clear failed",
      cause instanceof Error ? cause.message : "Couldn't clear the shared chat name.",
    );
  }
  return Response.json({
    apiKey: stream.apiKey,
    chatToken: stream.client.createToken(userId),
  });
}
