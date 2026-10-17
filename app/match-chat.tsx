"use client";

import { useEffect, useRef, useState } from "react";
import type { Channel as StreamChannel } from "stream-chat";
import {
  Channel,
  Chat,
  defaultMessageActionSet,
  MessageComposer,
  MessageActions as StreamMessageActions,
  MessageList,
  Thread,
  WithComponents,
  Window,
  useCreateChatClient,
} from "stream-chat-react";
import "stream-chat-react/css/index.css";

type Session = {
  apiKey: string;
  token: string;
};

type MatchChatProps = {
  channelId: string;
  userId: string;
  name: string;
  airport: string;
  city: string;
  state: string;
  partnerId: string;
  partnerName: string;
  partnerCity: string;
  partnerState: string;
  onEnd: () => void;
};

const reactionOnlyActionSet = defaultMessageActionSet.filter(
  (action) => action.placement === "quick" && "type" in action && action.type === "react",
);

function ReactionOnlyMessageActions() {
  return <StreamMessageActions messageActionSet={reactionOnlyActionSet} />;
}

export default function MatchChat(props: MatchChatProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const room = await fetch("/api/chat/channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: props.channelId,
          createdBy: props.userId,
          members: [
            { id: props.userId, name: props.name, city: props.city, state: props.state },
            {
              id: props.partnerId,
              name: props.partnerName,
              city: props.partnerCity,
              state: props.partnerState,
            },
          ],
          airport: props.airport,
        }),
      });
      if (!room.ok) {
        const detail: unknown = await room.json().catch(() => null);
        const message =
          detail &&
          typeof detail === "object" &&
          "error" in detail &&
          typeof detail.error === "string"
            ? detail.error
            : "Couldn't open the chat.";
        throw new Error(message);
      }

      const params = new URLSearchParams({
        user_id: props.userId,
        name: props.name,
      });
      const tokenResponse = await fetch(`/api/token?${params}`);
      if (!tokenResponse.ok) throw new Error("Couldn't sign you in to chat.");
      const body: unknown = await tokenResponse.json();
      if (
        !body ||
        typeof body !== "object" ||
        !("chatToken" in body) ||
        !("apiKey" in body) ||
        typeof body.chatToken !== "string" ||
        typeof body.apiKey !== "string"
      ) {
        throw new Error("Couldn't sign you in to chat.");
      }
      if (!mounted) return;
      setSession({ apiKey: body.apiKey, token: body.chatToken });
    })().catch((cause: unknown) => {
      if (!mounted) return;
      setError(cause instanceof Error ? cause.message : "Couldn't open the chat.");
    });

    return () => {
      mounted = false;
    };
  }, [
    props.channelId,
    props.userId,
    props.name,
    props.airport,
    props.city,
    props.state,
    props.partnerId,
    props.partnerName,
    props.partnerCity,
    props.partnerState,
  ]);

  if (error) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 bg-[#efece6] px-6">
        <p role="alert" className="max-w-sm text-center text-sm text-[#9b3d2f]">
          {error}
        </p>
        <button
          type="button"
          onClick={props.onEnd}
          className="rounded-full bg-[#1c1917] px-4 py-2 text-sm font-medium text-[#f7f4ee]"
        >
          Back
        </button>
      </main>
    );
  }

  if (!session) {
    return <Opening />;
  }

  return <ConnectedChat session={session} {...props} />;
}

function Opening() {
  return (
    <main className="flex h-full items-center justify-center bg-[#efece6] text-sm text-[#8a8478]">
      Opening your chat…
    </main>
  );
}

function ConnectedChat({
  session,
  channelId,
  userId,
  name,
  airport,
  partnerName,
  partnerCity,
  partnerState,
  onEnd,
}: MatchChatProps & { session: Session }) {
  const client = useCreateChatClient({
    apiKey: session.apiKey,
    tokenOrProvider: session.token,
    userData: { id: userId, name },
  });
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onEndRef = useRef(onEnd);

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    if (!client) return;
    let mounted = true;
    const next = client.channel("messaging", channelId);
    const subscription = next.on("channel.deleted", () => {
      onEndRef.current();
    });

    next
      .watch()
      .then(() => {
        if (mounted) setChannel(next);
      })
      .catch(() => {
        if (mounted) setError("Couldn't open the chat.");
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [client, channelId]);

  if (error) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 bg-[#efece6] px-6">
        <p role="alert" className="text-sm text-[#9b3d2f]">
          {error}
        </p>
        <EndChat channelId={channelId} userId={userId} onEnd={onEnd} />
      </main>
    );
  }

  if (!client || !channel) {
    return <Opening />;
  }

  return (
    <Chat client={client} theme="str-chat__theme-light">
      <style>{`
        .rideshare-composer .str-chat__message-composer-container {
          border-top: 0;
        }
        .str-chat .str-chat__message > .str-chat__avatar {
          display: none;
        }
      `}</style>
      <div className="flex h-full min-h-0 flex-col bg-white">
        <div className="min-h-0 flex-1">
          <Channel channel={channel}>
            <WithComponents overrides={{ MessageActions: ReactionOnlyMessageActions }}>
              <Window>
                <div className="flex min-h-16 flex-col items-center justify-center border-b border-[#e7e1d8] px-4 text-center">
                  <h1 className="text-sm font-semibold text-[#1c1917]">{partnerName}</h1>
                  <p className="mt-0.5 text-xs text-[#6f695f]">
                    {airport} <span aria-hidden="true">→</span> {partnerCity}, {partnerState}
                  </p>
                </div>
                <MessageList messageActions={["react"]} showAvatar={false} />
                <div className="rideshare-composer flex items-center gap-2 border-t border-[#e7e1d8] bg-white px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <MessageComposer />
                  </div>
                  <EndChat channelId={channelId} userId={userId} onEnd={onEnd} />
                </div>
              </Window>
              <Thread messageActions={["react"]} />
            </WithComponents>
          </Channel>
        </div>
      </div>
    </Chat>
  );
}

function EndChat({
  channelId,
  userId,
  onEnd,
}: {
  channelId: string;
  userId: string;
  onEnd: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/chat/channel", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, userId }),
    });
    if (!response.ok) {
      setPending(false);
      setError("Couldn't end the chat.");
      return;
    }
    onEnd();
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        {error && !confirming && (
          <p className="max-w-28 text-right text-xs text-[#9b3d2f]">{error}</p>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending}
          className="cursor-pointer rounded-full bg-[#1c1917] px-3 py-2 text-xs font-medium whitespace-nowrap text-[#f7f4ee] disabled:cursor-not-allowed disabled:opacity-40"
        >
          End chat
        </button>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 px-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setConfirming(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="end-chat-title"
            aria-describedby="end-chat-description"
            className="w-full max-w-sm rounded-[24px] bg-white p-6 shadow-2xl ring-1 ring-black/10"
          >
            <h2 id="end-chat-title" className="text-xl font-semibold text-[#1c1917]">
              End this chat?
            </h2>
            <p id="end-chat-description" className="mt-2 text-sm leading-6 text-[#6f695f]">
              This permanently deletes the conversation for both riders.
            </p>
            {error && <p className="mt-3 text-sm text-[#9b3d2f]">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-full border border-[#d8d2c8] px-4 py-2 text-sm font-medium text-[#1c1917] disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void end()}
                disabled={pending}
                className="cursor-pointer rounded-full bg-[#9b3d2f] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? "Ending…" : "End chat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
