"use client";

import React, { useState, useMemo } from "react";
import { useBuscaHorarios } from "@/hooks/useBuscaHorarios";
import { UnidadeResultCard } from "./UnidadeResultCard";
import { Search, Plus, X, Loader2, Clock, Sun, Moon, SunMoon, AlertCircle, Calendar, CheckCircle2, Copy } from "lucide-react";

export default function BuscaHorarios() {
  const {
    loading, searching, results,
    conveniosList, procedimentosList, subplanosMap, examesMetadata,
    buscar, gerarResposta,
  } = useBuscaHorarios();

  const getTodayStr = () => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  };

  const getNextWeekStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  };

  const [convenio, setConvenio] = useState("");
  const [subplano, setSubplano] = useState("");
  const [procedimentos, setProcedimentos] = useState<string[]>([]);
  const [periodo, setPeriodo] = useState<"Manha" | "Tarde" | "Ambos">("Ambos");
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getNextWeekStr());
  const [procSearch, setProcSearch] = useState("");
  const [showProcDropdown, setShowProcDropdown] = useState(false);

  const hasSubplanos = convenio && subplanosMap[convenio]?.length > 0;

  const filteredProcs = useMemo(() => {
    const search = procSearch.toLowerCase();
    return procedimentosList
      .filter(p => !procedimentos.includes(p))
      .filter(p => !search || p.toLowerCase().includes(search));
  }, [procedimentosList, procedimentos, procSearch]);

  const addProcedimento = (proc: string) => {
    setProcedimentos(prev => [...prev, proc]);
    setProcSearch("");
    setShowProcDropdown(false);
  };

  const removeProcedimento = (proc: string) => {
    setProcedimentos(prev => prev.filter(p => p !== proc));
  };

  const handleBuscar = () => {
    if (!convenio || !startDate || !endDate) return;
    buscar({ convenio, subplano, procedimentos, periodo, startDate, endDate });
  };

  const examPrices = useMemo(() => {
    let total = 0;
    const items = procedimentos.map(p => {
      const meta = examesMetadata[p];
      let price = 0;
      let label = "R$ 0,00";
      if (meta) {
        if (meta.incluso) {
          label = "Incluso";
        } else if (typeof meta.preco === 'number') {
          price = meta.preco;
          label = `R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        } else if (typeof meta.preco === 'string') {
          const parsed = parseFloat(meta.preco.replace(/[^\d,]/g, '').replace(',', '.'));
          if (!isNaN(parsed)) {
            price = parsed;
            label = `R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          } else {
            label = meta.preco;
          }
        }
      }
      total += price;
      return { nome: p, label, price };
    });
    return { items, total };
  }, [procedimentos, examesMetadata]);

  const friendlyName = (name: string) => {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-4 text-base text-gray-600 font-medium">Carregando informações...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-white px-6 py-3.5 rounded-xl shadow-md border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg shadow-inner">
            <Search className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-xl font-black text-gray-800 uppercase tracking-tight">Busca de Horários</h1>
        </div>
        <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest bg-gray-50 px-2 py-1 rounded">CALENDÁRIO ATIVO</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Left Column: Filters */}
        <div className="md:col-span-4 space-y-3">
          
          {/* Section 1: Planos */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
              <CheckCircle2 className="h-5 w-5 text-blue-500" />
              <h2 className="text-sm font-black text-gray-700 uppercase tracking-tighter">Planos & Convênios</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase mb-1 ml-1">Convênio</label>
                <select
                  value={convenio}
                  onChange={e => { setConvenio(e.target.value); setSubplano(""); }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold bg-gray-50 hover:bg-white transition-colors outline-none cursor-pointer"
                >
                  <option value="">-- Selecione --</option>
                  {conveniosList.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {hasSubplanos && (
                <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase mb-1 ml-1">Subplano</label>
                  <select
                    value={subplano}
                    onChange={e => setSubplano(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold bg-gray-50 hover:bg-white transition-colors outline-none cursor-pointer"
                  >
                    <option value="">Todos os subplanos</option>
                    {subplanosMap[convenio]?.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Exames */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
              <Plus className="h-5 w-5 text-green-500" />
              <h2 className="text-sm font-black text-gray-700 uppercase tracking-tighter">Exames & Procedimentos</h2>
            </div>
            <div className="relative mb-3">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Search className="h-4 w-4 text-gray-300" />
              </div>
              <input
                type="text"
                placeholder="Adicionar exame..."
                value={procSearch}
                onChange={e => { setProcSearch(e.target.value); setShowProcDropdown(true); }}
                onFocus={() => setShowProcDropdown(true)}
                className="w-full rounded-lg border border-gray-200 pl-10 pr-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
              />
              {showProcDropdown && filteredProcs.length > 0 && (
                <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto p-1">
                  {filteredProcs.slice(0, 15).map(proc => (
                    <button
                      key={proc}
                      onClick={() => addProcedimento(proc)}
                      className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-blue-50 rounded-lg transition-colors border-b border-gray-50 last:border-0"
                    >
                      {friendlyName(proc)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {examPrices.items.map(item => (
                <div key={item.nome} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-700">{friendlyName(item.nome)}</span>
                    <span className={`text-[10px] font-black ${item.label === 'Incluso' ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {item.label}
                    </span>
                  </div>
                  <button onClick={() => removeProcedimento(item.nome)} className="text-gray-300 hover:text-red-500 transition-colors p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            {procedimentos.length > 0 && convenio === "Particular" && (
              <div className="mt-3 pt-2 border-t border-dashed border-gray-200 flex justify-between items-center">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">TOTAL</span>
                <span className="text-base font-black text-blue-700">
                  R$ {examPrices.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {/* Section 3: Critérios */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
              <Clock className="h-5 w-5 text-orange-400" />
              <h2 className="text-sm font-black text-gray-700 uppercase tracking-tighter">Critérios de Busca</h2>
            </div>
            <div>
              <label className="block text-[11px] font-black text-gray-400 uppercase mb-2 ml-1">Turno Preferencial</label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { val: "Manha" as const, icon: <Sun className="h-4 w-4" />, label: "Manhã" },
                  { val: "Tarde" as const, icon: <Moon className="h-4 w-4" />, label: "Tarde" },
                  { val: "Ambos" as const, icon: <SunMoon className="h-4 w-4" />, label: "Todos" },
                ]).map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => setPeriodo(opt.val)}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-lg text-[10px] font-black border transition-all
                      ${periodo === opt.val 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-white border-gray-100 text-gray-400 hover:border-blue-200 hover:text-blue-500'}`}
                  >
                    {opt.icon}
                    <span className="mt-1">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 4: Calendário (EM BAIXO) */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
              <Calendar className="h-5 w-5 text-red-500" />
              <h2 className="text-sm font-black text-gray-700 uppercase tracking-tighter">Datas da Busca</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Data Início</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold bg-gray-50 hover:bg-white transition-colors outline-none cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Data Fim</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold bg-gray-50 hover:bg-white transition-colors outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleBuscar}
            disabled={!convenio || searching}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-black text-xs text-white transition-all uppercase tracking-widest
              bg-blue-600 hover:bg-blue-700 shadow-md disabled:bg-gray-100 disabled:text-gray-300 disabled:shadow-none active:scale-[0.98]"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {searching ? "BUSCANDO..." : "BUSCAR"}
          </button>
        </div>

        {/* Right Column: Results */}
        <div className="md:col-span-8">
          {results === null ? (
            <div className="bg-white border-2 border-dashed border-gray-100 rounded-2xl h-full min-h-[400px] flex flex-col items-center justify-center text-gray-300 p-12">
              <Calendar className="h-16 w-16 mb-4 opacity-10" />
              <p className="text-sm font-bold uppercase tracking-tight text-center">
                Selecione o convênio e as datas<br/>para identificar horários livres.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-8 flex items-center gap-5 shadow-sm">
              <AlertCircle className="h-8 w-8 text-orange-400" />
              <p className="text-base text-orange-800 font-bold">Nenhum horário livre encontrado para o período selecionado.</p>
            </div>
          ) : (
            <div className="space-y-4 pb-12">
              <div className="grid grid-cols-1 gap-4">
                {results.map(unit => (
                  <UnidadeResultCard key={unit.unidade} result={unit} procedimentos={procedimentos} />
                ))}
              </div>
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => {
                    const text = gerarResposta(results);
                    navigator.clipboard.writeText(text);
                    alert("✓ Resposta copiada!");
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-full text-xs font-black uppercase hover:bg-emerald-700 transition-all shadow-md active:scale-95"
                >
                  <Copy className="h-4 w-4" /> Copiar Resposta WhatsApp
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showProcDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setShowProcDropdown(false)} />
      )}
    </div>
  );
}
