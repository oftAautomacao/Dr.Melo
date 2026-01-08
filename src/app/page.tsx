"use client";

import SidebarLayout from "@/components/layout/sidebar-layout";
import Image from "next/image";
import Link from "next/link";
import { DollarSign, Plus, Landmark, Users, FileText, Activity, MapPin, BarChart3, LayoutGrid, List } from "lucide-react";
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
  /* ---------- state ---------- */
  const [patientData, setPatientData] = useState<Record<string, Record<string, any>>>({});
  const [unitConfig, setUnitConfig] = useState<Record<string, { bairro?: string; empresa?: string }>>({});
  const [loading, setLoading] = useState(true);

  // Dashboard Mode State
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("simple");

  // Filters (Shared)
  const [filter, setFilter] = useState<string>("");

  // Advanced States
  const [statType, setStatType] = useState<StatType>("unidades");
  const [filterCategory, setFilterCategory] = useState<"unidade" | "convenio" | "faixaEtaria" | "exame">("unidade");
  const [filterValue, setFilterValue] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

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

    return () => {
      offAg();
      offCfg();
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

  const faixasEtariasAvailable = ["Criança", "Adolescente", "Adulto", "Idoso"];

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
    if (statType === 'historico' && filter.includes(' de ')) {
      const justYear = filter.split(' de ')[1];
      if (justYear) setFilter(justYear);
      return;
    }
    if (filter) return;

    const hoje = new Date();
    const mesAtual = `${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`;
    if (mesesDisponiveis.includes(mesAtual)) setFilter(mesAtual);
    else if (mesesDisponiveis.length) setFilter(mesesDisponiveis.at(-1)!);
    else if (anosDisponiveis.length) setFilter(anosDisponiveis[0]);
  }, [filter, mesesDisponiveis, anosDisponiveis, statType]);


  /* ---------- Data Processing Logic (Unified) ---------- */
  const displayData = useMemo<CardData[]>(() => {
    if (!filter) return [];

    let appointments: any[] = [];
    const filterYear = filter.includes(" de ") ? filter.split(" de ")[1] : filter;
    const filterMonthStr = filter.includes(" de ") ? filter : null;

    // 1. Traverse Data
    for (const unit in patientData) {
      if (filterCategory === 'unidade' && filterValue && filterValue !== 'all' && unit !== filterValue) continue;

      for (const date in patientData[unit]) {
        const apptYear = obterAno(date);
        const apptMonthStr = obterNomeMes(date);
        let include = false;

        if (statType === 'historico') {
          if (apptYear === filterYear) include = true;
        } else {
          if (filterMonthStr) {
            if (apptMonthStr === filterMonthStr) include = true;
          } else {
            if (apptYear === filterYear) include = true;
          }
        }

        if (include) {
          const hours = patientData[unit][date];
          for (const time in hours) {
            const app = { ...hours[time], _unit: unit, _date: date };

            if (filterCategory === 'convenio' && filterValue && filterValue !== 'all' && app.convenio !== filterValue) continue;
            if (filterCategory === 'exame' && filterValue && filterValue !== 'all') {
              if (!Array.isArray(app.exames) || !app.exames.includes(filterValue)) continue;
            }
            if (filterCategory === 'faixaEtaria' && filterValue && filterValue !== 'all') {
              let bucket = "Desconhecido";
              if (app.nascimento) {
                try {
                  const birthDate = parse(app.nascimento, 'dd/MM/yyyy', new Date());
                  const age = differenceInYears(new Date(), birthDate);
                  if (age <= 12) bucket = "Criança";
                  else if (age <= 17) bucket = "Adolescente";
                  else if (age <= 59) bucket = "Adulto";
                  else bucket = "Idoso";
                } catch { }
              }
              if (bucket !== filterValue) continue;
            }
            appointments.push(app);
          }
        }
      }
    }

    // 2. Aggregate
    if (statType === "historico") {
      const monthlyCounts: Record<string, number> = {};
      appointments.forEach(app => {
        const m = obterNomeMes(app._date);
        if (m) monthlyCounts[m] = (monthlyCounts[m] || 0) + 1;
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
          value: count * 30,
          icon: <BarChart3 className="h-5 w-5 text-indigo-500" />
        }));
    }

    if (statType === "unidades") {
      // Logic for "Unidades" + "Convenio" + "All" => Show Top 3 Convenios per Unit
      if (filterCategory === 'convenio' && filterValue === 'all') {
        const unitConvenios: Record<string, Record<string, number>> = {};
        const unitCounts: Record<string, number> = {};

        appointments.forEach(app => {
          const u = app._unit;
          const c = app.convenio || "Não informado";

          unitCounts[u] = (unitCounts[u] || 0) + 1;

          if (!unitConvenios[u]) unitConvenios[u] = {};
          unitConvenios[u][c] = (unitConvenios[u][c] || 0) + 1;
        });

        return Object.keys(unitCounts).sort().map(unit => {
          const breakdown = unitConvenios[unit] || {};
          const top3 = Object.entries(breakdown)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([name, count]) => ({ name, count, value: count * 30 }));

          return {
            id: unit,
            title: unitConfig?.[unit]?.empresa ?? unit,
            subtitle: unitConfig?.[unit]?.bairro ?? "Unidade",
            count: unitCounts[unit],
            value: unitCounts[unit] * 30,
            icon: <MapPin className="h-5 w-5 text-blue-500" />,
            topConvenios: top3
          };
        });
      }

      // Logic for "Unidades" + "Faixa Etaria" + "All" => Show Age Breakdown per Unit
      if (filterCategory === 'faixaEtaria' && filterValue === 'all') {
        const unitFaixas: Record<string, Record<string, number>> = {};
        const unitCounts: Record<string, number> = {};

        appointments.forEach(app => {
          const u = app._unit;
          let bucket = "Desconhecido";
          if (app.nascimento) {
            try {
              const birthDate = parse(app.nascimento, 'dd/MM/yyyy', new Date());
              const age = differenceInYears(new Date(), birthDate);
              if (age <= 12) bucket = "Criança";
              else if (age <= 17) bucket = "Adolescente";
              else if (age <= 59) bucket = "Adulto";
              else bucket = "Idoso";
            } catch { }
          }

          unitCounts[u] = (unitCounts[u] || 0) + 1;

          if (!unitFaixas[u]) unitFaixas[u] = {};
          unitFaixas[u][bucket] = (unitFaixas[u][bucket] || 0) + 1;
        });

        return Object.keys(unitCounts).sort().map(unit => {
          const breakdown = unitFaixas[unit] || {};
          // Show Top 3 Age Groups by count
          const faixas = Object.entries(breakdown)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([name, count]) => ({ name, count, value: count * 30 }));

          return {
            id: unit,
            title: unitConfig?.[unit]?.empresa ?? unit,
            subtitle: unitConfig?.[unit]?.bairro ?? "Unidade",
            count: unitCounts[unit],
            value: unitCounts[unit] * 30,
            icon: <MapPin className="h-5 w-5 text-blue-500" />,
            topFaixas: faixas
          };
        });
      }

      // Logic for "Unidades" + "Exame" + "All" => Show Top 3 Exams per Unit
      if (filterCategory === 'exame' && filterValue === 'all') {
        const unitExames: Record<string, Record<string, number>> = {};
        const unitCounts: Record<string, number> = {};

        appointments.forEach(app => {
          const u = app._unit;
          unitCounts[u] = (unitCounts[u] || 0) + 1;

          if (!unitExames[u]) unitExames[u] = {};
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              unitExames[u][ex] = (unitExames[u][ex] || 0) + 1;
            });
          }
        });

        return Object.keys(unitCounts).sort().map(unit => {
          const breakdown = unitExames[unit] || {};
          const top3 = Object.entries(breakdown)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([name, count]) => ({ name, count, value: count * 30 }));

          return {
            id: unit,
            title: unitConfig?.[unit]?.empresa ?? unit,
            subtitle: unitConfig?.[unit]?.bairro ?? "Unidade",
            count: unitCounts[unit],
            value: unitCounts[unit] * 30,
            icon: <MapPin className="h-5 w-5 text-blue-500" />,
            topExames: top3
          };
        });
      }

      // Default Logic (Count only)
      const counts: Record<string, number> = {};
      appointments.forEach(app => {
        counts[app._unit] = (counts[app._unit] || 0) + 1;
      });

      // Always sort by Count Descending (as requested for List View consistency)
      const entries = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

      return entries.map(unit => ({
        id: unit,
        title: unitConfig?.[unit]?.empresa ?? unit,
        subtitle: unitConfig?.[unit]?.bairro ?? "Unidade",
        count: counts[unit],
        value: counts[unit] * 30,
        icon: <MapPin className="h-5 w-5 text-blue-500" />
      }));
    }

    if (statType === "convenios") {
      // Logic for "Convenios" + "Unidade" + "All" => Show Top 3 Units per Convenio
      if (filterCategory === 'unidade' && filterValue === 'all') {
        const convenioUnidades: Record<string, Record<string, number>> = {};
        const convenioCounts: Record<string, number> = {};

        appointments.forEach(app => {
          const c = app.convenio || "Não informado";
          const u = app._unit;

          convenioCounts[c] = (convenioCounts[c] || 0) + 1;

          if (!convenioUnidades[c]) convenioUnidades[c] = {};
          convenioUnidades[c][u] = (convenioUnidades[c][u] || 0) + 1;
        });

        return Object.keys(convenioCounts)
          .sort((a, b) => convenioCounts[b] - convenioCounts[a])
          .map(convenio => {
            const breakdown = convenioUnidades[convenio] || {};
            const top3 = Object.entries(breakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([name, count]) => ({
                name: unitConfig?.[name]?.empresa ?? name,
                count,
                value: count * 30
              }));

            return {
              id: convenio,
              title: convenio,
              subtitle: "Convênio Médico",
              count: convenioCounts[convenio],
              icon: <FileText className="h-5 w-5 text-green-600" />,
              topUnidades: top3
            };
          });
      }

      // Logic for "Convenios" + "Faixa Etaria" + "All" => Show Top 3 Age Groups per Convenio
      if (filterCategory === 'faixaEtaria' && filterValue === 'all') {
        const convenioFaixas: Record<string, Record<string, number>> = {};
        const convenioCounts: Record<string, number> = {};

        appointments.forEach(app => {
          const c = app.convenio || "Não informado";
          let bucket = "Desconhecido";
          if (app.nascimento) {
            try {
              const birthDate = parse(app.nascimento, 'dd/MM/yyyy', new Date());
              const age = differenceInYears(new Date(), birthDate);
              if (age <= 12) bucket = "Criança";
              else if (age <= 17) bucket = "Adolescente";
              else if (age <= 59) bucket = "Adulto";
              else bucket = "Idoso";
            } catch { }
          }

          convenioCounts[c] = (convenioCounts[c] || 0) + 1;

          if (!convenioFaixas[c]) convenioFaixas[c] = {};
          convenioFaixas[c][bucket] = (convenioFaixas[c][bucket] || 0) + 1;
        });

        return Object.keys(convenioCounts)
          .sort((a, b) => convenioCounts[b] - convenioCounts[a])
          .map(convenio => {
            const breakdown = convenioFaixas[convenio] || {};
            const top3 = Object.entries(breakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([name, count]) => ({ name, count, value: count * 30 }));

            return {
              id: convenio,
              title: convenio,
              subtitle: "Convênio Médico",
              count: convenioCounts[convenio],
              icon: <FileText className="h-5 w-5 text-green-600" />,
              topFaixas: top3
            };
          });
      }

      // Logic for "Convenios" + "Exame" + "All" => Show Top 3 Exams per Convenio
      if (filterCategory === 'exame' && filterValue === 'all') {
        const convenioExames: Record<string, Record<string, number>> = {};
        const convenioCounts: Record<string, number> = {};

        appointments.forEach(app => {
          const c = app.convenio || "Não informado";
          convenioCounts[c] = (convenioCounts[c] || 0) + 1;

          if (!convenioExames[c]) convenioExames[c] = {};
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              convenioExames[c][ex] = (convenioExames[c][ex] || 0) + 1;
            });
          }
        });

        return Object.keys(convenioCounts)
          .sort((a, b) => convenioCounts[b] - convenioCounts[a])
          .map(convenio => {
            const breakdown = convenioExames[convenio] || {};
            const top3 = Object.entries(breakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([name, count]) => ({ name, count, value: count * 30 }));

            return {
              id: convenio,
              title: convenio,
              subtitle: "Convênio Médico",
              count: convenioCounts[convenio],
              icon: <FileText className="h-5 w-5 text-green-600" />,
              topExames: top3
            };
          });
      }

      // Default Logic
      const counts: Record<string, number> = {};
      appointments.forEach(app => {
        const conv = app.convenio || "Não informado";
        counts[conv] = (counts[conv] || 0) + 1;
      });
      return Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, count]) => ({
          id: name,
          title: name,
          subtitle: "Convênio Médico",
          count,
          icon: <FileText className="h-5 w-5 text-green-600" />
        }));
    }

    if (statType === "faixaEtaria") {
      // Logic for "Faixa Etaria" + "Unidade" + "All" => Show Top 3 Units per Age Group
      if (filterCategory === 'unidade' && filterValue === 'all') {
        const faixaUnidades: Record<string, Record<string, number>> = {};
        const faixaCounts: Record<string, number> = {};

        appointments.forEach(app => {
          let bucket = "Desconhecido";
          if (app.nascimento) {
            try {
              const birthDate = parse(app.nascimento, 'dd/MM/yyyy', new Date());
              const age = differenceInYears(new Date(), birthDate);
              if (age <= 12) bucket = "Criança";
              else if (age <= 17) bucket = "Adolescente";
              else if (age <= 59) bucket = "Adulto";
              else bucket = "Idoso";
            } catch { }
          }
          const u = app._unit;

          faixaCounts[bucket] = (faixaCounts[bucket] || 0) + 1;

          if (!faixaUnidades[bucket]) faixaUnidades[bucket] = {};
          faixaUnidades[bucket][u] = (faixaUnidades[bucket][u] || 0) + 1;
        });

        const ranges = { "Criança": "0-12 anos", "Adolescente": "13-17 anos", "Adulto": "18-59 anos", "Idoso": "60+ anos" };
        return Object.keys(faixaCounts)
          .sort((a, b) => faixaCounts[b] - faixaCounts[a])
          .map(faixa => {
            const breakdown = faixaUnidades[faixa] || {};
            const top3 = Object.entries(breakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([name, count]) => ({
                name: unitConfig?.[name]?.empresa ?? name,
                count,
                value: count * 30
              }));

            return {
              id: faixa,
              title: faixa,
              subtitle: ranges[faixa as keyof typeof ranges] || "Faixa Etária",
              count: faixaCounts[faixa],
              icon: <Users className="h-5 w-5 text-purple-500" />,
              topUnidades: top3
            };
          });
      }

      // Logic for "Faixa Etaria" + "Convenio" + "All" => Show Top 3 Convenios per Age Group
      if (filterCategory === 'convenio' && filterValue === 'all') {
        const faixaConvenios: Record<string, Record<string, number>> = {};
        const faixaCounts: Record<string, number> = {};

        appointments.forEach(app => {
          let bucket = "Desconhecido";
          if (app.nascimento) {
            try {
              const birthDate = parse(app.nascimento, 'dd/MM/yyyy', new Date());
              const age = differenceInYears(new Date(), birthDate);
              if (age <= 12) bucket = "Criança";
              else if (age <= 17) bucket = "Adolescente";
              else if (age <= 59) bucket = "Adulto";
              else bucket = "Idoso";
            } catch { }
          }
          const c = app.convenio || "Não informado";

          faixaCounts[bucket] = (faixaCounts[bucket] || 0) + 1;

          if (!faixaConvenios[bucket]) faixaConvenios[bucket] = {};
          faixaConvenios[bucket][c] = (faixaConvenios[bucket][c] || 0) + 1;
        });

        const ranges = { "Criança": "0-12 anos", "Adolescente": "13-17 anos", "Adulto": "18-59 anos", "Idoso": "60+ anos" };
        return Object.keys(faixaCounts)
          .sort((a, b) => faixaCounts[b] - faixaCounts[a])
          .map(faixa => {
            const breakdown = faixaConvenios[faixa] || {};
            const top3 = Object.entries(breakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([name, count]) => ({ name, count, value: count * 30 }));

            return {
              id: faixa,
              title: faixa,
              subtitle: ranges[faixa as keyof typeof ranges] || "Faixa Etária",
              count: faixaCounts[faixa],
              icon: <Users className="h-5 w-5 text-purple-500" />,
              topConvenios: top3
            };
          });
      }

      // Logic for "Faixa Etaria" + "Exame" + "All" => Show Top 3 Exams per Age Group
      if (filterCategory === 'exame' && filterValue === 'all') {
        const faixaExames: Record<string, Record<string, number>> = {};
        const faixaCounts: Record<string, number> = {};

        appointments.forEach(app => {
          let bucket = "Desconhecido";
          if (app.nascimento) {
            try {
              const birthDate = parse(app.nascimento, 'dd/MM/yyyy', new Date());
              const age = differenceInYears(new Date(), birthDate);
              if (age <= 12) bucket = "Criança";
              else if (age <= 17) bucket = "Adolescente";
              else if (age <= 59) bucket = "Adulto";
              else bucket = "Idoso";
            } catch { }
          }

          faixaCounts[bucket] = (faixaCounts[bucket] || 0) + 1;

          if (!faixaExames[bucket]) faixaExames[bucket] = {};
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              faixaExames[bucket][ex] = (faixaExames[bucket][ex] || 0) + 1;
            });
          }
        });

        const ranges = { "Criança": "0-12 anos", "Adolescente": "13-17 anos", "Adulto": "18-59 anos", "Idoso": "60+ anos" };
        return Object.keys(faixaCounts)
          .sort((a, b) => faixaCounts[b] - faixaCounts[a])
          .map(faixa => {
            const breakdown = faixaExames[faixa] || {};
            const top3 = Object.entries(breakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([name, count]) => ({ name, count, value: count * 30 }));

            return {
              id: faixa,
              title: faixa,
              subtitle: ranges[faixa as keyof typeof ranges] || "Faixa Etária",
              count: faixaCounts[faixa],
              icon: <Users className="h-5 w-5 text-purple-500" />,
              topExames: top3
            };
          });
      }

      // Default Logic
      const buckets = { "Criança": 0, "Adolescente": 0, "Adulto": 0, "Idoso": 0 };
      const ranges = { "Criança": "0-12 anos", "Adolescente": "13-17 anos", "Adulto": "18-59 anos", "Idoso": "60+ anos" };
      appointments.forEach(app => {
        if (app.nascimento) {
          try {
            const birthDate = parse(app.nascimento, 'dd/MM/yyyy', new Date());
            const age = differenceInYears(new Date(), birthDate);
            if (age <= 12) buckets["Criança"]++;
            else if (age <= 17) buckets["Adolescente"]++;
            else if (age <= 59) buckets["Adulto"]++;
            else buckets["Idoso"]++;
          } catch { }
        }
      });
      return Object.entries(buckets)
        .sort(([, a], [, b]) => b - a)
        .map(([name, count]) => ({
          id: name,
          title: name,
          subtitle: ranges[name as keyof typeof ranges] || "Faixa Etária",
          count,
          icon: <Users className="h-5 w-5 text-purple-500" />
        }));
    }

    if (statType === "exames") {
      // Logic for "Exames" + "Unidade" + "All" => Show Top 3 Units per Exam
      if (filterCategory === 'unidade' && filterValue === 'all') {
        const exameUnidades: Record<string, Record<string, number>> = {};
        const exameCounts: Record<string, number> = {};

        appointments.forEach(app => {
          const u = app._unit;
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              exameCounts[ex] = (exameCounts[ex] || 0) + 1;

              if (!exameUnidades[ex]) exameUnidades[ex] = {};
              exameUnidades[ex][u] = (exameUnidades[ex][u] || 0) + 1;
            });
          }
        });

        return Object.keys(exameCounts)
          .sort((a, b) => exameCounts[b] - exameCounts[a])
          .slice(0, 10)
          .map(exame => {
            const breakdown = exameUnidades[exame] || {};
            const top3 = Object.entries(breakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([name, count]) => ({
                name: unitConfig?.[name]?.empresa ?? name,
                count,
                value: count * 30
              }));

            return {
              id: exame,
              title: exame,
              subtitle: "Procedimento",
              count: exameCounts[exame],
              icon: <Activity className="h-5 w-5 text-orange-500" />,
              topUnidades: top3
            };
          });
      }

      // Logic for "Exames" + "Convenio" + "All" => Show Top 3 Convenios per Exam
      if (filterCategory === 'convenio' && filterValue === 'all') {
        const exameConvenios: Record<string, Record<string, number>> = {};
        const exameCounts: Record<string, number> = {};

        appointments.forEach(app => {
          const c = app.convenio || "Não informado";
          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              exameCounts[ex] = (exameCounts[ex] || 0) + 1;

              if (!exameConvenios[ex]) exameConvenios[ex] = {};
              exameConvenios[ex][c] = (exameConvenios[ex][c] || 0) + 1;
            });
          }
        });

        return Object.keys(exameCounts)
          .sort((a, b) => exameCounts[b] - exameCounts[a])
          .slice(0, 10)
          .map(exame => {
            const breakdown = exameConvenios[exame] || {};
            const top3 = Object.entries(breakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([name, count]) => ({ name, count, value: count * 30 }));

            return {
              id: exame,
              title: exame,
              subtitle: "Procedimento",
              count: exameCounts[exame],
              icon: <Activity className="h-5 w-5 text-orange-500" />,
              topConvenios: top3
            };
          });
      }

      // Logic for "Exames" + "Faixa Etaria" + "All" => Show Top 3 Age Groups per Exam
      if (filterCategory === 'faixaEtaria' && filterValue === 'all') {
        const exameFaixas: Record<string, Record<string, number>> = {};
        const exameCounts: Record<string, number> = {};

        appointments.forEach(app => {
          let bucket = "Desconhecido";
          if (app.nascimento) {
            try {
              const birthDate = parse(app.nascimento, 'dd/MM/yyyy', new Date());
              const age = differenceInYears(new Date(), birthDate);
              if (age <= 12) bucket = "Criança";
              else if (age <= 17) bucket = "Adolescente";
              else if (age <= 59) bucket = "Adulto";
              else bucket = "Idoso";
            } catch { }
          }

          if (Array.isArray(app.exames)) {
            app.exames.forEach((ex: string) => {
              exameCounts[ex] = (exameCounts[ex] || 0) + 1;

              if (!exameFaixas[ex]) exameFaixas[ex] = {};
              exameFaixas[ex][bucket] = (exameFaixas[ex][bucket] || 0) + 1;
            });
          }
        });

        return Object.keys(exameCounts)
          .sort((a, b) => exameCounts[b] - exameCounts[a])
          .slice(0, 10)
          .map(exame => {
            const breakdown = exameFaixas[exame] || {};
            const top3 = Object.entries(breakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([name, count]) => ({ name, count, value: count * 30 }));

            return {
              id: exame,
              title: exame,
              subtitle: "Procedimento",
              count: exameCounts[exame],
              icon: <Activity className="h-5 w-5 text-orange-500" />,
              topFaixas: top3
            };
          });
      }

      // Default Logic
      const counts: Record<string, number> = {};
      appointments.forEach(app => {
        if (Array.isArray(app.exames)) {
          app.exames.forEach((ex: string) => {
            counts[ex] = (counts[ex] || 0) + 1;
          });
        }
      });
      return Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, count]) => ({
          id: name,
          title: name,
          subtitle: "Procedimento",
          count,
          icon: <Activity className="h-5 w-5 text-orange-500" />
        }));
    }
    return [];
  }, [patientData, filter, statType, unitConfig, filterCategory, filterValue]);

  const totalPacientes = displayData.reduce((acc, item) => acc + item.count, 0);

  /* ---------- UI ---------- */
  return (
    <SidebarLayout unit={selectedUnit}>
      <div className="flex flex-col items-center px-6 pb-6 pt-2 md:px-10 md:pb-10 md:pt-4 lg:px-16 lg:pb-16 lg:pt-6 bg-gradient-to-b from-blue-100 via-white to-blue-100 min-h-screen w-full relative overflow-auto">

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
                    <SelectItem value="unidades">Unidades</SelectItem>
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
                    <SelectItem value="unidade">Unidade</SelectItem>
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
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[180px] bg-white border-blue-200">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] overflow-y-auto">
                  {anosDisponiveis.map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
                  {/* Show months only if NOT history mode */}
                  {statType !== 'historico' && mesesDisponiveis.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                </SelectContent>
              </Select>
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
                          <th className="px-6 py-4 font-bold text-blue-900">Grupo</th>
                          <th className="px-6 py-4 font-bold text-blue-900">Detalhe</th>
                          <th className="px-6 py-4 text-center font-bold text-blue-900">Qtd.</th>
                          <th className="px-6 py-4 text-center font-bold text-blue-900">%</th>
                          <th className="px-6 py-4 text-right font-bold text-blue-900">Valor Estimado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayData.map((item) => (
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
                          <td className="px-6 py-4 text-right text-green-700">{(statType === 'unidades' || statType === 'historico') && `R$ ${(totalPacientes * 30).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {viewMode === "cards" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 justify-items-center animate-in fade-in zoom-in-95 duration-300">
                  {displayData.map((item) => (
                    <Card
                      key={item.id}
                      className="w-full max-w-sm rounded-xl shadow-lg bg-white p-2.5 transition-transform duration-200 hover:scale-105 relative"
                    >
                      <div className="relative z-10 flex flex-col h-full">
                        <CardHeader className="p-0 pb-2 flex flex-row items-start justify-between space-y-0 w-full">
                          <div className="flex flex-col truncate pr-2">
                            <span className="text-sm font-semibold text-blue-700 truncate" title={item.title}>{item.title}</span>
                            <span className="text-[10px] text-gray-500 truncate">{item.subtitle}</span>
                          </div>

                          {/* Default Home Actions: Render ONLY if Unidades + Simple */}
                          {statType === "unidades" && dashboardMode === 'simple' && (
                            <div className="flex flex-col items-center space-y-1">
                              <div className="relative z-20">
                                <Link href={`/novo-agendamento?unidade=${encodeURIComponent(item.id)}`} className="shrink-0">
                                  <Plus className="h-4 w-4 text-green-600 hover:opacity-80 transition" />
                                </Link>
                              </div>
                              <Sheet>
                                <SheetTrigger asChild>
                                  <button className="shrink-0">
                                    <DollarSign className="h-4 w-4 text-green-600 hover:opacity-80 transition" />
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

                          {/* If NOT Unidades, show Icon */}
                          {statType !== "unidades" && (
                            <div className="shrink-0 opacity-80">{item.icon}</div>
                          )}
                        </CardHeader>

                        <CardContent className="p-0 text-center flex-grow flex flex-col justify-center mt-1">
                          {item.topUnidades ? (
                            <div className="flex flex-col gap-1 w-full px-1">
                              {item.topUnidades.map((u, i) => (
                                <div key={i} className="flex justify-between items-center text-[10px] bg-gray-50 p-1 rounded border border-gray-100">
                                  <span className="truncate font-medium text-gray-700 max-w-[80px]" title={u.name}>{u.name}</span>
                                  <div className="flex gap-1.5">
                                    <span className="font-bold text-gray-900">{u.count}</span>
                                    <span className="font-mono text-green-600">R${u.value}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : item.topConvenios ? (
                            <div className="flex flex-col gap-1 w-full px-1">
                              {item.topConvenios.map((c, i) => (
                                <div key={i} className="flex justify-between items-center text-[10px] bg-gray-50 p-1 rounded border border-gray-100">
                                  <span className="truncate font-medium text-gray-700 max-w-[80px]" title={c.name}>{c.name}</span>
                                  <div className="flex gap-1.5">
                                    <span className="font-bold text-gray-900">{c.count}</span>
                                    <span className="font-mono text-green-600">R${c.value}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : item.topFaixas ? (
                            <div className="flex flex-col gap-1 w-full px-1">
                              {item.topFaixas.map((f, i) => (
                                <div key={i} className="flex justify-between items-center text-[10px] bg-gray-50 p-1 rounded border border-gray-100">
                                  <span className="truncate font-medium text-gray-700 max-w-[80px]" title={f.name}>{f.name}</span>
                                  <div className="flex gap-1.5">
                                    <span className="font-bold text-gray-900">{f.count}</span>
                                    <span className="font-mono text-green-600">R${f.value}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : item.topExames ? (
                            <div className="flex flex-col gap-1 w-full px-1">
                              {item.topExames.map((e, i) => (
                                <div key={i} className="flex justify-between items-center text-[10px] bg-gray-50 p-1 rounded border border-gray-100">
                                  <span className="truncate font-medium text-gray-700 max-w-[80px]" title={e.name}>{e.name}</span>
                                  <div className="flex gap-1.5">
                                    <span className="font-bold text-gray-900">{e.count}</span>
                                    <span className="font-mono text-green-600">R${e.value}</span>
                                  </div>
                                </div>
                              ))}
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

                      {/* Background Link - Only for Unidades (Simple/Advanced) to View Appointments */}
                      {statType === "unidades" && (
                        <Link
                          href={`/visualizar-agendamentos?unidade=${encodeURIComponent(item.id)}&filtro=${encodeURIComponent(filter)}`}
                          className="absolute inset-0 z-0"
                          aria-label={`Visualizar agendamentos para ${item.title}`}
                        />
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Footer Summary */}
          {!loading && displayData.length > 0 && (
            <div className="mt-8 flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-12 p-4 bg-gray-50/50 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total de Pacientes:</span>
                <span className="text-base font-bold text-blue-900">{totalPacientes}</span>
              </div>
              {(statType === 'unidades' || statType === 'historico') && (
                <>
                  <div className="hidden sm:block w-px h-4 bg-gray-300"></div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Valor Estimado:</span>
                    <span className="text-base font-bold text-green-600">{`R$ ${(totalPacientes * 30).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}</span>
                  </div>
                </>
              )}
            </div>
          )}

        </section>
      </div>
    </SidebarLayout>
  );
}
