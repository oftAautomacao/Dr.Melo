"use client";
import React from 'react';
import SidebarLayout from "@/components/layout/sidebar-layout";
import { Search, MessageCircle, MoreVertical, Smile, Mic, Send, Check, CheckCheck } from 'lucide-react';
import Image from 'next/image';

// Mock Data
const mockContacts = [
  { id: 1, name: 'Dr. João', lastMessage: 'Ok, estarei no aguardo.', time: '10:40', avatar: '/avatars/avatar1.png', unread: 2 },
  { id: 2, name: 'Clínica Matriz', lastMessage: 'A consulta foi confirmada.', time: '10:35', avatar: '/avatars/avatar2.png' },
  { id: 3, name: 'Laboratório B', lastMessage: 'O resultado do exame está pronto.', time: 'Ontem', avatar: '/avatars/avatar3.png' },
  { id: 4, name: 'Paciente Maria', lastMessage: 'Qual o valor da consulta?', time: 'Ontem', avatar: '/avatars/avatar4.png', unread: 1 },
  { id: 5, name: 'Grupo da Clínica', lastMessage: 'Reunião amanhã às 8h.', time: '20/09/2025', avatar: '/avatars/avatar5.png' },
  { id: 6, name: 'Fornecedor de Lentes', lastMessage: 'O pedido chegará na sexta-feira.', time: '19/09/2025', avatar: '/avatars/avatar6.png' },
  { id: 7, name: 'Contabilidade', lastMessage: 'O balancete de agosto foi fechado.', time: '18/09/2025', avatar: '/avatars/avatar7.png' },
  { id: 8, name: 'RH', lastMessage: 'Folhas de ponto disponíveis.', time: '17/09/2025', avatar: '/avatars/avatar8.png' },
];

const mockMessages = [
    { id: 1, sender: 'Dr. João', text: 'Olá! A cirurgia do paciente Carlos foi um sucesso.', time: '10:30' },
    { id: 2, sender: 'me', text: 'Excelente notícia, Dr. João! Obrigado por avisar.', time: '10:31', status: 'read' },
    { id: 3, sender: 'Dr. João', text: 'Ele já está na sala de recuperação. A família já foi informada.', time: '10:32' },
    { id: 4, sender: 'me', text: 'Perfeito. Alguma recomendação especial para o pós-operatório?', time: '10:33', status: 'delivered' },
    { id: 5, sender: 'Dr. João', text: 'Apenas o procedimento padrão. Manter o repouso e a medicação nos horários corretos. A receita já está com a enfermeira.', time: '10:35' },
    { id: 6, sender: 'me', text: 'Ok, estarei no aguardo.', time: '10:40', status: 'sent' },
];


const MessageStatus = ({ status }: { status?: 'sent' | 'delivered' | 'read' }) => {
  if (!status) return null;

  switch (status) {
    case 'sent':
      return <Check size={16} className="text-gray-500" />;
    case 'delivered':
      return <CheckCheck size={16} className="text-gray-500" />;
    case 'read':
      return <CheckCheck size={16} className="text-blue-500" />;
    default:
      return null;
  }
};

const WhastsAppPage = () => {
  const [selectedUnit, setSelectedUnit] = React.useState<"DRM" | "OFT/45" | null>("DRM");

  return (
    <SidebarLayout unit={selectedUnit}>
      <div className="flex h-[calc(100vh-5rem)] w-full bg-white text-gray-800 shadow-lg rounded-lg overflow-hidden">
        {/* Left Panel: Contacts List */}
        <div className="flex flex-col w-full md:w-1/3 border-r border-gray-200 bg-white">
          {/* Header */}
          <header className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
            <Image src="/avatars/avatar1.png" alt="My Avatar" width={40} height={40} className="rounded-full" />
            <div className="flex items-center space-x-4">
              <MessageCircle size={24} className="text-gray-600 cursor-pointer" />
              <MoreVertical size={24} className="text-gray-600 cursor-pointer" />
            </div>
          </header>

          {/* Search Bar */}
          <div className="p-2 bg-gray-50 border-b border-gray-200">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Pesquisar ou começar uma nova conversa"
                className="w-full pl-10 pr-4 py-2 text-sm border rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Contact List */}
          <div className="flex-1 overflow-y-auto">
            {mockContacts.map(contact => (
              <div key={contact.id} className="flex items-center p-3 cursor-pointer hover:bg-gray-100 border-b border-gray-200">
                <Image src={contact.avatar} alt={contact.name} width={48} height={48} className="rounded-full" />
                <div className="flex-1 ml-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold">{contact.name}</h3>
                    <p className={`text-xs ${contact.unread ? 'text-green-500 font-bold' : 'text-gray-500'}`}>{contact.time}</p>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs text-gray-500 truncate">{contact.lastMessage}</p>
                    {contact.unread && (
                      <span className="bg-green-500 text-white text-xs rounded-full px-2 py-0.5">
                        {contact.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Chat Window */}
        <div className="hidden md:flex flex-col w-2/3">
          {/* Chat Header */}
          <header className="flex items-center p-3 border-b border-gray-200 bg-gray-50">
            <Image src="/avatars/avatar1.png" alt="Contact Avatar" width={40} height={40} className="rounded-full" />
            <div className="ml-3">
              <h3 className="text-sm font-semibold">Dr. João</h3>
              <p className="text-xs text-gray-500">online</p>
            </div>
            <div className="flex items-center space-x-4 ml-auto">
              <Search size={20} className="text-gray-600 cursor-pointer" />
              <MoreVertical size={20} className="text-gray-600 cursor-pointer" />
            </div>
          </header>

          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto" style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')" }}>
            {mockMessages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'} mb-2`}>
                <div className={`rounded-lg px-3 py-2 max-w-md ${msg.sender === 'me' ? 'bg-green-100' : 'bg-white'} shadow`}>
                  <p className="text-sm">{msg.text}</p>
                  <div className="flex items-center justify-end mt-1">
                    <p className="text-xs text-gray-400 mr-1">{msg.time}</p>
                    {msg.sender === 'me' && <MessageStatus status={msg.status as any} />}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Message Input */}
          <footer className="flex items-center p-3 bg-gray-50 border-t border-gray-200">
            <Smile size={24} className="text-gray-600 cursor-pointer" />
            <input
              type="text"
              placeholder="Digite uma mensagem"
              className="w-full mx-3 px-4 py-2 text-sm border rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <Send size={24} className="text-gray-600 cursor-pointer" />
            <Mic size={24} className="text-gray-600 cursor-pointer ml-2" />
          </footer>
        </div>
      </div>
    </SidebarLayout>
  );
};

export default WhastsAppPage;