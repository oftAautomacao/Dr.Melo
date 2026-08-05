"use client";

import { useState } from "react";
import { UnitResult } from "@/hooks/useBuscaHorarios";
import {
  MapPin,
  CheckCircle2,
  Calendar,
  Phone,
  Copy,
  Check,
  MessageCircle,
  Plus,
  ChevronDown,
} from "lucide-react";

interface UnidadeResultCardProps {
  result: UnitResult;
  procedimentos: string[];
}

const friendlyName = (name: string) => {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
};

const formatCompanyName = (empresa: string, bairro: string) => {
  if (empresa.trim().toLowerCase() === "oftalmo" && bairro.trim().toLowerCase() === "recreio") {
    return "Oftalmorecreio";
  }
  return empresa;
};

const normalizeContactDigits = (value?: string) => {
  if (!value) return "";

  let digits = value.replace(/\D/g, "");

  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }

  return digits;
};

const formatContactNumber = (value?: string, referenceWhatsApp?: string) => {
  const digits = normalizeContactDigits(value);
  const whatsAppDigits = normalizeContactDigits(referenceWhatsApp);

  if (!digits) return "--";

  if (digits.length === 11 && whatsAppDigits.length === 10 && digits.slice(1) === whatsAppDigits) {
    return `(${whatsAppDigits.slice(0, 2)}) ${whatsAppDigits.slice(2, 6)}-${whatsAppDigits.slice(6)}`;
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 9) {
    return `(21) ${digits.slice(0, 5)}-${digits.slice(5)}`;
  }

  if (digits.length === 8) {
    return `(21) ${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return value || "--";
};

const buildContactsCopyText = (
  empresa: string,
  bairro: string,
  telefone: string,
  whatsApp: string,
  endereco: string,
) => {
  const unitName = formatCompanyName(empresa, bairro);

  return [
    `Os contatos da Unidade ${unitName} (${bairro}) sao:`,
    `- Telefone: ${telefone}`,
    `- WhatsApp: ${whatsApp}`,
    `- Endereco: ${endereco}`,
  ].join("\n");
};

export function UnidadeResultCard({ result, procedimentos }: UnidadeResultCardProps) {
  const [copied, setCopied] = useState<"contacts" | null>(null);
  const [isExamesOpen, setIsExamesOpen] = useState(false);
  const totalSlots = result.horariosDisponiveis.reduce((sum, d) => sum + d.slots.length, 0);
  const hasAvailability = result.horariosDisponiveis.length > 0;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied("contacts");
    setTimeout(() => setCopied(null), 2050);
  };

  const formattedTelefone = formatContactNumber(result.telefone, result.whatsApp);
  const formattedWhatsApp = formatContactNumber(result.whatsApp);

  return (
    <div className="group overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all hover:border-blue-300">
      <div className="relative flex items-center justify-between overflow-hidden border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 transition-all">
        <div className="pointer-events-none absolute right-4 top-1/2 translate-x-4 -translate-y-1/2 opacity-10">
          <MapPin className="h-28 w-28 text-indigo-650" />
        </div>
        <div className="relative z-10 flex min-w-0 items-center gap-3">
          <h3 className="truncate text-sm font-black uppercase tracking-tight text-slate-800">
            {formatCompanyName(result.empresa, result.bairro)}
          </h3>
          <span className="shrink-0 rounded-full border border-blue-250/20 bg-blue-200/50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-700 shadow-sm">
            {result.bairro}
          </span>
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-1.5 rounded-xl border border-blue-100 bg-white px-2.5 py-1 shadow-sm">
          <span className="text-sm font-black text-indigo-600">{totalSlots}</span>
          <span className="text-[9px] font-black uppercase tracking-tight text-slate-400">Vagas</span>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div>
          <div className="mb-2 flex items-center gap-1.5 px-1 text-[9px] font-black uppercase tracking-widest text-gray-400">
            <Calendar className="h-3.5 w-3.5 text-blue-300" />
            Horarios Disponiveis
          </div>

          <div className="max-h-44 space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200">
            {hasAvailability ? (
              result.horariosDisponiveis.map((day) => (
                <div
                  key={day.date}
                  className="flex flex-col gap-1.5 rounded-lg border border-gray-100 bg-gray-50/50 p-2 sm:flex-row sm:items-start"
                >
                  <span className="w-20 shrink-0 text-[9px] font-black text-gray-600 sm:pt-1">
                    {day.dateLabel}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {day.slots.map((slot) => (
                      <span
                        key={slot}
                        className="rounded-md border border-emerald-100 bg-white px-1.5 py-0.5 text-[9px] font-black text-emerald-700 shadow-sm"
                      >
                        {slot}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-3">
                <p className="text-[11px] font-bold text-gray-500">
                  Nenhum horario disponivel encontrado para os filtros atuais.
                </p>
              </div>
            )}
          </div>

          {procedimentos.length === 0 && result.examesDisponiveis && result.examesDisponiveis.length > 0 && (
            <div className="mt-3 border-t border-dashed border-gray-100 pt-2">
              <button
                type="button"
                onClick={() => setIsExamesOpen((current) => !current)}
                className="mb-2 flex w-full items-center justify-between gap-2 text-left"
              >
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-500">
                  <Plus className="h-3 w-3" /> Exames Realizados nesta Unidade
                </div>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-emerald-400 transition-transform ${
                    isExamesOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isExamesOpen && (
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200">
                  {[...result.examesDisponiveis]
                    .sort((a, b) => friendlyName(a).localeCompare(friendlyName(b)))
                    .map((ex) => (
                      <span
                        key={ex}
                        className="rounded border border-emerald-100/50 bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700 shadow-sm"
                      >
                        {friendlyName(ex)}
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-1.5 border-t border-gray-100 pt-3 md:grid-cols-2">
          <div className="flex items-center gap-2 rounded-lg bg-white p-1">
            <div className="rounded-md bg-gray-100 p-1.5">
              <Phone className="h-3.5 w-3.5 text-gray-600" />
            </div>
            <div className="min-w-0 flex flex-1 flex-col">
              <span className="mb-0.5 text-[9px] font-black uppercase leading-none text-gray-400">Telefone</span>
              <span className="whitespace-nowrap text-[11px] font-bold leading-none text-gray-700">
                {formattedTelefone}
              </span>
            </div>
          </div>

          {result.whatsApp && (
            <div className="flex items-center gap-2 rounded-lg bg-white p-1">
              <div className="rounded-md bg-green-100 p-1.5">
                <MessageCircle className="h-3.5 w-3.5 text-green-600" />
              </div>
              <div className="min-w-0 flex flex-1 flex-col">
                <span className="mb-0.5 text-[9px] font-black uppercase leading-none text-green-500">WhatsApp</span>
                <span className="whitespace-nowrap text-[11px] font-bold leading-none text-gray-700">
                  {formattedWhatsApp}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-white p-1 md:col-span-2">
            <div className="rounded-md bg-red-50 p-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 text-red-500" />
            </div>
            <div className="min-w-0 flex flex-1 flex-col">
              <span className="mb-1 text-[9px] font-black uppercase leading-none text-gray-400">Endereco</span>
              <span className="break-words text-[9px] font-bold leading-tight text-gray-500">{result.endereco}</span>
            </div>
            <button
              type="button"
              onClick={() =>
                copyToClipboard(
                  buildContactsCopyText(
                    result.empresa,
                    result.bairro,
                    formattedTelefone,
                    formattedWhatsApp,
                    result.endereco,
                  )
                )
              }
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-blue-200 bg-blue-50 p-1.5 text-blue-700 transition-colors hover:bg-blue-100"
              title="Copiar telefone, WhatsApp e endereco"
            >
              {copied === "contacts" ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {result.subplanosAceitos && result.subplanosAceitos.length > 0 && (
          <div className="border-t border-gray-50 pt-1.5">
            <div className="mb-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-gray-400">
              <CheckCircle2 className="h-2.5 w-2.5 text-blue-400" />
              Planos Aceitos
            </div>
            <div className="flex flex-wrap gap-1">
              {[...result.subplanosAceitos].sort().map((sp) => (
                <span
                  key={sp}
                  className="rounded border border-blue-100 bg-blue-50/50 px-2 py-0.5 text-[9px] font-black text-blue-700 shadow-sm"
                >
                  {sp}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
