import { streamServer } from "../../stream";

const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CHANNEL_ID = /^m[a-f0-9]{32}$/;

type Member = {
  id: string;
  name: string;
  city: string;
  state: string;
};

const SAME_RIDER =
  "Both pages are signed in as the same rider. Open the other person in a private window.";

function membersFrom(body: unknown): Member[] | string {
  if (!body || typeof body !== "object" || !("members" in body)) {
    return "A match chat needs two riders.";
  }
  const members = (body as { members?: unknown }).members;
  if (!Array.isArray(members) || members.length !== 2) {
    return "A match chat needs two riders.";
  }
  const cleaned: Member[] = [];
  for (const member of members) {
    if (!member || typeof member !== "object") return "A match chat needs two riders.";
    const id = "id" in member ? member.id : null;
    const name = "name" in member ? member.name : null;
    const city = "city" in member ? member.city : null;
    const state = "state" in member ? member.state : null;
    if (
      typeof id !== "string" ||
      typeof name !== "string" ||
      typeof city !== "string" ||
      typeof state !== "string"
    ) {
      return "A match chat needs two riders.";
    }
    const trimmed = name.trim();
    const trimmedCity = city.trim();
    const trimmedState = state.trim().toUpperCase();
    if (
      !USER_ID.test(id) ||
      !trimmed ||
      trimmed.length > 40 ||
      trimmedCity.length > 100 ||
      (trimmedState && !/^[A-Z]{2}$/.test(trimmedState))
    ) {
      return "A match chat needs two riders.";
    }
    cleaned.push({ id, name: trimmed, city: trimmedCity, state: trimmedState });
  }
  if (cleaned[0].id === cleaned[1].id) return SAME_RIDER;
  return cleaned;
}

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("user_id");
  if (!userId || !USER_ID.test(userId)) {
    return Response.json({ error: "A rider id is required." }, { status: 400 });
  }

  const stream = streamServer();
  if (!stream) {
    return Response.json({ error: "Chat is not configured." }, { status: 500 });
  }

  try {
    const channels = await stream.client.queryChannels(
      { type: "messaging", members: { $in: [userId] } },
      { last_updated: -1 },
      {
        limit: 30,
        state: true,
        watch: false,
        message_limit: 0,
        member_limit: 10,
        user_id: userId,
      },
    );
    const channel = channels.find((item) => item.id && CHANNEL_ID.test(item.id));
    if (!channel?.id) return Response.json({ channel: null });

    let members = Object.values(channel.state.members);
    if (members.length === 0) {
      const state = await channel.query({ watch: false, state: true, messages: { limit: 0 } });
      members = state.members ?? [];
    }
    const partner = members.find((member) => (member.user_id ?? member.user?.id) !== userId);
    const partnerId = partner?.user_id ?? partner?.user?.id;
    const partnerName = partner?.user?.name?.trim();
    if (!partnerId || !USER_ID.test(partnerId) || partnerId === userId) {
      return Response.json({ channel: null });
    }

    return Response.json({
      channel: {
        channelId: channel.id,
        airport: channel.data?.airport ?? "",
        city: channel.data?.destinations?.[userId] ?? "",
        state: channel.data?.destinationStates?.[userId] ?? "",
        partnerId,
        partnerName: partnerName || "Rider",
        partnerCity: channel.data?.destinations?.[partnerId] ?? "",
        partnerState: channel.data?.destinationStates?.[partnerId] ?? "",
      },
    });
  } catch (cause) {
    console.error(
      "chat lookup failed",
      cause instanceof Error ? cause.message : "Couldn't look up the chat.",
    );
    return Response.json({ error: "Couldn't look up the chat." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const raw = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    console.error("chat channel rejected: invalid json", raw.slice(0, 300));
    return Response.json({ error: "A match chat needs two riders." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "A match chat needs two riders." }, { status: 400 });
  }

  const channelId = "channelId" in body ? body.channelId : null;
  const createdBy = "createdBy" in body ? body.createdBy : null;
  const airport = "airport" in body ? body.airport : null;
  const members = membersFrom(body);
  if (
    typeof members === "string" ||
    typeof channelId !== "string" ||
    !CHANNEL_ID.test(channelId) ||
    typeof createdBy !== "string" ||
    typeof airport !== "string" ||
    !/^[A-Z]{3}$/.test(airport) ||
    !members.some((member) => member.id === createdBy)
  ) {
    const error = typeof members === "string" ? members : "A match chat needs two riders.";
    console.error("chat channel rejected", error);
    return Response.json({ error }, { status: 400 });
  }

  const stream = streamServer();
  if (!stream) {
    return Response.json({ error: "Chat is not configured." }, { status: 500 });
  }

  try {
    await stream.client.upsertUsers(
      members.map((member) => ({ id: member.id, name: member.name, role: "user" as const })),
    );

    const channel = stream.client.channel("messaging", channelId, {
      members: members.map((member) => member.id),
      created_by_id: createdBy,
      airport,
      destinations: Object.fromEntries(members.map((member) => [member.id, member.city])),
      destinationStates: Object.fromEntries(members.map((member) => [member.id, member.state])),
    });
    await channel.create();
    await channel.updatePartial({
      set: {
        airport,
        destinations: Object.fromEntries(members.map((member) => [member.id, member.city])),
        destinationStates: Object.fromEntries(members.map((member) => [member.id, member.state])),
      },
      unset: ["name"],
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Couldn't open the chat.";
    if (/already exists/i.test(message)) {
      await stream.client.channel("messaging", channelId).updatePartial({ unset: ["name"] });
      return Response.json({ channelId, type: "messaging" });
    }
    console.error("chat channel failed", message);
    return Response.json({ error: "Couldn't open the chat." }, { status: 502 });
  }

  return Response.json({ channelId, type: "messaging" });
}

export async function DELETE(request: Request) {
  const raw = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "That chat could not be ended." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "That chat could not be ended." }, { status: 400 });
  }
  const channelId = "channelId" in body ? body.channelId : null;
  const userId = "userId" in body ? body.userId : null;
  if (
    typeof channelId !== "string" ||
    !CHANNEL_ID.test(channelId) ||
    typeof userId !== "string" ||
    !USER_ID.test(userId)
  ) {
    return Response.json({ error: "That chat could not be ended." }, { status: 400 });
  }

  const stream = streamServer();
  if (!stream) {
    return Response.json({ error: "Chat is not configured." }, { status: 500 });
  }

  const channel = stream.client.channel("messaging", channelId);
  try {
    const state = await channel.query({ watch: false, state: true, messages: { limit: 0 } });
    const members = state.members ?? [];
    const memberIds = members
      .map((member) => member.user_id || member.user?.id)
      .filter((id): id is string => typeof id === "string");
    if (!memberIds.includes(userId)) {
      return Response.json({ error: "That chat isn't yours." }, { status: 403 });
    }
    await channel.delete({ hard_delete: true });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (/not found|doesn't exist|does not exist/i.test(message)) {
      return Response.json({ ok: true });
    }
    console.error("chat channel delete failed", message);
    return Response.json({ error: "Couldn't end the chat." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
