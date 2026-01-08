"use client";

import SidebarLayout from "@/components/layout/sidebar-layout";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ref, onValue } from "firebase/database";
import { getDatabaseInstance } from "@/lib/firebase";
import { ENVIRONMENT } from "../../../ambiente";
import { getFirebasePathBase } from "@/lib/firebaseConfig";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Card,
    CardContent,
    CardHeader,
} from "@/components/ui/card";
import { differenceInYears, parse } from "date-fns";
import { Users, FileText, Activity, MapPin, BarChart3, LayoutGrid, List } from "lucide-react";

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

interface CardData {
    id: string;
    title: string;
    subtitle: string;
    count: number;
    value?: number; // Optional financial value
    icon?: React.ReactNode;
}

export default function StatisticsPage() {
    /* ---------- state ---------- */
    const [patientData, setPatientData] = useState<Record<string, Record<string, any>>>({});
    const [loading, setLoading] = useState(true);

    // Filters
    const [filter, setFilter] = useState<string>("");
    const [statType, setStatType] = useState<StatType>("unidades");

    // Dynamic Filter (Pivot Slicers)
    const [filterCategory, setFilterCategory] = useState<"none" | "unidade" | "convenio" | "faixaEtaria" | "exame">("unidade");
    const [filterValue, setFilterValue] = useState<string>("all");

    // View Toggle
    const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

    // Configs & Env
    const [unitConfig, setUnitConfig] = useState<Record<string, { bairro?: string; empresa?: string }>>({});
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

    /* ---------- RTDB listener ---------- */
    useEffect(() => {
        const db = getDatabaseInstance(ENVIRONMENT);
        const pathBase = getFirebasePathBase();
        const node = pathBase === 'OFT/45' ? 'medicos' : 'unidades';

        // Fetch Appointments
        const agRef = ref(db, `/${pathBase}/agendamentoWhatsApp/operacional/consultasAgendadas/${node}`);
        const offAg = onValue(agRef, snap => {
            setPatientData(snap.exists() ? (snap.val() as any) : {});
            setLoading(false);
        });

        // Fetch Unit Config (mostly for Unidades view)
        const cfgRef = ref(db, `/${pathBase}/agendamentoWhatsApp/configuracoes/${node}`);
        const offCfg = onValue(cfgRef, snap => {
            setUnitConfig(snap.exists() ? (snap.val() as any) : {});
        });

        return () => {
            offAg();
            offCfg();
        };
    }, []);

    // Reset filter value when category changes
    useEffect(() => {
        if (filterCategory === 'unidade') {
            setFilterValue("all");
        } else {
            setFilterValue("");
        }
    }, [filterCategory]);

    /* ---------- Available Options ---------- */
    const unitsAvailable = useMemo(() => {
        return Object.keys(patientData).sort();
    }, [patientData]);

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
                    if (Array.isArray(examList)) {
                        examList.forEach(ex => set.add(ex));
                    }
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

    /* Default Filter & Mode Validations */
    useEffect(() => {
        // Validation 1: If switching to 'historico', ensure filter is just a year
        if (statType === 'historico' && filter.includes(' de ')) {
            const justYear = filter.split(' de ')[1];
            if (justYear) setFilter(justYear);
            return;
        }

        if (filter) return;

        // Initial Default
        const hoje = new Date();
        const mesAtual = `${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`;
        if (mesesDisponiveis.includes(mesAtual)) setFilter(mesAtual);
        else if (mesesDisponiveis.length) setFilter(mesesDisponiveis.at(-1)!);
        else if (anosDisponiveis.length) setFilter(anosDisponiveis[0]);
    }, [filter, mesesDisponiveis, anosDisponiveis, statType]);

    /* ---------- Data Processing ---------- */
    const displayData = useMemo<CardData[]>(() => {
        if (!filter) return [];

        let appointments: any[] = [];
        const filterYear = filter.includes(" de ") ? filter.split(" de ")[1] : filter;
        const filterMonthStr = filter.includes(" de ") ? filter : null;

        // 1. Extract & Filter by Unit and Date
        for (const unit in patientData) {
            // Filter by Unit Category
            if (filterCategory === 'unidade' && filterValue && filterValue !== 'all' && unit !== filterValue) continue;

            for (const date in patientData[unit]) {
                const apptYear = obterAno(date);
                const apptMonthStr = obterNomeMes(date);

                let include = false;

                if (statType === 'historico') {
                    // In history mode, we show all months of the selected YEAR
                    if (apptYear === filterYear) include = true;
                } else {
                    // In other modes, we respect the full filter (Month+Year or Year)
                    if (filterMonthStr) {
                        // Filter is specific Month
                        if (apptMonthStr === filterMonthStr) include = true;
                    } else {
                        // Filter is just Year
                        if (apptYear === filterYear) include = true;
                    }
                }

                if (include) {
                    const hours = patientData[unit][date];
                    for (const time in hours) {
                        const app = { ...hours[time], _unit: unit, _date: date };

                        // --- Dynamic Filters ---
                        if (filterCategory === 'convenio' && filterValue && app.convenio !== filterValue) continue;

                        if (filterCategory === 'exame' && filterValue) {
                            if (!Array.isArray(app.exames) || !app.exames.includes(filterValue)) continue;
                        }

                        if (filterCategory === 'faixaEtaria' && filterValue) {
                            let bucket = "Desconhecido";
                            if (app.nascimento) {
                                try {
                                    const birthDate = parse(app.nascimento, 'dd/MM/yyyy', new Date());
                                    const age = differenceInYears(new Date(), birthDate);
                                    if (age <= 12) bucket = "Criança";
                                    else if (age <= 17) bucket = "Adolescente";
                                    else if (age <= 59) bucket = "Adulto";
                                    else bucket = "Idoso";
                                } catch { /* ignore */ }
                            }
                            if (bucket !== filterValue) continue;
                        }

                        appointments.push(app);
                    }
                }
            }
        }

        // 2. Aggregate based on StatType
        if (statType === "historico") {
            const monthlyCounts: Record<string, number> = {};
            // Initialize all months for continuity? Or just present ones? Let's just do present ones.
            appointments.forEach(app => {
                const m = obterNomeMes(app._date);
                if (m) monthlyCounts[m] = (monthlyCounts[m] || 0) + 1;
            });

            // Sort Chronologically
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
                    title: name.split(" de ")[0], // Show only Month Name
                    subtitle: name.split(" de ")[1], // Show Year as subtitle
                    count,
                    value: count * 30, // Estimativa R$ 30
                    icon: <BarChart3 className="h-5 w-5 text-indigo-500" />
                }));
        }

        if (statType === "unidades") {
            const counts: Record<string, number> = {};
            appointments.forEach(app => {
                counts[app._unit] = (counts[app._unit] || 0) + 1;
            });
            return Object.keys(counts).map(unit => ({
                id: unit,
                title: unitConfig?.[unit]?.empresa ?? unit,
                subtitle: unitConfig?.[unit]?.bairro ?? "Unidade",
                count: counts[unit],
                value: counts[unit] * 30, // Estimativa R$ 30
                icon: <MapPin className="h-5 w-5 text-blue-500" />
            }));
        }

        if (statType === "convenios") {
            const counts: Record<string, number> = {};
            appointments.forEach(app => {
                const conv = app.convenio || "Não informado";
                counts[conv] = (counts[conv] || 0) + 1;
            });
            return Object.entries(counts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10) // Top 10
                .map(([name, count]) => ({
                    id: name,
                    title: name,
                    subtitle: "Convênio Médico",
                    count,
                    // value can be estimated if needed, or omitted
                    icon: <FileText className="h-5 w-5 text-green-600" />
                }));
        }

        if (statType === "faixaEtaria") {
            const buckets = {
                "Criança": 0,
                "Adolescente": 0,
                "Adulto": 0,
                "Idoso": 0,
            };
            const ranges = {
                "Criança": "0-12 anos",
                "Adolescente": "13-17 anos",
                "Adulto": "18-59 anos",
                "Idoso": "60+ anos"
            };

            appointments.forEach(app => {
                if (app.nascimento) {
                    try {
                        const birthDate = parse(app.nascimento, 'dd/MM/yyyy', new Date());
                        const age = differenceInYears(new Date(), birthDate);
                        if (age <= 12) buckets["Criança"]++;
                        else if (age <= 17) buckets["Adolescente"]++;
                        else if (age <= 59) buckets["Adulto"]++;
                        else buckets["Idoso"]++;
                    } catch { /* ignore */ }
                }
            });
            return Object.entries(buckets).map(([name, count]) => ({
                id: name,
                title: name,
                subtitle: ranges[name as keyof typeof ranges] || "Faixa Etária",
                count,
                icon: <Users className="h-5 w-5 text-purple-500" />
            }));
        }

        if (statType === "exames") {
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
                .slice(0, 10) // Top 10
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
    // Valor total only makes sense if all items have values (like Unidades) or if we estimate globally?
    // Let's just show Total Count for generic stats.

    /* ---------- UI ---------- */
    return (
        <SidebarLayout unit={selectedUnit}>
            <div className="flex flex-col items-center p-6 md:p-10 lg:p-16 bg-gradient-to-b from-blue-100 via-white to-blue-100 min-h-screen w-full relative overflow-auto">

                {/* Top Section */}
                <section className="w-full flex flex-col xl:flex-row justify-between items-start xl:items-end mb-8 gap-6">

                    {/* Title & Pivot Controls Container */}
                    <div className="flex flex-col gap-6 w-full">

                        <div className="flex justify-between items-center w-full">
                            <div className="flex flex-col">
                                <h1 className="text-2xl font-bold text-blue-900">Estatísticas</h1>
                                <p className="text-gray-500 text-sm">Análise Dinâmica (Pivot)</p>
                            </div>

                            {/* View Toggle */}
                            <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                                <button
                                    onClick={() => setViewMode("cards")}
                                    className={`p-2 rounded-md transition-all ${viewMode === "cards" ? "bg-blue-100 text-blue-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                                    title="Visualização em Cards"
                                >
                                    <LayoutGrid className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setViewMode("table")}
                                    className={`p-2 rounded-md transition-all ${viewMode === "table" ? "bg-blue-100 text-blue-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                                    title="Visualização em Tabela (Excel)"
                                >
                                    <List className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Pivot Toolbar (Excel-like) */}
                        <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center w-full bg-white/50 p-4 rounded-xl border border-blue-100/50 backdrop-blur-sm">

                            {/* Control 1: Group By */}
                            <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                                <label className="text-xs font-semibold text-blue-900 uppercase tracking-wider ml-1">
                                    Agrupar por
                                </label>
                                <Select value={statType} onValueChange={(v) => setStatType(v as StatType)}>
                                    <SelectTrigger className="w-full sm:w-[180px] bg-white border-blue-200 shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <BarChart3 className="w-4 h-4 text-blue-500" />
                                            <SelectValue placeholder="Tipo" />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unidades">Unidades</SelectItem>
                                        <SelectItem value="convenios">Convênios</SelectItem>
                                        <SelectItem value="faixaEtaria">Faixa Etária</SelectItem>
                                        <SelectItem value="exames">Exames</SelectItem>
                                        <SelectItem value="historico">Evolução Mensal</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Control 2: Filter Category (Filter By) */}
                            <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                                <label className="text-xs font-semibold text-blue-900 uppercase tracking-wider ml-1">
                                    Filtrar por
                                </label>
                                <Select value={filterCategory} onValueChange={(v: any) => setFilterCategory(v)}>
                                    <SelectTrigger className="w-full sm:w-[150px] bg-white border-blue-200 shadow-sm">
                                        <SelectValue placeholder="Nenhum" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Todas as Unidades</SelectItem>
                                        <SelectItem value="unidade">Unidade Específica</SelectItem>
                                        <SelectItem value="convenio">Convênio</SelectItem>
                                        <SelectItem value="faixaEtaria">Faixa Etária</SelectItem>
                                        <SelectItem value="exame">Exame/Proced.</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Control 3: Filter Value (Dynamic Select) */}
                            {filterCategory !== 'none' && (
                                <div className="flex flex-col gap-1.5 w-full sm:w-auto animate-in fade-in slide-in-from-left-2 duration-300">
                                    <label className="text-xs font-semibold text-blue-900 uppercase tracking-wider ml-1">
                                        Selecione
                                    </label>
                                    <Select value={filterValue} onValueChange={setFilterValue}>
                                        <SelectTrigger className="w-full sm:w-[200px] bg-white border-blue-200 shadow-sm">
                                            <div className="flex items-center gap-2">
                                                <SelectValue placeholder="Selecione..." />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[250px]">
                                            {filterCategory === 'unidade' && (
                                                <>
                                                    <SelectItem value="all">Todas</SelectItem>
                                                    {unitsAvailable.map((u) => (
                                                        <SelectItem key={u} value={u}>
                                                            {unitConfig?.[u]?.empresa ?? u}
                                                            {unitConfig?.[u]?.bairro ? ` - ${unitConfig?.[u]?.bairro}` : ''}
                                                        </SelectItem>
                                                    ))}
                                                </>
                                            )}
                                            {filterCategory !== 'unidade' && filterCategory === 'convenio' && conveniosAvailable.map((c) => (
                                                <SelectItem key={c} value={c}>{c}</SelectItem>
                                            ))}
                                            {filterCategory === 'faixaEtaria' && faixasEtariasAvailable.map((f) => (
                                                <SelectItem key={f} value={f}>{f}</SelectItem>
                                            ))}
                                            {filterCategory === 'exame' && examesAvailable.map((e) => (
                                                <SelectItem key={e} value={e}>{e}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {/* Control 4: Period */}
                            <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                                <label className="text-xs font-semibold text-blue-900 uppercase tracking-wider ml-1">
                                    Período
                                </label>
                                <Select value={filter} onValueChange={setFilter}>
                                    <SelectTrigger className="w-full sm:w-[180px] bg-white border-blue-200 shadow-sm">
                                        <SelectValue placeholder="Mês/Ano" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[250px]">
                                        {anosDisponiveis.map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
                                        {statType !== 'historico' && mesesDisponiveis.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                    </div>
                </section>


                {/* Content Area */}
                <section className="w-full max-w-6xl transition-all duration-300">
                    {loading && <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}

                    {!loading && displayData.length === 0 && (
                        <div className="text-center p-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                            <p className="text-gray-500">Nenhum dado encontrado para esta combinação de filtros.</p>
                        </div>
                    )}

                    {!loading && displayData.length > 0 && (
                        <>
                            {/* Visualização: TABLE */}
                            {viewMode === "table" && (
                                <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-100">
                                                <tr>
                                                    <th className="px-6 py-4 font-bold text-blue-900">Grupo</th>
                                                    <th className="px-6 py-4 font-bold text-blue-900">Detalhe</th>
                                                    <th className="px-6 py-4 text-center font-bold text-blue-900">Qtd.</th>
                                                    <th className="px-6 py-4 text-center font-bold text-blue-900">% do Total</th>
                                                    <th className="px-6 py-4 text-right font-bold text-blue-900">Estimativa (Valor)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {displayData.map((item, idx) => (
                                                    <tr key={item.id} className="hover:bg-blue-50/50 transition-colors">
                                                        <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
                                                            {item.icon && <span className="text-gray-400 scale-75">{item.icon}</span>}
                                                            {item.title}
                                                        </td>
                                                        <td className="px-6 py-4 text-gray-500">
                                                            {item.subtitle}
                                                        </td>
                                                        <td className="px-6 py-4 text-center font-bold text-gray-800 bg-gray-50/30">
                                                            {item.count}
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <div className="flex items-center justify-center gap-2" title={`${item.count} de ${totalPacientes} registros`}>
                                                                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-blue-500 rounded-full"
                                                                        style={{ width: `${(item.count / totalPacientes) * 100}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-xs text-gray-500 font-medium">
                                                                    {((item.count / totalPacientes) * 100).toFixed(1)}%
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-mono text-green-600 font-medium">
                                                            {item.value !== undefined
                                                                ? `R$ ${item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                                                                : '-'
                                                            }
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold text-gray-900">
                                                <tr>
                                                    <td colSpan={2} className="px-6 py-4 text-right uppercase text-xs tracking-wider">Total Geral</td>
                                                    <td className="px-6 py-4 text-center text-lg text-blue-700">{totalPacientes}</td>
                                                    <td className="px-6 py-4"></td>
                                                    <td className="px-6 py-4 text-right text-green-700">
                                                        {(statType === 'unidades' || statType === 'historico') && `R$ ${(totalPacientes * 30).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Visualização: CARDS */}
                            {viewMode === "cards" && (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 justify-items-center animate-in fade-in zoom-in-95 duration-300">
                                        {displayData.map((item) => (
                                            <Card
                                                key={item.id}
                                                className="w-full max-w-sm rounded-2xl shadow-lg bg-white p-3 transition-transform duration-200 hover:scale-105 relative"
                                            >
                                                <div className="relative z-10 flex flex-col h-full">
                                                    {/* Header */}
                                                    <CardHeader className="p-0 pb-2 flex flex-row items-start justify-between space-y-0 w-full">
                                                        <div className="flex flex-col truncate pr-2">
                                                            <span className="text-base font-semibold text-blue-700 truncate" title={item.title}>
                                                                {item.title}
                                                            </span>
                                                            <span className="text-xs text-gray-500 truncate">
                                                                {item.subtitle}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col items-center space-y-2">
                                                            <div className="shrink-0 opacity-80">
                                                                {item.icon}
                                                            </div>
                                                        </div>
                                                    </CardHeader>

                                                    {/* Content */}
                                                    <CardContent className="p-0 text-center flex-grow flex flex-col justify-center">
                                                        <div className="text-lg font-bold text-gray-800">
                                                            {item.count}
                                                        </div>
                                                        <div className="text-xs text-gray-400 mb-1">
                                                            {statType === 'exames' ? 'Solicitações' : 'Pacientes'}
                                                        </div>
                                                        {item.value !== undefined && (
                                                            <div className="text-sm font-semibold text-green-600">
                                                                R$ {item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                                            </div>
                                                        )}
                                                        {item.value === undefined && (
                                                            <div className="text-sm font-semibold text-green-600">
                                                                {((item.count / totalPacientes) * 100).toFixed(1)}%
                                                            </div>
                                                        )}
                                                    </CardContent>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>

                                    {/* Footer no modo Cards */}
                                    {/* Footer no modo Cards */}
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
                                                    <span className="text-base font-bold text-green-600">
                                                        {`R$ ${(totalPacientes * 30).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </section>

            </div>
        </SidebarLayout>
    );
}
