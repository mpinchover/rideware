"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/firebase";
import { useRideSession } from "./ride-session";

export default function LoginBar() {
  const ride = useRideSession();
  const username = ride.name.trim();
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ride.userId || !username) return;
    const params = new URLSearchParams({ user_id: ride.userId, name: username });
    void fetch(`/api/token?${params}`);
  }, [ride.userId, username]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function logout() {
    setPending(true);
    setError(null);
    try {
      await signOut(auth);
      setOpen(false);
    } catch {
      setError("Couldn't log out. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <header className="flex items-center justify-between gap-4 px-5 py-3">
      <p className="font-mono text-[11px] tracking-[0.28em] text-[#8a8478]">RIDEWARE</p>
      {ride.authReady && ride.userId ? (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => {
              setError(null);
              setOpen((current) => !current);
            }}
            className="h-9 cursor-pointer rounded-full bg-[#1c1917] px-4 text-sm font-medium text-[#f7f4ee]"
          >
            {username}
          </button>
          {open && (
            <div
              role="menu"
              className="absolute top-[calc(100%+0.5rem)] right-0 z-50 min-w-40 rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-black/10"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => void logout()}
                disabled={pending}
                className="w-full cursor-pointer rounded-xl px-3 py-2 text-left text-sm font-medium text-[#9b3d2f] hover:bg-[#f4f1eb] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? "Logging out…" : "Log out"}
              </button>
              {error && <p className="px-3 py-2 text-xs text-[#9b3d2f]">{error}</p>}
            </div>
          )}
        </div>
      ) : ride.authReady ? (
        <Link
          href="/login"
          className="h-9 rounded-full bg-[#1c1917] px-4 text-sm leading-9 font-medium text-[#f7f4ee]"
        >
          Log in
        </Link>
      ) : (
        <span className="h-9 w-20" />
      )}
    </header>
  );
}
