import React, { ReactNode } from 'react';
import Link from 'next/link';

import { Home, CalendarDays, PlusCircle, CalendarX } from "lucide-react"; // Importando ícones
import { MessageSquareText, Settings } from "lucide-react"; // Importando ícone de mensagem e configurações
import WhatsAppIcon from '@/components/ui/whatsapp-icon';
interface SidebarLayoutProps {
  children: ReactNode;
  unit: 'DRM' | 'OFT/45' | null; // Adiciona a prop unit
}

const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children, unit }) => {
  console.log("SidebarLayout received unit prop:", unit);
  return (
    <div className="flex min-h-screen">
      {/* Sidebar - Changed background to dark blue and text to white */}
      <div className="w-64 bg-blue-900 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-gray-700">
          {unit === 'OFT/45' ? 'Menu - Oftalmoday' : 'Menu - Dr. Melo'} {/* Condicional para o texto do menu */}
        </div>
        <nav className="flex flex-col p-4 space-y-2">
          <Link href="/" className="flex items-center px-4 py-3 rounded transition-colors hover:bg-blue-800">
            <Home className="mr-3 h-5 w-5" /> {/* Ícone */}
            Início
          </Link>
          <Link href="/novo-agendamento" className="flex items-center px-4 py-3 rounded transition-colors hover:bg-blue-800">
            <PlusCircle className="mr-3 h-5 w-5" /> {/* Ícone */}
            Novo Agendamento
          </Link>
          <Link href="/visualizar-agendamentos" className="flex items-center px-4 py-3 rounded transition-colors hover:bg-blue-800">
            <CalendarDays className="mr-3 h-5 w-5" /> {/* Ícone */}
            Agendamentos
          </Link>
          <Link href="/cancelamentos" className="flex items-center px-4 py-3 rounded transition-colors hover:bg-blue-800">
            <CalendarX className="mr-3 h-5 w-5" /> {/* Ícone */}
            Cancelamentos
          </Link>
          <Link href="/enviar-mensagem" className="flex items-center px-4 py-3 rounded transition-colors hover:bg-blue-800">
            <MessageSquareText className="mr-3 h-5 w-5" /> {/* Ícone de Mensagem */}
            Enviar Mensagem Paciente
          </Link>
          <Link href="/whastsapp" className="flex items-center px-4 py-3 rounded transition-colors hover:bg-blue-800">
            <WhatsAppIcon className="mr-3 h-5 w-5" />
            WhastsApp
          </Link>
          <Link href="/configuracoes" className="flex items-center px-4 py-3 rounded transition-colors hover:bg-blue-800">
            <Settings className="mr-3 h-5 w-5" /> {/* Ícone de Configurações */}
            Configurações
          </Link>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 bg-gray-100">
        {children}
      </div>
    </div>
  );
};

export default SidebarLayout;