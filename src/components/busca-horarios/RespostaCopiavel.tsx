"use client";

import React, { useState } from "react";
import { Copy, Check, MessageSquare } from "lucide-react";

interface RespostaCopiavelProps {
  texto: string;
}

export function RespostaCopiavel({ texto }: RespostaCopiavelProps) {
  const [copiado, setCopiado] = useState(false);

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = texto;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    }
  };

  if (!texto) return null;

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
          <MessageSquare className="h-4 w-4 text-green-500" />
          Resposta para WhatsApp
        </div>
        <button
          onClick={handleCopiar}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black transition-all shadow-md uppercase tracking-tighter
            ${copiado ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        >
          {copiado ? <><Check className="h-3.5 w-3.5" /> Copiado!</> : <><Copy className="h-3.5 w-3.5" /> Copiar Texto</>}
        </button>
      </div>
      <div className="p-3 bg-gray-50/20">
        <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed bg-white rounded-lg border border-gray-100 p-3 shadow-inner max-h-60 overflow-y-auto">
          {texto}
        </pre>
      </div>
    </div>
  );
}
