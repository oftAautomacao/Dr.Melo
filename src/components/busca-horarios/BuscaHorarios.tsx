"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  explainExamAction,
  ExamExplanationResult,
} from "@/app/actions/exam-assistant";
import { useBuscaHorarios } from "@/hooks/useBuscaHorarios";
import {
  cloneInternalExamAliasEntries,
  findInternalExamMatches,
  formatProcedureName,
  InternalExamAliasEntry,
  InternalExamMatch,
  INTERNAL_EXAM_ALIAS_ENTRIES,
} from "@/lib/exam-internal-search";
import { PatientSearchResult, PatientSearchSheet } from "@/components/patient-search-sheet";
import { UnidadeResultCard } from "./UnidadeResultCard";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast as showToast } from "@/hooks/use-toast";
import { ptBR } from "date-fns/locale";
import { format, getDay, parseISO, isValid, startOfDay } from "date-fns";
import { 
  Search, Plus, X, Loader2, Clock,
  AlertCircle, Calendar as CalendarIcon, CheckCircle2, Copy, Eraser, MapPin, CircleHelp, Pencil, List, Trash2
} from "lucide-react";

const INCLUDED_IN_CONSULTA_OPTION = "__included_in_consulta__";
const INTERNAL_LIST_STORAGE_KEY = "busca-horarios-internal-aliases-v1";

function buildDefaultSearchWeek() {
  const today = startOfDay(new Date());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return date;
  });
}

export default function BuscaHorarios() {
  const toast = Object.assign(
    (props: Parameters<typeof showToast>[0]) => showToast(props),
    {
      success: (title: string, description?: string) =>
        showToast({ title, description }),
      error: (description: string, title = "Erro") =>
        showToast({ title, description, variant: "destructive" }),
      message: (description: string, title?: string) =>
        showToast({ title, description }),
    }
  );
  const {
    loading, searching, results,
    conveniosList, procedimentosList, unidadesList, subplanosMap, examesMetadata, feriadosData,
    buscar, limparResultados, gerarResposta, getNextDiscoveryDate,
  } = useBuscaHorarios();

  const [convenio, setConvenio] = useState("Particular");
  const [selectedUnidades, setSelectedUnidades] = useState<string[]>([]);
  const [subplano, setSubplano] = useState("");
  const [procedimentos, setProcedimentos] = useState<string[]>([]);
  const [periodo, setPeriodo] = useState<"Manha" | "Tarde" | "Ambos">("Ambos");
  
  const [selectedDateObjects, setSelectedDateObjects] = useState<Date[]>(() => buildDefaultSearchWeek());
  
  const [procSearch, setProcSearch] = useState("");
  const [unitSearch, setUnitSearch] = useState("");
  const [showProcDropdown, setShowProcDropdown] = useState(false);
  const [showUnidadeDropdown, setShowUnidadeDropdown] = useState(false);
  const [selectedByIncludedOption, setSelectedByIncludedOption] = useState(false);
  const [isPatientSearchOpen, setIsPatientSearchOpen] = useState(false);
  const [internalAliasEntries, setInternalAliasEntries] = useState<InternalExamAliasEntry[]>(() =>
    cloneInternalExamAliasEntries(INTERNAL_EXAM_ALIAS_ENTRIES)
  );
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupMatches, setLookupMatches] = useState<InternalExamMatch[]>([]);
  const [isLookupEditMode, setIsLookupEditMode] = useState(false);
  const [showLookupAssociationList, setShowLookupAssociationList] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [editCanonical, setEditCanonical] = useState("");
  const [editAliasesText, setEditAliasesText] = useState("");
  const [openExamInfoFor, setOpenExamInfoFor] = useState<string | null>(null);
  const [examInfoLoadingFor, setExamInfoLoadingFor] = useState<string | null>(null);
  const [examExplanationMap, setExamExplanationMap] = useState<Record<string, ExamExplanationResult>>({});

  const selectedDatesStrings = useMemo(() => {
    return selectedDateObjects.map(d => format(d, "yyyy-MM-dd"));
  }, [selectedDateObjects]);

  const hasSearchResults = Array.isArray(results) && results.length > 0;

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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(INTERNAL_LIST_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const sanitized = parsed
        .filter((entry) => entry && typeof entry === "object")
        .map((entry: any, index: number) => ({
          id: String(entry.id || `custom_${index + 1}`),
          canonical: String(entry.canonical || "").trim(),
          aliases: Array.isArray(entry.aliases)
            ? entry.aliases.map((value: unknown) => String(value || "").trim()).filter(Boolean)
            : [],
          searchTerms: Array.isArray(entry.searchTerms)
            ? entry.searchTerms.map((value: unknown) => String(value || "").trim()).filter(Boolean)
            : [],
        }))
        .filter((entry: InternalExamAliasEntry) => entry.canonical && entry.aliases.length > 0);

      if (sanitized.length > 0) {
        setInternalAliasEntries(sanitized);
      }
    } catch (error) {
      console.warn("Nao foi possivel carregar a lista interna personalizada.", error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        INTERNAL_LIST_STORAGE_KEY,
        JSON.stringify(internalAliasEntries)
      );
    } catch (error) {
      console.warn("Nao foi possivel salvar a lista interna personalizada.", error);
    }
  }, [internalAliasEntries]);

  const includedProcedimentos = useMemo(() => {
    return procedimentosList.filter((proc) => examesMetadata[proc]?.incluso);
  }, [procedimentosList, examesMetadata]);

  const filteredProcs = useMemo(() => {
    const search = procSearch.toLowerCase();
    const filtered = procedimentosList
      .filter(p => !procedimentos.includes(p))
      .filter(p => !search || p.toLowerCase().includes(search));

    if (search && "incluso na consulta".includes(search) && includedProcedimentos.length > 0) {
      return [INCLUDED_IN_CONSULTA_OPTION, ...filtered];
    }

    return filtered;
  }, [procedimentosList, procedimentos, procSearch, includedProcedimentos]);

  const addProcedimento = (proc: string) => {
    if (proc === INCLUDED_IN_CONSULTA_OPTION) {
      setProcedimentos((prev) => Array.from(new Set([...prev, ...includedProcedimentos])));
      setSelectedByIncludedOption(true);
      setProcSearch("");
      setShowProcDropdown(false);
      return;
    }

    setProcedimentos(prev => [...prev, proc]);
    setSelectedByIncludedOption(false);
    setProcSearch("");
    setShowProcDropdown(false);
  };

  const removeProcedimento = (proc: string) => {
    setProcedimentos(prev => prev.filter(p => p !== proc));
    setSelectedByIncludedOption(false);
  };

  const filteredUnidades = useMemo(() => {
    const search = unitSearch.toLowerCase();
    return unidadesList
      .filter(u => !selectedUnidades.includes(u))
      .filter(u => !search || u.toLowerCase().includes(search) || u.replace(/([A-Z])/g, ' $1').trim().toLowerCase().includes(search));
  }, [unidadesList, selectedUnidades, unitSearch]);

  const addUnidade = (unit: string) => {
    setSelectedUnidades(prev => [...prev, unit]);
    setUnitSearch("");
    setShowUnidadeDropdown(false);
  };

  const removeUnidade = (unit: string) => {
    setSelectedUnidades(prev => prev.filter(u => u !== unit));
  };

  useEffect(() => {
    const hasSearchCriteria = Boolean(
      convenio || procedimentos.length > 0 || selectedUnidades.length > 0
    );

    if (!loading && hasSearchCriteria) {
      buscar({
        convenio,
        subplano,
        procedimentos,
        periodo,
        selectedDates: selectedDatesStrings,
        unidades: selectedUnidades,
      });
    } else if (!loading) {
      limparResultados();
    }
  }, [
    buscar,
    convenio,
    limparResultados,
    loading,
    periodo,
    procedimentos,
    selectedDatesStrings,
    selectedUnidades,
    subplano,
  ]);

  const handleLimpar = () => {
    setConvenio("Particular");
    setSelectedUnidades([]);
    setSubplano("");
    setProcedimentos([]);
    setSelectedByIncludedOption(false);
    setPeriodo("Ambos");
    setSelectedDateObjects(buildDefaultSearchWeek());
    setUnitSearch("");
    setOpenExamInfoFor(null);
    setExamInfoLoadingFor(null);
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

  const hasIncludedOptionCopyMode = useMemo(() => {
    return examPrices.items.length > 0 && examPrices.items.every((item) => item.label === "Incluso");
  }, [examPrices]);

  const friendlyName = (name: string) => formatProcedureName(name);

  const buildLookupMatches = (query: string) => {
    return findInternalExamMatches(query, procedimentosList, internalAliasEntries);
  };

  const fillLookupEditor = (query: string, match?: InternalExamMatch | null) => {
    if (match) {
      setEditEntryId(match.id);
      setEditCanonical(match.canonical);
      setEditAliasesText(match.aliases.join("\n"));
      return;
    }

    setEditEntryId(null);
    setEditCanonical(query.trim());
    setEditAliasesText(query.trim());
  };

  const parseAliasesText = (value: string) => {
    return Array.from(
      new Set(
        value
          .split(/[\n,=]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  };

  const openLookupEditor = () => {
    fillLookupEditor(lookupQuery || procSearch, lookupMatches[0] || null);
    setIsLookupEditMode(true);
    setShowLookupAssociationList(false);
  };

  const handleLookupSearch = () => {
    const query = procSearch.trim();
    if (!query) {
      toast({
        title: "Exame nao informado",
        description: "Digite um exame para usar a lupa.",
        variant: "destructive",
      });
      return;
    }

    setShowProcDropdown(false);
    const matches = buildLookupMatches(query);
    setLookupQuery(query);
    setLookupMatches(matches);
    fillLookupEditor(query, matches[0] || null);
    setIsLookupEditMode(false);
    setShowLookupAssociationList(false);
    setIsLookupOpen(true);
  };

  const handleSaveLookupEntry = () => {
    const canonical = editCanonical.trim();
    const aliases = parseAliasesText(editAliasesText);

    if (!canonical) {
      toast({
        title: "Nome principal obrigatorio",
        description: "Preencha o nome principal do exame.",
        variant: "destructive",
      });
      return;
    }

    if (aliases.length === 0) {
      toast({
        title: "Correspondencia obrigatoria",
        description: "Adicione ao menos uma correspondencia.",
        variant: "destructive",
      });
      return;
    }

    const nextEntry: InternalExamAliasEntry = {
      id:
        editEntryId ||
        `custom_${canonical.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_")}`,
      canonical,
      aliases: Array.from(new Set([canonical, ...aliases])),
      searchTerms: Array.from(new Set([canonical, ...aliases])),
    };

    setInternalAliasEntries((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.id === nextEntry.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = nextEntry;
        return updated;
      }

      return [...prev, nextEntry];
    });

    const refreshedMatches = findInternalExamMatches(lookupQuery || procSearch, procedimentosList, [
      ...internalAliasEntries.filter((entry) => entry.id !== nextEntry.id),
      nextEntry,
    ]);
    setLookupMatches(refreshedMatches);
    fillLookupEditor(lookupQuery || procSearch, refreshedMatches[0] || nextEntry as any);
    setIsLookupEditMode(false);
    toast({
      title: "Lista interna atualizada",
    });
  };

  const handleDeleteLookupEntry = (entryId: string) => {
    setInternalAliasEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    setLookupMatches((prev) => prev.filter((entry) => entry.id !== entryId));

    if (editEntryId === entryId) {
      setEditEntryId(null);
      setEditCanonical("");
      setEditAliasesText("");
      setIsLookupEditMode(false);
    }

    toast({
      title: "Associacao removida",
    });
  };

  const handleExamInfoOpenChange = async (examRaw: string, open: boolean) => {
    setOpenExamInfoFor(open ? examRaw : null);

    if (!open || examExplanationMap[examRaw]) return;

    setExamInfoLoadingFor(examRaw);
    try {
      const result = await explainExamAction({ examName: friendlyName(examRaw) });
      if (result) {
        setExamExplanationMap((prev) => ({ ...prev, [examRaw]: result }));
      }
    } finally {
      setExamInfoLoadingFor((current) => (current === examRaw ? null : current));
    }
  };

  const copyToClipboard = async (
    text: string,
    successTitle: string,
    successDescription?: string
  ) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const tempInput = document.createElement("textarea");
        tempInput.value = text;
        tempInput.setAttribute("readonly", "");
        tempInput.style.position = "absolute";
        tempInput.style.left = "-9999px";
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
      }

      toast({
        title: successTitle,
        description: successDescription,
      });
      return true;
    } catch {
      toast({
        title: "Erro ao copiar",
        description: "Nao foi possivel copiar o conteudo.",
        variant: "destructive",
      });
      return false;
    }
  };

  const copyExamExplanation = async (examRaw: string) => {
    const explanation = examExplanationMap[examRaw];
    if (!explanation?.patientCopy) return;
    await copyToClipboard(explanation.patientCopy, "Explicacao copiada");
  };

  const handleCopyWhatsappResponse = async () => {
    if (!results || results.length === 0) {
      toast({
        title: "Sem resposta para copiar",
        description: "Busque os horarios antes de copiar a mensagem.",
        variant: "destructive",
      });
      return;
    }

    await copyToClipboard(
      gerarResposta(results),
      "Resposta copiada",
      "A mensagem do WhatsApp foi copiada."
    );
  };

  const handlePatientSearchSelect = (record: PatientSearchResult) => {
    setIsPatientSearchOpen(false);
    const statusLabel = record.status === "agendado" ? "Agendado" : "Cancelado";
    toast.message(
      `${statusLabel}: ${record.nomePaciente} em ${record.dataAgendamento.split("-").reverse().join("/")} às ${record.horario}.`
    );
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
      <div className="sticky top-4 z-30">
        <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-2 shadow-sm md:flex-row md:items-center md:justify-between md:px-5 md:py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary p-1.5">
              <Search className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-black text-foreground uppercase tracking-tight">Busca de Horarios</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <button
              type="button"
              onClick={handleLimpar}
              disabled={searching}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 active:scale-[0.98] disabled:opacity-50"
              title="Limpar filtros"
              aria-label="Limpar filtros"
            >
              <Eraser className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleCopyWhatsappResponse}
              disabled={searching || !hasSearchResults}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-emerald-200 disabled:text-emerald-50"
              title={searching ? "Buscando horarios" : "Copiar resposta do WhatsApp"}
              aria-label={searching ? "Buscando horarios" : "Copiar resposta do WhatsApp"}
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setIsPatientSearchOpen(true)}
              className="inline-flex items-center justify-center rounded-lg border border-sky-200 bg-sky-50 p-1.5 text-sky-700 transition-colors hover:bg-sky-100 hover:text-sky-800"
              title="Buscar paciente agendado"
              aria-label="Buscar paciente agendado"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Left Column: Filters */}
        <div className="md:col-span-4">
          <div className="bg-card rounded-xl shadow-sm border p-4 space-y-3">
          {/* Section 2: Exames */}
          <div>
            <div className="flex items-center gap-2 mb-2 border-b pb-1.5">
              <Plus className="h-5 w-5 text-emerald-600" />
              <h2 className="text-xs font-black text-foreground uppercase tracking-tighter">Exames & Procedimentos</h2>
            </div>
            <div className="relative mb-2">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                type="text"
                placeholder="Adicionar exame..."
                value={procSearch}
                onChange={e => {
                  setProcSearch(e.target.value);
                  setShowProcDropdown(true);
                }}
                onFocus={() => setShowProcDropdown(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (filteredProcs.length > 0) {
                      addProcedimento(filteredProcs[0]);
                    }
                  }
                }}
                className="w-full rounded-lg border border-input pl-10 pr-20 py-2 text-[12px] font-bold focus:ring-2 focus:ring-primary/20 outline-none bg-muted hover:bg-card"
              />
              <Popover open={isLookupOpen} onOpenChange={setIsLookupOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={handleLookupSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-800"
                    title="Consultar lista interna"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" side="bottom" sideOffset={12} className="w-[420px] space-y-3 rounded-2xl p-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                      Lista interna
                    </p>
                  </div>

                  {lookupMatches.length > 0 ? (
                    <div className="space-y-3">
                      {(() => {
                        const bestMatch = lookupMatches[0];
                        const bestProcedure = bestMatch.resolvedProcedures[0];

                        return (
                          <div className="rounded-2xl border bg-muted/40 p-4">
                            <div className="space-y-2 text-sm">
                              <p>
                                <span className="font-black text-foreground">Voce digitou:</span>{" "}
                                <span className="text-muted-foreground">{lookupQuery}</span>
                              </p>
                              <div className="flex items-center justify-between gap-3">
                                <p>
                                  <span className="font-black text-foreground">Melhor correspondencia:</span>{" "}
                                  <span className="text-foreground">{bestMatch.canonical}</span>
                                </p>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={openLookupEditor}
                                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-white hover:text-primary"
                                    title="Editar esta correspondencia"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowLookupAssociationList((current) => !current);
                                      setIsLookupEditMode(false);
                                    }}
                                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-white hover:text-primary"
                                    title="Ver todas as associacoes"
                                  >
                                    <List className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {bestProcedure ? (
                              <div className="mt-3">
                                <div className="flex flex-wrap gap-2">
                                  {bestMatch.resolvedProcedures.slice(0, 3).map((procedure, index) => (
                                    <button
                                      key={`${bestMatch.id}_${procedure.raw}`}
                                      type="button"
                                      onClick={() => {
                                        addProcedimento(procedure.raw);
                                        setIsLookupOpen(false);
                                      }}
                                      disabled={procedimentos.includes(procedure.raw)}
                                      className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                        index === 0
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                                      }`}
                                    >
                                      {procedimentos.includes(procedure.raw)
                                        ? "Ja adicionado"
                                        : index === 0
                                          ? `Melhor: ${procedure.label}`
                                          : procedure.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="mt-3 text-xs text-amber-700">
                                Encontrei a correspondencia pelo nome, mas nao achei qual exame da sua lista deve ser adicionado.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between gap-3">
                        <p>Nao encontrei correspondencia nessa lista local.</p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={openLookupEditor}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-white hover:text-primary"
                            title="Editar esta correspondencia"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowLookupAssociationList((current) => !current);
                              setIsLookupEditMode(false);
                            }}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-white hover:text-primary"
                            title="Ver todas as associacoes"
                          >
                            <List className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {showLookupAssociationList && (
                    <div className="rounded-2xl border bg-muted/30 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Todas as associacoes
                      </p>
                      <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                        {internalAliasEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="w-full rounded-xl border bg-white px-3 py-2 text-left transition-colors hover:bg-primary/5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  fillLookupEditor(lookupQuery || procSearch, {
                                    id: entry.id,
                                    canonical: entry.canonical,
                                    matchedAlias: entry.aliases[0] || entry.canonical,
                                    aliases: entry.aliases,
                                    resolvedProcedures: [],
                                  });
                                  setIsLookupEditMode(true);
                                  setShowLookupAssociationList(false);
                                }}
                                className="min-w-0 flex-1 text-left"
                              >
                                <p className="text-sm font-black text-foreground">{entry.canonical}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{entry.aliases.join(" = ")}</p>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLookupEntry(entry.id)}
                                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
                                title="Excluir associacao"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {isLookupEditMode && (
                      <div className="space-y-3 rounded-2xl border bg-muted/30 p-3">
                        <div>
                          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Nome principal do exame
                          </label>
                          <input
                            type="text"
                            value={editCanonical}
                            onChange={(e) => setEditCanonical(e.target.value)}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Outros nomes que significam a mesma coisa
                          </label>
                          <textarea
                            value={editAliasesText}
                            onChange={(e) => setEditAliasesText(e.target.value)}
                            rows={5}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Um por linha. Ex: Fundoscopia"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveLookupEntry}
                          className="rounded-lg bg-primary px-3 py-2 text-xs font-black uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                          Salvar lista
                        </button>
                      </div>
                    )}
                </PopoverContent>
              </Popover>
              {showProcDropdown && filteredProcs.length > 0 && (
                <div className="absolute z-20 mt-2 w-full bg-card border border-input rounded-xl shadow-2xl max-h-56 overflow-y-auto p-1">
                  {filteredProcs.slice(0, 15).map(proc => (
                    <button
                      key={proc}
                      onClick={() => addProcedimento(proc)}
                      className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-muted rounded-lg transition-colors border-b last:border-0"
                    >
                      {proc === INCLUDED_IN_CONSULTA_OPTION ? "Incluso na consulta" : friendlyName(proc)}
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
                  <div className="flex items-center gap-1">
                    <Popover
                      open={openExamInfoFor === item.nome}
                      onOpenChange={(open) => {
                        void handleExamInfoOpenChange(item.nome, open);
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                          title="Detalhes do exame"
                        >
                          <CircleHelp className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-[360px] space-y-3">
                        {examInfoLoadingFor === item.nome ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Carregando explicacao...
                          </div>
                        ) : examExplanationMap[item.nome] ? (
                          <>
                            <div>
                              <p className="text-xs font-black uppercase tracking-widest text-primary">
                                {examExplanationMap[item.nome].title}
                              </p>
                              <p className="mt-1 text-sm text-foreground">
                                {examExplanationMap[item.nome].summary}
                              </p>
                            </div>
                            <div className="space-y-2 text-sm">
                              <p>
                                <span className="font-black text-foreground">Para que serve:</span>{" "}
                                <span className="text-muted-foreground">{examExplanationMap[item.nome].servesFor}</span>
                              </p>
                              <p>
                                <span className="font-black text-foreground">O que avalia:</span>{" "}
                                <span className="text-muted-foreground">{examExplanationMap[item.nome].evaluates}</span>
                              </p>
                              <p>
                                <span className="font-black text-foreground">Como e feito:</span>{" "}
                                <span className="text-muted-foreground">{examExplanationMap[item.nome].howItsDone}</span>
                              </p>
                              <p>
                                <span className="font-black text-foreground">Dilata a pupila:</span>{" "}
                                <span className="text-muted-foreground">{examExplanationMap[item.nome].requiresDilation}</span>
                              </p>
                              <p>
                                <span className="font-black text-foreground">Contraste venoso:</span>{" "}
                                <span className="text-muted-foreground">{examExplanationMap[item.nome].hasVenousContrast}</span>
                              </p>
                            </div>
                            <div className="rounded-lg border bg-muted/50 p-3">
                              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                                Texto para paciente
                              </p>
                              <p className="mt-1 text-sm text-foreground">
                                {examExplanationMap[item.nome].patientCopy}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => copyExamExplanation(item.nome)}
                              className="inline-flex items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-xs font-black uppercase tracking-wide text-primary transition-colors hover:bg-primary/10"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Copiar explicacao
                            </button>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Nao foi possivel gerar a explicacao agora.
                          </p>
                        )}
                      </PopoverContent>
                    </Popover>
                    <button
                      onClick={() => removeProcedimento(item.nome)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {procedimentos.length > 0 && (
              <div className="mt-3 pt-3 border-t border-dashed space-y-2">
                <div className="flex justify-between items-center px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total</span>
                    <button 
                      onClick={() => {
                        const text = selectedByIncludedOption && hasIncludedOptionCopyMode
                          ? examPrices.items.map(i => `- ${friendlyName(i.nome)}`).join('\n')
                          : examPrices.items.map(i => `- ${friendlyName(i.nome)}: ${i.label}`).join('\n') + 
                            `\n\n*Total: R$ ${examPrices.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*`;
                        navigator.clipboard.writeText(text);
                        toast.success("Orçamento copiado!");
                      }}
                      className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md transition-all active:scale-90"
                      title="Copiar Orçamento"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                    R$ {examPrices.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Unidades */}
          <div>
            <div className="flex items-center gap-2 mb-2 border-b pb-1.5">
              <MapPin className="h-5 w-5 text-amber-500" />
              <h2 className="text-xs font-black text-foreground uppercase tracking-tighter">Unidades</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="relative mb-2">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <input
                    type="text"
                    placeholder="Adicionar unidade..."
                    value={unitSearch}
                    onChange={e => { setUnitSearch(e.target.value); setShowUnidadeDropdown(true); }}
                    onFocus={() => setShowUnidadeDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (filteredUnidades.length > 0) {
                          addUnidade(filteredUnidades[0]);
                        }
                      }
                    }}
                    className="w-full rounded-lg border border-input pl-10 pr-4 py-2 text-[12px] font-bold focus:ring-2 focus:ring-primary/20 outline-none bg-muted hover:bg-card"
                  />
                  {showUnidadeDropdown && filteredUnidades.length > 0 && (
                    <div className="absolute z-20 mt-2 w-full bg-card border border-input rounded-xl shadow-2xl max-h-56 overflow-y-auto p-1">
                      {filteredUnidades.slice(0, 15).map(unit => (
                        <button
                          key={unit}
                          type="button"
                          onClick={() => addUnidade(unit)}
                          className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-muted rounded-lg transition-colors border-b last:border-0"
                        >
                          {unit.replace(/([A-Z])/g, ' $1').trim()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                {selectedUnidades.length > 0 && (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {selectedUnidades.map(unit => (
                      <div key={unit} className="flex items-center justify-between bg-muted px-3 py-2 rounded-lg border">
                        <span className="text-xs font-bold text-foreground">
                          {unit.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <button 
                          type="button" 
                          onClick={() => removeUnidade(unit)} 
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Calendário Estilizado (Highlight month, bg, holidays) */}
          <div>
            <div className="flex items-center justify-between mb-3 border-b pb-1.5">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" />
                <h2 className="text-xs font-black text-foreground uppercase tracking-tighter">Datas da Busca</h2>
              </div>
              {procedimentos.length > 0 && (
                <div className="flex items-center gap-1.5 animate-pulse">
                  <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Opções Alternativas</span>
                </div>
              )}
            </div>
            
            {procedimentos.length > 0 && nextDiscoveryDate && (
              <div className="mb-2 px-2 py-1.5 bg-emerald-50/50 border border-emerald-100 rounded-lg">
                <p className="text-[10px] text-emerald-800 font-bold leading-tight">
                  💡 A <span className="text-emerald-600 border-b border-emerald-500">próxima data disponível</span> com uma unidade que não apareceu acima é dia <span className="font-black">{nextDiscoveryDate.split('-').slice(1).reverse().join('/')}</span>.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-2.5 shadow-inner">
              <CalendarUI
                mode="multiple"
                selected={selectedDateObjects}
                onSelect={(dates) => setSelectedDateObjects(dates || [])}
                locale={ptBR}
                showOutsideDays={false}
                className="mx-auto max-w-[238px] rounded-md p-0"
                classNames={{
                  months: "space-y-0",
                  month: "space-y-2",
                  caption: "relative mb-1.5 flex items-center justify-center rounded-lg bg-primary px-1.5 py-1.5 text-primary-foreground shadow-sm",
                  caption_label: "text-[10px] font-black uppercase tracking-wide",
                  nav: "flex items-center gap-0.5",
                  nav_button: "h-4.5 w-4.5 border-0 bg-primary-foreground/20 p-0 text-primary-foreground opacity-100 hover:bg-primary-foreground/40 hover:text-primary-foreground",
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                  table: "w-full border-collapse",
                  head_row: "flex",
                  head_cell: "w-8 text-center text-[8px] font-black uppercase text-primary/50",
                  row: "mt-1 flex w-full",
                  cell: "h-8 w-8 p-0 text-center text-[10px]",
                  day: "h-8 w-8 rounded-md p-0 text-[10px] font-bold text-foreground transition-colors hover:bg-primary/10 aria-selected:opacity-100",
                  day_selected: "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                }}
                modifiers={{
                  holiday: holidayDates,
                  sunday: (d: Date) => getDay(d) === 0,
                  discovery: (d: Date) => format(d, "yyyy-MM-dd") === nextDiscoveryDate,
                }}
                modifiersClassNames={{
                  holiday: "bg-amber-500 text-white rounded-md font-black shadow-sm",
                  sunday: "text-rose-500 font-bold",
                  discovery: "border-b-2 border-emerald-500 text-emerald-700 rounded-none",
                }}
                disabled={[
                  { before: startOfDay(new Date()) }
                ]}
              />
            </div>
          </div>

          {/* Section 5: Planos & Convênios */}
          <div>
            <div className="flex items-center gap-2 mb-2 border-b pb-1.5">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <h2 className="text-xs font-black text-foreground uppercase tracking-tighter">Planos & Convênios</h2>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                  Operadora
                </label>
                <select
                  value={convenio}
                  onChange={(e) => {
                    setConvenio(e.target.value);
                    setSubplano("");
                  }}
                  className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700 focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="">Selecione o Convênio</option>
                  {conveniosList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {hasSubplanos && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                    Subplano
                  </label>
                  <select
                    value={subplano}
                    onChange={(e) => setSubplano(e.target.value)}
                    className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700 focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    <option value="">Todos os subplanos</option>
                    {subplanosMap[convenio]?.map(sp => (
                      <option key={sp} value={sp}>{sp}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
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
              {selectedDatesStrings.length === 0 && (convenio || procedimentos.length > 0) && (
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
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {results.map(unit => (
                  <UnidadeResultCard key={unit.unidade} result={unit} procedimentos={procedimentos} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {(showProcDropdown || showUnidadeDropdown) && (
        <div className="fixed inset-0 z-10" onClick={() => { setShowProcDropdown(false); setShowUnidadeDropdown(false); }} />
      )}
      <PatientSearchSheet
        isOpen={isPatientSearchOpen}
        onClose={() => setIsPatientSearchOpen(false)}
        onSelect={handlePatientSearchSelect}
        enableInlineActions
      />
    </div>
  );
}
