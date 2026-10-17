"use client";

import MatchChat from "../match-chat";
import { useRideSession } from "../ride-session";

export default function MessagesPage() {
  const ride = useRideSession();
  const match = ride.match;

  if (!ride.chatKnown || !match || !ride.name.trim()) {
    return (
      <main className="flex h-full items-center justify-center bg-[#efece6] text-sm text-[#8a8478]">
        Opening your chat…
      </main>
    );
  }

  return (
    <MatchChat
      channelId={match.channelId}
      userId={match.you.userId}
      name={match.you.name}
      airport={match.you.airport}
      city={match.you.city}
      state={match.you.state}
      partnerId={match.partner.userId}
      partnerName={match.partner.name}
      partnerCity={match.partner.city}
      partnerState={match.partner.state}
      onEnd={ride.findAnother}
    />
  );
}
