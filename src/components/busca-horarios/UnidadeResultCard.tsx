"use client";

import React, { useState } from "react";
import { UnitResult } from "@/hooks/useBuscaHorarios";
import { MapPin, CheckCircle2, XCircle, Calendar, Phone, Copy, Check, MessageCircle } from "lucide-react";

interface UnidadeResultCardProps {
  result: UnitResult;
  procedimentos: string[];
}

const friendlyName = (name: string) => {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
};

export function UnidadeResultCard({ result, procedimentos }: UnidadeResultCardProps) {
  const [copied, setCopied] = useState<'tel' | 'addr' | 'zap' | null>(null);
  const totalSlots = result.horariosDisponiveis.reduce((sum, d) => sum + d.slots.length, 0);

  const copyToClipboard = (text: string, type: 'tel' | 'addr' | 'zap') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden hover:border-blue-300 transition-all group">
      {/* Header Bar */}
      <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex items-center justify-between group-hover:bg-blue-50/30 transition-colors">
        <div className="flex items-center gap-4">
          <h3 className="text-base font-black text-gray-800 uppercase tracking-tight">{result.empresa}</h3>
          <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
            {result.bairro}
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-sm font-black text-blue-600">{totalSlots}</span>
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-tight">Vagas</span>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Info Col */}
        <div className="md:col-span-5 space-y-3 border-r border-gray-100 pr-5">
          {/* Contact Info */}
          <div className="space-y-2">
            {/* Phone */}
            <div 
              className="flex items-center gap-2.5 group/item cursor-pointer hover:bg-gray-50 p-1.5 rounded-lg transition-all border border-transparent hover:border-gray-200 bg-white"
              onClick={() => copyToClipboard(result.telefone, 'tel')}
            >
              <div className="bg-gray-100 p-1.5 rounded-md">
                <Phone className="h-3.5 w-3.5 text-gray-600" />
              </div>
              <div className="flex flex-col flex-1 truncate">
                <span className="text-[9px] font-black text-gray-400 uppercase leading-none mb-0.5">Telefone</span>
                <span className="text-xs font-bold text-gray-700 leading-none">{result.telefone || '--'}</span>
              </div>
              {copied === 'tel' ? <Check className="h-3.5 w-3.5 text-green-600 font-bold" /> : <Copy className="h-3.5 w-3.5 text-gray-300 opacity-0 group-hover/item:opacity-100 transition-opacity" />}
            </div>

            {/* WhatsApp */}
            {result.whatsApp && (
              <div 
                className="flex items-center gap-2.5 group/item cursor-pointer hover:bg-gray-50 p-1.5 rounded-lg transition-all border border-transparent hover:border-gray-200 bg-white"
                onClick={() => copyToClipboard(result.whatsApp, 'zap')}
              >
                <div className="bg-green-100 p-1.5 rounded-md">
                  <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                </div>
                <div className="flex flex-col flex-1 truncate">
                  <span className="text-[9px] font-black text-green-500 uppercase leading-none mb-0.5">WhatsApp</span>
                  <span className="text-xs font-bold text-gray-700 leading-none">{result.whatsApp}</span>
                </div>
                {copied === 'zap' ? <Check className="h-3.5 w-3.5 text-green-600 font-bold" /> : <Copy className="h-3.5 w-3.5 text-gray-300 opacity-0 group-hover/item:opacity-100 transition-opacity" />}
              </div>
            )}
            
            {/* Address */}
            <div 
              className="flex items-start gap-2.5 group/item cursor-pointer hover:bg-gray-50 p-1.5 rounded-lg transition-all border border-transparent hover:border-gray-200 bg-white"
              onClick={() => copyToClipboard(result.endereco, 'addr')}
            >
              <div className="bg-red-50 p-1.5 rounded-md">
                <MapPin className="h-3.5 w-3.5 text-red-500 mt-0.5" />
              </div>
              <div className="flex flex-col flex-1">
                <span className="text-[9px] font-black text-gray-400 uppercase leading-none mb-1">Endereço</span>
                <span className="text-[11px] leading-tight font-bold text-gray-500">{result.endereco}</span>
              </div>
              {copied === 'addr' ? <Check className="h-3.5 w-3.5 text-green-600 font-bold" /> : <Copy className="h-3.5 w-3.5 text-gray-300 opacity-0 group-hover/item:opacity-100 transition-opacity" />}
            </div>
          </div>

          {/* Procedures */}
          {procedimentos.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {procedimentos.map(proc => {
                const aceito = result.procedimentosAceitos[proc];
                return (
                  <div
                    key={proc}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black border
                      ${aceito 
                        ? 'bg-green-50 border-green-200 text-green-700' 
                        : 'bg-red-50 border-red-100 text-red-600 opacity-60'}`}
                  >
                    {aceito ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {friendlyName(proc)}
                  </div>
                );
              })}
            </div>
          )}

          {/* Subplanos Aceitos */}
          {result.subplanosAceitos && result.subplanosAceitos.length > 0 && (
            <div className="pt-2 border-t border-gray-50 mt-2">
              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <CheckCircle2 className="h-2.5 w-2.5 text-blue-400" />
                Planos Aceitos
              </div>
              <div className="flex flex-wrap gap-1">
                {result.subplanosAceitos.map(sp => (
                  <span key={sp} className="px-2 py-0.5 rounded bg-blue-50/50 text-blue-700 text-[9px] font-black border border-blue-100 shadow-sm">
                    {sp}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Slots Col */}
        <div className="md:col-span-7">
          <div className="flex items-center gap-1.5 mb-2.5 text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
            <Calendar className="h-3.5 w-3.5 text-blue-300" />
            Horários Disponíveis
          </div>
          
          <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200">
            {result.horariosDisponiveis.map(day => (
              <div key={day.date} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-gray-50/50 p-2.5 rounded-xl border border-gray-100">
                <span className="text-[11px] font-black text-gray-600 w-28 shrink-0">
                  {day.dateLabel}
                </span>
                <div className="flex flex-wrap gap-2">
                  {day.slots.map(slot => (
                    <span
                      key={slot}
                      className="px-2.5 py-1 rounded-lg bg-white text-emerald-700 text-xs font-black border-2 border-emerald-100 shadow-sm"
                    >
                      {slot}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
