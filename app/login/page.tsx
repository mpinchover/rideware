"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../../firebase/firebase";
import { useRideSession } from "../ride-session";

export default function LoginPage() {
  const ride = useRideSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ride.authReady && ride.userId) router.replace("/");
  }, [ride.authReady, ride.userId, router]);

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      router.replace("/");
    } catch {
      setPending(false);
      setError("Google sign-in didn't finish. Try again.");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-16">
      <header className="mb-8">
        <h1 className="text-[2.5rem] leading-[1.05] font-medium tracking-[-0.035em] text-[#1c1917]">
          Log in.
        </h1>
        <p className="mt-4 text-[15px] leading-6 text-[#6f695f]">
          Log in to find someone to split the ride with.
        </p>
      </header>
      <section>
        <button
          type="button"
          onClick={signIn}
          disabled={pending}
          className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-2xl bg-[#1c1917] text-[15px] font-medium text-[#f7f4ee] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <GoogleMark />
          {pending ? "Waiting for Google…" : "Continue with Google"}
        </button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-[#9b3d2f]">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4">
      <path
        fill="#fff"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#fff"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#fff"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z"
      />
      <path
        fill="#fff"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
