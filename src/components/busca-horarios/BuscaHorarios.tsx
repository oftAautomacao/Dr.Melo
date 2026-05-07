"use client";

import React, { useState, useMemo } from "react";
import { useBuscaHorarios } from "@/hooks/useBuscaHorarios";
import { UnidadeResultCard } from "./UnidadeResultCard";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { ptBR } from "date-fns/locale";
import { format, getDay, parseISO, isValid, startOfDay } from "date-fns";
import { 
  Search, Plus, X, Loader2, Clock, Sun, Moon, SunMoon, 
  AlertCircle, Calendar as CalendarIcon, CheckCircle2, Copy 
} from "lucide-react";

export default function BuscaHorarios() {
  const {
    loading, searching, results,
    conveniosList, procedimentosList, subplanosMap, examesMetadata, feriadosData,
    buscar, gerarResposta, getNextDiscoveryDate,
  } = useBuscaHorarios();

  const [convenio, setConvenio] = useState("");
  const [subplano, setSubplano] = useState("");
  const [procedimentos, setProcedimentos] = useState<string[]>([]);
  const [periodo, setPeriodo] = useState<"Manha" | "Tarde" | "Ambos">("Ambos");
  
  const [selectedDateObjects, setSelectedDateObjects] = useState<Date[]>([]);
  
  const [procSearch, setProcSearch] = useState("");
  const [showProcDropdown, setShowProcDropdown] = useState(false);

  const selectedDatesStrings = useMemo(() => {
    return selectedDateObjects.map(d => format(d, "yyyy-MM-dd"));
  }, [selectedDateObjects]);

  const nextDiscoveryDate = useMemo(() => {
    // Find the soonest date for a unit not yet in results
    const shownUnits = new Set(results?.map(r => r.unidade) || []);
    return getNextDiscoveryDate(procedimentos, Array.from(shownUnits), selectedDatesStrings);
  }, [procedimentos, results, getNextDiscoveryDate, selectedDatesStrings]);

  const hasSubplanos = convenio && subplanosMap[convenio]?.length > 0;

  // Process holidays for modifiers using startOfDay for better matching
  const holidayDates = useMemo(() => {
    if (!feriadosData || typeof feriadosData !== 'object') return [];
    return Object.keys(feriadosData).map((dStr) => {
      // Handle "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss..."
      const datePart = dStr.split('T')[0];
      const [y, m, d] = datePart.split("-").map(Number);
      if (!y || !m || !d) return null;
      return startOfDay(new Date(y, m - 1, d));
    }).filter(Boolean) as Date[];
  }, [feriadosData]);

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
    // Search is allowed if either a convenio is selected OR procedures are selected
    if (!convenio && procedimentos.length === 0) return;
    buscar({ convenio, subplano, procedimentos, periodo, selectedDates: selectedDatesStrings });
  };

  const handleLimpar = () => {
    setConvenio("");
    setSubplano("");
    setProcedimentos([]);
    setPeriodo("Ambos");
    setSelectedDateObjects([]);
    // To clear results, we need to call a clear function in the hook or set results to null
    // Assuming 'buscar' with empty params or a new clear function
    buscar({ convenio: "", subplano: "", procedimentos: [], periodo: "Ambos", selectedDates: [] });
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-4 text-base text-muted-foreground font-medium">Carregando sistema...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-card px-6 py-3.5 rounded-xl shadow-sm border">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2 rounded-lg">
            <Search className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-black text-foreground uppercase tracking-tight">Busca de Horários</h1>
        </div>
        <div className="text-[10px] text-primary font-black uppercase tracking-widest bg-primary/10 px-2 py-1 rounded">CALENDÁRIO ATIVO</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Left Column: Filters */}
        <div className="md:col-span-4 space-y-3">
          
          {/* Section 1: Planos */}
          <div className="bg-card rounded-xl shadow-sm border p-5">
            <div className="flex items-center gap-2 mb-3 border-b pb-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-black text-foreground uppercase tracking-tighter">Planos & Convênios</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-black text-muted-foreground uppercase mb-1 ml-1">Convênio</label>
                <select
                  value={convenio}
                  onChange={e => { setConvenio(e.target.value); setSubplano(""); }}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm font-bold bg-muted hover:bg-card transition-colors outline-none cursor-pointer"
                >
                  <option value="">-- Selecione --</option>
                  {conveniosList.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {hasSubplanos && (
                <div>
                  <label className="block text-[11px] font-black text-muted-foreground uppercase mb-1 ml-1">Subplano</label>
                  <select
                    value={subplano}
                    onChange={e => setSubplano(e.target.value)}
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm font-bold bg-muted hover:bg-card transition-colors outline-none cursor-pointer"
                  >
                    <option value="">Todos os subplanos</option>
                    {subplanosMap[convenio]?.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Exames */}
          <div className="bg-card rounded-xl shadow-sm border p-5">
            <div className="flex items-center gap-2 mb-3 border-b pb-2">
              <Plus className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-black text-foreground uppercase tracking-tighter">Exames & Procedimentos</h2>
            </div>
            <div className="relative mb-3">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                type="text"
                placeholder="Adicionar exame..."
                value={procSearch}
                onChange={e => { setProcSearch(e.target.value); setShowProcDropdown(true); }}
                onFocus={() => setShowProcDropdown(true)}
                className="w-full rounded-lg border border-input pl-10 pr-4 py-2 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none bg-muted hover:bg-card"
              />
              {showProcDropdown && filteredProcs.length > 0 && (
                <div className="absolute z-20 mt-2 w-full bg-card border border-input rounded-xl shadow-2xl max-h-56 overflow-y-auto p-1">
                  {filteredProcs.slice(0, 15).map(proc => (
                    <button
                      key={proc}
                      onClick={() => addProcedimento(proc)}
                      className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-muted rounded-lg transition-colors border-b last:border-0"
                    >
                      {friendlyName(proc)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {examPrices.items.map(item => (
                <div key={item.nome} className="flex items-center justify-between bg-muted px-3 py-2 rounded-lg border">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">{friendlyName(item.nome)}</span>
                    <span className={`text-[10px] font-black ${item.label === 'Incluso' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {item.label}
                    </span>
                  </div>
                  <button onClick={() => removeProcedimento(item.nome)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {convenio === "Particular" && procedimentos.length > 0 && (
              <div className="mt-3 pt-3 border-t border-dashed flex justify-between items-center px-1">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Estimado</span>
                <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                  R$ {examPrices.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {/* Section 3: Critérios */}
          <div className="bg-card rounded-xl shadow-sm border p-5">
            <div className="flex items-center gap-2 mb-3 border-b pb-2">
              <Clock className="h-5 w-5 text-amber-500" />
              <h2 className="text-sm font-black text-foreground uppercase tracking-tighter">Critérios de Busca</h2>
            </div>
            <div>
              <label className="block text-[11px] font-black text-muted-foreground uppercase mb-2 ml-1">Turno Preferencial</label>
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
                        ? 'bg-primary border-primary text-primary-foreground shadow-md' 
                        : 'bg-muted border-input text-muted-foreground hover:border-primary hover:text-primary'}`}
                  >
                    {opt.icon}
                    <span className="mt-1">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 4: Calendário Estilizado (Highlight month, bg, holidays) */}
          <div className="bg-card rounded-xl shadow-sm border p-4">
            <div className="flex items-center justify-between mb-4 border-b pb-2">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" />
                <h2 className="text-sm font-black text-foreground uppercase tracking-tighter">Datas da Busca</h2>
              </div>
              {procedimentos.length > 0 && (
                <div className="flex items-center gap-1.5 animate-pulse">
                  <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Opções Alternativas</span>
                </div>
              )}
            </div>
            
            {procedimentos.length > 0 && nextDiscoveryDate && (
              <div className="mb-3 px-2 py-1.5 bg-emerald-50/50 border border-emerald-100 rounded-lg">
                <p className="text-[10px] text-emerald-800 font-bold leading-tight">
                  💡 A <span className="text-emerald-600 border-b border-emerald-500">próxima data disponível</span> com uma unidade que não apareceu acima é dia <span className="font-black">{nextDiscoveryDate.split('-').slice(1).reverse().join('/')}</span>.
                </p>
              </div>
            )}

            <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 shadow-inner">
              <CalendarUI
                mode="multiple"
                selected={selectedDateObjects}
                onSelect={(dates) => setSelectedDateObjects(dates || [])}
                locale={ptBR}
                className="rounded-md mx-auto"
                classNames={{
                  caption: "flex justify-center pt-2 relative items-center bg-primary text-primary-foreground rounded-lg p-2 mb-4 shadow-md",
                  caption_label: "text-xs font-black uppercase tracking-widest",
                  nav_button: "h-6 w-6 bg-primary-foreground/20 hover:bg-primary-foreground/40 text-primary-foreground border-transparent",
                  table: "w-full border-collapse",
                  head_cell: "text-primary/50 font-black uppercase text-[10px] w-9",
                  day: "h-9 w-9 p-0 font-bold aria-selected:opacity-100 rounded-lg hover:bg-primary/10 transition-all relative",
                  day_selected: "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 z-10 hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                }}
                modifiers={{
                  holiday: holidayDates,
                  sunday: (d: Date) => getDay(d) === 0,
                  discovery: (d: Date) => format(d, "yyyy-MM-dd") === nextDiscoveryDate,
                }}
                modifiersClassNames={{
                  holiday: "bg-amber-500 text-white rounded-lg font-black shadow-sm",
                  sunday: "text-rose-500 font-bold",
                  discovery: "text-emerald-700 border-b-2 border-emerald-500 rounded-none",
                }}
                disabled={[
                  { before: new Date() }
                ]}
              />
            </div>

            {selectedDatesStrings.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2 px-1">
                  Selecionados ({selectedDatesStrings.length})
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1 scrollbar-thin">
                  {selectedDatesStrings.sort().map(d => (
                    <span key={d} className="text-[10px] bg-primary text-primary-foreground px-2 py-1 rounded-lg font-black flex items-center gap-1.5 shadow-sm animate-in fade-in zoom-in duration-200">
                      {d.split('-').slice(1).reverse().join('/')}
                      <X 
                        className="h-3 w-3 cursor-pointer hover:text-rose-200" 
                        onClick={() => setSelectedDateObjects(prev => prev.filter(obj => format(obj, "yyyy-MM-dd") !== d))} 
                      />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleLimpar}
              disabled={searching}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-black text-xs text-gray-500 transition-all uppercase tracking-widest
                bg-gray-100 hover:bg-gray-200 active:scale-[0.98] disabled:opacity-50"
            >
              <X className="h-4 w-4" /> LIMPAR
            </button>
            <button
              onClick={handleBuscar}
              disabled={searching || (!convenio && procedimentos.length === 0)}
              className="flex-[2] flex items-center justify-center gap-2 py-4 rounded-xl font-black text-xs text-primary-foreground transition-all uppercase tracking-widest
                bg-primary hover:bg-primary/90 shadow-xl shadow-primary/10 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none active:scale-[0.98]"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searching ? "BUSCANDO..." : "BUSCAR"}
            </button>
          </div>
        </div>

        {/* Right Column: Results */}
        <div className="md:col-span-8">
          {results === null ? (
            <div className="bg-card border-2 border-dashed border-primary/10 rounded-2xl h-full min-h-[400px] flex flex-col items-center justify-center text-primary/20 p-12">
              <CalendarIcon className="h-20 w-20 mb-4 opacity-10" />
              <p className="text-sm font-black uppercase tracking-widest text-center">
                Selecione as datas no calendário
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-10 flex flex-col items-center gap-4 shadow-sm text-center">
              <AlertCircle className="h-10 w-10 text-amber-400" />
              <p className="text-lg text-amber-900 font-black uppercase tracking-tight">Nenhum horário livre</p>
              <p className="text-sm text-amber-700 font-medium max-w-xs">Não encontramos vagas para os critérios e datas selecionadas. Tente outros dias.</p>
            </div>
          ) : (
            <div className="space-y-4 pb-12">
              {selectedDatesStrings.length === 0 && (
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-primary uppercase tracking-wider">Modo Descoberta Ativo</h3>
                    <p className="text-[10px] text-muted-foreground font-medium">Mostrando a vaga mais próxima disponível em cada unidade encontrada.</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4">
                {results.map(unit => (
                  <UnidadeResultCard key={unit.unidade} result={unit} procedimentos={procedimentos} />
                ))}
              </div>
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => {
                    const text = gerarResposta(results);
                    navigator.clipboard.writeText(text);
                    alert("✓ Resposta copiada!");
                  }}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-full text-xs font-black uppercase hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 active:scale-95"
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
