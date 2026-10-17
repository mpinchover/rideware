"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/firebase";
import { MATCH_SERVER_URL, matchUrl } from "./public-config";

const SERVER_URL = MATCH_SERVER_URL.replace(/\/$/, "");
const AIRPORT_KEY = "rideshare-airport";
const MATCH_KEY = "rideshare-match";
const PENDING_KEY = "rideshare-pending";

export type Destination = {
  city: string;
  state: string;
  miles: number;
};

export type Person = {
  name: string;
  airport: string;
  city: string;
  state: string;
  userId: string;
};

export type MatchPayload = {
  channelId: string;
  you: Person;
  partner: Person;
};

type Phase = "form" | "waiting";

type RideSessionValue = {
  userId: string | null;
  connected: boolean;
  name: string;
  airport: string;
  setAirport: (value: string) => void;
  airportName: string | null;
  destinations: Destination[];
  loadingPlaces: boolean;
  phase: Phase;
  you: Person | null;
  error: string | null;
  setError: (message: string | null) => void;
  submitting: boolean;
  join: (city: string, state: string) => void;
  match: MatchPayload | null;
  chatKnown: boolean;
  authReady: boolean;
  findAnother: () => void;
};

const RideSessionContext = createContext<RideSessionValue | null>(null);

export function useRideSession() {
  const value = useContext(RideSessionContext);
  if (!value) throw new Error("Ride session is missing.");
  return value;
}

function isPerson(value: unknown): value is Person {
  if (!value || typeof value !== "object") return false;
  const person = value as Person;
  return (
    typeof person.name === "string" &&
    typeof person.airport === "string" &&
    typeof person.city === "string" &&
    typeof person.state === "string" &&
    typeof person.userId === "string"
  );
}

function isMatch(value: unknown): value is MatchPayload {
  if (!value || typeof value !== "object") return false;
  const match = value as MatchPayload;
  return typeof match.channelId === "string" && isPerson(match.you) && isPerson(match.partner);
}

function readMatch(): MatchPayload | null {
  try {
    const raw = localStorage.getItem(MATCH_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isMatch(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export type PendingSearch = {
  airport: string;
  city: string;
  state: string;
};

export function savePendingSearch(search: PendingSearch) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(search));
  } catch {
    // The search can still be resumed while this page stays open.
  }
}

export function readPendingSearch(): PendingSearch | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const airport = "airport" in parsed ? parsed.airport : null;
    const city = "city" in parsed ? parsed.city : null;
    const state = "state" in parsed ? parsed.state : null;
    if (
      typeof airport !== "string" ||
      !/^[A-Z]{3}$/.test(airport) ||
      typeof city !== "string" ||
      !city.trim() ||
      typeof state !== "string" ||
      !state.trim()
    ) {
      return null;
    }
    return { airport, city: city.trim(), state: state.trim() };
  } catch {
    return null;
  }
}

export function clearPendingSearch() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing left to resume if storage is blocked.
  }
}

export default function RideSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const routerRef = useRef(router);
  const socketRef = useRef<Socket | null>(null);
  const phaseRef = useRef<Phase>("form");
  const intentionalClose = useRef(false);
  const lookupGen = useRef(0);
  const sessionMatch = useRef(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [name, setNameState] = useState("");
  const [airport, setAirportState] = useState("");
  const [airportName, setAirportName] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [you, setYou] = useState<Person | null>(null);
  const [match, setMatch] = useState<MatchPayload | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [chatKnown, setChatKnown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    try {
      const storedAirport = localStorage.getItem(AIRPORT_KEY);
      if (storedAirport && /^[A-Z]{3}$/.test(storedAirport)) setAirportState(storedAirport);
    } catch {
      // Storage can be unavailable. This visit still works.
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        lookupGen.current += 1;
        sessionMatch.current = false;
        intentionalClose.current = true;
        socketRef.current?.disconnect();
        socketRef.current = null;
        setUserId(null);
        setNameState("");
        setMatch(null);
        setConnected(false);
        setPhase("form");
        setYou(null);
        setSubmitting(false);
        setChatKnown(true);
        setIdentityReady(true);
        return;
      }
      const nextName = (user.displayName || user.email?.split("@")[0] || "Rider").slice(0, 40);
      setUserId(user.uid);
      setNameState(nextName);
      try {
        const storedMatch = readMatch();
        if (storedMatch?.you.userId === user.uid) setMatch(storedMatch);
        else localStorage.removeItem(MATCH_KEY);
      } catch {
        // A missing saved chat just means there is nothing to reopen.
      }
      setIdentityReady(true);
    });
  }, []);

  useEffect(() => {
    return () => {
      intentionalClose.current = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!identityReady) return;
    if (!userId || !name.trim()) {
      setChatKnown(true);
      return;
    }

    const gen = ++lookupGen.current;
    const params = new URLSearchParams({ user_id: userId });
    fetch(matchUrl(`/chat/channel?${params}`))
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error("Couldn't look up the chat.");
        return body;
      })
      .then((body: unknown) => {
        if (gen !== lookupGen.current) return;
        const channel =
          body &&
          typeof body === "object" &&
          "channel" in body &&
          body.channel &&
          typeof body.channel === "object"
            ? body.channel
            : null;
        const channelId =
          channel && "channelId" in channel && typeof channel.channelId === "string"
            ? channel.channelId
            : "";
        const partnerId =
          channel && "partnerId" in channel && typeof channel.partnerId === "string"
            ? channel.partnerId
            : "";
        const partnerName =
          channel && "partnerName" in channel && typeof channel.partnerName === "string"
            ? channel.partnerName
            : "";
        const chatAirport =
          channel && "airport" in channel && typeof channel.airport === "string"
            ? channel.airport
            : "";
        const city =
          channel && "city" in channel && typeof channel.city === "string" ? channel.city : "";
        const state =
          channel && "state" in channel && typeof channel.state === "string" ? channel.state : "";
        const partnerCity =
          channel && "partnerCity" in channel && typeof channel.partnerCity === "string"
            ? channel.partnerCity
            : "";
        const partnerState =
          channel && "partnerState" in channel && typeof channel.partnerState === "string"
            ? channel.partnerState
            : "";
        if (!channelId || !partnerId || !partnerName) {
          if (!sessionMatch.current) {
            setMatch(null);
            try {
              localStorage.removeItem(MATCH_KEY);
            } catch {
              // The in-memory match is already cleared.
            }
          }
          setChatKnown(true);
          return;
        }

        setMatch((current) => {
          if (sessionMatch.current && current && current.channelId !== channelId) return current;
          const next =
            current?.channelId === channelId
              ? current
              : {
                  channelId,
                  you: {
                    name: name.trim(),
                    airport: chatAirport,
                    city,
                    state,
                    userId,
                  },
                  partner: {
                    name: partnerName,
                    airport: chatAirport,
                    city: partnerCity,
                    state: partnerState,
                    userId: partnerId,
                  },
                };
          try {
            localStorage.setItem(MATCH_KEY, JSON.stringify(next));
          } catch {
            // The chat can still open for this visit.
          }
          return next;
        });
        clearPendingSearch();
        setChatKnown(true);
      })
      .catch(() => {
        if (gen !== lookupGen.current) return;
        setChatKnown(true);
      });
  }, [identityReady, userId, name]);

  useEffect(() => {
    if (!chatKnown) return;
    if (match && pathname !== "/messages") {
      routerRef.current.push("/messages");
      return;
    }
    if (!match && pathname === "/messages") {
      routerRef.current.push("/");
    }
  }, [chatKnown, match, pathname]);

  useEffect(() => {
    if (phase !== "waiting" || !you || !userId || !name.trim()) return;

    const waitingRider = you;
    const riderId = userId;
    let stopped = false;
    let checking = false;

    async function recoverChat() {
      if (checking || stopped) return;
      checking = true;
      try {
        const params = new URLSearchParams({ user_id: riderId });
        const response = await fetch(matchUrl(`/chat/channel?${params}`));
        const body: unknown = await response.json();
        if (!response.ok || stopped || !body || typeof body !== "object" || !("channel" in body)) {
          return;
        }
        const channel = body.channel;
        if (!channel || typeof channel !== "object") return;
        const channelId =
          "channelId" in channel && typeof channel.channelId === "string"
            ? channel.channelId
            : "";
        const partnerId =
          "partnerId" in channel && typeof channel.partnerId === "string"
            ? channel.partnerId
            : "";
        const partnerName =
          "partnerName" in channel && typeof channel.partnerName === "string"
            ? channel.partnerName
            : "";
        const chatAirport =
          "airport" in channel && typeof channel.airport === "string" ? channel.airport : "";
        const partnerCity =
          "partnerCity" in channel && typeof channel.partnerCity === "string"
            ? channel.partnerCity
            : "";
        const partnerState =
          "partnerState" in channel && typeof channel.partnerState === "string"
            ? channel.partnerState
            : "";
        if (!channelId || !partnerId || !partnerName) return;

        const recovered: MatchPayload = {
          channelId,
          you: waitingRider,
          partner: {
            name: partnerName,
            airport: chatAirport || waitingRider.airport,
            city: partnerCity,
            state: partnerState,
            userId: partnerId,
          },
        };
        lookupGen.current += 1;
        sessionMatch.current = true;
        setMatch(recovered);
        setPhase("form");
        setYou(null);
        setSubmitting(false);
        setError(null);
        clearPendingSearch();
        try {
          localStorage.setItem(MATCH_KEY, JSON.stringify(recovered));
        } catch {
          // The chat can still open for this visit.
        }
        intentionalClose.current = true;
        socketRef.current?.disconnect();
        routerRef.current.push("/messages");
      } catch {
        // The match socket remains the primary path; retry while waiting.
      } finally {
        checking = false;
      }
    }

    void recoverChat();
    const interval = window.setInterval(recoverChat, 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [phase, you, userId, name]);

  useEffect(() => {
    if (pathname === "/") return;
    intentionalClose.current = true;
    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnected(false);
    setPhase("form");
    setYou(null);
    setSubmitting(false);
  }, [pathname]);

  useEffect(() => {
    if (airport.length !== 3) {
      setAirportName(null);
      setDestinations([]);
      setLoadingPlaces(false);
      return;
    }

    const controller = new AbortController();
    setLoadingPlaces(true);
    setAirportName(null);
    setDestinations([]);

    fetch(`${SERVER_URL}/destinations/${airport}`, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (
          !response.ok ||
          !body ||
          typeof body !== "object" ||
          !("destinations" in body) ||
          !Array.isArray(body.destinations)
        ) {
          const message =
            body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : "That airport isn't available.";
          throw new Error(message);
        }
        const airportName =
          "airportName" in body && typeof body.airportName === "string" ? body.airportName : null;
        return { airportName, destinations: body.destinations as Destination[] };
      })
      .then((body) => {
        setAirportName(body.airportName);
        setDestinations(body.destinations);
        setLoadingPlaces(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setAirportName(null);
        setDestinations([]);
        setLoadingPlaces(false);
        setError(cause instanceof Error ? cause.message : "Can't reach the match server.");
      });

    return () => controller.abort();
  }, [airport]);

  function setAirport(value: string) {
    const next = value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
    setAirportState(next);
    try {
      localStorage.setItem(AIRPORT_KEY, next);
    } catch {
      // Keep the airport in memory when storage is blocked.
    }
  }

  function join(city: string, state: string) {
    const trimmed = name.trim();
    const place = city.trim();
    const region = state.trim();
    if (
      pathname !== "/" ||
      !userId ||
      trimmed.length === 0 ||
      airport.length !== 3 ||
      place.length === 0 ||
      region.length === 0
    ) {
      return;
    }

    intentionalClose.current = true;
    socketRef.current?.disconnect();
    socketRef.current = null;

    setError(null);
    setSubmitting(true);
    intentionalClose.current = false;
    lookupGen.current += 1;

    const socket = io(SERVER_URL, { transports: ["websocket"], reconnection: false });
    socketRef.current = socket;
    const active = true;

    socket.on("connect", () => {
      if (!active || socketRef.current !== socket) return;
      setConnected(true);
      setError((current) => (current === "Can't reach the match server." ? null : current));
      socket.emit("join", {
        name: trimmed,
        airport,
        city: place,
        state: region,
        userId,
      });
    });

    socket.on("connect_error", () => {
      if (!active) return;
      setConnected(false);
      setSubmitting(false);
      setError("Can't reach the match server.");
    });

    socket.on("disconnect", () => {
      if (socketRef.current === socket) socketRef.current = null;
      if (!active) return;
      setConnected(false);
      setSubmitting(false);
      if (intentionalClose.current) {
        intentionalClose.current = false;
        return;
      }
      if (phaseRef.current === "waiting") {
        setPhase("form");
        setYou(null);
        setError("Disconnected. Your place in line was released.");
      }
    });

    socket.on("waiting", (payload: Person) => {
      if (!active || socketRef.current !== socket || !isPerson(payload)) return;
      setYou(payload);
      setPhase("waiting");
      setError(null);
      setSubmitting(false);
    });

    socket.on("matched", (payload: MatchPayload) => {
      if (!active || socketRef.current !== socket || !isMatch(payload)) return;
      lookupGen.current += 1;
      sessionMatch.current = true;
      setMatch(payload);
      setPhase("form");
      setYou(null);
      setSubmitting(false);
      setError(null);
      clearPendingSearch();
      try {
        localStorage.setItem(MATCH_KEY, JSON.stringify(payload));
      } catch {
        // The chat can still open for this visit.
      }
      intentionalClose.current = true;
      socket.disconnect();
      routerRef.current.push("/messages");
    });

    socket.on("join_error", (payload: { message?: string }) => {
      if (!active || socketRef.current !== socket) return;
      setError(payload.message ?? "Something went wrong.");
      setSubmitting(false);
      intentionalClose.current = true;
      socket.disconnect();
    });
  }

  function findAnother() {
    lookupGen.current += 1;
    sessionMatch.current = false;
    setMatch(null);
    setChatKnown(true);
    setPhase("form");
    setYou(null);
    setSubmitting(false);
    setError(null);
    try {
      localStorage.removeItem(MATCH_KEY);
    } catch {
      // The in-memory match is already cleared.
    }
    routerRef.current.push("/");
  }

  return (
    <RideSessionContext.Provider
      value={{
        userId,
        connected,
        name,
        airport,
        setAirport,
        airportName,
        destinations,
        loadingPlaces,
        phase,
        you,
        error,
        setError,
        submitting,
        join,
        match,
        chatKnown,
        authReady: identityReady,
        findAnother,
      }}
    >
      {children}
    </RideSessionContext.Provider>
  );
}
