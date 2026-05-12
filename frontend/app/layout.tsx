import type { Metadata } from "next"
import { Geist, Geist_Mono, Esteban } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const esteban = Esteban({
  variable: "--font-esteban",
  subsets: ["latin"],
  weight: "400",
})

export const metadata: Metadata = {
  title: "Penumbra",
  description: "Penumbra — early mental health detection and peer support",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${esteban.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  )
}
