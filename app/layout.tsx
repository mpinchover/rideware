import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import AppFrame from "./app-frame";
import RideSession from "./ride-session";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rideware",
  description: "Get paired with someone at your airport headed near the same place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
      style={{ colorScheme: "light" }}
    >
      <body className="h-dvh overflow-hidden">
        <RideSession>
          <AppFrame>{children}</AppFrame>
        </RideSession>
      </body>
    </html>
  );
}
