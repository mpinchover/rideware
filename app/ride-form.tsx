"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useRideSession, readPendingSearch, clearPendingSearch, savePendingSearch } from "./ride-session";
import { loadNeighborhoods, suggestNeighborhoods, type Neighborhood } from "./neighborhood-list";

function placeLabel(city: string, state: string) {
  return `${city}, ${state}`;
}

export default function RideForm() {
  const ride = useRideSession();
  const router = useRouter();
  const listId = useId();
  const resumeStarted = useRef(false);

  const [destinationQuery, setDestinationQuery] = useState("");
  const [selected, setSelected] = useState<Neighborhood | null>(null);
  const [places, setPlaces] = useState<Neighborhood[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let active = true;
    loadNeighborhoods()
      .then((next) => {
        if (!active) return;
        setPlaces(next);
        setLoadingPlaces(false);
      })
      .catch(() => {
        if (!active) return;
        setPlaces([]);
        setLoadingPlaces(false);
        ride.setError("Couldn't load neighborhoods.");
      });
    return () => {
      active = false;
    };
  }, [ride.setError]);

  useEffect(() => {
    setSelected(null);
    setDestinationQuery("");
    setListOpen(false);
  }, [ride.airport]);

  const suggestions = useMemo(
    () => suggestNeighborhoods(places, destinationQuery),
    [places, destinationQuery],
  );

  const highlighted = suggestions.length
    ? Math.min(activeIndex, suggestions.length - 1)
    : 0;

  function choose(destination: Neighborhood) {
    setSelected(destination);
    setDestinationQuery(placeLabel(destination.city, destination.state));
    setListOpen(false);
    ride.setError(null);
  }

  function onDestinationKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!listOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && suggestions[highlighted]) {
      event.preventDefault();
      choose(suggestions[highlighted]);
    } else if (event.key === "Escape") {
      setListOpen(false);
    }
  }

  useEffect(() => {
    if (
      !ride.authReady ||
      !ride.userId ||
      !ride.chatKnown ||
      ride.match ||
      ride.phase !== "form" ||
      ride.submitting
    ) {
      return;
    }
    const pending = readPendingSearch();
    if (!pending) return;
    if (ride.airport !== pending.airport) {
      ride.setAirport(pending.airport);
      return;
    }
    if (resumeStarted.current) return;
    resumeStarted.current = true;
    clearPendingSearch();
    ride.join(pending);
  }, [
    ride.authReady,
    ride.userId,
    ride.chatKnown,
    ride.match,
    ride.phase,
    ride.submitting,
    ride.airport,
    ride.name,
  ]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || ride.airport.length !== 3) return;
    if (!ride.userId) {
      savePendingSearch({
        airport: ride.airport,
        city: selected.city,
        state: selected.state,
        latitude: selected.latitude,
        longitude: selected.longitude,
      });
      router.push("/login");
      return;
    }
    ride.join(selected);
  }

  const canSubmit =
    ride.chatKnown &&
    ride.match === null &&
    ride.airport.length === 3 &&
    selected !== null &&
    !ride.submitting;

  const destinationReady = ride.airport.length === 3 && !loadingPlaces && places.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-16">
      <header className="mb-8">
        <h1 className="text-[2.5rem] leading-[1.05] font-medium tracking-[-0.035em] text-[#1c1917]">
          Find someone going your way.
        </h1>
        <p className="mt-4 text-[15px] leading-6 text-[#6f695f]">
        Pick an airport and destination. Match with travelers and split the ride.
        </p>
      </header>

      <section className="rounded-[28px] bg-white px-6 py-7 shadow-[0_24px_60px_-32px_rgba(28,25,23,0.45)] ring-1 ring-black/5">
        {ride.phase === "form" && (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-medium tracking-[0.16em] text-[#8a8478] uppercase">
                Airport
              </span>
              <input
                value={ride.airport}
                onChange={(event) => ride.setAirport(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Backspace") return;
                  event.preventDefault();
                  ride.setAirport("");
                }}
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={3}
                placeholder="JFK"
                aria-describedby="airport-hint"
                className="h-14 rounded-2xl bg-[#f4f1eb] px-4 text-center font-mono text-xl tracking-[0.42em] text-[#1c1917] uppercase outline-none ring-1 ring-transparent transition-shadow placeholder:tracking-[0.42em] placeholder:text-[#b3ada3] focus:ring-[#1c1917]"
              />
              <span id="airport-hint" className="text-xs text-[#8a8478]">
                {ride.airportName ?? "Three letters, like SFO or JFK."}
              </span>
            </label>

            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-2" htmlFor="destination">
                <span className="text-[11px] font-medium tracking-[0.16em] text-[#8a8478] uppercase">
                  Destination
                </span>
                <div className="relative">
                  <input
                    id="destination"
                    role="combobox"
                    aria-expanded={listOpen}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                      listOpen && suggestions[highlighted]
                        ? `${listId}-${highlighted}`
                        : undefined
                    }
                    value={destinationQuery}
                    disabled={ride.airport.length !== 3 || loadingPlaces}
                    placeholder={
                      loadingPlaces
                        ? "Loading neighborhoods…"
                        : "A neighborhood, like Upper West Side"
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      setDestinationQuery(value);
                      setSelected(null);
                      setListOpen(value.trim().length >= 3);
                      setActiveIndex(0);
                    }}
                    onBlur={() => setListOpen(false)}
                    onKeyDown={onDestinationKeyDown}
                    autoComplete="off"
                    className="h-12 w-full rounded-2xl bg-[#f4f1eb] px-4 text-[15px] text-[#1c1917] outline-none ring-1 ring-transparent transition-shadow placeholder:text-[#b3ada3] focus:ring-[#1c1917] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {listOpen && destinationReady && (
                    <ul
                      id={listId}
                      role="listbox"
                      className="absolute top-[calc(100%+0.5rem)] z-10 max-h-64 w-full overflow-auto rounded-2xl bg-white py-1 shadow-[0_16px_40px_-20px_rgba(28,25,23,0.45)] ring-1 ring-black/10"
                    >
                      {suggestions.length === 0 ? (
                        <li className="px-4 py-3 text-sm text-[#8a8478]">No close matches.</li>
                      ) : (
                        suggestions.map((destination, index) => (
                          <li
                            key={`${destination.city}-${destination.state}-${destination.latitude}-${destination.longitude}`}
                            role="presentation"
                          >
                            <button
                              id={`${listId}-${index}`}
                              type="button"
                              role="option"
                              aria-selected={index === highlighted}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => choose(destination)}
                              onMouseEnter={() => setActiveIndex(index)}
                              className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[15px] ${
                                index === highlighted ? "bg-[#f4f1eb]" : ""
                              }`}
                            >
                              <span>{placeLabel(destination.city, destination.state)}</span>
                              <span className="font-mono text-xs text-[#8a8478]">
                                {Math.round(destination.miles)} mi
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              </label>
            </div>

            {ride.error && (
              <p role="alert" className="text-sm text-[#9b3d2f]">
                {ride.error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="h-12 cursor-pointer rounded-2xl bg-[#1c1917] text-[15px] font-medium text-[#f7f4ee] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ride.submitting ? "Looking…" : "Split the ride"}
            </button>
          </form>
        )}

        {ride.phase === "waiting" && ride.you && (
          <div className="py-4">
            <p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-[#8a8478] uppercase">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c4a15a]" />
              Waiting
            </p>
            <p className="mt-6 font-mono text-sm tracking-[0.28em] text-[#8a8478]">
              {ride.you.airport}
            </p>
            <h2 className="mt-3 text-4xl font-medium tracking-[-0.03em] text-[#1c1917]">
              {placeLabel(ride.you.city, ride.you.state)}
            </h2>
            <p className="mt-4 text-[15px] leading-6 text-[#6f695f]">
              Finding a rideshare. Do not close this tab.
            </p>
          </div>
        )}

        {(ride.phase === "waiting" || ride.submitting) && (
          <p className="mt-6 flex items-center gap-2 text-xs text-[#8a8478]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${ride.connected ? "bg-[#0f6e56]" : "bg-[#c4a15a]"}`}
            />
            {ride.connected ? "Connected" : "Connecting to server"}
          </p>
        )}
      </section>
    </main>
  );
}
