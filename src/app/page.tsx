"use client";

import SidebarLayout from "@/components/layout/sidebar-layout";
import Image from "next/image";
import Link from "next/link";
import { DollarSign, Plus, Landmark } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { ref, onValue } from "firebase/database";
import { getDatabaseInstance } from "@/lib/firebase";
import { ENVIRONMENT } from "../../ambiente";
import { getFirebasePathBase } from "@/lib/firebaseConfig";
import { FinancialSheetContent } from "@/components/financial-sheet-content";

/* ---------- helpers ---------- */
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const obterNomeMes = (dataStr: string) => {
  const [ano, mes] = dataStr.split("-");
  const idx = Number(mes) - 1;
  return idx >= 0 && idx < 12 ? `${MESES[idx]} de ${ano}` : null;
};

const obterAno = (dataStr: string) => dataStr.substring(0, 4);

/* =============================================================
   PÁGINA INICIAL
   ============================================================= */
export default function Home() {
  /* ---------- state ---------- */
  const [patientData, setPatientData] =
    useState<Record<string, Record<string, any>>>({});
  const [unitConfig, setUnitConfig] =
    useState<Record<string, { bairro?: string; empresa?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null); // Adiciona estado para a unidade

  /* ---------- get unit from localStorage ---------- */
  useEffect(() => {
    const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
    if (storedPathBase) setSelectedUnit(storedPathBase);
  }, []);

  // Listen for changes in localStorage (optional, for cross-tab sync)
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
    const agRef = ref(
      getDatabaseInstance(ENVIRONMENT),
      `/${getFirebasePathBase()}/agendamentoWhatsApp/operacional/consultasAgendadas/${getFirebasePathBase() === 'OFT/45' ? 'medicos' : 'unidades'}`
    );
    const off = onValue(
      agRef,
      snap => {
        setPatientData(snap.exists() ? (snap.val() as any) : {});
        setLoading(false);
      },
      err => {
        console.error(err);
        setError("Erro ao carregar dados de pacientes.");
        setLoading(false);
      }
    );
    return () => off();
  }, []);

  useEffect(() => {
    const cfgRef = ref(
      getDatabaseInstance(ENVIRONMENT),
      `/${getFirebasePathBase()}/agendamentoWhatsApp/configuracoes/${getFirebasePathBase() === 'OFT/45' ? 'medicos' : 'unidades'}`
    );
    const off = onValue(cfgRef, snap => {
      setUnitConfig(snap.exists() ? (snap.val() as any) : {});
    });
    return () => off();
  }, []);

  /* ---------- filtros ---------- */
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

  /* filtro default */
  useEffect(() => {
    if (filter) return;
    const hoje = new Date();
    const mesAtual = `${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`;
    if (mesesDisponiveis.includes(mesAtual)) setFilter(mesAtual);
    else if (mesesDisponiveis.length) setFilter(mesesDisponiveis.at(-1)!);
    else if (anosDisponiveis.length) setFilter(anosDisponiveis[0]);
  }, [filter, mesesDisponiveis, anosDisponiveis]);

  /* ---------- contagem filtrada ---------- */
  const filteredCounts = useMemo(() => {
    if (!filter) return {};
    const result: Record<string, number> = {};

    for (const unit in patientData) {
      let count = 0;
      for (const d in patientData[unit]) {
        if (
          (filter.includes(" de ") && obterNomeMes(d) === filter) ||
          (!filter.includes(" de ") && obterAno(d) === filter)
        ) {
          count += Object.keys(patientData[unit][d]).length;
        }
      }
      if (count) result[unit] = count;
    }
    return result;
  }, [patientData, filter]);

  const unidades = Object.keys(filteredCounts);
  const totalPacientes = unidades.reduce((s, u) => s + filteredCounts[u], 0);
  const totalValorFormat = (totalPacientes * 30).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
  });

  /* ---------- UI ---------- */
  return (
    <SidebarLayout unit={selectedUnit}>
      <div className="flex flex-col items-center p-6 md:p-10 lg:p-16 bg-gradient-to-b from-blue-100 via-white to-blue-100 min-h-screen w-full relative overflow-auto">
        {/* Top section with logo on the right and filter on the left */}
        <section className="w-full flex justify-between items-start mb-8">
          {/* Left side: Logo and Subtitle */}
          <div className="flex flex-col items-start">
            {selectedUnit === "OFT/45" ? (
              <Image src="/images/logo pequena.png" alt="OFT Logo" width={150} height={60} layout="intrinsic" className="mb-4" />
            ) : (
              <Image src="/images/image1.png" alt="Dr. Melo Logo" width={200} height={80} className="mb-4" />
            )}

          </div>

          {/* Right side: Filter */}
          <div className="flex flex-col items-end pt-4"> {/* Added pt-4 for top padding */}

            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Selecione o Mês/Ano" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px] overflow-y-auto">
                {anosDisponiveis.map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
                {mesesDisponiveis.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </section>


        {/* Lista + filtro */}
        <section className="w-full max-w-6xl">
          {loading && <p className="text-center">Carregando…</p>}
          {error && <p className="text-center text-red-500">{error}</p>}

          {!loading && (
            <>
              {unidades.length ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 justify-items-center">
                  {unidades.map((unit) => (
                    <Card
                      key={unit}
                      className="w-full max-w-sm rounded-2xl shadow-lg bg-white p-4 transition-transform duration-200 hover:scale-105 relative"
                    >
                      {/* Conteúdo do card */}
                      <div className="relative z-10 flex flex-col h-full">
                        {/* ─────── 1ª linha → Nome + ícones ─────── */}
                        <CardHeader className="p-0 pb-2 flex flex-row items-start justify-between space-y-0 w-full">
                          {/* nome da unidade */}
                          <div className="flex flex-col truncate pr-2">
                            <span className="text-base font-semibold text-blue-700 truncate">
                              {unitConfig?.[unit]?.empresa ?? unit}
                            </span>
                            <span className="text-xs text-gray-500 truncate">
                              {unitConfig?.[unit]?.bairro}
                            </span>
                          </div>

                          {/* ícones “+” e “$” */}
                          <div className="flex flex-col items-center space-y-2">
                            <div className="relative z-20">
                              <Link
                                href={`/novo-agendamento?unidade=${encodeURIComponent(
                                  unit
                                )}`}
                                aria-label="Novo agendamento"
                                className="shrink-0"
                              >
                                <Plus className="h-5 w-5 text-green-600 hover:opacity-80 transition" />
                              </Link>
                            </div>
                            <Sheet>
                              <SheetTrigger asChild>
                                <button className="shrink-0">
                                  <DollarSign className="h-5 w-5 text-green-600 hover:opacity-80 transition" />
                                </button>
                              </SheetTrigger>
                              <SheetContent className="sm:max-w-lg">
                                <SheetHeader>
                                  <SheetTitle className="flex items-center text-xl font-semibold text-gray-800">
                                    <Landmark className="mr-2 h-5 w-5 text-blue-600" />
                                    <span>
                                      Financeiro -{" "}
                                      {unitConfig?.[unit]?.empresa ?? unit}
                                    </span>
                                  </SheetTitle>
                                </SheetHeader>
                                <FinancialSheetContent
                                  unit={unit}
                                  patientData={patientData}
                                  initialMonth={filter}
                                  unitConfig={unitConfig}
                                />
                              </SheetContent>
                            </Sheet>
                          </div>
                        </CardHeader>

                        {/* contagem + valor (ocupa o espaço restante) */}
                        <CardContent className="p-0 text-center flex-grow flex flex-col justify-center">
                          <div className="text-lg font-bold text-gray-800">
                            {filteredCounts[unit]}
                          </div>
                          <div className="text-sm font-semibold text-green-600 mt-1">
                            {`R$ ${(
                              filteredCounts[unit] * 30
                            ).toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                            })}`}
                          </div>
                        </CardContent>
                      </div>

                      {/* Link de fundo para cobrir o card inteiro */}
                      <Link
                        href={`/visualizar-agendamentos?unidade=${encodeURIComponent(
                          unit
                        )}&filtro=${encodeURIComponent(filter)}`} // O link de fundo agora funciona corretamente
                        className="absolute inset-0 z-0"
                        aria-label={`Visualizar agendamentos para ${unit}`}
                      />
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-center text-lg text-gray-700">
                  Nenhum agendamento encontrado com este filtro.
                </p>
              )}

              {/* total */}
              {unidades.length > 0 && (
                <div className="mt-8 text-center text-xl font-bold text-gray-800">
                  Total Pacientes: {totalPacientes} • Total: R${" "}
                  {totalValorFormat}
                </div>
              )}</>
          )}
        </section>
      </div>
    </SidebarLayout>
  );
}
