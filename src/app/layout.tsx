import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

export const metadata: Metadata = {
  title: "Agenda Dr. Melo - Agendamento de Pacientes",
  description: "Sistema de agendamento de pacientes com categorização por IA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased min-h-screen bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
