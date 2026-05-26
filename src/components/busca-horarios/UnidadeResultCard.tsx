"use client";

import React, { useState } from "react";
import { UnitResult } from "@/hooks/useBuscaHorarios";
import {
  MapPin,
  CheckCircle2,
  XCircle,
  Calendar,
  Phone,
  Copy,
  Check,
  MessageCircle,
  Plus,
  Building2,
  Clock3,
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

  // Alguns telefones fixos vieram salvos com um "9" extra na frente.
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

const buildContactsCopyText = (empresa: string, bairro: string, telefone: string, whatsApp: string) => {
  const unitName = formatCompanyName(empresa, bairro);

  return [
    `Os telefones da Unidade ${unitName} (${bairro}) são:`,
    `- Telefone: ${telefone}`,
    `- WhatsApp: ${whatsApp}`,
  ].join("\n");
};

const buildSingleContactCopyText = (label: "Telefone" | "WhatsApp", value: string) => {
  return `${label}: ${value}`;
};

export function UnidadeResultCard({ result, procedimentos }: UnidadeResultCardProps) {
  const [copied, setCopied] = useState<"tel" | "addr" | "zap" | "both" | null>(null);
  const totalSlots = result.horariosDisponiveis.reduce((sum, d) => sum + d.slots.length, 0);
  const hasAvailability = result.horariosDisponiveis.length > 0;

  const copyToClipboard = (text: string, type: "tel" | "addr" | "zap" | "both") => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2050);
  };

  const formattedTelefone = formatContactNumber(result.telefone, result.whatsApp);
  const formattedWhatsApp = formatContactNumber(result.whatsApp);

  return (
    <div className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md transition-all hover:border-blue-300">
      <div className="relative flex items-center justify-between overflow-hidden border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 transition-all">
        <div className="pointer-events-none absolute right-4 top-1/2 translate-x-4 -translate-y-1/2 opacity-10">
          <MapPin className="h-28 w-28 text-indigo-650" />
        </div>
        <div className="relative z-10 flex items-center gap-4">
          <h3 className="text-base font-black uppercase tracking-tight text-slate-800">
            {formatCompanyName(result.empresa, result.bairro)}
          </h3>
          <span className="rounded-full border border-blue-250/20 bg-blue-200/50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-700 shadow-sm">
            {result.bairro}
          </span>
        </div>
        <div className="relative z-10 flex items-center gap-1.5 rounded-xl border border-blue-100 bg-white px-2.5 py-1 shadow-sm">
          <span className="text-sm font-black text-indigo-600">{totalSlots}</span>
          <span className="text-[9px] font-black uppercase tracking-tight text-slate-400">Vagas</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 p-4 md:grid-cols-12">
        <div className="space-y-3 border-r border-gray-100 pr-5 md:col-span-5">
          <div className="space-y-2">
            <div
              className="group/item flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent bg-white p-1.5 transition-all hover:border-gray-200 hover:bg-gray-50"
              onClick={() => copyToClipboard(buildSingleContactCopyText("Telefone", formattedTelefone), "tel")}
            >
              <div className="rounded-md bg-gray-100 p-1.5">
                <Phone className="h-3.5 w-3.5 text-gray-600" />
              </div>
              <div className="flex flex-1 flex-col truncate">
                <span className="mb-0.5 text-[9px] font-black uppercase leading-none text-gray-400">Telefone</span>
                <span className="text-xs font-bold leading-none text-gray-700">{formattedTelefone}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(
                    buildContactsCopyText(result.empresa, result.bairro, formattedTelefone, formattedWhatsApp),
                    "both",
                  );
                }}
                className="p-1 rounded hover:bg-blue-50 text-blue-500 hover:text-blue-700 transition-colors flex items-center justify-center"
                title="Copiar Ambos os Telefones"
              >
                {copied === "both" ? (
                  <Check className="h-3.5 w-3.5 font-bold text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              {copied === "tel" ? (
                <Check className="h-3.5 w-3.5 font-bold text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-gray-300 opacity-0 transition-opacity group-hover/item:opacity-100" />
              )}
            </div>

            {result.whatsApp && (
              <div
                className="group/item flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent bg-white p-1.5 transition-all hover:border-gray-200 hover:bg-gray-50"
                onClick={() => copyToClipboard(buildSingleContactCopyText("WhatsApp", formattedWhatsApp), "zap")}
              >
                <div className="rounded-md bg-green-100 p-1.5">
                  <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                </div>
                <div className="flex flex-1 flex-col truncate">
                  <span className="mb-0.5 text-[9px] font-black uppercase leading-none text-green-500">WhatsApp</span>
                  <span className="text-xs font-bold leading-none text-gray-700">{formattedWhatsApp}</span>
                </div>
                {copied === "zap" ? (
                  <Check className="h-3.5 w-3.5 font-bold text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-gray-300 opacity-0 transition-opacity group-hover/item:opacity-100" />
                )}
              </div>
            )}

            <div
              className="group/item flex cursor-pointer items-start gap-2.5 rounded-lg border border-transparent bg-white p-1.5 transition-all hover:border-gray-200 hover:bg-gray-50"
              onClick={() => copyToClipboard(result.endereco, "addr")}
            >
              <div className="rounded-md bg-red-50 p-1.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 text-red-500" />
              </div>
              <div className="flex flex-1 flex-col">
                <span className="mb-1 text-[9px] font-black uppercase leading-none text-gray-400">Endereco</span>
                <span className="text-[11px] font-bold leading-tight text-gray-500">{result.endereco}</span>
              </div>
              {copied === "addr" ? (
                <Check className="h-3.5 w-3.5 font-bold text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-gray-300 opacity-0 transition-opacity group-hover/item:opacity-100" />
              )}
            </div>
          </div>

          {result.horariosFuncionamento && result.horariosFuncionamento.length > 0 && (
            <div className="mt-2 border-t border-gray-50 pt-2">
              <div className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-gray-400">
                <Clock3 className="h-2.5 w-2.5 text-amber-500" />
                Horarios de Funcionamento
              </div>
              <div className="max-h-32 space-y-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200">
                {result.horariosFuncionamento.map((horario) => (
                  <div
                    key={horario}
                    className="rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-1.5 text-[10px] font-black text-amber-800 shadow-sm"
                  >
                    {horario}
                  </div>
                ))}
              </div>
            </div>
          )}

          {procedimentos.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {procedimentos.map((proc) => {
                const aceito = result.procedimentosAceitos[proc];
                return (
                  <div
                    key={proc}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-black ${
                      aceito
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-red-100 bg-red-50 text-red-600 opacity-60"
                    }`}
                  >
                    {aceito ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {friendlyName(proc)}
                  </div>
                );
              })}
            </div>
          )}

          {result.subplanosAceitos && result.subplanosAceitos.length > 0 && (
            <div className="mt-2 border-t border-gray-50 pt-2">
              <div className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-gray-400">
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

        <div className="md:col-span-7">
          <div className="mb-2.5 flex items-center gap-1.5 px-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
            <Calendar className="h-3.5 w-3.5 text-blue-300" />
            Horarios Disponiveis
          </div>

          <div className="max-h-48 space-y-2.5 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200">
            {hasAvailability ? (
              result.horariosDisponiveis.map((day) => (
                <div
                  key={day.date}
                  className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/50 p-2.5 sm:flex-row sm:items-center"
                >
                  <span className="w-28 shrink-0 text-[11px] font-black text-gray-600">{day.dateLabel}</span>
                  <div className="flex flex-wrap gap-2">
                    {day.slots.map((slot) => (
                      <span
                        key={slot}
                        className="rounded-lg border-2 border-emerald-100 bg-white px-2.5 py-1 text-xs font-black text-emerald-700 shadow-sm"
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
            <div className="mt-4 border-t border-dashed border-gray-100 pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-500">
                <Plus className="h-3 w-3" /> Exames Realizados nesta Unidade
              </div>
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
            </div>
          )}

          {result.conveniosAceitos && result.conveniosAceitos.length > 0 && (
            <div className="mt-4 border-t border-dashed border-gray-100 pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-indigo-500">
                <Building2 className="h-3 w-3" /> Convenios Aceitos
              </div>
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200">
                {result.conveniosAceitos.map((conv) => (
                  <span
                    key={conv}
                    className="rounded border border-indigo-100 bg-indigo-50/60 px-2 py-1 text-[9px] font-black text-indigo-700 shadow-sm"
                  >
                    {conv}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
