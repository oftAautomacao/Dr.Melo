"use client";

import SidebarLayout from "@/components/layout/sidebar-layout";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, MapPin, Users, FileText, BarChart3, List, LayoutGrid, Plus, DollarSign, Landmark, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Building2 } from "lucide-react";
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
import { differenceInYears, parse } from "date-fns";
import { PatientDetailsSheet, AppointmentDetail } from "@/components/PatientDetailsSheet";

/* ---------- helpers ---------- */
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const obterNomeMes = (dataStr: string) => {
  const [ano, mes] = dataStr.split("-");
  const idx = Number(mes) - 1;
  return idx >= 0 && idx < 12 ? `${MESES[idx]} de ${ano}` : null;
};

const obterAno = (dataStr: string) => dataStr.substring(0, 4);

const calculateAge = (nascimento: string) => {
  if (!nascimento) return 0;
  try {
    const birthDate = parse(nascimento, 'dd/MM/yyyy', new Date());
    return differenceInYears(new Date(), birthDate);
  } catch {
    return 0;
  }
};

const getAgeBucket = (nascimento: string) => {
  const age = calculateAge(nascimento);
  if (age <= 13) return "Criança";
  if (age <= 59) return "Adulto"; // Includes adolescents as requested
  return "Idoso";
};

/* ---------- Types ---------- */
type StatType = "unidades" | "convenios" | "faixaEtaria" | "exames" | "historico";
type DashboardMode = "simple" | "advanced";

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
}

/* =============================================================
   PÁGINA INICIAL MERGED (HOME + STATISTICS)
   ============================================================= */
export default function Home() {
  const router = useRouter();
  /* ---------- state ---------- */
  const [patientData, setPatientData] = useState<Record<string, Record<string, any>>>({});
  const [unitConfig, setUnitConfig] = useState<Record<string, { bairro?: string; empresa?: string }>>({});
  const [examConfig, setExamConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Dashboard Mode State
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("simple");
  const [periodMode, setPeriodMode] = useState<'month' | 'year'>('month');

  // Filters (Shared)
  const [filter, setFilter] = useState<string>("");

  // Advanced States
  const [statType, setStatType] = useState<StatType>("unidades");
  const [filterCategory, setFilterCategory] = useState<"unidade" | "convenio" | "faixaEtaria" | "exame">("unidade");
  const [filterValue, setFilterValue] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [sortColumn, setSortColumn] = useState<"title" | "count" | "percentage" | "value" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Drill-down states
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [activeDrillDown, setActiveDrillDown] = useState<{ title: string; patients: AppointmentDetail[] } | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

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

  /* ---------- RTDB listeners ---------- */
  useEffect(() => {
    const db = getDatabaseInstance(ENVIRONMENT);
    const pathBase = getFirebasePathBase();
    const node = pathBase === 'OFT/45' ? 'medicos' : 'unidades';

    const agRef = ref(db, `/${pathBase}/agendamentoWhatsApp/operacional/consultasAgendadas/${node}`);
    const offAg = onValue(agRef, snap => {
      setPatientData(snap.exists() ? (snap.val() as any) : {});
      setLoading(false);
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
      offCfg();
      offExames();
    };
  }, []);

  /* ---------- Reset Filters on Mode Change ---------- */
  useEffect(() => {
    if (dashboardMode === 'simple') {
      // Force defaults for simple mode
      setStatType('unidades');
      setFilterCategory('unidade');
      setFilterValue('all');
      setViewMode('cards');
    }
  }, [dashboardMode]);

  /* ---------- Sync Filter Category with Stat Type ---------- */
  useEffect(() => {
    // Map statType to corresponding filterCategory
    const mapping: Record<StatType, "unidade" | "convenio" | "faixaEtaria" | "exame"> = {
      "unidades": "unidade",
      "convenios": "convenio",
      "faixaEtaria": "faixaEtaria",
      "exames": "exame",
      "historico": "unidade" // Default to unidade for historico
    };

    const newFilterCategory = mapping[statType];
    if (newFilterCategory) {
      setFilterCategory(newFilterCategory);
      setFilterValue("all"); // Always set to "all" when changing statType
    }
  }, [statType]);

  useEffect(() => {
    if (filterCategory === 'unidade' || filterCategory === 'convenio' || filterCategory === 'faixaEtaria' || filterCategory === 'exame') {
      setFilterValue("all");
    } else {
      setFilterValue("");
    }
  }, [filterCategory]);

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

  const faixasEtariasAvailable = ["Criança", "Adulto", "Idoso"];

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
            
            if (date < "2026-03-01" || selectedUnit !== "DRM") {
               appValue = 30; // Regra antiga
            } else {
               if (!isParticular) {
                  appValue = 30; // Plano de Saúde: mantém 30,00
               } else {
                  // Particular: soma valor configurado
                  let sum = 0;
                  if (Array.isArray(hours[time].exames)) {
                      hours[time].exames.forEach((exName: string) => {
                          const conf = examConfig[exName];
                          let priceDrMelo = conf?.drMelo;

                          // Preparação para futura alteração onde drMelo será separado por unidade
                          if (priceDrMelo && typeof priceDrMelo === 'object') {
                              priceDrMelo = priceDrMelo[unit] || 0;
                          }

                          if (typeof priceDrMelo === 'number') {
                              sum += priceDrMelo;
                          } else if (typeof priceDrMelo === 'string') {
                              if (!priceDrMelo.toLowerCase().includes("incluso")) {
                                  const parsed = Number(priceDrMelo.replace(/[^\d.,]/g, '').replace(',', '.'));
                                  if (!isNaN(parsed)) sum += parsed;
                              }
                          }
                      });
                  }
                  appValue = sum;
               }
            }

            const app = { ...hours[time], _unit: unit, _date: date, _time: time, _value: appValue };

            if (filterCategory === 'convenio' && filterValue && filterValue !== 'all' && app.convenio !== filterValue) continue;
            if (filterCategory === 'exame' && filterValue && filterValue !== 'all') {
              if (!Array.isArray(app.exames) || !app.exames.includes(filterValue)) continue;
            }
            if (filterCategory === 'faixaEtaria' && filterValue && filterValue !== 'all') {
              const bucket = getAgeBucket(app.nascimento);
              if (bucket !== filterValue) continue;
            }
            if (filterCategory === 'unidade' && filterValue && filterValue !== 'all' && app._unit !== filterValue) continue;

            appointments.push(app);
          }
        }
      }
    }
    return appointments;
  }, [patientData, filter, statType, filterCategory, filterValue, examConfig, selectedUnit]);

  const displayData = useMemo<CardData[]>(() => {
    const appointments = filteredAppointments;
    if (appointments.length === 0) return [];

    // 2. Aggregate
    if (statType === "historico") {
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
        .sort(([a], [b]) => {
          const [mA, yA] = a.split(" de ");
          const [mB, yB] = b.split(" de ");
          const idxA = MESES.indexOf(mA);
          const idxB = MESES.indexOf(mB);
          return Number(yA) === Number(yB) ? idxA - idxB : Number(yA) - Number(yB);
        })
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
      // Logic for "Unidades" + "Convenio" + "All" => Show Top 3 Convenios per Unit
      if (filterCategory === 'convenio' && filterValue === 'all') {
        const unitConvenios: Record<string, Record<string, { count: number, value: number }>> = {};
        const unitCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const u = app._unit;
          const c = app.convenio || "Não informado";

          if (!unitCounts[u]) unitCounts[u] = { count: 0, value: 0 };
          unitCounts[u].count += 1;
          unitCounts[u].value += app._value;

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
            title: unitConfig?.[unit]?.empresa ?? unit,
            subtitle: unitConfig?.[unit]?.bairro ?? (selectedUnit === 'OFT/45' ? "Médico" : "Unidade"),
            count: unitCounts[unit].count,
            value: unitCounts[unit].value,
            icon: <Building2 className="h-5 w-5 text-blue-500" />,
            topConvenios: top3
          };
        });
      }

      // Logic for "Unidades" + "Faixa Etaria" + "All" => Show Age Breakdown per Unit
      if (filterCategory === 'faixaEtaria' && filterValue === 'all') {
        const unitFaixas: Record<string, Record<string, { count: number, value: number }>> = {};
        const unitCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const u = app._unit;
          const bucket = getAgeBucket(app.nascimento) || "Desconhecido";

          if (!unitCounts[u]) unitCounts[u] = { count: 0, value: 0 };
          unitCounts[u].count += 1;
          unitCounts[u].value += app._value;

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
            title: unitConfig?.[unit]?.empresa ?? unit,
            subtitle: unitConfig?.[unit]?.bairro ?? (selectedUnit === 'OFT/45' ? "Médico" : "Unidade"),
            count: unitCounts[unit].count,
            value: unitCounts[unit].value,
            icon: <Building2 className="h-5 w-5 text-blue-500" />,
            topFaixas: faixas
          };
        });
      }

      // Logic for "Unidades" + "Exame" + "All" => Show Top 3 Exams per Unit
      if (filterCategory === 'exame' && filterValue === 'all') {
        const unitExames: Record<string, Record<string, { count: number, value: number }>> = {};
        const unitCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const u = app._unit;
          if (!unitCounts[u]) unitCounts[u] = { count: 0, value: 0 };
          unitCounts[u].count += 1;
          unitCounts[u].value += app._value;

          if (!unitExames[u]) unitExames[u] = {};
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              if (!unitExames[u][ex]) unitExames[u][ex] = { count: 0, value: 0 };
              unitExames[u][ex].count += 1;
              unitExames[u][ex].value += app._value;
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
            title: unitConfig?.[unit]?.empresa ?? unit,
            subtitle: unitConfig?.[unit]?.bairro ?? (selectedUnit === 'OFT/45' ? "Médico" : "Unidade"),
            count: unitCounts[unit].count,
            value: unitCounts[unit].value,
            icon: <Building2 className="h-5 w-5 text-blue-500" />,
            topExames: top3
          };
        });
      }

      // Default Logic (Count only)
      const counts: Record<string, { count: number, value: number }> = {};
      appointments.forEach(app => {
        if (!counts[app._unit]) counts[app._unit] = { count: 0, value: 0 };
        counts[app._unit].count += 1;
        counts[app._unit].value += app._value;
      });

      // Always sort by Count Descending (as requested for List View consistency)
      const entries = Object.keys(counts).sort((a, b) => counts[b].count - counts[a].count);

      return entries.map(unit => ({
        id: unit,
        title: unitConfig?.[unit]?.empresa ?? unit,
        subtitle: unitConfig?.[unit]?.bairro ?? (selectedUnit === 'OFT/45' ? "Médico" : "Unidade"),
        count: counts[unit].count,
        value: counts[unit].value,
        icon: <Building2 className="h-5 w-5 text-blue-500" />
      }));
    }

    if (statType === "convenios") {
      // Logic for "Convenios" + "Unidade" + "All" => Show Top 3 Units per Convenio
      if (filterCategory === 'unidade' && filterValue === 'all') {
        const convenioUnidades: Record<string, Record<string, { count: number, value: number }>> = {};
        const convenioCounts: Record<string, { count: number, value: number }> = {};

        appointments.forEach(app => {
          const c = app.convenio || "Não informado";
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
                name: unitConfig?.[name]?.empresa ?? name,
                count: data.count,
                value: data.value
              }));

              return {
                id: convenio,
                title: convenio,
                subtitle: "Convênio Médico",
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
          const c = app.convenio || "Não informado";
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
                subtitle: "Convênio Médico",
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
          const c = app.convenio || "Não informado";

          if (!convenioCounts[c]) convenioCounts[c] = { count: 0, value: 0 };
          convenioCounts[c].count += 1;
          convenioCounts[c].value += app._value;

          if (!convenioExames[c]) convenioExames[c] = {};
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              if (!convenioExames[c][ex]) convenioExames[c][ex] = { count: 0, value: 0 };
              convenioExames[c][ex].count += 1;
              convenioExames[c][ex].value += app._value;
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
                subtitle: "Convênio Médico",
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
        const conv = app.convenio || "Não informado";
        if (!counts[conv]) counts[conv] = { count: 0, value: 0 };
        counts[conv].count += 1;
        counts[conv].value += app._value;
      });
      return Object.entries(counts)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, data]) => ({
          id: name,
          title: name,
          subtitle: "Convênio Médico",
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

        const ranges = { "Criança": "0-13 anos", "Adulto": "14-59 anos", "Idoso": "60+ anos" };
        const order = ["Criança", "Adulto", "Idoso"];

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
              subtitle: ranges[faixa as keyof typeof ranges] || "Faixa Etária",
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
          const c = app.convenio || "Não informado";

          if (!faixaCounts[bucket]) faixaCounts[bucket] = { count: 0, value: 0 };
          faixaCounts[bucket].count += 1;
          faixaCounts[bucket].value += app._value;

          if (!faixaConvenios[bucket]) faixaConvenios[bucket] = {};
          if (!faixaConvenios[bucket][c]) faixaConvenios[bucket][c] = { count: 0, value: 0 };
          faixaConvenios[bucket][c].count += 1;
          faixaConvenios[bucket][c].value += app._value;
        });

        const ranges = { "Criança": "0-13 anos", "Adulto": "14-59 anos", "Idoso": "60+ anos" };
        const order = ["Criança", "Adulto", "Idoso"];

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
              subtitle: ranges[faixa as keyof typeof ranges] || "Faixa Etária",
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
              faixaExames[bucket][ex].value += app._value;
            });
          }
        });

        const ranges = { "Criança": "0-13 anos", "Adulto": "14-59 anos", "Idoso": "60+ anos" };
        const order = ["Criança", "Adulto", "Idoso"];

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
              subtitle: ranges[faixa as keyof typeof ranges] || "Faixa Etária",
              count: faixaCounts[faixa].count,
              value: faixaCounts[faixa].value,
              icon: <Users className="h-5 w-5 text-purple-500" />,
              topExames: top3
            };
          });
      }

      // Default Logic
      const buckets: Record<string, { count: number, value: number }> = { 
        "Criança": { count: 0, value: 0 }, 
        "Adulto": { count: 0, value: 0 }, 
        "Idoso": { count: 0, value: 0 } 
      };
      const ranges = { "Criança": "0-13 anos", "Adulto": "14-59 anos", "Idoso": "60+ anos" };
      appointments.forEach(app => {
        const bucket = getAgeBucket(app.nascimento);
        if (buckets[bucket] !== undefined) {
          buckets[bucket].count++;
          buckets[bucket].value += app._value;
        }
      });
      const order = ["Criança", "Adulto", "Idoso"];
      return order
        .map(name => ({
          id: name,
          title: name,
          subtitle: ranges[name as keyof typeof ranges] || "Faixa Etária",
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
              exameCounts[ex].value += app._value;

              if (!exameUnidades[ex]) exameUnidades[ex] = {};
              if (!exameUnidades[ex][u]) exameUnidades[ex][u] = { count: 0, value: 0 };
              exameUnidades[ex][u].count += 1;
              exameUnidades[ex][u].value += app._value;
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
          const c = app.convenio || "Não informado";
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              if (!exameCounts[ex]) exameCounts[ex] = { count: 0, value: 0 };
              exameCounts[ex].count += 1;
              exameCounts[ex].value += app._value;

              if (!exameConvenios[ex]) exameConvenios[ex] = {};
              if (!exameConvenios[ex][c]) exameConvenios[ex][c] = { count: 0, value: 0 };
              exameConvenios[ex][c].count += 1;
              exameConvenios[ex][c].value += app._value;
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
              exameCounts[ex].value += app._value;

              if (!exameFaixas[ex]) exameFaixas[ex] = {};
              if (!exameFaixas[ex][bucket]) exameFaixas[ex][bucket] = { count: 0, value: 0 };
              exameFaixas[ex][bucket].count += 1;
              exameFaixas[ex][bucket].value += app._value;
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
            counts[ex].value += app._value;
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
          icon: <Activity className="h-5 w-5 text-orange-500" />
        }));
    }
    return [];
  }, [filteredAppointments, statType, unitConfig, filterCategory, filterValue]);

  const totalPacientes = displayData.reduce((acc, item) => acc + item.count, 0);
  const totalEstimado = displayData.reduce((acc, item) => acc + (item.value || 0), 0);

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



  // Function to handle card click for detailed records
  const handleDrillDown = (item: CardData, subItemName?: string) => {
    // If NOT in analytic mode, navigate to unit calendar if it's a unit card
    if (dashboardMode === 'simple') {
      if (statType === 'unidades') {
        router.push(`/visualizar-agendamentos?unidade=${encodeURIComponent(item.id)}&filtro=${encodeURIComponent(filter)}`);
      }
      return;
    }

    // In Analytic Mode: Only drill down if there's no breakdown OR if it's a subItem click
    const hasBreakdown = !!(item.topConvenios || item.topFaixas || item.topExames || item.topUnidades);
    if (hasBreakdown && !subItemName) return;

    // Filter appointments for this item from filteredAppointments
    let matches: any[] = [];
    if (statType === "unidades") {
      matches = filteredAppointments.filter((app: any) => app._unit === item.id);
    } else if (statType === "convenios") {
      matches = filteredAppointments.filter((app: any) => (app.convenio || "Não informado") === item.id);
    } else if (statType === "faixaEtaria") {
      matches = filteredAppointments.filter((app: any) => getAgeBucket(app.nascimento) === item.id);
    } else if (statType === "exames") {
      matches = filteredAppointments.filter((app: any) => Array.isArray(app.exames) && app.exames.includes(item.id));
    } else if (statType === "historico") {
      matches = filteredAppointments.filter((app: any) => obterNomeMes(app._date) === item.id);
    }

    // Secondary filter if subItemName is provided
    if (subItemName) {
      if (item.topUnidades) {
        matches = matches.filter((app: any) => (unitConfig?.[app._unit]?.empresa ?? app._unit) === subItemName);
      } else if (item.topConvenios) {
        matches = matches.filter((app: any) => (app.convenio || "Não informado") === subItemName);
      } else if (item.topFaixas) {
        matches = matches.filter((app: any) => getAgeBucket(app.nascimento) === subItemName);
      } else if (item.topExames) {
        matches = matches.filter((app: any) => Array.isArray(app.exames) && app.exames.includes(subItemName));
      }
    }

    const details: AppointmentDetail[] = matches.map((app: any) => ({
      nome: app.nomePaciente || app.nome || "Não informado",
      nascimento: app.nascimento || "-",
      idade: calculateAge(app.nascimento),
      convenio: app.convenio || "Não informado",
      unidade: app._unit,
      unidadeName: unitConfig?.[app._unit]?.empresa ?? app._unit,
      dataConsulta: app._date.split("-").reverse().join("/"),
      horario: app._time || "-",
      exames: Array.isArray(app.exames) ? app.exames : [],
      telefone: app.telefone || ""
    }));

    const finalTitle = subItemName ? `${item.title} › ${subItemName}` : item.title;
    setActiveDrillDown({ title: finalTitle, patients: details });
    setDrillDownOpen(true);
  };

  /* ---------- UI ---------- */
  return (
    <SidebarLayout unit={selectedUnit}>
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

        {/* Top section: Header, Logo, and Mode Toggle */}
        <section className="w-full flex flex-col xl:flex-row justify-between items-start xl:items-end mb-8 gap-6">
          <div className="flex flex-col items-start gap-4">
            {selectedUnit === "OFT/45" ? (
              <Image src="/images/logo pequena.png" alt="OFT Logo" width={150} height={60} layout="intrinsic" />
            ) : (
              <Image src="/images/image1.png" alt="Dr. Melo Logo" width={200} height={80} />
            )}

            {/* Dashboard Mode Toggle */}
            <button
              onClick={() => setDashboardMode(prev => prev === 'simple' ? 'advanced' : 'simple')}
              className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors flex items-center gap-1.5"
            >
              <BarChart3 className="w-4 h-4" />
              {dashboardMode === 'simple' ? 'Ativar Modo Analítico' : 'Voltar ao Modo Simples'}
            </button>
          </div>

          {/* Controls Container - Only show robust checks in Advanced Mode */}
          {dashboardMode === 'advanced' && (
            <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center w-full xl:w-auto bg-white/60 p-4 rounded-xl border border-blue-100/50 backdrop-blur-sm shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                <label className="text-xs font-semibold text-blue-900 uppercase tracking-wider ml-1">Agrupar Por</label>
                <Select value={statType} onValueChange={(v) => setStatType(v as StatType)}>
                  <SelectTrigger className="w-full sm:w-[160px] bg-white"><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unidades">{selectedUnit === 'OFT/45' ? 'Médicos' : 'Unidades'}</SelectItem>
                    <SelectItem value="convenios">Convênios</SelectItem>
                    <SelectItem value="faixaEtaria">Faixa Etária</SelectItem>
                    <SelectItem value="exames">Exames</SelectItem>
                    <SelectItem value="historico">Evolução Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                <label className="text-xs font-semibold text-blue-900 uppercase tracking-wider ml-1">Filtrar por</label>
                <Select value={filterCategory} onValueChange={(v: any) => setFilterCategory(v)}>
                  <SelectTrigger className="w-full sm:w-[150px] bg-white"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unidade">{selectedUnit === 'OFT/45' ? 'Médico' : 'Unidade'}</SelectItem>
                    <SelectItem value="convenio">Convênio</SelectItem>
                    <SelectItem value="faixaEtaria">Faixa Etária</SelectItem>
                    <SelectItem value="exame">Exame</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5 w-full sm:w-auto animate-in fade-in">
                <label className="text-xs font-semibold text-blue-900 uppercase tracking-wider ml-1">Opção</label>
                <Select value={filterValue} onValueChange={setFilterValue}>
                  <SelectTrigger className="w-full sm:w-[160px] bg-white"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    {filterCategory === 'unidade' && (
                      <>
                        <SelectItem value="all">Todas</SelectItem>
                        {unitsAvailable.map((u) => (
                          <SelectItem key={u} value={u}>{unitConfig?.[u]?.empresa ?? u} {unitConfig?.[u]?.bairro ? ` - ${unitConfig?.[u]?.bairro}` : ''}</SelectItem>
                        ))}
                      </>
                    )}
                    {filterCategory === 'convenio' && (
                      <>
                        <SelectItem value="all">Todas</SelectItem>
                        {conveniosAvailable.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </>
                    )}
                    {filterCategory === 'faixaEtaria' && (
                      <>
                        <SelectItem value="all">Todas</SelectItem>
                        {faixasEtariasAvailable.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </>
                    )}
                    {filterCategory === 'exame' && (
                      <>
                        <SelectItem value="all">Todas</SelectItem>
                        {examesAvailable.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                <label className="text-xs font-semibold text-blue-900 uppercase tracking-wider ml-1">Período</label>
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="w-full sm:w-[160px] bg-white"><SelectValue placeholder="Mês/Ano" /></SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    {statType === 'historico' && <SelectItem value="all">Todos os Anos</SelectItem>}
                    {anosDisponiveis.map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
                    {statType !== 'historico' && mesesDisponiveis.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm self-end">
                <button onClick={() => setViewMode("cards")} className={`p-2 rounded-md ${viewMode === "cards" ? "bg-blue-100 text-blue-700" : "text-gray-400 hover:text-gray-600"}`}><LayoutGrid className="w-5 h-5" /></button>
                <button onClick={() => setViewMode("table")} className={`p-2 rounded-md ${viewMode === "table" ? "bg-blue-100 text-blue-700" : "text-gray-400 hover:text-gray-600"}`}><List className="w-5 h-5" /></button>
              </div>
            </div>
          )}

          {/* Basic Period Filter (Visible ONLY in Simple Mode) */}
          {dashboardMode === 'simple' && (
            <div className="flex flex-col items-end pt-4">
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center bg-white rounded-xl border border-slate-200 shadow-sm divide-x divide-slate-100">
                  <button
                    onClick={() => handlePeriodChange('prev')}
                    disabled={isPrevDisabled}
                    className="px-3 py-2.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors"
                    title="Anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={togglePeriodMode}
                    className="px-6 py-2 text-xs font-medium text-slate-700 hover:text-blue-600 min-w-[148px] text-center tracking-wide transition-colors cursor-pointer"
                    title={`Clique para ver por ${periodMode === 'year' ? 'Mês' : 'Ano'}`}
                  >
                    {filter}
                  </button>
                  <button
                    onClick={() => handlePeriodChange('next')}
                    disabled={isNextDisabled}
                    className="px-3 py-2.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors"
                    title="Próximo"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>


        {/* Main Content */}
        <section className="w-full max-w-6xl transition-all duration-300">
          {loading && <p className="text-center">Carregando…</p>}

          {!loading && displayData.length === 0 && (
            <div className="text-center p-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-500">Nenhum dado encontrado para esta combinação.</p>
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
                                <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
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
                                <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
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
                                <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
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
                                <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
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
                    const hasBreakdown = !!(item.topConvenios || item.topFaixas || item.topExames || item.topUnidades);
                    const isClickable = dashboardMode === 'simple' || !hasBreakdown;

                    return (
                      <Card
                        key={item.id}
                        className={`w-full max-w-sm rounded-xl shadow-lg bg-white p-2 transition-transform duration-200 relative 
                            ${isClickable ? "cursor-pointer hover:scale-105" : ""}`}
                        onClick={() => handleDrillDown(item)}
                      >
                        <div className="relative z-10 flex flex-col h-full">
                          <CardHeader className="p-0 pb-1 flex flex-row items-start justify-between space-y-0 w-full">
                            <div className="flex flex-col truncate pr-2">
                              <span className="text-sm font-semibold text-blue-700 truncate" title={item.title}>{item.title}</span>
                              <span className="text-[10px] text-gray-500 truncate">{item.subtitle}</span>
                            </div>

                            {/* Default Home Actions: Render ONLY if Unidades + Simple */}
                            {statType === "unidades" && dashboardMode === 'simple' && (
                              <div className="flex flex-row items-center gap-2 relative z-20" onClick={(e) => e.stopPropagation()}>
                                <Link
                                  href={`/novo-agendamento?unidade=${encodeURIComponent(item.id)}`}
                                  className="shrink-0 p-1.5 bg-green-50/50 hover:bg-green-100/80 hover:scale-110 shadow-sm border border-green-100 rounded-full transition-all duration-200 group/btn"
                                  title="Novo Agendamento"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Plus className="h-4 w-4 text-green-600 group-hover/btn:text-green-700" />
                                </Link>
                                <Sheet>
                                  <SheetTrigger asChild>
                                    <button
                                      className="shrink-0 p-1.5 bg-green-50/50 hover:bg-green-100/80 hover:scale-110 shadow-sm border border-green-100 rounded-full transition-all duration-200 group/btn"
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
                            )}

                            {/* Only show Icon in Advanced (Analytic) Mode */}
                            {dashboardMode === 'advanced' && (
                              <div className="shrink-0 opacity-80">{item.icon}</div>
                            )}
                          </CardHeader>

                          <CardContent className="p-0 text-center flex-grow flex flex-col justify-center mt-0.5">
                            {item.topUnidades ? (
                              <div className="flex flex-col justify-between w-full h-full px-1 pt-1 pb-1">
                                <div className="flex flex-col gap-1 w-full">
                                  {(expandedCards.has(item.id) ? item.topUnidades : item.topUnidades.slice(0, 3)).map((u, i) => (
                                    <div 
                                      key={i} 
                                      className="flex justify-between items-center text-[10px] bg-gray-50 p-0.5 rounded border border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors group"
                                      onClick={() => handleDrillDown(item, u.name)}
                                      title={`Ver pacientes de ${u.name}`}
                                    >
                                      <span className="truncate font-medium text-gray-700 max-w-[80px] group-hover:text-blue-700" title={u.name}>{u.name}</span>
                                      <div className="flex gap-1.5 px-0.5">
                                        <span className="font-bold text-gray-900">{u.count}</span>
                                        <span className="font-mono text-green-600">R${u.value}</span>
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
                                  {item.topUnidades.length > 3 && (
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
                            ) : item.topConvenios ? (
                              <div className="flex flex-col justify-between w-full h-full px-1 pt-1 pb-1">
                                <div className="flex flex-col gap-1 w-full">
                                  {(expandedCards.has(item.id) ? item.topConvenios : item.topConvenios.slice(0, 3)).map((c, i) => (
                                    <div 
                                      key={i} 
                                      className="flex justify-between items-center text-[10px] bg-gray-50 p-0.5 rounded border border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors group"
                                      onClick={() => handleDrillDown(item, c.name)}
                                      title={`Ver pacientes de ${c.name}`}
                                    >
                                      <span className="truncate font-medium text-gray-700 max-w-[80px] group-hover:text-blue-700" title={c.name}>{c.name}</span>
                                      <div className="flex gap-1.5 px-0.5">
                                        <span className="font-bold text-gray-900">{c.count}</span>
                                        <span className="font-mono text-green-600">R${c.value}</span>
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
                                  {item.topConvenios.length > 3 && (
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
                            ) : item.topFaixas ? (
                              <div className="flex flex-col justify-between w-full h-full px-1 pt-1 pb-1">
                                <div className="flex flex-col gap-1 w-full">
                                  {(expandedCards.has(item.id) ? item.topFaixas : item.topFaixas.slice(0, 3)).map((f, i) => (
                                    <div 
                                      key={i} 
                                      className="flex justify-between items-center text-[10px] bg-gray-50 p-0.5 rounded border border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors group"
                                      onClick={() => handleDrillDown(item, f.name)}
                                      title={`Ver pacientes de ${f.name}`}
                                    >
                                      <span className="truncate font-medium text-gray-700 max-w-[80px] group-hover:text-blue-700" title={f.name}>{f.name}</span>
                                      <div className="flex gap-1.5 px-0.5">
                                        <span className="font-bold text-gray-900">{f.count}</span>
                                        <span className="font-mono text-green-600">R${f.value}</span>
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
                                  {item.topFaixas.length > 3 && (
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
                            ) : item.topExames ? (
                              <div className="flex flex-col justify-between w-full h-full px-1 pt-1 pb-1">
                                <div className="flex flex-col gap-1 w-full">
                                  {(expandedCards.has(item.id) ? item.topExames : item.topExames.slice(0, 3)).map((e, i) => (
                                    <div 
                                      key={i} 
                                      className="flex justify-between items-center text-[10px] bg-gray-50 p-0.5 rounded border border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors group"
                                      onClick={() => handleDrillDown(item, e.name)}
                                      title={`Ver pacientes de ${e.name}`}
                                    >
                                      <span className="truncate font-medium text-gray-700 max-w-[80px] group-hover:text-blue-700" title={e.name}>{e.name}</span>
                                      <div className="flex gap-1.5 px-0.5">
                                        <span className="font-bold text-gray-900">{e.count}</span>
                                        <span className="font-mono text-green-600">R${e.value}</span>
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
                                  {item.topExames.length > 3 && (
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
                                <div className="text-[10px] text-gray-400 mb-0.5">{statType === 'exames' ? 'Solicitações' : 'Pacientes'}</div>
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

