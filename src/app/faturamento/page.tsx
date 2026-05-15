"use client";

import { useState, useMemo, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ref, onValue } from "firebase/database";
import { getDatabaseInstance } from "@/lib/firebase";
import { ENVIRONMENT } from "../../../ambiente";
import { getFirebasePathBase } from "@/lib/firebaseConfig";
import { ClipboardCheck, Printer } from "lucide-react";
import { AttendanceReviewPanel } from "@/components/attendance-review-panel";
import type { AttendanceBillingRow, AttendanceReviewAnalysisResult } from "@/types/attendance-review";
import { getBillingAppointmentsForUnitMonth, resolveBillingUnitKey } from "@/lib/attendance-report";
import { Badge } from "@/components/ui/badge";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function FaturamentoPage() {
  const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null);
  const [patientData, setPatientData] = useState<Record<string, Record<string, any>>>({});
  const [unitConfig, setUnitConfig] = useState<Record<string, { bairro?: string; empresa?: string }>>({});
  const [loading, setLoading] = useState(true);

  // Filtros Controlados
  const [manualUnit, setManualUnit] = useState<string>("all");
  const [manualMonth, setManualMonth] = useState<string>("");
  const [manualYear, setManualYear] = useState<string>(new Date().getFullYear().toString());

  const [analysisResult, setAnalysisResult] = useState<AttendanceReviewAnalysisResult | null>(null);

  // Sincroniza filtros da IA com filtros manuais quando a IA termina
  useEffect(() => {
    if (analysisResult) {
      if (analysisResult.unidade) {
        const key = resolveBillingUnitKey(analysisResult.unidade, patientData, unitConfig);
        if (key) setManualUnit(key);
      }
      if (analysisResult.mes) setManualMonth(analysisResult.mes);
      if (analysisResult.ano) setManualYear(analysisResult.ano);
    }
  }, [analysisResult, patientData, unitConfig]);

  const handleReset = () => {
    setAnalysisResult(null);
    setManualUnit("all");
    setManualMonth("");
    setManualYear(new Date().getFullYear().toString());
  };

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

    return () => {
      offAg();
      offCfg();
    };
  }, []);

  const reportData = useMemo(() => {
    if (!manualMonth || !manualYear || manualUnit === "all") return [];
    const targetMonthYear = `${manualMonth} de ${manualYear}`;
    return getBillingAppointmentsForUnitMonth(manualUnit, targetMonthYear, patientData, unitConfig);
  }, [manualUnit, manualMonth, manualYear, patientData, unitConfig]);

  return (
    <SidebarLayout unit={selectedUnit}>
      <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-blue-100 pb-4">
          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <div className="p-1.5 bg-blue-600 rounded-lg">
                <ClipboardCheck className="w-5 h-5 text-white" />
              </div>
              Validação de Faturamento
            </h1>
            <p className="text-slate-500 text-sm">
              Cruzamento de documentos e agendamentos via IA.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
             <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1 text-[11px] font-medium rounded-full">
               {reportData.length} agendamentos
             </Badge>
          </div>
        </div>

        {/* AI Panel */}
        <div className="animate-in slide-in-from-bottom-4 duration-1000 delay-200">
          <AttendanceReviewPanel
            reportRows={reportData as AttendanceBillingRow[]}
            loading={loading}
            onAnalysisResult={setAnalysisResult}
            onReset={handleReset}
            analysisReady={Boolean(manualUnit !== "all" && manualMonth && manualYear)}
          />
        </div>
      </div>
    </SidebarLayout>
  );
}

