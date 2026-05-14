"use client";

import { useState, useMemo, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar-layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ref, onValue } from "firebase/database";
import { getDatabaseInstance } from "@/lib/firebase";
import { ENVIRONMENT } from "../../../ambiente";
import { getFirebasePathBase } from "@/lib/firebaseConfig";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { AttendanceReviewPanel } from "@/components/attendance-review-panel";
import type { AttendanceBillingRow, AttendanceReviewAnalysisResult } from "@/types/attendance-review";
import { getBillingAppointmentsForUnitMonth, resolveBillingUnitKey } from "@/lib/attendance-report";

  const MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

export default function FaturamentoPage() {
  const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null);
  const [patientData, setPatientData] = useState<Record<string, Record<string, any>>>({});
  const [unitConfig, setUnitConfig] = useState<Record<string, { bairro?: string; empresa?: string }>>({});
  const [loading, setLoading] = useState(true);

  const [analysisResult, setAnalysisResult] = useState<AttendanceReviewAnalysisResult | null>(null);

  const [examConfig, setExamConfig] = useState<Record<string, any>>({});
  const filterUnit = analysisResult?.unidade || "all";
  const filterMonth = analysisResult?.mes || "";
  const filterYear = analysisResult?.ano || "";
  const setFilterUnit = () => {};
  const setFilterMonth = () => {};
  const setFilterYear = () => {};
  const unitsAvailable = useMemo(() => Object.keys(patientData).sort(), [patientData]);
  const yearsAvailable = useMemo(() => {
    const currentYear = new Date().getFullYear().toString();
    return filterYear ? [filterYear, currentYear].filter((value, index, self) => self.indexOf(value) === index) : [currentYear];
  }, [filterYear]);

  /* ---------- get unit from localStorage ---------- */
  useEffect(() => {
    const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
    if (storedPathBase) setSelectedUnit(storedPathBase);
  }, []);

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

  const isItemIncluso = (itemName: string) => {
    if (itemName.toLowerCase().includes("(incluso na consulta)")) return true;
    const cfg = examConfig[itemName];
    return (typeof cfg?.preco === 'string' && cfg.preco.toLowerCase().includes('incluso'));
  };

  const reportData = useMemo(() => {
    if (!analysisResult?.mes || !analysisResult?.ano || !analysisResult?.unidade) return [];

    const targetMonthYear = `${analysisResult.mes} de ${analysisResult.ano}`;
    const matchedUnitKey = resolveBillingUnitKey(analysisResult.unidade, patientData, unitConfig);
    if (!matchedUnitKey) return [];

    return getBillingAppointmentsForUnitMonth(matchedUnitKey, targetMonthYear, patientData, unitConfig);
  }, [analysisResult, patientData, unitConfig]);

  const fillFiltersFromAnalysis = (result: AttendanceReviewAnalysisResult) => {
    setAnalysisResult(result);
  };

  return (
    <SidebarLayout unit={selectedUnit}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="text-3xl font-bold text-blue-900 flex items-center gap-2">
            <ClipboardCheck className="w-8 h-8" />
            Faturamento - RelatÃ³rio de ValidaÃ§Ã£o
          </h1>
        </div>
        {/* Filters */}
        <Card className="hidden bg-white/80 backdrop-blur shadow-sm border-blue-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold text-blue-800">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-blue-900 uppercase tracking-wider">Unidade</label>
                <div className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700">
                  {filterUnit === "all" ? "Aguardando leitura do documento" : (unitConfig[filterUnit]?.empresa || filterUnit)}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-blue-900 uppercase tracking-wider">MÃªs</label>
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="bg-white border-blue-200">
                    <SelectValue placeholder="Selecione o MÃªs" />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-blue-900 uppercase tracking-wider">Ano</label>
                <Select value={filterYear} onValueChange={setFilterYear}>
                  <SelectTrigger className="bg-white border-blue-200">
                    <SelectValue placeholder="Selecione o Ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {yearsAvailable.map(y => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {(() => {
          const reportRows = reportData as AttendanceBillingRow[];

          return (
          <AttendanceReviewPanel
            reportRows={reportRows}
            loading={loading}
            onAnalysisResult={fillFiltersFromAnalysis}
            analysisReady={Boolean(analysisResult?.unidade && analysisResult?.mes && analysisResult?.ano)}
          />
        );
      })()}

        {/* Table Content */}
        <Card className="hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                <p className="text-blue-900 font-medium">Carregando dados do faturamento...</p>
              </div>
            ) : reportData.length === 0 ? (
              <div className="p-20 text-center">
                <p className="text-gray-500 text-lg">Nenhum dado encontrado para o perÃ­odo e unidade selecionados.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-blue-50">
                    <TableRow>
                      <TableHead className="text-blue-900 font-bold">Data/Hora</TableHead>
                      <TableHead className="text-blue-900 font-bold">Unidade</TableHead>
                      <TableHead className="text-blue-900 font-bold">Nome do Paciente</TableHead>
                      <TableHead className="text-blue-900 font-bold">ConvÃªnio</TableHead>
                      <TableHead className="text-blue-900 font-bold">Procedimentos</TableHead>
                      <TableHead className="text-blue-900 font-bold text-center">Realizou (S/N)</TableHead>
                      <TableHead className="text-blue-900 font-bold text-center">Data Atendimento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((app, index) => {
                      const dateStr = new Date(app._date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                      
                      let procedimentos = (app.exames && app.exames.length > 0) ? [...app.exames] : ["Consulta"];
                      const hasIncluso = procedimentos.some(item => isItemIncluso(item));
                      const hasConsulta = procedimentos.some(item => item.toLowerCase().trim() === "consulta");
                      if (hasIncluso && !hasConsulta) {
                        procedimentos = ["Consulta", ...procedimentos];
                      }
                      
                      return (
                        <TableRow key={index} className="hover:bg-blue-50/30 transition-colors">
                          <TableCell className="font-medium whitespace-nowrap">
                            <div className="flex flex-col">
                              <span>{dateStr}</span>
                              <span className="text-xs text-gray-500">{app._time}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-semibold text-blue-700">{app._unitName}</span>
                              <span className="text-[10px] text-gray-500 uppercase tracking-tight">{app._bairro}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-gray-900">
                            <div className="flex flex-col">
                              <span>{app.nomePaciente || "NÃ£o informado"}</span>
                              {app.cpf && <span className="text-[10px] text-gray-500">CPF: {app.cpf}</span>}
                            </div>
                          </TableCell>
                          <TableCell>{app.convenio || "NÃ£o informado"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {procedimentos.map((proc: string, pIdx: number) => (
                                <span key={pIdx} className="inline-block bg-gray-100 text-gray-700 text-[10px] px-1.5 py-0.5 rounded border border-gray-200">
                                  {proc}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="w-12 h-6 border border-gray-300 rounded mx-auto"></div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="w-24 h-6 border border-gray-300 rounded mx-auto"></div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarLayout>
  );
}

