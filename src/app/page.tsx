"use client";

import SidebarLayout, { HOME_FILTERS_RESET_EVENT } from "@/components/layout/sidebar-layout";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, MapPin, Users, FileText, BarChart3, List, LayoutGrid, Plus, DollarSign, Landmark, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, UserX, MessageSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ref, onValue } from "firebase/database";
import { getDatabaseInstance } from "@/lib/firebase";
import { ENVIRONMENT } from "../../ambiente";
import { getFirebasePathBase } from "@/lib/firebaseConfig";
import { FinancialSheetContent } from "@/components/financial-sheet-content";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { differenceInYears, parse } from "date-fns";
import { PatientDetailsSheet, AppointmentDetail } from "@/components/PatientDetailsSheet";
import { normalizePatientOrigin } from "@/lib/patient-origin";

/* ---------- helpers ---------- */
const MESES = [
  "Janeiro", "Fevereiro", "Mar\u00E7o", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ORIGIN_LABELS: Record<string, string> = {
  Google: "Google",
  Instagram: "Instagram",
  Desconhecido: "Desconhecida",
};

const getOriginLabel = (origin: string) => ORIGIN_LABELS[origin] || origin;
const getOriginValueFromLabel = (label: string) => (label === "Desconhecida" ? "Desconhecido" : label);

const obterNomeMes = (dataStr: string) => {
  const [ano, mes] = dataStr.split("-");
  const idx = Number(mes) - 1;
  return idx >= 0 && idx < 12 ? `${MESES[idx]} de ${ano}` : null;
};

const obterAno = (dataStr: string) => dataStr.substring(0, 4);

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const matchesSearchText = (value: string, query: string) => {
  const normalizedValue = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (normalizedValue.includes(normalizedQuery)) return true;

  return queryTokens.every((token) => normalizedValue.includes(token));
};

const calculateAge = (nascimento: string) => {
  if (!nascimento) return 0;
  try {
    const birthDate = parse(nascimento, 'dd/MM/yyyy', new Date());
    return differenceInYears(new Date(), birthDate);
  } catch {
    return 0;
  }
};

const AGE_BUCKETS = ["Crian\u00E7a", "Jovem", "Adulto", "Idoso"] as const;
const AGE_BUCKET_RANGES: Record<(typeof AGE_BUCKETS)[number], string> = {
  "Crian\u00E7a": "0-7 anos",
  "Jovem": "8-17 anos",
  "Adulto": "18-59 anos",
  "Idoso": "60+ anos",
};

const getAgeBucket = (nascimento: string) => {
  const age = calculateAge(nascimento);
  if (age <= 7) return "Crian\u00E7a";
  if (age <= 17) return "Jovem";
  if (age <= 59) return "Adulto";
  return "Idoso";
};

/* ---------- Types ---------- */
type StatType = "unidades" | "convenios" | "faixaEtaria" | "exames" | "historico" | "origem" | "motivacao" | "cirurgia";
type FilterCategory = "unidade" | "convenio" | "faixaEtaria" | "exame" | "origem" | "motivacao" | "cirurgia";

interface FilterOptionItem {
  value: string;
  label: string;
}

interface CardData {
  id: string;
  title: string;
  subtitle: string;
  count: number;
  value?: number; // Optional financial value
  icon?: React.ReactNode;
  topConvenios?: { name: string; count: number; value: number }[]; // For detailed breakdown
  topFaixas?: { name: string; count: number; value: number }[]; // For age breakdown
  topExames?: { name: string; count: number; value: number }[]; // For exam breakdown
  topUnidades?: { name: string; count: number; value: number }[]; // For unit breakdown
  topOrigens?: { name: string; count: number; value: number }[];
  topMotivacoes?: { name: string; count: number; value: number }[];
  topCirurgias?: { name: string; count: number; value: number }[];
  ratingSum?: number;
  ratingCount?: number;
  cancellationCount?: number;
}

/* =============================================================
   PÁGINA INICIAL MERGED (HOME + STATISTICS)
   ============================================================= */
export default function Home() {
  const router = useRouter();
  /* ---------- state ---------- */
  const [patientData, setPatientData] = useState<Record<string, Record<string, any>>>({});
  const [cancellationData, setCancellationData] = useState<Record<string, Record<string, any>>>({});
  const [unitConfig, setUnitConfig] = useState<Record<string, { bairro?: string; empresa?: string }>>({});
  const [examConfig, setExamConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const [periodMode, setPeriodMode] = useState<'month' | 'year'>('month');

  // Filters (Shared)
  const [filter, setFilter] = useState<string>("");

  // Advanced States
  const [statType, setStatType] = useState<StatType>("unidades");
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("unidade");
  const [filterValue, setFilterValue] = useState<string>("all");
  const [optionQuery, setOptionQuery] = useState("");
  const [isOptionInputFocused, setIsOptionInputFocused] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [sortColumn, setSortColumn] = useState<"title" | "count" | "percentage" | "value" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Drill-down states
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [activeDrillDown, setActiveDrillDown] = useState<{ title: string; patients: AppointmentDetail[] } | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const analyticSelectItemClassName =
    "text-[13px] font-medium text-slate-900 data-[highlighted]:bg-blue-700 data-[highlighted]:text-white";

  const toggleCardExpansion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null);

  /* ---------- get unit from localStorage ---------- */
  useEffect(() => {
    const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
    if (storedPathBase) setSelectedUnit(storedPathBase);
  }, []);

  useEffect(() => {
    const handleStorageChange = () => {
      const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
      if (storedPathBase && storedPathBase !== selectedUnit) {
        setSelectedUnit(storedPathBase);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [selectedUnit]);

  useEffect(() => {
    const resetHomeFilters = () => {
      setStatType("unidades");
      setFilterCategory("unidade");
      setFilterValue("all");
      setOptionQuery("");
      setIsOptionInputFocused(false);
      setPeriodMode("month");
      setFilter("");
    };

    window.addEventListener(HOME_FILTERS_RESET_EVENT, resetHomeFilters);
    return () => window.removeEventListener(HOME_FILTERS_RESET_EVENT, resetHomeFilters);
  }, []);

  /* ---------- RTDB listeners ---------- */
  useEffect(() => {
    const db = getDatabaseInstance(ENVIRONMENT);
    const pathBase = getFirebasePathBase();
    const node = pathBase === 'OFT/45' ? 'medicos' : 'unidades';

    const agRef = ref(db, `/${pathBase}/agendamentoWhatsApp/operacional/consultasAgendadas/${node}`);
    const cancelRef = ref(db, `/${pathBase}/agendamentoWhatsApp/operacional/consultasCanceladas/${node}`);
    const offAg = onValue(agRef, snap => {
      setPatientData(snap.exists() ? (snap.val() as any) : {});
      setLoading(false);
    });
    const offCancel = onValue(cancelRef, snap => {
      setCancellationData(snap.exists() ? (snap.val() as any) : {});
    });

    const cfgRef = ref(db, `/${pathBase}/agendamentoWhatsApp/configuracoes/${node}`);
    const offCfg = onValue(cfgRef, snap => {
      setUnitConfig(snap.exists() ? (snap.val() as any) : {});
    });

    const examesRef = ref(db, `/DRM/agendamentoWhatsApp/configuracoes/exames`);
    const offExames = onValue(examesRef, snap => {
      setExamConfig(snap.exists() ? (snap.val() as any) : {});
    });

    return () => {
      offAg();
      offCancel();
      offCfg();
      offExames();
    };
  }, []);

  /* ---------- Sync Filter Category with Stat Type ---------- */
  useEffect(() => {
    // Map statType to corresponding filterCategory
    const mapping: Record<StatType, FilterCategory> = {
      "unidades": "unidade",
      "convenios": "convenio",
      "faixaEtaria": "faixaEtaria",
      "exames": "exame",
      "origem": "origem",
      "motivacao": "motivacao",
      "cirurgia": "cirurgia",
      "historico": "unidade" // Default to unidade for historico
    };

    const newFilterCategory = mapping[statType];
    if (newFilterCategory) {
      setFilterCategory(newFilterCategory);
      setFilterValue("all"); // Always set to "all" when changing statType
    }
  }, [statType]);

  useEffect(() => {
    if (filterCategory === 'unidade' || filterCategory === 'convenio' || filterCategory === 'faixaEtaria' || filterCategory === 'exame' || filterCategory === 'origem' || filterCategory === 'motivacao' || filterCategory === 'cirurgia') {
      setFilterValue("all");
    } else {
      setFilterValue("");
    }
  }, [filterCategory]);

  useEffect(() => {
    setOptionQuery(filterValue === "all" ? "" : filterValue);
  }, [filterValue]);

  /* ---------- Available Options (Memoized) ---------- */
  const unitsAvailable = useMemo(() => Object.keys(patientData).sort(), [patientData]);

  const conveniosAvailable = useMemo(() => {
    const set = new Set<string>();
    for (const unit in patientData) {
      for (const date in patientData[unit]) {
        const hours = patientData[unit][date];
        for (const time in hours) {
          const c = hours[time]?.convenio;
          if (c) set.add(c);
        }
      }
    }
    return Array.from(set).sort();
  }, [patientData]);

  const examesAvailable = useMemo(() => {
    const set = new Set<string>();
    for (const unit in patientData) {
      for (const date in patientData[unit]) {
        const hours = patientData[unit][date];
        for (const time in hours) {
          const examList = hours[time]?.exames;
          if (Array.isArray(examList)) examList.forEach(ex => set.add(ex));
        }
      }
    }
    return Array.from(set).sort();
  }, [patientData]);

  const faixasEtariasAvailable = AGE_BUCKETS;

  const motivacoesAvailable = useMemo(() => {
    const counts = new Map<string, number>();
    for (const unit in patientData) {
      for (const date in patientData[unit]) {
        const hours = patientData[unit][date];
        for (const time in hours) {
          const motivacao = String(hours[time]?.motivacao || "").trim();
          if (!motivacao) continue;
          counts.set(motivacao, (counts.get(motivacao) || 0) + 1);
        }
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([motivacao]) => motivacao);
  }, [patientData]);

  const cirurgiasAvailable = useMemo(() => {
    const counts = new Map<string, number>();
    for (const unit in patientData) {
      for (const date in patientData[unit]) {
        const hours = patientData[unit][date];
        for (const time in hours) {
          const cirurgia = String(hours[time]?.cirurgia || "").trim();
          if (!cirurgia) continue;
          counts.set(cirurgia, (counts.get(cirurgia) || 0) + 1);
        }
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([cirurgia]) => cirurgia);
  }, [patientData]);

  const filterOptions = useMemo<FilterOptionItem[]>(() => {
    if (filterCategory === "unidade") {
      return unitsAvailable.map((u) => ({
        value: u,
        label: `${unitConfig?.[u]?.empresa ?? u}${unitConfig?.[u]?.bairro ? ` - ${unitConfig?.[u]?.bairro}` : ""}`,
      }));
    }

    if (filterCategory === "convenio") {
      return conveniosAvailable.map((c) => ({ value: c, label: c }));
    }

    if (filterCategory === "faixaEtaria") {
      return faixasEtariasAvailable.map((f) => ({ value: f, label: f }));
    }

    if (filterCategory === "exame") {
      return examesAvailable.map((e) => ({ value: e, label: e }));
    }

    if (filterCategory === "origem") {
      return [
        { value: "Google", label: "Google" },
        { value: "Instagram", label: "Instagram" },
        { value: "Desconhecido", label: "Desconhecida" },
      ];
    }

    if (filterCategory === "motivacao") {
      return motivacoesAvailable.map((m) => ({ value: m, label: m }));
    }

    if (filterCategory === "cirurgia") {
      return cirurgiasAvailable.map((c) => ({ value: c, label: c }));
    }

    return [];
  }, [cirurgiasAvailable, conveniosAvailable, examesAvailable, faixasEtariasAvailable, filterCategory, motivacoesAvailable, unitConfig, unitsAvailable]);

  const filteredOptionSuggestions = useMemo(() => {
    if (!optionQuery.trim()) {
      return filterOptions.slice(0, 12);
    }

    const normalizedQuery = normalizeSearchText(optionQuery);

    return [...filterOptions]
      .filter((option) => matchesSearchText(option.label, optionQuery))
      .sort((a, b) => {
        const aStarts = normalizeSearchText(a.label).startsWith(normalizedQuery);
        const bStarts = normalizeSearchText(b.label).startsWith(normalizedQuery);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.label.localeCompare(b.label);
      })
      .slice(0, 12);
  }, [filterOptions, optionQuery]);

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const unit in patientData) {
      for (const d in patientData[unit]) {
        const nome = obterNomeMes(d);
        if (nome) set.add(nome);
      }
    }
    return Array.from(set).sort((a, b) => {
      const [mA, yA] = a.split(" de ");
      const [mB, yB] = b.split(" de ");
      const idxA = MESES.indexOf(mA);
      const idxB = MESES.indexOf(mB);
      return Number(yA) === Number(yB) ? idxA - idxB : Number(yA) - Number(yB);
    });
  }, [patientData]);

  const anosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const unit in patientData) {
      for (const d in patientData[unit]) set.add(obterAno(d));
    }
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [patientData]);

  /* ---------- Default Filter ---------- */
  useEffect(() => {
    if (!filter) {
      const now = new Date();
      if (statType === "historico" || periodMode === "year") {
        setFilter(String(now.getFullYear()));
      } else {
        const monthYear = `${MESES[now.getMonth()]} de ${now.getFullYear()}`;
        setFilter(monthYear);
      }
    }
  }, [filter, statType, periodMode]);

  /* ---------- Navigational Period Filter Helpers ---------- */
  const handlePeriodChange = (direction: 'prev' | 'next') => {
    if (statType === 'historico' || periodMode === 'year') {
      // Navigating Years
      const years = [...anosDisponiveis].sort((a, b) => Number(a) - Number(b)); // Ascending
      const currentYearStr = filter.includes(' de ') ? filter.split(' de ')[1] : filter;
      const currentIndex = years.indexOf(currentYearStr);

      if (direction === 'prev' && currentIndex > 0) {
        setFilter(years[currentIndex - 1]);
      } else if (direction === 'next' && currentIndex < years.length - 1) {
        setFilter(years[currentIndex + 1]);
      }
    } else {
      // Navigating Months
      const months = [...mesesDisponiveis]; // Assumes months are already sorted chronologically
      const currentIndex = months.indexOf(filter);

      if (direction === 'prev' && currentIndex > 0) {
        setFilter(months[currentIndex - 1]);
      } else if (direction === 'next' && currentIndex < months.length - 1) {
        setFilter(months[currentIndex + 1]);
      }
    }
  };

  const isPrevDisabled = useMemo(() => {
    if (statType === 'historico' || periodMode === 'year') {
      const years = [...anosDisponiveis].sort((a, b) => Number(a) - Number(b));
      const currentYearStr = filter.includes(' de ') ? filter.split(' de ')[1] : filter;
      return years.indexOf(currentYearStr) <= 0;
    } else {
      return mesesDisponiveis.indexOf(filter) <= 0;
    }
  }, [filter, statType, periodMode, anosDisponiveis, mesesDisponiveis]);

  const isNextDisabled = useMemo(() => {
    if (statType === 'historico' || periodMode === 'year') {
      const years = [...anosDisponiveis].sort((a, b) => Number(a) - Number(b));
      const currentYearStr = filter.includes(' de ') ? filter.split(' de ')[1] : filter;
      return years.indexOf(currentYearStr) >= years.length - 1;
    } else {
      return mesesDisponiveis.indexOf(filter) >= mesesDisponiveis.length - 1;
    }
  }, [filter, statType, periodMode, anosDisponiveis, mesesDisponiveis]);

  const togglePeriodMode = () => {
    if (periodMode === 'year') {
      setPeriodMode('month');
      // Set to current month of the currently selected year, or just now if unavailable
      const yearFromFilter = filter;
      const now = new Date();
      const monthYear = `${MESES[now.getMonth()]} de ${yearFromFilter}`;
      if (mesesDisponiveis.includes(monthYear)) {
        setFilter(monthYear);
      } else if (mesesDisponiveis.some(m => m.endsWith(yearFromFilter))) {
        setFilter(mesesDisponiveis.filter(m => m.endsWith(yearFromFilter))[0]);
      } else {
        setFilter(`${MESES[now.getMonth()]} de ${now.getFullYear()}`);
      }
    } else {
      setPeriodMode('year');
      // Set filter to the year of the currently selected month
      const justYear = filter.includes(' de ') ? filter.split(' de ')[1] : filter;
      if (anosDisponiveis.includes(justYear)) {
        setFilter(justYear);
      }
    }
  };

  /* ---------- Drill-down states ---------- */


  /* ---------- Data Processing Logic (Unified) ---------- */
  const filteredAppointments = useMemo(() => {
    if (!filter) return [];

    let appointments: any[] = [];
    const filterYear = filter === 'all' ? null : (filter.includes(" de ") ? filter.split(" de ")[1] : filter);
    const filterMonthStr = filter.includes(" de ") ? filter : null;

    // 1. Traverse Data
    for (const unit in patientData) {
      for (const date in patientData[unit]) {
        const apptMonthStr = obterNomeMes(date);
        const apptYear = obterAno(date);

        const hours = patientData[unit][date];
        for (const time in hours) {
          let include = false;

          if (statType === 'historico') {
            if (filterYear === null || apptYear === filterYear) include = true;
          } else {
            if (filterMonthStr) {
              if (apptMonthStr === filterMonthStr) include = true;
            } else if (filterYear) {
              if (apptYear === filterYear) include = true;
            }
          }

          if (include) {
            let appValue = 0;
            const isParticular = hours[time].convenio?.trim().toLowerCase() === "particular";
            const examPrices: Record<string, number> = {};
            const examesArray = Array.isArray(hours[time].exames) ? hours[time].exames : [];
            
            if (date < "2026-03-01" || selectedUnit !== "DRM" || !isParticular) {
               appValue = 30; // Regra antiga / Plano de Saúde
               const count = examesArray.length;
               if (count > 0) {
                 examesArray.forEach((ex: string) => {
                   examPrices[ex] = 30 / count;
                 });
               }
            } else {
               // Particular: soma valor configurado
               let sum = 0;
               examesArray.forEach((exName: string) => {
                   const conf = examConfig[exName];
                   let priceDrMelo = conf?.drMelo;

                   // Preparação para futura alteração onde drMelo será separado por unidade
                   if (priceDrMelo && typeof priceDrMelo === 'object') {
                       priceDrMelo = priceDrMelo[unit] || 0;
                   }

                   let examVal = 0;
                   if (typeof priceDrMelo === 'number') {
                       examVal = priceDrMelo;
                   } else if (typeof priceDrMelo === 'string') {
                       if (!priceDrMelo.toLowerCase().includes("incluso")) {
                           const parsed = Number(priceDrMelo.replace(/[^\d.,]/g, '').replace(',', '.'));
                           if (!isNaN(parsed)) examVal = parsed;
                       }
                   }
                   examPrices[exName] = examVal;
                   sum += examVal;
               });
               appValue = sum;
            }

            const app = { ...hours[time], _unit: unit, _date: date, _time: time, _value: appValue, _examPrices: examPrices };

            if (filterCategory === 'convenio' && filterValue && filterValue !== 'all' && !matchesSearchText(app.convenio || "", filterValue)) continue;
            if (filterCategory === 'exame' && filterValue && filterValue !== 'all') {
              if (!Array.isArray(app.exames) || !app.exames.some((ex: string) => matchesSearchText(ex, filterValue))) continue;
            }
            if (filterCategory === 'faixaEtaria' && filterValue && filterValue !== 'all') {
              const bucket = getAgeBucket(app.nascimento);
              if (bucket !== filterValue) continue;
            }
            if (filterCategory === 'unidade' && filterValue && filterValue !== 'all') {
              const unitLabel = `${unitConfig?.[app._unit]?.empresa ?? app._unit}${unitConfig?.[app._unit]?.bairro ? ` - ${unitConfig?.[app._unit]?.bairro}` : ""}`;
              if (!matchesSearchText(unitLabel, filterValue) && !matchesSearchText(app._unit, filterValue)) continue;
            }
            if (filterCategory === 'origem' && filterValue && filterValue !== 'all') {
              const origVal = normalizePatientOrigin(app.origem);
              if (!matchesSearchText(origVal, filterValue)) continue;
            }
            if (filterCategory === 'motivacao' && filterValue && filterValue !== 'all') {
              if (!matchesSearchText(app.motivacao || "", filterValue)) continue;
            }
            if (filterCategory === 'cirurgia' && filterValue && filterValue !== 'all') {
              if (!matchesSearchText(app.cirurgia || "", filterValue)) continue;
            }

            appointments.push(app);
          }
        }
      }
    }
    return appointments;
  }, [patientData, filter, statType, filterCategory, filterValue, examConfig, selectedUnit, unitConfig]);

  const filteredCancellations = useMemo(() => {
    if (!filter) return [];

    const cancellations: any[] = [];
    const filterYear = filter === 'all' ? null : (filter.includes(" de ") ? filter.split(" de ")[1] : filter);
    const filterMonthStr = filter.includes(" de ") ? filter : null;

    for (const unit in cancellationData) {
      for (const date in cancellationData[unit]) {
        const cancelMonthStr = obterNomeMes(date);
        const cancelYear = obterAno(date);

        const hours = cancellationData[unit][date];
        for (const time in hours) {
          let include = false;

          if (statType === 'historico') {
            if (filterYear === null || cancelYear === filterYear) include = true;
          } else {
            if (filterMonthStr) {
              if (cancelMonthStr === filterMonthStr) include = true;
            } else if (filterYear) {
              if (cancelYear === filterYear) include = true;
            }
          }

          if (include) {
            const app = { ...hours[time], _unit: unit, _date: date, _time: time };

            if (filterCategory === 'convenio' && filterValue && filterValue !== 'all' && !matchesSearchText(app.convenio || "", filterValue)) continue;
            if (filterCategory === 'exame' && filterValue && filterValue !== 'all') {
              if (!Array.isArray(app.exames) || !app.exames.some((ex: string) => matchesSearchText(ex, filterValue))) continue;
            }
            if (filterCategory === 'faixaEtaria' && filterValue && filterValue !== 'all') {
              const bucket = getAgeBucket(app.nascimento);
              if (bucket !== filterValue) continue;
            }
            if (filterCategory === 'unidade' && filterValue && filterValue !== 'all') {
              const unitLabel = `${unitConfig?.[app._unit]?.empresa ?? app._unit}${unitConfig?.[app._unit]?.bairro ? ` - ${unitConfig?.[app._unit]?.bairro}` : ""}`;
              if (!matchesSearchText(unitLabel, filterValue) && !matchesSearchText(app._unit, filterValue)) continue;
            }
            if (filterCategory === 'origem' && filterValue && filterValue !== 'all') {
              const origVal = normalizePatientOrigin(app.origem);
              if (!matchesSearchText(origVal, filterValue)) continue;
            }
            if (filterCategory === 'motivacao' && filterValue && filterValue !== 'all') {
              if (!matchesSearchText(app.motivacao || "", filterValue)) continue;
            }
            if (filterCategory === 'cirurgia' && filterValue && filterValue !== 'all') {
              if (!matchesSearchText(app.cirurgia || "", filterValue)) continue;
            }

            cancellations.push(app);
          }
        }
      }
    }

    return cancellations;
  }, [cancellationData, filter, statType, filterCategory, filterValue, unitConfig]);

  const displayData = useMemo<CardData[]>(() => {
    const appointments = filteredAppointments;
    if (appointments.length === 0) return [];

    const getExamValue = (exName: string, app: any) => {
      return app._examPrices?.[exName] || 0;
    };

    // 2. Aggregate
    if (statType === "historico") {
      const sortMonths = ([a]: [string, any], [b]: [string, any]) => {
        const [mA, yA] = a.split(" de ");
        const [mB, yB] = b.split(" de ");
        const idxA = MESES.indexOf(mA);
        const idxB = MESES.indexOf(mB);
        return Number(yA) === Number(yB) ? idxA - idxB : Number(yA) - Number(yB);
      };

      if (filterCategory === "unidade" && filterValue === "all") {
        const monthlyUnits: Record<string, Record<string, { count: number; value: number }>> = {};
        const monthlyCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const month = obterNomeMes(app._date);
          if (!month) return;

          if (!monthlyCounts[month]) monthlyCounts[month] = { count: 0, value: 0 };
          monthlyCounts[month].count += 1;
          monthlyCounts[month].value += app._value;

          if (!monthlyUnits[month]) monthlyUnits[month] = {};
          if (!monthlyUnits[month][app._unit]) monthlyUnits[month][app._unit] = { count: 0, value: 0 };
          monthlyUnits[month][app._unit].count += 1;
          monthlyUnits[month][app._unit].value += app._value;
        });

        return Object.entries(monthlyCounts)
          .sort(sortMonths)
          .map(([name, data]) => ({
            id: name,
            title: name.split(" de ")[0],
            subtitle: name.split(" de ")[1],
            count: data.count,
            value: data.value,
            icon: <BarChart3 className="h-5 w-5 text-indigo-500" />,
            topUnidades: Object.entries(monthlyUnits[name] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([unit, breakdown]) => ({
                name: unitConfig?.[unit]?.empresa ?? unit,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "convenio" && filterValue === "all") {
        const monthlyConvenios: Record<string, Record<string, { count: number; value: number }>> = {};
        const monthlyCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const month = obterNomeMes(app._date);
          if (!month) return;

          const convenio = app.convenio || "Não informado";
          if (!monthlyCounts[month]) monthlyCounts[month] = { count: 0, value: 0 };
          monthlyCounts[month].count += 1;
          monthlyCounts[month].value += app._value;

          if (!monthlyConvenios[month]) monthlyConvenios[month] = {};
          if (!monthlyConvenios[month][convenio]) monthlyConvenios[month][convenio] = { count: 0, value: 0 };
          monthlyConvenios[month][convenio].count += 1;
          monthlyConvenios[month][convenio].value += app._value;
        });

        return Object.entries(monthlyCounts)
          .sort(sortMonths)
          .map(([name, data]) => ({
            id: name,
            title: name.split(" de ")[0],
            subtitle: name.split(" de ")[1],
            count: data.count,
            value: data.value,
            icon: <BarChart3 className="h-5 w-5 text-indigo-500" />,
            topConvenios: Object.entries(monthlyConvenios[name] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([convenio, breakdown]) => ({
                name: convenio,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "faixaEtaria" && filterValue === "all") {
        const monthlyFaixas: Record<string, Record<string, { count: number; value: number }>> = {};
        const monthlyCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const month = obterNomeMes(app._date);
          if (!month) return;

          const faixa = getAgeBucket(app.nascimento) || "Desconhecido";
          if (!monthlyCounts[month]) monthlyCounts[month] = { count: 0, value: 0 };
          monthlyCounts[month].count += 1;
          monthlyCounts[month].value += app._value;

          if (!monthlyFaixas[month]) monthlyFaixas[month] = {};
          if (!monthlyFaixas[month][faixa]) monthlyFaixas[month][faixa] = { count: 0, value: 0 };
          monthlyFaixas[month][faixa].count += 1;
          monthlyFaixas[month][faixa].value += app._value;
        });

        return Object.entries(monthlyCounts)
          .sort(sortMonths)
          .map(([name, data]) => ({
            id: name,
            title: name.split(" de ")[0],
            subtitle: name.split(" de ")[1],
            count: data.count,
            value: data.value,
            icon: <BarChart3 className="h-5 w-5 text-indigo-500" />,
            topFaixas: Object.entries(monthlyFaixas[name] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([faixa, breakdown]) => ({
                name: faixa,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "exame" && filterValue === "all") {
        const monthlyExames: Record<string, Record<string, { count: number; value: number }>> = {};
        const monthlyCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const month = obterNomeMes(app._date);
          if (!month) return;

          if (!monthlyCounts[month]) monthlyCounts[month] = { count: 0, value: 0 };
          monthlyCounts[month].count += 1;
          monthlyCounts[month].value += app._value;

          if (!monthlyExames[month]) monthlyExames[month] = {};
          if (Array.isArray(app.exames)) {
            app.exames.forEach((exam: string) => {
              if (!monthlyExames[month][exam]) monthlyExames[month][exam] = { count: 0, value: 0 };
              monthlyExames[month][exam].count += 1;
              monthlyExames[month][exam].value += getExamValue(exam, app);
            });
          }
        });

        return Object.entries(monthlyCounts)
          .sort(sortMonths)
          .map(([name, data]) => ({
            id: name,
            title: name.split(" de ")[0],
            subtitle: name.split(" de ")[1],
            count: data.count,
            value: data.value,
            icon: <BarChart3 className="h-5 w-5 text-indigo-500" />,
            topExames: Object.entries(monthlyExames[name] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([exam, breakdown]) => ({
                name: exam,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "origem" && filterValue === "all") {
        const monthlyOrigens: Record<string, Record<string, { count: number; value: number }>> = {};
        const monthlyCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const month = obterNomeMes(app._date);
          if (!month) return;

          const origem = normalizePatientOrigin(app.origem);
          if (!monthlyCounts[month]) monthlyCounts[month] = { count: 0, value: 0 };
          monthlyCounts[month].count += 1;
          monthlyCounts[month].value += app._value;

          if (!monthlyOrigens[month]) monthlyOrigens[month] = {};
          if (!monthlyOrigens[month][origem]) monthlyOrigens[month][origem] = { count: 0, value: 0 };
          monthlyOrigens[month][origem].count += 1;
          monthlyOrigens[month][origem].value += app._value;
        });

        return Object.entries(monthlyCounts)
          .sort(sortMonths)
          .map(([name, data]) => ({
            id: name,
            title: name.split(" de ")[0],
            subtitle: name.split(" de ")[1],
            count: data.count,
            value: data.value,
            icon: <BarChart3 className="h-5 w-5 text-indigo-500" />,
            topOrigens: Object.entries(monthlyOrigens[name] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([origem, breakdown]) => ({
                name: getOriginLabel(origem),
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "motivacao" && filterValue === "all") {
        const monthlyMotivacoes: Record<string, Record<string, { count: number; value: number }>> = {};
        const monthlyCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const month = obterNomeMes(app._date);
          if (!month) return;

          const motivacao = String(app.motivacao || "N\u00E3o informado").trim() || "N\u00E3o informado";
          if (!monthlyCounts[month]) monthlyCounts[month] = { count: 0, value: 0 };
          monthlyCounts[month].count += 1;
          monthlyCounts[month].value += app._value;

          if (!monthlyMotivacoes[month]) monthlyMotivacoes[month] = {};
          if (!monthlyMotivacoes[month][motivacao]) monthlyMotivacoes[month][motivacao] = { count: 0, value: 0 };
          monthlyMotivacoes[month][motivacao].count += 1;
          monthlyMotivacoes[month][motivacao].value += app._value;
        });

        return Object.entries(monthlyCounts)
          .sort(sortMonths)
          .map(([name, data]) => ({
            id: name,
            title: name.split(" de ")[0],
            subtitle: name.split(" de ")[1],
            count: data.count,
            value: data.value,
            icon: <BarChart3 className="h-5 w-5 text-indigo-500" />,
            topMotivacoes: Object.entries(monthlyMotivacoes[name] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([motivacao, breakdown]) => ({
                name: motivacao,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "cirurgia" && filterValue === "all") {
        const monthlyCirurgias: Record<string, Record<string, { count: number; value: number }>> = {};
        const monthlyCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const month = obterNomeMes(app._date);
          if (!month) return;

          const cirurgia = String(app.cirurgia || "N\u00E3o informado").trim() || "N\u00E3o informado";
          if (!monthlyCounts[month]) monthlyCounts[month] = { count: 0, value: 0 };
          monthlyCounts[month].count += 1;
          monthlyCounts[month].value += app._value;

          if (!monthlyCirurgias[month]) monthlyCirurgias[month] = {};
          if (!monthlyCirurgias[month][cirurgia]) monthlyCirurgias[month][cirurgia] = { count: 0, value: 0 };
          monthlyCirurgias[month][cirurgia].count += 1;
          monthlyCirurgias[month][cirurgia].value += app._value;
        });

        return Object.entries(monthlyCounts)
          .sort(sortMonths)
          .map(([name, data]) => ({
            id: name,
            title: name.split(" de ")[0],
            subtitle: name.split(" de ")[1],
            count: data.count,
            value: data.value,
            icon: <BarChart3 className="h-5 w-5 text-indigo-500" />,
            topCirurgias: Object.entries(monthlyCirurgias[name] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([cirurgia, breakdown]) => ({
                name: cirurgia,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      const monthlyCounts: Record<string, number> = {};
      const monthlyValues: Record<string, number> = {};
      appointments.forEach(app => {
        const m = obterNomeMes(app._date);
        if (m) {
          monthlyCounts[m] = (monthlyCounts[m] || 0) + 1;
          monthlyValues[m] = (monthlyValues[m] || 0) + app._value;
        }
      });
      return Object.entries(monthlyCounts)
        .sort(sortMonths)
        .map(([name, count]) => ({
          id: name,
          title: name.split(" de ")[0],
          subtitle: name.split(" de ")[1],
          count,
          value: monthlyValues[name],
          icon: <BarChart3 className="h-5 w-5 text-indigo-500" />
        }));
    }

    if (statType === "unidades") {
      const cancellationCountsByUnit = filteredCancellations.reduce<Record<string, number>>((acc, app) => {
        acc[app._unit] = (acc[app._unit] || 0) + 1;
        return acc;
      }, {});

      // Logic for "Unidades" + "Convenio" + "All" => Show Top 3 Convenios per Unit
      if (filterCategory === 'convenio' && filterValue === 'all') {
        const unitConvenios: Record<string, Record<string, { count: number, value: number }>> = {};
        const unitCounts: Record<string, { count: number, value: number, ratingSum: number, ratingCount: number, noShows: number }> = {};

        appointments.forEach(app => {
          const u = app._unit;
          const c = app.convenio || "N\u00E3o informado";

          if (!unitCounts[u]) unitCounts[u] = { count: 0, value: 0, ratingSum: 0, ratingCount: 0, noShows: 0 };
          unitCounts[u].count += 1;
          unitCounts[u].value += app._value;

          const sat = app.pesquisaSatisfacao;
          if (sat?.estrelas) { unitCounts[u].ratingSum += Number(sat.estrelas) || 0; unitCounts[u].ratingCount += 1; }
          if (sat?.botao === 'naoCompareceu' || sat?.naoCompareceu === true || app.botao === 'naoCompareceu' || app.naoCompareceu === true) unitCounts[u].noShows += 1;

          if (!unitConvenios[u]) unitConvenios[u] = {};
          if (!unitConvenios[u][c]) unitConvenios[u][c] = { count: 0, value: 0 };
          unitConvenios[u][c].count += 1;
          unitConvenios[u][c].value += app._value;
        });

        return Object.keys(unitCounts).sort().map(unit => {
          const breakdown = unitConvenios[unit] || {};
          const top3 = Object.entries(breakdown)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([name, data]) => ({ name, count: data.count, value: data.value }));

          return {
            id: unit,
            title: unit.charAt(0).toUpperCase() + unit.slice(1),
            subtitle: unitConfig?.[unit]?.bairro ?? (selectedUnit === 'OFT/45' ? "M\u00E9dico" : "Unidade"),
            count: unitCounts[unit].count,
            value: unitCounts[unit].value,
            ratingSum: unitCounts[unit].ratingSum,
            ratingCount: unitCounts[unit].ratingCount,
            cancellationCount: cancellationCountsByUnit[unit] || 0,
            topConvenios: top3
          };
        });
      }

      // Logic for "Unidades" + "Faixa Etaria" + "All" => Show Age Breakdown per Unit
      if (filterCategory === 'faixaEtaria' && filterValue === 'all') {
        const unitFaixas: Record<string, Record<string, { count: number, value: number }>> = {};
        const unitCounts: Record<string, { count: number, value: number, ratingSum: number, ratingCount: number, noShows: number }> = {};

        appointments.forEach(app => {
          const u = app._unit;
          const bucket = getAgeBucket(app.nascimento) || "Desconhecido";

          if (!unitCounts[u]) unitCounts[u] = { count: 0, value: 0, ratingSum: 0, ratingCount: 0, noShows: 0 };
          unitCounts[u].count += 1;
          unitCounts[u].value += app._value;

          const sat = app.pesquisaSatisfacao;
          if (sat?.estrelas) { unitCounts[u].ratingSum += Number(sat.estrelas) || 0; unitCounts[u].ratingCount += 1; }
          if (sat?.botao === 'naoCompareceu' || sat?.naoCompareceu === true || app.botao === 'naoCompareceu' || app.naoCompareceu === true) unitCounts[u].noShows += 1;

          if (!unitFaixas[u]) unitFaixas[u] = {};
          if (!unitFaixas[u][bucket]) unitFaixas[u][bucket] = { count: 0, value: 0 };
          unitFaixas[u][bucket].count += 1;
          unitFaixas[u][bucket].value += app._value;
        });

        return Object.keys(unitCounts).sort().map(unit => {
          const breakdown = unitFaixas[unit] || {};
          // Show Top 3 Age Groups by count
          const faixas = Object.entries(breakdown)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([name, data]) => ({ name, count: data.count, value: data.value }));

          return {
            id: unit,
            title: unit.charAt(0).toUpperCase() + unit.slice(1),
            subtitle: unitConfig?.[unit]?.bairro ?? (selectedUnit === 'OFT/45' ? "M\u00E9dico" : "Unidade"),
            count: unitCounts[unit].count,
            value: unitCounts[unit].value,
            ratingSum: unitCounts[unit].ratingSum,
            ratingCount: unitCounts[unit].ratingCount,
            cancellationCount: cancellationCountsByUnit[unit] || 0,
            topFaixas: faixas
          };
        });
      }

      // Logic for "Unidades" + "Exame" + "All" => Show Top 3 Exams per Unit
      if (filterCategory === 'exame' && filterValue === 'all') {
        const unitExames: Record<string, Record<string, { count: number, value: number }>> = {};
        const unitCounts: Record<string, { count: number, value: number, ratingSum: number, ratingCount: number, noShows: number }> = {};

        appointments.forEach(app => {
          const u = app._unit;
          if (!unitCounts[u]) unitCounts[u] = { count: 0, value: 0, ratingSum: 0, ratingCount: 0, noShows: 0 };
          unitCounts[u].count += 1;
          unitCounts[u].value += app._value;

          const sat = app.pesquisaSatisfacao;
          if (sat?.estrelas) { unitCounts[u].ratingSum += Number(sat.estrelas) || 0; unitCounts[u].ratingCount += 1; }
          if (sat?.botao === 'naoCompareceu' || sat?.naoCompareceu === true || app.botao === 'naoCompareceu' || app.naoCompareceu === true) unitCounts[u].noShows += 1;

          if (!unitExames[u]) unitExames[u] = {};
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              if (!unitExames[u][ex]) unitExames[u][ex] = { count: 0, value: 0 };
              unitExames[u][ex].count += 1;
              unitExames[u][ex].value += getExamValue(ex, app);
            });
          }
        });

        return Object.keys(unitCounts).sort().map(unit => {
          const breakdown = unitExames[unit] || {};
          const top3 = Object.entries(breakdown)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([name, data]) => ({ name, count: data.count, value: data.value }));

          return {
            id: unit,
            title: unit.charAt(0).toUpperCase() + unit.slice(1),
            subtitle: unitConfig?.[unit]?.bairro ?? (selectedUnit === 'OFT/45' ? "M\u00E9dico" : "Unidade"),
            count: unitCounts[unit].count,
            value: unitCounts[unit].value,
            ratingSum: unitCounts[unit].ratingSum,
            ratingCount: unitCounts[unit].ratingCount,
            cancellationCount: cancellationCountsByUnit[unit] || 0,
            topExames: top3
          };
        });
      }

      // Default Logic (Count only)
      const counts: Record<string, { count: number, value: number, ratingSum: number, ratingCount: number, noShows: number }> = {};
      appointments.forEach(app => {
        if (!counts[app._unit]) counts[app._unit] = { count: 0, value: 0, ratingSum: 0, ratingCount: 0, noShows: 0 };
        counts[app._unit].count += 1;
        counts[app._unit].value += app._value;

        const sat = app.pesquisaSatisfacao;
        if (sat?.estrelas) { counts[app._unit].ratingSum += Number(sat.estrelas) || 0; counts[app._unit].ratingCount += 1; }
        if (sat?.botao === 'naoCompareceu' || sat?.naoCompareceu === true || app.botao === 'naoCompareceu' || app.naoCompareceu === true) counts[app._unit].noShows += 1;
      });

      // Always sort by Count Descending (as requested for List View consistency)
      const entries = Object.keys(counts).sort((a, b) => counts[b].count - counts[a].count);

      return entries.map(unit => ({
        id: unit,
        title: unit.charAt(0).toUpperCase() + unit.slice(1),
        subtitle: unitConfig?.[unit]?.bairro ?? (selectedUnit === 'OFT/45' ? "M\u00E9dico" : "Unidade"),
        count: counts[unit].count,
        value: counts[unit].value,
        ratingSum: counts[unit].ratingSum,
        ratingCount: counts[unit].ratingCount,
        cancellationCount: cancellationCountsByUnit[unit] || 0
      }));
    }

    if (statType === "convenios") {
      // Logic for "Convenios" + "Unidade" + "All" => Show Top 3 Units per Convenio
      if (filterCategory === 'unidade' && filterValue === 'all') {
        const convenioUnidades: Record<string, Record<string, { count: number, value: number }>> = {};
        const convenioCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const c = app.convenio || "N\u00E3o informado";
          const u = app._unit;

          if (!convenioCounts[c]) convenioCounts[c] = { count: 0, value: 0 };
          convenioCounts[c].count += 1;
          convenioCounts[c].value += app._value;

          if (!convenioUnidades[c]) convenioUnidades[c] = {};
          if (!convenioUnidades[c][u]) convenioUnidades[c][u] = { count: 0, value: 0 };
          convenioUnidades[c][u].count += 1;
          convenioUnidades[c][u].value += app._value;
        });

        return Object.keys(convenioCounts)
          .sort((a, b) => convenioCounts[b].count - convenioCounts[a].count)
          .map(convenio => {
            const breakdown = convenioUnidades[convenio] || {};
            const top3 = Object.entries(breakdown)
              .sort((a, b) => b[1].count - a[1].count)
              .slice(0, 3)
              .map(([name, data]) => ({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                count: data.count,
                value: data.value
              }));

              return {
                id: convenio,
                title: convenio,
                subtitle: "Conv\u00EAnio M\u00E9dico",
                count: convenioCounts[convenio].count,
                value: convenioCounts[convenio].value,
                icon: <FileText className="h-5 w-5 text-green-600" />,
                topUnidades: top3
              };
          });
      }

      // Logic for "Convenios" + "Faixa Etaria" + "All" => Show Top 3 Age Groups per Convenio
      if (filterCategory === 'faixaEtaria' && filterValue === 'all') {
        const convenioFaixas: Record<string, Record<string, { count: number, value: number }>> = {};
        const convenioCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const c = app.convenio || "N\u00E3o informado";
          const bucket = getAgeBucket(app.nascimento) || "Desconhecido";

          if (!convenioCounts[c]) convenioCounts[c] = { count: 0, value: 0 };
          convenioCounts[c].count += 1;
          convenioCounts[c].value += app._value;

          if (!convenioFaixas[c]) convenioFaixas[c] = {};
          if (!convenioFaixas[c][bucket]) convenioFaixas[c][bucket] = { count: 0, value: 0 };
          convenioFaixas[c][bucket].count += 1;
          convenioFaixas[c][bucket].value += app._value;
        });

        return Object.keys(convenioCounts)
          .sort((a, b) => convenioCounts[b].count - convenioCounts[a].count)
          .map(convenio => {
            const breakdown = convenioFaixas[convenio] || {};
            const top3 = Object.entries(breakdown)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, data]) => ({ name, count: data.count, value: data.value }));

              return {
                id: convenio,
                title: convenio,
                subtitle: "Conv\u00EAnio M\u00E9dico",
                count: convenioCounts[convenio].count,
                value: convenioCounts[convenio].value,
                icon: <FileText className="h-5 w-5 text-green-600" />,
                topFaixas: top3
              };
          });
      }

      // Logic for "Convenios" + "Exame" + "All" => Show Top 3 Exams per Convenio
      if (filterCategory === 'exame' && filterValue === 'all') {
        const convenioExames: Record<string, Record<string, { count: number, value: number }>> = {};
        const convenioCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const c = app.convenio || "N\u00E3o informado";

          if (!convenioCounts[c]) convenioCounts[c] = { count: 0, value: 0 };
          convenioCounts[c].count += 1;
          convenioCounts[c].value += app._value;

          if (!convenioExames[c]) convenioExames[c] = {};
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              if (!convenioExames[c][ex]) convenioExames[c][ex] = { count: 0, value: 0 };
              convenioExames[c][ex].count += 1;
              convenioExames[c][ex].value += getExamValue(ex, app);
            });
          }
        });

        return Object.keys(convenioCounts)
          .sort((a, b) => convenioCounts[b].count - convenioCounts[a].count)
          .map(convenio => {
            const breakdown = convenioExames[convenio] || {};
            const top3 = Object.entries(breakdown)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, data]) => ({ name, count: data.count, value: data.value }));

              return {
                id: convenio,
                title: convenio,
                subtitle: "Conv\u00EAnio M\u00E9dico",
                count: convenioCounts[convenio].count,
                value: convenioCounts[convenio].value,
                icon: <FileText className="h-5 w-5 text-green-600" />,
                topExames: top3
              };
          });
      }

      // Default Logic
      const counts: Record<string, { count: number, value: number }> = {};
      appointments.forEach(app => {
        const conv = app.convenio || "N\u00E3o informado";
        if (!counts[conv]) counts[conv] = { count: 0, value: 0 };
        counts[conv].count += 1;
        counts[conv].value += app._value;
      });
      return Object.entries(counts)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, data]) => ({
          id: name,
          title: name,
          subtitle: "Conv\u00EAnio M\u00E9dico",
          count: data.count,
          value: data.value,
          icon: <FileText className="h-5 w-5 text-green-600" />
        }));
    }

    if (statType === "faixaEtaria") {
      // Logic for "Faixa Etaria" + "Unidade" + "All" => Show Top 3 Units per Age Group
      if (filterCategory === 'unidade' && filterValue === 'all') {
        const faixaUnidades: Record<string, Record<string, { count: number, value: number }>> = {};
        const faixaCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const bucket = getAgeBucket(app.nascimento) || "Desconhecido";
          const u = app._unit;

          if (!faixaCounts[bucket]) faixaCounts[bucket] = { count: 0, value: 0 };
          faixaCounts[bucket].count += 1;
          faixaCounts[bucket].value += app._value;

          if (!faixaUnidades[bucket]) faixaUnidades[bucket] = {};
          if (!faixaUnidades[bucket][u]) faixaUnidades[bucket][u] = { count: 0, value: 0 };
          faixaUnidades[bucket][u].count += 1;
          faixaUnidades[bucket][u].value += app._value;
        });

        const ranges = AGE_BUCKET_RANGES;
        const order = AGE_BUCKETS;

        return order
          .filter(f => faixaCounts[f] && faixaCounts[f].count > 0)
          .map(faixa => {
            const breakdown = faixaUnidades[faixa] || {};
            const top3 = Object.entries(breakdown)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, data]) => ({
                name: unitConfig?.[name]?.empresa ?? name,
                count: data.count,
                value: data.value
              }));

            return {
              id: faixa,
              title: faixa,
              subtitle: ranges[faixa as keyof typeof ranges] || "Faixa Et\u00E1ria",
              count: faixaCounts[faixa].count,
              value: faixaCounts[faixa].value,
              icon: <Users className="h-5 w-5 text-purple-500" />,
              topUnidades: top3
            };
          });
      }

      // Logic for "Faixa Etaria" + "Convenio" + "All" => Show Top 3 Convenios per Age Group
      if (filterCategory === 'convenio' && filterValue === 'all') {
        const faixaConvenios: Record<string, Record<string, { count: number, value: number }>> = {};
        const faixaCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const bucket = getAgeBucket(app.nascimento) || "Desconhecido";
          const c = app.convenio || "N\u00E3o informado";

          if (!faixaCounts[bucket]) faixaCounts[bucket] = { count: 0, value: 0 };
          faixaCounts[bucket].count += 1;
          faixaCounts[bucket].value += app._value;

          if (!faixaConvenios[bucket]) faixaConvenios[bucket] = {};
          if (!faixaConvenios[bucket][c]) faixaConvenios[bucket][c] = { count: 0, value: 0 };
          faixaConvenios[bucket][c].count += 1;
          faixaConvenios[bucket][c].value += app._value;
        });

        const ranges = AGE_BUCKET_RANGES;
        const order = AGE_BUCKETS;

        return order
          .filter(f => faixaCounts[f] && faixaCounts[f].count > 0)
          .map(faixa => {
            const breakdown = faixaConvenios[faixa] || {};
            const top3 = Object.entries(breakdown)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, data]) => ({ name, count: data.count, value: data.value }));

            return {
              id: faixa,
              title: faixa,
              subtitle: ranges[faixa as keyof typeof ranges] || "Faixa Et\u00E1ria",
              count: faixaCounts[faixa].count,
              value: faixaCounts[faixa].value,
              icon: <Users className="h-5 w-5 text-purple-500" />,
              topConvenios: top3
            };
          });
      }

      // Logic for "Faixa Etaria" + "Exame" + "All" => Show Top 3 Exams per Age Group
      if (filterCategory === 'exame' && filterValue === 'all') {
        const faixaExames: Record<string, Record<string, { count: number, value: number }>> = {};
        const faixaCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const bucket = getAgeBucket(app.nascimento) || "Desconhecido";

          if (!faixaCounts[bucket]) faixaCounts[bucket] = { count: 0, value: 0 };
          faixaCounts[bucket].count += 1;
          faixaCounts[bucket].value += app._value;

          if (!faixaExames[bucket]) faixaExames[bucket] = {};
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              if (!faixaExames[bucket][ex]) faixaExames[bucket][ex] = { count: 0, value: 0 };
              faixaExames[bucket][ex].count += 1;
              faixaExames[bucket][ex].value += getExamValue(ex, app);
            });
          }
        });

        const ranges = AGE_BUCKET_RANGES;
        const order = AGE_BUCKETS;

        return order
          .filter(f => faixaCounts[f] && faixaCounts[f].count > 0)
          .map(faixa => {
            const breakdown = faixaExames[faixa] || {};
            const top3 = Object.entries(breakdown)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, data]) => ({ name, count: data.count, value: data.value }));

            return {
              id: faixa,
              title: faixa,
              subtitle: ranges[faixa as keyof typeof ranges] || "Faixa Et\u00E1ria",
              count: faixaCounts[faixa].count,
              value: faixaCounts[faixa].value,
              icon: <Users className="h-5 w-5 text-purple-500" />,
              topExames: top3
            };
          });
      }

      // Default Logic
      const buckets: Record<string, { count: number, value: number }> = { 
        "Crian\u00E7a": { count: 0, value: 0 }, 
        "Jovem": { count: 0, value: 0 },
        "Adulto": { count: 0, value: 0 }, 
        "Idoso": { count: 0, value: 0 } 
      };
      const ranges = AGE_BUCKET_RANGES;
      appointments.forEach(app => {
        const bucket = getAgeBucket(app.nascimento);
        if (buckets[bucket] !== undefined) {
          buckets[bucket].count++;
          buckets[bucket].value += app._value;
        }
      });
      const order = AGE_BUCKETS;
      return order
        .map(name => ({
          id: name,
          title: name,
          subtitle: ranges[name as keyof typeof ranges] || "Faixa Et\u00E1ria",
          count: buckets[name]?.count || 0,
          value: buckets[name]?.value || 0,
          icon: <Users className="h-5 w-5 text-purple-500" />
        }))
        .filter(item => item.count > 0);
    }

    if (statType === "exames") {
      // Logic for "Exames" + "Unidade" + "All" => Show Top 3 Units per Exam
      if (filterCategory === 'unidade' && filterValue === 'all') {
        const exameUnidades: Record<string, Record<string, { count: number, value: number }>> = {};
        const exameCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const u = app._unit;
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              if (!exameCounts[ex]) exameCounts[ex] = { count: 0, value: 0 };
              exameCounts[ex].count += 1;
              exameCounts[ex].value += getExamValue(ex, app);

              if (!exameUnidades[ex]) exameUnidades[ex] = {};
              if (!exameUnidades[ex][u]) exameUnidades[ex][u] = { count: 0, value: 0 };
              exameUnidades[ex][u].count += 1;
              exameUnidades[ex][u].value += getExamValue(ex, app);
            });
          }
        });

        return Object.keys(exameCounts)
          .sort((a, b) => exameCounts[b].count - exameCounts[a].count)
          .map(exame => {
            const breakdown = exameUnidades[exame] || {};
            const top3 = Object.entries(breakdown)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, data]) => ({
                name: unitConfig?.[name]?.empresa ?? name,
                count: data.count,
                value: data.value
              }));

            return {
              id: exame,
              title: exame,
              subtitle: "Procedimento",
              count: exameCounts[exame].count,
              value: exameCounts[exame].value,
              icon: <Activity className="h-5 w-5 text-orange-500" />,
              topUnidades: top3
            };
          });
      }

      // Logic for "Exames" + "Convenio" + "All" => Show Top 3 Convenios per Exam
      if (filterCategory === 'convenio' && filterValue === 'all') {
        const exameConvenios: Record<string, Record<string, { count: number, value: number }>> = {};
        const exameCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const c = app.convenio || "N\u00E3o informado";
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              if (!exameCounts[ex]) exameCounts[ex] = { count: 0, value: 0 };
              exameCounts[ex].count += 1;
              exameCounts[ex].value += getExamValue(ex, app);

              if (!exameConvenios[ex]) exameConvenios[ex] = {};
              if (!exameConvenios[ex][c]) exameConvenios[ex][c] = { count: 0, value: 0 };
              exameConvenios[ex][c].count += 1;
              exameConvenios[ex][c].value += getExamValue(ex, app);
            });
          }
        });

        return Object.keys(exameCounts)
          .sort((a, b) => exameCounts[b].count - exameCounts[a].count)
          .map(exame => {
            const breakdown = exameConvenios[exame] || {};
            const top3 = Object.entries(breakdown)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, data]) => ({ name, count: data.count, value: data.value }));

            return {
              id: exame,
              title: exame,
              subtitle: "Procedimento",
              count: exameCounts[exame].count,
              value: exameCounts[exame].value,
              icon: <Activity className="h-5 w-5 text-orange-500" />,
              topConvenios: top3
            };
          });
      }

      // Logic for "Exames" + "Faixa Etaria" + "All" => Show Top 3 Age Groups per Exam
      if (filterCategory === 'faixaEtaria' && filterValue === 'all') {
        const exameFaixas: Record<string, Record<string, { count: number, value: number }>> = {};
        const exameCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const bucket = getAgeBucket(app.nascimento) || "Desconhecido";

          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              if (!exameCounts[ex]) exameCounts[ex] = { count: 0, value: 0 };
              exameCounts[ex].count += 1;
              exameCounts[ex].value += getExamValue(ex, app);

              if (!exameFaixas[ex]) exameFaixas[ex] = {};
              if (!exameFaixas[ex][bucket]) exameFaixas[ex][bucket] = { count: 0, value: 0 };
              exameFaixas[ex][bucket].count += 1;
              exameFaixas[ex][bucket].value += getExamValue(ex, app);
            });
          }
        });

        return Object.keys(exameCounts)
          .sort((a, b) => exameCounts[b].count - exameCounts[a].count)
          .map(exame => {
            const breakdown = exameFaixas[exame] || {};
            const top3 = Object.entries(breakdown)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, data]) => ({ name, count: data.count, value: data.value }));

            return {
              id: exame,
              title: exame,
              subtitle: "Procedimento",
              count: exameCounts[exame].count,
              value: exameCounts[exame].value,
              icon: <Activity className="h-5 w-5 text-orange-500" />,
              topFaixas: top3
            };
          });
      }

      // Default Logic
      const counts: Record<string, { count: number, value: number }> = {};
      appointments.forEach(app => {
        if (Array.isArray(app.exames)) {
          app.exames.forEach((ex: string) => {
            if (!counts[ex]) counts[ex] = { count: 0, value: 0 };
            counts[ex].count += 1;
            counts[ex].value += getExamValue(ex, app);
          });
        }
      });
      return Object.entries(counts)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, data]) => ({
          id: name,
          title: name,
          subtitle: "Procedimento",
          count: data.count,
          value: data.value,
         }));
    }

    if (statType === "origem") {
      // Logic for "Origem" + "Unidade" + "All" => Show Top 3 Units per Origin
      if (filterCategory === 'unidade' && filterValue === 'all') {
        const origemUnidades: Record<string, Record<string, { count: number, value: number }>> = {};
        const origemCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const orig = normalizePatientOrigin(app.origem);
          const u = app._unit;

          if (!origemCounts[orig]) origemCounts[orig] = { count: 0, value: 0 };
          origemCounts[orig].count += 1;
          origemCounts[orig].value += app._value;

          if (!origemUnidades[orig]) origemUnidades[orig] = {};
          if (!origemUnidades[orig][u]) origemUnidades[orig][u] = { count: 0, value: 0 };
          origemUnidades[orig][u].count += 1;
          origemUnidades[orig][u].value += app._value;
        });

        const labels: Record<string, string> = { Google: "Google", Instagram: "Instagram", Desconhecido: "Desconhecida" };
        const order = ["Google", "Instagram", "Desconhecido"];

        return order
          .filter(o => origemCounts[o] && origemCounts[o].count > 0)
          .map(origem => {
            const breakdown = origemUnidades[origem] || {};
            const top3 = Object.entries(breakdown)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, data]) => ({
                name: unitConfig?.[name]?.empresa ?? name,
                count: data.count,
                value: data.value
              }));

            return {
              id: origem,
              title: labels[origem] || origem,
              subtitle: "Origem do Paciente",
              count: origemCounts[origem].count,
              value: origemCounts[origem].value,
              icon: <Users className="h-5 w-5 text-indigo-500" />,
              topUnidades: top3
            };
          });
      }

      if (filterCategory === "convenio" && filterValue === "all") {
        const origemConvenios: Record<string, Record<string, { count: number; value: number }>> = {};
        const origemCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const origem = normalizePatientOrigin(app.origem);
          const convenio = app.convenio || "Não informado";

          if (!origemCounts[origem]) origemCounts[origem] = { count: 0, value: 0 };
          origemCounts[origem].count += 1;
          origemCounts[origem].value += app._value;

          if (!origemConvenios[origem]) origemConvenios[origem] = {};
          if (!origemConvenios[origem][convenio]) origemConvenios[origem][convenio] = { count: 0, value: 0 };
          origemConvenios[origem][convenio].count += 1;
          origemConvenios[origem][convenio].value += app._value;
        });

        const labels: Record<string, string> = { Google: "Google", Instagram: "Instagram", Desconhecido: "Desconhecida" };
        return Object.entries(origemCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([origem, data]) => ({
            id: origem,
            title: labels[origem] || origem,
            subtitle: "Origem do Paciente",
            count: data.count,
            value: data.value,
            icon: <Users className="h-5 w-5 text-indigo-500" />,
            topConvenios: Object.entries(origemConvenios[origem] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([convenio, breakdown]) => ({
                name: convenio,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "faixaEtaria" && filterValue === "all") {
        const origemFaixas: Record<string, Record<string, { count: number; value: number }>> = {};
        const origemCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const origem = normalizePatientOrigin(app.origem);
          const faixa = getAgeBucket(app.nascimento) || "Desconhecido";

          if (!origemCounts[origem]) origemCounts[origem] = { count: 0, value: 0 };
          origemCounts[origem].count += 1;
          origemCounts[origem].value += app._value;

          if (!origemFaixas[origem]) origemFaixas[origem] = {};
          if (!origemFaixas[origem][faixa]) origemFaixas[origem][faixa] = { count: 0, value: 0 };
          origemFaixas[origem][faixa].count += 1;
          origemFaixas[origem][faixa].value += app._value;
        });

        const labels: Record<string, string> = { Google: "Google", Instagram: "Instagram", Desconhecido: "Desconhecida" };
        return Object.entries(origemCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([origem, data]) => ({
            id: origem,
            title: labels[origem] || origem,
            subtitle: "Origem do Paciente",
            count: data.count,
            value: data.value,
            icon: <Users className="h-5 w-5 text-indigo-500" />,
            topFaixas: Object.entries(origemFaixas[origem] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([faixa, breakdown]) => ({
                name: faixa,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "exame" && filterValue === "all") {
        const origemExames: Record<string, Record<string, { count: number; value: number }>> = {};
        const origemCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const origem = normalizePatientOrigin(app.origem);

          if (!origemCounts[origem]) origemCounts[origem] = { count: 0, value: 0 };
          origemCounts[origem].count += 1;
          origemCounts[origem].value += app._value;

          if (!origemExames[origem]) origemExames[origem] = {};
          if (Array.isArray(app.exames)) {
            app.exames.forEach((exam: string) => {
              if (!origemExames[origem][exam]) origemExames[origem][exam] = { count: 0, value: 0 };
              origemExames[origem][exam].count += 1;
              origemExames[origem][exam].value += getExamValue(exam, app);
            });
          }
        });

        const labels: Record<string, string> = { Google: "Google", Instagram: "Instagram", Desconhecido: "Desconhecida" };
        return Object.entries(origemCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([origem, data]) => ({
            id: origem,
            title: labels[origem] || origem,
            subtitle: "Origem do Paciente",
            count: data.count,
            value: data.value,
            icon: <Users className="h-5 w-5 text-indigo-500" />,
            topExames: Object.entries(origemExames[origem] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([exam, breakdown]) => ({
                name: exam,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "motivacao" && filterValue === "all") {
        const origemMotivacoes: Record<string, Record<string, { count: number; value: number }>> = {};
        const origemCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const origem = normalizePatientOrigin(app.origem);
          const motivacao = String(app.motivacao || "N\u00E3o informado").trim() || "N\u00E3o informado";

          if (!origemCounts[origem]) origemCounts[origem] = { count: 0, value: 0 };
          origemCounts[origem].count += 1;
          origemCounts[origem].value += app._value;

          if (!origemMotivacoes[origem]) origemMotivacoes[origem] = {};
          if (!origemMotivacoes[origem][motivacao]) origemMotivacoes[origem][motivacao] = { count: 0, value: 0 };
          origemMotivacoes[origem][motivacao].count += 1;
          origemMotivacoes[origem][motivacao].value += app._value;
        });

        return Object.entries(origemCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([origem, data]) => ({
            id: origem,
            title: getOriginLabel(origem),
            subtitle: "Origem do Paciente",
            count: data.count,
            value: data.value,
            icon: <Users className="h-5 w-5 text-indigo-500" />,
            topMotivacoes: Object.entries(origemMotivacoes[origem] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([motivacao, breakdown]) => ({
                name: motivacao,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "cirurgia" && filterValue === "all") {
        const origemCirurgias: Record<string, Record<string, { count: number; value: number }>> = {};
        const origemCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const origem = normalizePatientOrigin(app.origem);
          const cirurgia = String(app.cirurgia || "N\u00E3o informado").trim() || "N\u00E3o informado";

          if (!origemCounts[origem]) origemCounts[origem] = { count: 0, value: 0 };
          origemCounts[origem].count += 1;
          origemCounts[origem].value += app._value;

          if (!origemCirurgias[origem]) origemCirurgias[origem] = {};
          if (!origemCirurgias[origem][cirurgia]) origemCirurgias[origem][cirurgia] = { count: 0, value: 0 };
          origemCirurgias[origem][cirurgia].count += 1;
          origemCirurgias[origem][cirurgia].value += app._value;
        });

        return Object.entries(origemCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([origem, data]) => ({
            id: origem,
            title: getOriginLabel(origem),
            subtitle: "Origem do Paciente",
            count: data.count,
            value: data.value,
            icon: <Users className="h-5 w-5 text-indigo-500" />,
            topCirurgias: Object.entries(origemCirurgias[origem] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([cirurgia, breakdown]) => ({
                name: cirurgia,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      // Default Logic for Origem
      const counts: Record<string, { count: number, value: number }> = {};
      appointments.forEach(app => {
        const orig = normalizePatientOrigin(app.origem);
        if (!counts[orig]) counts[orig] = { count: 0, value: 0 };
        counts[orig].count += 1;
        counts[orig].value += app._value;
      });

      const labels: Record<string, string> = { Google: "Google", Instagram: "Instagram", Desconhecido: "Desconhecida" };
      return Object.entries(counts)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, data]) => ({
          id: name,
          title: labels[name] || name,
          subtitle: "Origem do Paciente",
          count: data.count,
          value: data.value,
          icon: <Users className="h-5 w-5 text-indigo-500" />
        }));
    }

    if (statType === "motivacao") {
      if (filterCategory === "unidade" && filterValue === "all") {
        const motivacaoUnidades: Record<string, Record<string, { count: number; value: number }>> = {};
        const motivacaoCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const motivacao = String(app.motivacao || "N\u00E3o informado").trim() || "N\u00E3o informado";
          const unidade = app._unit;

          if (!motivacaoCounts[motivacao]) motivacaoCounts[motivacao] = { count: 0, value: 0 };
          motivacaoCounts[motivacao].count += 1;
          motivacaoCounts[motivacao].value += app._value;

          if (!motivacaoUnidades[motivacao]) motivacaoUnidades[motivacao] = {};
          if (!motivacaoUnidades[motivacao][unidade]) motivacaoUnidades[motivacao][unidade] = { count: 0, value: 0 };
          motivacaoUnidades[motivacao][unidade].count += 1;
          motivacaoUnidades[motivacao][unidade].value += app._value;
        });

        return Object.entries(motivacaoCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([motivacao, data]) => ({
            id: motivacao,
            title: motivacao,
            subtitle: "Motiva\u00E7\u00E3o do Agendamento",
            count: data.count,
            value: data.value,
            icon: <MessageSquare className="h-5 w-5 text-cyan-600" />,
            topUnidades: Object.entries(motivacaoUnidades[motivacao] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, breakdown]) => ({
                name: unitConfig?.[name]?.empresa ?? name,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "convenio" && filterValue === "all") {
        const motivacaoConvenios: Record<string, Record<string, { count: number; value: number }>> = {};
        const motivacaoCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const motivacao = String(app.motivacao || "N\u00E3o informado").trim() || "N\u00E3o informado";
          const convenio = app.convenio || "N\u00E3o informado";

          if (!motivacaoCounts[motivacao]) motivacaoCounts[motivacao] = { count: 0, value: 0 };
          motivacaoCounts[motivacao].count += 1;
          motivacaoCounts[motivacao].value += app._value;

          if (!motivacaoConvenios[motivacao]) motivacaoConvenios[motivacao] = {};
          if (!motivacaoConvenios[motivacao][convenio]) motivacaoConvenios[motivacao][convenio] = { count: 0, value: 0 };
          motivacaoConvenios[motivacao][convenio].count += 1;
          motivacaoConvenios[motivacao][convenio].value += app._value;
        });

        return Object.entries(motivacaoCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([motivacao, data]) => ({
            id: motivacao,
            title: motivacao,
            subtitle: "Motiva\u00E7\u00E3o do Agendamento",
            count: data.count,
            value: data.value,
            icon: <MessageSquare className="h-5 w-5 text-cyan-600" />,
            topConvenios: Object.entries(motivacaoConvenios[motivacao] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, breakdown]) => ({
                name,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "faixaEtaria" && filterValue === "all") {
        const motivacaoFaixas: Record<string, Record<string, { count: number; value: number }>> = {};
        const motivacaoCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const motivacao = String(app.motivacao || "N\u00E3o informado").trim() || "N\u00E3o informado";
          const faixa = getAgeBucket(app.nascimento) || "Desconhecido";

          if (!motivacaoCounts[motivacao]) motivacaoCounts[motivacao] = { count: 0, value: 0 };
          motivacaoCounts[motivacao].count += 1;
          motivacaoCounts[motivacao].value += app._value;

          if (!motivacaoFaixas[motivacao]) motivacaoFaixas[motivacao] = {};
          if (!motivacaoFaixas[motivacao][faixa]) motivacaoFaixas[motivacao][faixa] = { count: 0, value: 0 };
          motivacaoFaixas[motivacao][faixa].count += 1;
          motivacaoFaixas[motivacao][faixa].value += app._value;
        });

        return Object.entries(motivacaoCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([motivacao, data]) => ({
            id: motivacao,
            title: motivacao,
            subtitle: "Motiva\u00E7\u00E3o do Agendamento",
            count: data.count,
            value: data.value,
            icon: <MessageSquare className="h-5 w-5 text-cyan-600" />,
            topFaixas: Object.entries(motivacaoFaixas[motivacao] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, breakdown]) => ({
                name,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      const counts: Record<string, { count: number; value: number }> = {};
      appointments.forEach((app) => {
        const motivacao = String(app.motivacao || "N\u00E3o informado").trim() || "N\u00E3o informado";
        if (!counts[motivacao]) counts[motivacao] = { count: 0, value: 0 };
        counts[motivacao].count += 1;
        counts[motivacao].value += app._value;
      });

      return Object.entries(counts)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([motivacao, data]) => ({
          id: motivacao,
          title: motivacao,
          subtitle: "Motiva\u00E7\u00E3o do Agendamento",
          count: data.count,
          value: data.value,
          icon: <MessageSquare className="h-5 w-5 text-cyan-600" />,
        }));
    }

    if (statType === "cirurgia") {
      if (filterCategory === "unidade" && filterValue === "all") {
        const cirurgiaUnidades: Record<string, Record<string, { count: number; value: number }>> = {};
        const cirurgiaCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const cirurgia = String(app.cirurgia || "N\u00E3o informado").trim() || "N\u00E3o informado";
          const unidade = app._unit;

          if (!cirurgiaCounts[cirurgia]) cirurgiaCounts[cirurgia] = { count: 0, value: 0 };
          cirurgiaCounts[cirurgia].count += 1;
          cirurgiaCounts[cirurgia].value += app._value;

          if (!cirurgiaUnidades[cirurgia]) cirurgiaUnidades[cirurgia] = {};
          if (!cirurgiaUnidades[cirurgia][unidade]) cirurgiaUnidades[cirurgia][unidade] = { count: 0, value: 0 };
          cirurgiaUnidades[cirurgia][unidade].count += 1;
          cirurgiaUnidades[cirurgia][unidade].value += app._value;
        });

        return Object.entries(cirurgiaCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([cirurgia, data]) => ({
            id: cirurgia,
            title: cirurgia,
            subtitle: "Cirurgia do Agendamento",
            count: data.count,
            value: data.value,
            icon: <Activity className="h-5 w-5 text-rose-600" />,
            topUnidades: Object.entries(cirurgiaUnidades[cirurgia] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, breakdown]) => ({
                name: unitConfig?.[name]?.empresa ?? name,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "convenio" && filterValue === "all") {
        const cirurgiaConvenios: Record<string, Record<string, { count: number; value: number }>> = {};
        const cirurgiaCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const cirurgia = String(app.cirurgia || "N\u00E3o informado").trim() || "N\u00E3o informado";
          const convenio = app.convenio || "N\u00E3o informado";

          if (!cirurgiaCounts[cirurgia]) cirurgiaCounts[cirurgia] = { count: 0, value: 0 };
          cirurgiaCounts[cirurgia].count += 1;
          cirurgiaCounts[cirurgia].value += app._value;

          if (!cirurgiaConvenios[cirurgia]) cirurgiaConvenios[cirurgia] = {};
          if (!cirurgiaConvenios[cirurgia][convenio]) cirurgiaConvenios[cirurgia][convenio] = { count: 0, value: 0 };
          cirurgiaConvenios[cirurgia][convenio].count += 1;
          cirurgiaConvenios[cirurgia][convenio].value += app._value;
        });

        return Object.entries(cirurgiaCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([cirurgia, data]) => ({
            id: cirurgia,
            title: cirurgia,
            subtitle: "Cirurgia do Agendamento",
            count: data.count,
            value: data.value,
            icon: <Activity className="h-5 w-5 text-rose-600" />,
            topConvenios: Object.entries(cirurgiaConvenios[cirurgia] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, breakdown]) => ({
                name,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      if (filterCategory === "faixaEtaria" && filterValue === "all") {
        const cirurgiaFaixas: Record<string, Record<string, { count: number; value: number }>> = {};
        const cirurgiaCounts: Record<string, { count: number; value: number }> = {};

        appointments.forEach((app) => {
          const cirurgia = String(app.cirurgia || "N\u00E3o informado").trim() || "N\u00E3o informado";
          const faixa = getAgeBucket(app.nascimento) || "Desconhecido";

          if (!cirurgiaCounts[cirurgia]) cirurgiaCounts[cirurgia] = { count: 0, value: 0 };
          cirurgiaCounts[cirurgia].count += 1;
          cirurgiaCounts[cirurgia].value += app._value;

          if (!cirurgiaFaixas[cirurgia]) cirurgiaFaixas[cirurgia] = {};
          if (!cirurgiaFaixas[cirurgia][faixa]) cirurgiaFaixas[cirurgia][faixa] = { count: 0, value: 0 };
          cirurgiaFaixas[cirurgia][faixa].count += 1;
          cirurgiaFaixas[cirurgia][faixa].value += app._value;
        });

        return Object.entries(cirurgiaCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([cirurgia, data]) => ({
            id: cirurgia,
            title: cirurgia,
            subtitle: "Cirurgia do Agendamento",
            count: data.count,
            value: data.value,
            icon: <Activity className="h-5 w-5 text-rose-600" />,
            topFaixas: Object.entries(cirurgiaFaixas[cirurgia] || {})
              .sort((a, b) => b[1].count - a[1].count)
              .map(([name, breakdown]) => ({
                name,
                count: breakdown.count,
                value: breakdown.value,
              })),
          }));
      }

      const counts: Record<string, { count: number; value: number }> = {};
      appointments.forEach((app) => {
        const cirurgia = String(app.cirurgia || "N\u00E3o informado").trim() || "N\u00E3o informado";
        if (!counts[cirurgia]) counts[cirurgia] = { count: 0, value: 0 };
        counts[cirurgia].count += 1;
        counts[cirurgia].value += app._value;
      });

      return Object.entries(counts)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([cirurgia, data]) => ({
          id: cirurgia,
          title: cirurgia,
          subtitle: "Cirurgia do Agendamento",
          count: data.count,
          value: data.value,
          icon: <Activity className="h-5 w-5 text-rose-600" />,
        }));
    }

    return [];
  }, [filteredAppointments, filteredCancellations, statType, unitConfig, filterCategory, filterValue]);

  const totalPacientes = useMemo(() => filteredAppointments.length, [filteredAppointments]);
  const totalEstimado = useMemo(() => filteredAppointments.reduce((acc, app) => acc + (app._value || 0), 0), [filteredAppointments]);

  // Apply sorting to displayData
  const sortedDisplayData = useMemo(() => {
    // If a specific sort column is active, use it (for table view)
    if (sortColumn) {
      return [...displayData].sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortColumn) {
          case "title":
            aVal = a.title.toLowerCase();
            bVal = b.title.toLowerCase();
            break;
          case "count":
            aVal = a.count;
            bVal = b.count;
            break;
          case "percentage":
            aVal = (a.count / totalPacientes) * 100;
            bVal = (b.count / totalPacientes) * 100;
            break;
          case "value":
            aVal = a.value || 0;
            bVal = b.value || 0;
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    // Default sorting logic for cards (and table if no column selected)
    // Matches the Simple Mode sorting: highest count first
    // Except for 'historico' (months), which relies on its own chronology sorted earlier
    if (statType !== "historico" && statType !== "faixaEtaria") {
      return [...displayData].sort((a, b) => b.count - a.count);
    }

    return displayData;
  }, [displayData, sortColumn, sortDirection, totalPacientes, statType]);

  const handleSort = (column: "title" | "count" | "percentage" | "value") => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      // New column, default to descending
      setSortColumn(column);
      setSortDirection("desc");
    }
  };



  const buildAppointmentDetail = (app: any): AppointmentDetail => ({
    nome: app.nomePaciente || app.nome || "N\u00E3o informado",
    nascimento: app.nascimento || "-",
    idade: calculateAge(app.nascimento),
    convenio: app.convenio || "N\u00E3o informado",
    unidade: app._unit,
    unidadeName: unitConfig?.[app._unit]?.empresa ?? app._unit,
    dataConsulta: app._date.split("-").reverse().join("/"),
    horario: app._time || "-",
    exames: Array.isArray(app.exames) ? app.exames : [],
    telefone: app.telefone || "",
    origem: normalizePatientOrigin(app.origem),
    motivoCancelamento: String(app.motivoCancelamento || "").trim() || undefined,
    avaliacaoEstrelas: Number(app.pesquisaSatisfacao?.estrelas) || undefined,
    avaliacaoTexto: String(app.pesquisaSatisfacao?.texto || "").trim() || undefined,
  });

  const getBreakdownMeta = (item: CardData) => {
    if (item.topUnidades) return { kind: "unidade" as const, items: item.topUnidades };
    if (item.topConvenios) return { kind: "convenio" as const, items: item.topConvenios };
    if (item.topFaixas) return { kind: "faixaEtaria" as const, items: item.topFaixas };
    if (item.topExames) return { kind: "exame" as const, items: item.topExames };
    if (item.topOrigens) return { kind: "origem" as const, items: item.topOrigens };
    if (item.topMotivacoes) return { kind: "motivacao" as const, items: item.topMotivacoes };
    if (item.topCirurgias) return { kind: "cirurgia" as const, items: item.topCirurgias };
    return null;
  };

  const openCancellationDrillDown = (item: CardData) => {
    const matches = filteredCancellations
      .filter((app: any) => app._unit === item.id)
      .sort((a: any, b: any) => {
        const reasonA = String(a.motivoCancelamento || "N\u00E3o informado").trim() || "N\u00E3o informado";
        const reasonB = String(b.motivoCancelamento || "N\u00E3o informado").trim() || "N\u00E3o informado";
        const reasonCompare = reasonA.localeCompare(reasonB, "pt-BR");
        if (reasonCompare !== 0) return reasonCompare;
        const dateCompare = a._date.localeCompare(b._date);
        if (dateCompare !== 0) return dateCompare;
        return a._time.localeCompare(b._time);
      });

    setActiveDrillDown({
      title: `${item.title} \u203A Motivo do Cancelamento`,
      patients: matches.map(buildAppointmentDetail),
    });
    setDrillDownOpen(true);
  };

  const openRatingDrillDown = (item: CardData) => {
    const matches = filteredAppointments
      .filter((app: any) => app._unit === item.id)
      .filter((app: any) => {
        const stars = Number(app.pesquisaSatisfacao?.estrelas) || 0;
        const text = String(app.pesquisaSatisfacao?.texto || "").trim();
        return stars > 0 || !!text;
      })
      .sort((a: any, b: any) => {
        const starsA = Number(a.pesquisaSatisfacao?.estrelas) || 0;
        const starsB = Number(b.pesquisaSatisfacao?.estrelas) || 0;
        if (starsA !== starsB) return starsB - starsA;
        const textA = String(a.pesquisaSatisfacao?.texto || "").trim();
        const textB = String(b.pesquisaSatisfacao?.texto || "").trim();
        if (!!textA !== !!textB) return textA ? -1 : 1;
        const textCompare = textA.localeCompare(textB, "pt-BR");
        if (textCompare !== 0) return textCompare;
        const dateCompare = a._date.localeCompare(b._date);
        if (dateCompare !== 0) return dateCompare;
        return a._time.localeCompare(b._time);
      });

    setActiveDrillDown({
      title: `${item.title} \u203A Estrelas e Coment\u00E1rios`,
      patients: matches.map(buildAppointmentDetail),
    });
    setDrillDownOpen(true);
  };

  // Function to handle card click for detailed records
  const handleDrillDown = (item: CardData, subItemName?: string) => {
    const breakdown = getBreakdownMeta(item);
    const hasBreakdown = !!breakdown;
    if (hasBreakdown && !subItemName && statType !== "unidades") return;

    // Filter appointments for this item from filteredAppointments
    let matches: any[] = [];
    if (statType === "unidades") {
      matches = filteredAppointments.filter((app: any) => app._unit === item.id);
    } else if (statType === "convenios") {
      matches = filteredAppointments.filter((app: any) => (app.convenio || "N\u00E3o informado") === item.id);
    } else if (statType === "faixaEtaria") {
      matches = filteredAppointments.filter((app: any) => getAgeBucket(app.nascimento) === item.id);
    } else if (statType === "exames") {
      matches = filteredAppointments.filter((app: any) => Array.isArray(app.exames) && app.exames.includes(item.id));
    } else if (statType === "historico") {
      matches = filteredAppointments.filter((app: any) => obterNomeMes(app._date) === item.id);
    } else if (statType === "origem") {
      matches = filteredAppointments.filter((app: any) => normalizePatientOrigin(app.origem) === item.id);
    } else if (statType === "motivacao") {
      matches = filteredAppointments.filter((app: any) => (String(app.motivacao || "N\u00E3o informado").trim() || "N\u00E3o informado") === item.id);
    } else if (statType === "cirurgia") {
      matches = filteredAppointments.filter((app: any) => (String(app.cirurgia || "N\u00E3o informado").trim() || "N\u00E3o informado") === item.id);
    }

    // Secondary filter if subItemName is provided
    if (subItemName && breakdown) {
      if (breakdown.kind === "unidade") {
        matches = matches.filter((app: any) => (unitConfig?.[app._unit]?.empresa ?? app._unit) === subItemName);
      } else if (breakdown.kind === "convenio") {
        matches = matches.filter((app: any) => (app.convenio || "N\u00E3o informado") === subItemName);
      } else if (breakdown.kind === "faixaEtaria") {
        matches = matches.filter((app: any) => getAgeBucket(app.nascimento) === subItemName);
      } else if (breakdown.kind === "exame") {
        matches = matches.filter((app: any) => Array.isArray(app.exames) && app.exames.includes(subItemName));
      } else if (breakdown.kind === "origem") {
        matches = matches.filter((app: any) => normalizePatientOrigin(app.origem) === getOriginValueFromLabel(subItemName));
      } else if (breakdown.kind === "motivacao") {
        matches = matches.filter((app: any) => (String(app.motivacao || "N\u00E3o informado").trim() || "N\u00E3o informado") === subItemName);
      } else if (breakdown.kind === "cirurgia") {
        matches = matches.filter((app: any) => (String(app.cirurgia || "N\u00E3o informado").trim() || "N\u00E3o informado") === subItemName);
      }
    }

    const details: AppointmentDetail[] = matches.map(buildAppointmentDetail);

    const finalTitle = subItemName ? `${item.title} \u203A ${subItemName}` : item.title;
    setActiveDrillDown({ title: finalTitle, patients: details });
    setDrillDownOpen(true);
  };

  /* ---------- UI ---------- */
  return (
    <SidebarLayout unit={selectedUnit} bgColor="bg-transparent" contentClassName="p-0">
      <div className="flex flex-col items-center px-6 pb-6 pt-2 md:px-10 md:pb-10 md:pt-4 lg:px-16 lg:pb-16 lg:pt-6 bg-gradient-to-b from-blue-100 via-white to-blue-100 min-h-screen w-full relative overflow-auto">

        {/* Patient Details Sheet (Drill-down) */}
        {activeDrillDown && (
          <PatientDetailsSheet
            isOpen={drillDownOpen}
            onClose={() => setDrillDownOpen(false)}
            title={activeDrillDown.title}
            patients={activeDrillDown.patients}
          />
        )}

        {/* Unified Filters */}
        <section className="w-full mb-8">
          <div className="relative z-40 flex flex-col gap-3 rounded-2xl border border-blue-100/70 bg-white/75 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col gap-2.5 xl:flex-row xl:flex-wrap xl:items-end">
              <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                <label className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider ml-1">Agrupar Por</label>
                <Select value={statType} onValueChange={(v) => setStatType(v as StatType)}>
                  <SelectTrigger className="w-full sm:w-[170px] bg-white text-[13px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem className={analyticSelectItemClassName} value="unidades">{selectedUnit === 'OFT/45' ? 'M\u00E9dicos' : 'Unidades'}</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="convenios">{"Conv\u00EAnios"}</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="faixaEtaria">{"Faixa Et\u00E1ria"}</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="exames">Exames</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="motivacao">{"Motiva\u00E7\u00E3o"}</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="cirurgia">Cirurgia</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="origem">Origem do Paciente</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="historico">{"Evolu\u00E7\u00E3o Mensal"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                <label className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider ml-1">Filtrar por</label>
                <Select value={filterCategory} onValueChange={(v: any) => setFilterCategory(v)}>
                  <SelectTrigger className="w-full sm:w-[170px] bg-white text-[13px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem className={analyticSelectItemClassName} value="unidade">{selectedUnit === 'OFT/45' ? 'M\u00E9dico' : 'Unidade'}</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="convenio">{"Conv\u00EAnio"}</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="faixaEtaria">{"Faixa Et\u00E1ria"}</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="exame">Exame</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="motivacao">{"Motiva\u00E7\u00E3o"}</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="cirurgia">Cirurgia</SelectItem>
                    <SelectItem className={analyticSelectItemClassName} value="origem">Origem</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                <label className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider ml-1">{"Op\u00E7\u00E3o"}</label>
                <div className="relative z-50 w-full sm:w-[170px]">
                  <Input
                    value={optionQuery}
                    placeholder="Digite para filtrar..."
                    className="bg-white text-[13px] placeholder:text-[13px]"
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setOptionQuery(nextValue);
                      setFilterValue(nextValue.trim() ? nextValue : "all");
                    }}
                    onFocus={() => setIsOptionInputFocused(true)}
                    onBlur={() => {
                      window.setTimeout(() => setIsOptionInputFocused(false), 120);
                    }}
                  />
                  {isOptionInputFocused && filteredOptionSuggestions.length > 0 && (
                    <div className="absolute z-[120] mt-2 max-h-52 w-[220px] overflow-y-auto rounded-lg border border-blue-100 bg-white p-1 shadow-2xl sm:w-[240px]">
                      {filteredOptionSuggestions.map((option) => (
                        <button
                          key={`${option.value}-${option.label}`}
                          type="button"
                          className="flex w-full items-start rounded-md px-3 py-2 text-left text-[13px] font-medium leading-5 text-slate-900 hover:bg-blue-700 hover:text-white"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setOptionQuery(option.label);
                            setFilterValue(option.value);
                            setIsOptionInputFocused(false);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                <label className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider ml-1">{"Per\u00EDodo"}</label>
                <div className="flex h-10 items-center bg-white rounded-xl border border-slate-200 shadow-sm divide-x divide-slate-100 w-full sm:w-[170px]">
                  <button
                    onClick={() => handlePeriodChange('prev')}
                    disabled={isPrevDisabled}
                    className="flex h-full items-center px-2.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors"
                    title="Anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={togglePeriodMode}
                    className="flex-1 h-full px-2 text-[13px] font-medium text-slate-700 hover:text-blue-600 text-center transition-colors cursor-pointer"
                    title={`Clique para ver por ${periodMode === 'year' ? 'M\u00EAs' : 'Ano'}`}
                  >
                    {filter}
                  </button>
                  <button
                    onClick={() => handlePeriodChange('next')}
                    disabled={isNextDisabled}
                    className="flex h-full items-center px-2.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors"
                    title="Pr\u00F3ximo"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm self-start xl:self-end">
                <button onClick={() => setViewMode("cards")} className={`p-2 rounded-md ${viewMode === "cards" ? "bg-blue-100 text-blue-700" : "text-gray-400 hover:text-gray-600"}`}><LayoutGrid className="w-5 h-5" /></button>
                <button onClick={() => setViewMode("table")} className={`p-2 rounded-md ${viewMode === "table" ? "bg-blue-100 text-blue-700" : "text-gray-400 hover:text-gray-600"}`}><List className="w-5 h-5" /></button>
              </div>
            </div>
          </div>
        </section>


        {/* Main Content */}
        <section className="w-full max-w-6xl transition-all duration-300">
          {loading && <p className="text-center">Carregando...</p>}

          {!loading && displayData.length === 0 && (
            <div className="text-center p-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-500">Nenhum dado encontrado para esta combina\u00E7\u00E3o.</p>
            </div>
          )}

          {!loading && displayData.length > 0 && (
            <>
              {viewMode === "table" && (
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th
                            className="px-6 py-4 font-bold text-blue-900 cursor-pointer hover:bg-blue-100 transition-colors select-none"
                            onClick={() => handleSort("title")}
                          >
                            <div className="flex items-center gap-1">
                              Grupo
                              {sortColumn === "title" && (
                                <span>{sortDirection === "asc" ? "\u2191" : "\u2193"}</span>
                              )}
                            </div>
                          </th>
                          <th className="px-6 py-4 font-bold text-blue-900">Detalhe</th>
                          <th
                            className="px-6 py-4 text-center font-bold text-blue-900 cursor-pointer hover:bg-blue-100 transition-colors select-none"
                            onClick={() => handleSort("count")}
                          >
                            <div className="flex items-center justify-center gap-1">
                              Qtd.
                              {sortColumn === "count" && (
                                <span>{sortDirection === "asc" ? "\u2191" : "\u2193"}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="px-6 py-4 text-center font-bold text-blue-900 cursor-pointer hover:bg-blue-100 transition-colors select-none"
                            onClick={() => handleSort("percentage")}
                          >
                            <div className="flex items-center justify-center gap-1">
                              %
                              {sortColumn === "percentage" && (
                                <span>{sortDirection === "asc" ? "\u2191" : "\u2193"}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="px-6 py-4 text-right font-bold text-blue-900 cursor-pointer hover:bg-blue-100 transition-colors select-none"
                            onClick={() => handleSort("value")}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Valor Estimado
                              {sortColumn === "value" && (
                                <span>{sortDirection === "asc" ? "\u2191" : "\u2193"}</span>
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sortedDisplayData.map((item) => (
                          <tr key={item.id} className="hover:bg-blue-50/50 transition-colors">
                            <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">{item.icon && <span className="text-gray-400 scale-75">{item.icon}</span>}{item.title}</td>
                            <td className="px-6 py-4 text-gray-500">{item.subtitle}</td>
                            <td className="px-6 py-4 text-center font-bold text-gray-800">{item.count}</td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-xs font-medium text-gray-600">{((item.count / totalPacientes) * 100).toFixed(1)}%</span>
                                <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(item.count / totalPacientes) * 100}%` }}></div></div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right font-mono text-green-600">{item.value ? `R$ ${item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold text-gray-900">
                        <tr>
                          <td colSpan={2} className="px-6 py-4 text-right uppercase text-xs tracking-wider">Total Geral</td>
                          <td className="px-6 py-4 text-center text-lg text-blue-700">{totalPacientes}</td>
                          <td className="px-6 py-4"></td>
                          <td className="px-6 py-4 text-right text-green-700">{`R$ ${(totalEstimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {viewMode === "cards" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 justify-items-center animate-in fade-in zoom-in-95 duration-300">
                  {sortedDisplayData.map((item) => {
                    const breakdown = getBreakdownMeta(item);
                    const hasBreakdown = !!breakdown;
                    const isClickable = statType === "unidades" || !hasBreakdown;

                    return (
                      <div key={item.id} className="w-full max-w-sm">
                        <Card
                          className={`w-full rounded-xl shadow-lg bg-white p-2 transition-transform duration-200 relative 
                              ${isClickable ? "cursor-pointer hover:scale-105" : ""}`}
                          onClick={() => handleDrillDown(item)}
                        >
                          <div className="relative z-10 flex flex-col h-full">
                          <CardHeader className="relative p-0 pb-1 flex flex-row items-start justify-between space-y-0 w-full">
                            <div className={`flex flex-col truncate ${statType === "unidades" ? "pr-12" : "pr-2"}`}>
                              <span className="text-sm font-semibold text-blue-700 truncate" title={item.title}>{item.title}</span>
                              <span className="text-[11px] text-gray-500 truncate">{item.subtitle}</span>
                              {statType === "unidades" && (
                                <div className="mt-1.5 flex flex-col items-start gap-1.5 text-[11px] font-semibold">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <button
                                      type="button"
                                      title="Ver pacientes cancelados por motivo de cancelamento"
                                      className="flex items-center gap-1 text-red-600 transition-colors hover:text-red-700"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openCancellationDrillDown(item);
                                      }}
                                    >
                                      <UserX className="w-3.5 h-3.5" />
                                      {item.cancellationCount || 0}
                                    </button>
                                    <button
                                      type="button"
                                      title="Ver pacientes organizados por estrelas e comentário"
                                      className="flex items-center gap-1 text-yellow-600 transition-colors hover:text-yellow-700"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openRatingDrillDown(item);
                                      }}
                                    >
                                      {"\u2605"} {item.ratingCount ? (item.ratingSum! / item.ratingCount!).toFixed(1) : "-"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {statType === "unidades" ? (
                              <div className="absolute right-0 top-0 flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                                <Link
                                  href={`/novo-agendamento?unidade=${encodeURIComponent(item.id)}`}
                                  className="rounded-full border border-green-100 bg-green-50/95 p-1.5 shadow-sm transition-all duration-200 hover:scale-110 hover:bg-green-100 group/btn"
                                  title="Novo Agendamento"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Plus className="h-4 w-4 text-green-600 group-hover/btn:text-green-700" />
                                </Link>
                                <Link
                                  href={`/visualizar-agendamentos?unidade=${encodeURIComponent(item.id)}&filtro=${encodeURIComponent(filter)}`}
                                  className="rounded-full border border-blue-100 bg-blue-50/95 p-1.5 shadow-sm transition-all duration-200 hover:scale-110 hover:bg-blue-100 group/btn"
                                  title="Ver Agenda"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <FileText className="h-4 w-4 text-blue-600 group-hover/btn:text-blue-700" />
                                </Link>
                                <Sheet>
                                  <SheetTrigger asChild>
                                    <button
                                      className="rounded-full border border-green-100 bg-green-50/95 p-1.5 shadow-sm transition-all duration-200 hover:scale-110 hover:bg-green-100 group/btn"
                                      title="Ver Financeiro"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <DollarSign className="h-4 w-4 text-green-600 group-hover/btn:text-green-700" />
                                    </button>
                                  </SheetTrigger>
                                  <SheetContent className="sm:max-w-lg">
                                    <SheetHeader>
                                      <SheetTitle className="flex items-center text-xl font-semibold text-gray-800">
                                        <Landmark className="mr-2 h-5 w-5 text-blue-600" />
                                        <span>Financeiro - {item.title}</span>
                                      </SheetTitle>
                                    </SheetHeader>
                                    <FinancialSheetContent unit={item.id} patientData={patientData} initialMonth={filter} unitConfig={unitConfig} />
                                  </SheetContent>
                                </Sheet>
                              </div>
                            ) : item.icon ? <div className="shrink-0 opacity-80">{item.icon}</div> : null}
                          </CardHeader>

                          <CardContent className="p-0 text-center flex-grow flex flex-col justify-center mt-0.5">
                            {breakdown ? (
                              <div className="flex flex-col justify-between w-full h-full px-1 pt-1 pb-1">
                                <div className="flex flex-col gap-1 w-full">
                                  {(expandedCards.has(item.id) ? breakdown.items : breakdown.items.slice(0, 3)).map((entry, i) => (
                                    <div 
                                      key={i} 
                                      className="flex justify-between items-center text-[10px] bg-gray-50 p-0.5 rounded border border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors group"
                                      onClick={() => handleDrillDown(item, entry.name)}
                                      title={`Ver pacientes de ${entry.name}`}
                                    >
                                      <span className="truncate font-medium text-gray-700 max-w-[80px] group-hover:text-blue-700" title={entry.name}>{entry.name}</span>
                                      <div className="flex gap-1.5 px-0.5">
                                        <span className="font-bold text-gray-900">{entry.count}</span>
                                        <span className="font-mono text-green-600">R${entry.value}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                  <div className="flex-grow flex justify-between items-center text-[10px] bg-blue-50 p-0.5 rounded border border-blue-100 shadow-inner">
                                    <span className="font-semibold text-blue-800">Total</span>
                                    <div className="flex gap-1.5">
                                      <span className="font-bold text-blue-900">{item.count}</span>
                                      <span className="font-mono text-green-700">R${item.value || 0}</span>
                                    </div>
                                  </div>
                                  {breakdown.items.length > 3 && (
                                    <button 
                                      onClick={(e) => toggleCardExpansion(item.id, e)} 
                                      className="text-blue-500 hover:text-blue-700 transition-colors p-0.5"
                                      title={expandedCards.has(item.id) ? "Ver menos" : "Ver todos"}
                                    >
                                      {expandedCards.has(item.id) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="text-base font-bold text-gray-800">{item.count}</div>
                                <div className="text-[10px] text-gray-400 mb-0.5">{statType === 'exames' ? 'Solicita\u00E7\u00F5es' : 'Pacientes'}</div>
                                {item.value !== undefined ? (
                                  <div className="text-xs font-semibold text-green-600">R$ {item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                                ) : (
                                  <div className="text-xs font-semibold text-green-600">{((item.count / totalPacientes) * 100).toFixed(1)}%</div>
                                )}
                              </>
                            )}
                          </CardContent>
                          </div>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Footer Summary */}
          {!loading && displayData.length > 0 && (
            <div className="mt-8 flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-12 p-4 bg-gray-50/50 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">{statType === 'exames' ? 'Total de Exames:' : 'Total de Pacientes:'}</span>
                <span className="text-base font-bold text-blue-900">{totalPacientes}</span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-gray-300"></div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Valor Estimado:</span>
                <span className="text-base font-bold text-green-600">{`R$ ${(totalEstimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}</span>
              </div>
            </div>
          )}

        </section>
      </div>
    </SidebarLayout>
  );
}


