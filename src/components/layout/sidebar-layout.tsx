"use client";

import React, { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';

import { Home, CalendarDays, CalendarX, Search, DollarSign, RotateCcw } from "lucide-react";
import { MessageSquareText, Settings } from "lucide-react";

interface SidebarLayoutProps {
  children: ReactNode;
  unit: 'DRM' | 'OFT/45' | null;
  bgColor?: string;
  contentClassName?: string;
}

export const HOME_FILTERS_RESET_EVENT = "dr-melo:reset-home-filters";

const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children, unit, bgColor, contentClassName }) => {
  return (
    <div className="min-h-screen md:pl-64">
      <aside className="w-full bg-blue-900 text-white md:fixed md:inset-y-0 md:left-0 md:z-40 md:w-64 md:overflow-y-auto">
        <div className={`flex items-center justify-center border-b border-gray-700 ${unit === 'OFT/45' ? 'bg-white py-1' : 'bg-blue-900 p-2'}`}>
          {unit === 'OFT/45' ? (
            <Image src="/images/logo lobo.jpg" alt="OFT Logo" width={120} height={48} className="object-contain" />
          ) : (
            <Image src="/images/image2_semFundo.png" alt="Dr. Melo Logo" width={150} height={60} className="object-contain bg-blue-900" />
          )}
        </div>
        <nav className="flex flex-col space-y-2 p-4">
          <Link
            href="/"
            onClick={() => window.dispatchEvent(new Event(HOME_FILTERS_RESET_EVENT))}
            className="flex items-center rounded px-4 py-3 transition-colors hover:bg-blue-800"
          >
            <Home className="mr-3 h-5 w-5" />
            Início
          </Link>

          <Link href="/visualizar-agendamentos" className="flex items-center rounded px-4 py-3 transition-colors hover:bg-blue-800">
            <CalendarDays className="mr-3 h-5 w-5" />
            Agendamentos
          </Link>
          <Link href="/cancelamentos" className="flex items-center rounded px-4 py-3 transition-colors hover:bg-blue-800">
            <CalendarX className="mr-3 h-5 w-5" />
            Cancelamentos
          </Link>
          <Link href="/enviar-mensagem" className="flex items-center rounded px-4 py-3 transition-colors hover:bg-blue-800">
            <MessageSquareText className="mr-3 h-5 w-5" />
            Conversas
          </Link>

          <Link href="/busca-horarios" className="flex items-center rounded px-4 py-3 transition-colors hover:bg-blue-800">
            <Search className="mr-3 h-5 w-5" />
            Busca de Horários
          </Link>

          <Link href="/faturamento" className="flex items-center rounded px-4 py-3 transition-colors hover:bg-blue-800">
            <DollarSign className="mr-3 h-5 w-5" />
            Faturamento
          </Link>

          <Link href="/configuracoes" className="flex items-center rounded px-4 py-3 transition-colors hover:bg-blue-800">
            <Settings className="mr-3 h-5 w-5" />
            Configurações
          </Link>

          {unit === 'DRM' && (
            <Link href="/migrar-origens" className="flex items-center rounded px-4 py-3 font-semibold text-yellow-300 transition-colors hover:bg-yellow-900/30">
              <RotateCcw className="mr-3 h-5 w-5" />
              Base de Dados
            </Link>
          )}
        </nav>
      </aside>

      <main className={`min-h-screen ${contentClassName || 'p-6'} ${bgColor || 'bg-gray-100'}`}>
        {children}
      </main>
    </div>
  );
};

export default SidebarLayout;
