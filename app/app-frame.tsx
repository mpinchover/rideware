"use client";

import { useEffect, type ReactNode } from "react";
import { enableAnalytics } from "../firebase/firebase";
import LoginBar from "./login-bar";

export default function AppFrame({ children }: { children: ReactNode }) {
  useEffect(() => {
    void enableAnalytics();
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <LoginBar />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
    </div>
  );
}
