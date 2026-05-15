"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { 
  analyzeAttendanceDocumentAction, 
  analyzeAttendanceValidationAction, 
  analyzeAttendanceRefinementAction 
} from "@/app/actions/attendance-review";
import type { 
  AttendanceBillingRow, 
  AttendanceReviewAnalysisResult, 
  AttendanceReviewRow 
} from "@/types/attendance-review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  AlertTriangle,
  FileText,
  Loader2,
  ScanSearch,
  Sparkles,
  Trash2,
  UploadCloud,
  CalendarDays,
  Activity,
  Printer,
  XCircle,
  CheckCircle2,
  CalendarRange,
  RotateCcw
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PatientForm } from "@/components/patient-form";
import { cancelAppointment } from "@/app/actions";
import { getFirebasePathBase } from "@/lib/firebaseConfig";
import { ENVIRONMENT } from "../../ambiente";
import { Checkbox } from "@/components/ui/checkbox";

// --- Tipos Locais ---

type DraftRow = {
  realizou: "S" | "N" | "";
  dataAtendimento: string;
  confidence?: AttendanceReviewAnalysisResult["confidence"];
  aiPatientName?: string;
  matchedFrom?: string;
  notes?: string;
};

interface AttendanceReviewPanelProps {
  reportRows: AttendanceBillingRow[];
  loading: boolean;
  onAnalysisResult?: (result: AttendanceReviewAnalysisResult) => void;
  onReset?: () => void;
  analysisReady?: boolean;
}

// --- Componente Principal ---

export function AttendanceReviewPanel({
  reportRows,
  loading,
  onAnalysisResult,
  onReset,
  analysisReady = false,
}: AttendanceReviewPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [analysisResult, setAnalysisResult] = useState<AttendanceReviewAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [draftRows, setDraftRows] = useState<Record<string, DraftRow>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const validationKeyRef = useRef<string>("");
  const autoFillKeyRef = useRef<string>("");

  const [processedRows, setProcessedRows] = useState<Set<string>>(new Set());
  const [manuallyCancelledRows, setManuallyCancelledRows] = useState<Record<string, AttendanceBillingRow>>({});
  const [isConfirmCancelDialogOpen, setIsConfirmCancelDialogOpen] = useState(false);
  const [isRescheduleFormOpen, setIsRescheduleFormOpen] = useState(false);
  const [appointmentToCancel, setAppointmentToCancel] = useState<any>(null);
  const [appointmentToReschedule, setAppointmentToReschedule] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");

  const toggleProcessed = (key: string) => {
    setProcessedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Sincroniza draft com reportRows iniciais
  useEffect(() => {
    setDraftRows((current) => {
      const next: Record<string, DraftRow> = {};
      for (const row of reportRows) {
        const key = getRowKey(row);
        next[key] = current[key] ?? {
          realizou: row.realizouConsulta ?? "",
          dataAtendimento: formatInputDate(row.dataAtendimento),
        };
      }
      return next;
    });
  }, [reportRows]);

  const rowsWithDrafts = useMemo(() => {
    // Mapeia linhas atuais vindas das props
    const currentRows = reportRows.map(row => ({ row, key: getRowKey(row) }));
    const currentKeys = new Set(currentRows.map(r => r.key));

    // Pega linhas canceladas manualmente que não estão mais nas props (já foram removidas do Firebase)
    const keptRows = Object.entries(manuallyCancelledRows)
      .filter(([key]) => !currentKeys.has(key))
      .map(([key, row]) => ({ row, key }));

    // Combina e ordena
    const combined = [...currentRows, ...keptRows].sort((a, b) => 
      a.row._date.localeCompare(b.row._date) || a.row._time.localeCompare(b.row._time)
    );

    return combined.map(({ row, key }) => {
      return {
        row,
        key,
        draft: draftRows[key] ?? {
          realizou: row.realizouConsulta ?? "",
          dataAtendimento: formatInputDate(row.dataAtendimento),
        },
      };
    });
  }, [draftRows, reportRows, manuallyCancelledRows]);

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file);
    setAnalysisResult(null);
    validationKeyRef.current = "";
    autoFillKeyRef.current = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");

    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
  };

  const applyAnalysisToDrafts = (result: AttendanceReviewAnalysisResult) => {
    const nextDrafts: Record<string, DraftRow> = {};
    const usedIndexes = new Set<number>();

    // Aplica o que a IA encontrou sem resetar o que já existe
    for (const aiRow of result.rows) {
      const preferredIndex = typeof aiRow.matchedLineIndex === "number" ? aiRow.matchedLineIndex - 1 : -1;
      let targetIndex = -1;

      // 1. Tenta Match por Índice Preferencial
      if (preferredIndex >= 0 && preferredIndex < reportRows.length && !usedIndexes.has(preferredIndex)) {
        targetIndex = preferredIndex;
      } else {
        // 2. Tenta Match por Nome Exato
        const aiName = normalizeText(aiRow.patientName || "");
        const exactCandidates = reportRows
          .map((row, index) => ({ row, index }))
          .filter(({ row, index }) => !usedIndexes.has(index) && normalizeText(row.nomePaciente || "") === aiName);

        if (exactCandidates.length === 1) {
          targetIndex = exactCandidates[0].index;
        } else if (exactCandidates.length > 1) {
          const exactBySchedule = exactCandidates.find(({ row }) => {
            const sameDate = !aiRow.appointmentDate || aiRow.appointmentDate === row._date;
            const sameTime = !aiRow.appointmentTime || aiRow.appointmentTime === row._time;
            return sameDate && sameTime;
          });
          if (exactBySchedule) targetIndex = exactBySchedule.index;
        }
      }

      // 3. Tenta Fuzzy Match (Score)
      if (targetIndex < 0) {
        let bestScore = 0;
        for (let i = 0; i < reportRows.length; i += 1) {
          if (usedIndexes.has(i)) continue;
          const score = matchScore(aiRow, reportRows[i]);
          if (score > bestScore) {
            bestScore = score;
            targetIndex = i;
          }
        }
        if (targetIndex < 0 || bestScore < 35) continue;
      }

      const target = reportRows[targetIndex];
      usedIndexes.add(targetIndex);
      const key = getRowKey(target);

      nextDrafts[key] = {
        realizou: aiRow.realizou ?? "",
        dataAtendimento: aiRow.dataAtendimento ? formatInputDate(aiRow.dataAtendimento) : "",
        confidence: aiRow.confidence,
        aiPatientName: aiRow.patientName,
        matchedFrom: `Linha ${aiRow.lineIndex}`,
        notes: aiRow.notes,
      };
    }
    setDraftRows((prev) => ({
      ...prev,
      ...nextDrafts,
    }));
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      toast.error("Selecione um arquivo antes de analisar.");
      return;
    }
    setIsAnalyzing(true);
    const loadingToast = toast.loading("Lendo documento com IA...");
    try {
      const fileData = await fileToBase64(selectedFile);
      const analysisPromise = analyzeAttendanceDocumentAction({
        fileData,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "application/octet-stream",
      });

      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000));
      const result = await Promise.race([analysisPromise, timeoutPromise]);

      if (result) {
        setAnalysisResult(result);
        onAnalysisResult?.(result);
        toast.success("Documento analisado com sucesso.", { id: loadingToast });
      } else {
        toast.error("A leitura inicial demorou muito. Tente novamente.", { id: loadingToast });
      }
    } catch (error) {
      console.error(error);
      toast.error("Falha ao analisar o documento.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Trigger automático do preenchimento inicial quando o resultado da Etapa 1 chega
  useEffect(() => {
    if (!analysisResult?.rows?.length || !reportRows.length) return;

    const autoFillKey = [
      selectedFile?.name || "",
      selectedFile?.size || 0,
      reportRows.length,
      analysisResult.rows.length,
      analysisResult.unidade || "",
      analysisResult.mes || "",
      analysisResult.ano || "",
    ].join("|");

    if (autoFillKeyRef.current === autoFillKey) return;

    applyAnalysisToDrafts(analysisResult);
    autoFillKeyRef.current = autoFillKey;
  }, [analysisResult, reportRows, selectedFile]);

  // Trigger automático da Etapa 2 e 3 (Cruzamento e Refinamento)
  useEffect(() => {
    const unidade = analysisResult?.unidade;
    const mes = analysisResult?.mes;
    const ano = analysisResult?.ano;
    if (!selectedFile || !unidade || !mes || !ano || !reportRows.length || isValidating) return;

    const validationKey = [selectedFile.name, selectedFile.size, unidade, mes, ano, reportRows.length].join("|");
    if (validationKeyRef.current === validationKey) return;

    let active = true;
    const runValidation = async () => {
      setIsValidating(true);
      const loadingToast = toast.loading("Cruzando dados identificados com o sistema...");
      try {
        const fileData = await fileToBase64(selectedFile);
        const candidateRows = reportRows.map((row, index) => ({
          lineIndex: index + 1,
          patientName: row.nomePaciente || "",
          appointmentDate: row._date,
          appointmentTime: row._time,
          unidade: row._unitName,
          convenio: row.convenio,
        }));

        const validationPromise = analyzeAttendanceValidationAction({
          fileData,
          fileName: selectedFile.name,
          mimeType: selectedFile.type || "application/octet-stream",
          unidade,
          mes,
          ano,
          rows: candidateRows,
        });

        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000));
        const result = await Promise.race([validationPromise, timeoutPromise]);

        if (!active) return;
        
        // Marcamos a chave como processada independente do resultado para evitar loops
        validationKeyRef.current = validationKey;

        if (result) {
          applyAnalysisToDrafts(result);
          toast.success("Cruzamento concluído.", { id: loadingToast });
        } else {
          toast.error("O cruzamento inicial demorou muito. Você pode tentar o Refino Manual.", { id: loadingToast });
        }
      } catch (error) {
        console.error(error);
        toast.error("Falha no cruzamento.", { id: loadingToast });
      } finally {
        if (active) setIsValidating(false);
      }
    };
    runValidation();
    return () => { active = false; };
  }, [analysisResult, reportRows, selectedFile]);

  const updateDraft = (row: AttendanceBillingRow, field: keyof DraftRow, value: string) => {
    const key = getRowKey(row);
    setDraftRows((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value,
      } as DraftRow,
    }));
  };

  const handleReset = () => {
    setSelectedFile(null);
    setAnalysisResult(null);
    setDraftRows({});
    setProcessedRows(new Set());
    setManuallyCancelledRows({});
    validationKeyRef.current = "";
    autoFillKeyRef.current = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onReset?.();
  };

  const handleRefinement = async () => {
    if (!selectedFile || !analysisResult) return;
    
    const unidade = analysisResult.unidade;
    if (!unidade) {
      toast.error("Unidade não identificada.");
      return;
    }

    const pendingRows = reportRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        const key = getRowKey(row);
        const draft = draftRows[key];
        return !draft || !draft.confidence || draft.confidence === "baixa";
      })
      .map(({ row, index }) => ({
        lineIndex: index + 1,
        patientName: row.nomePaciente || "",
        appointmentDate: row._date,
        appointmentTime: row._time,
        unidade: row._unitName,
        convenio: row.convenio,
      }));

    if (pendingRows.length === 0) {
      toast.info("Não há pendências críticas para refinar.");
      return;
    }

    setIsRefining(true);
    const loadingToast = toast.loading(`Refinando ${pendingRows.length} pacientes...`);
    try {
      const fileData = await fileToBase64(selectedFile);
      const refinementPromise = analyzeAttendanceRefinementAction({
        fileData,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "application/octet-stream",
        unidade,
        pendingPatients: pendingRows,
      });

      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000));
      const refinementResult = await Promise.race([refinementPromise, timeoutPromise]);

      if (refinementResult) {
        applyAnalysisToDrafts(refinementResult);
        toast.success("Refinamento concluído.", { id: loadingToast });
      } else {
        toast.error("O refinamento demorou muito ou falhou.", { id: loadingToast });
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro no refinamento.", { id: loadingToast });
    } finally {
      setIsRefining(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:space-y-0 print:m-0">
      {/* Área de Upload e Status */}
      {/* Top Toolbar: Upload, Actions, and Context Info */}
      <div className="flex flex-wrap items-center gap-6 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm print:hidden">
        {/* Upload & Basic Controls */}
        <div className="flex items-center gap-4">
          <div 
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileChange(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`
              w-20 h-20 flex-shrink-0 cursor-pointer border-2 border-dashed rounded-2xl transition-all duration-300 flex flex-col items-center justify-center text-center p-2
              ${selectedFile ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}
            `}
          >
            <Input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} className="hidden" />
            {selectedFile ? (
              <FileText className="h-6 w-6 text-blue-600" />
            ) : (
              <UploadCloud className="h-6 w-6 text-slate-400" />
            )}
            <span className="text-[8px] font-bold text-slate-500 uppercase mt-1">
              {selectedFile ? 'Trocar' : 'PDF/FOTO'}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {selectedFile && (
              <div className="flex gap-2">
                <Button 
                  onClick={handleAnalyze} 
                  disabled={isAnalyzing || isValidating} 
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-4 rounded-lg text-[10px] font-bold uppercase"
                >
                  {isAnalyzing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  Analisar
                </Button>
                
                {analysisResult && (
                  <Button 
                    onClick={handleRefinement} 
                    disabled={isAnalyzing || isValidating || isRefining} 
                    variant="outline"
                    size="sm"
                    className="border-blue-200 text-blue-600 hover:bg-blue-50 h-8 px-4 rounded-lg text-[10px] font-bold uppercase"
                  >
                    {isRefining ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ScanSearch className="h-3 w-3 mr-1" />}
                    Refinar Pendentes
                  </Button>
                )}
              </div>
            )}
            <Button variant="ghost" onClick={handleReset} size="sm" className="h-8 px-4 text-slate-400 hover:text-rose-500 hover:bg-rose-50 text-[10px] font-bold uppercase self-start">
              <Trash2 className="h-3 w-3 mr-1" /> Limpar Tudo
            </Button>
          </div>
        </div>

        {/* Unit & Period Info */}
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documento Identificado</span>
            {isValidating && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
          </div>
          <div className="flex items-center gap-3">
             <div className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                <span className="text-xs font-bold text-slate-700">
                  {analysisResult?.unidade || "Aguardando..."}
                </span>
             </div>
             <div className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                <span className="text-xs font-bold text-slate-700">
                  {analysisResult ? `${analysisResult.mes}/${analysisResult.ano}` : "Mês/Ano"}
                </span>
             </div>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-3 ml-auto">
           {reportRows.length > 0 && (
             <Button variant="outline" onClick={handlePrint} className="h-10 px-4 border-slate-200 text-slate-600 rounded-xl gap-2 hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
               <Printer className="h-4 w-4" />
               <span className="text-xs font-bold uppercase">Imprimir</span>
             </Button>
           )}
        </div>
      </div>

      {/* Tabela de Dados */}
      <Card className="border-none shadow-2xl shadow-slate-100 bg-white overflow-hidden print:shadow-none print:border print:border-slate-200">
        {!analysisReady ? (
          <div className="p-32 flex flex-col items-center justify-center text-center gap-6 print:hidden">
            <div className="p-6 bg-slate-50 rounded-full">
              <ScanSearch className="h-16 w-16 text-slate-300" />
            </div>
            <div className="max-w-md">
              <h3 className="text-xl font-bold text-slate-800">Aguardando Parâmetros</h3>
              <p className="text-slate-500 mt-2">Selecione a Unidade e o Mês nos filtros acima ou faça o upload do documento para carregar a lista de pacientes.</p>
            </div>
          </div>
        ) : reportRows.length === 0 ? (
          <div className="p-32 flex flex-col items-center justify-center text-center gap-4 print:hidden">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
            <p className="text-xl font-semibold text-slate-700">Nenhum agendamento encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <Table className="print:text-[10px]">
              <TableHeader className="bg-slate-50/80 print:bg-slate-100">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[50px] pl-6 print:hidden">
                    <RotateCcw className="h-4 w-4 text-slate-300" />
                  </TableHead>
                  <TableHead className="w-[150px] font-bold py-5 pl-4 print:pl-4 print:py-2">Data/Hora</TableHead>
                  <TableHead className="font-bold print:py-2">Paciente</TableHead>
                  <TableHead className="font-bold print:py-2">Convênio / Procedimento</TableHead>
                  <TableHead className="text-center font-bold print:py-2">Realizou?</TableHead>
                  <TableHead className="text-center font-bold print:py-2">Data Atend.</TableHead>
                  <TableHead className="font-bold pr-8 print:pr-4 print:py-2">Ações / Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsWithDrafts.map(({ row, draft, key }) => {
                  const isProcessed = processedRows.has(key);
                  const isCancelled = !!row._raw.motivoCancelamento;
                  const cancelReason = row._raw.motivoCancelamento;
                  
                  return (
                    <TableRow 
                      key={key} 
                      className={`
                        group transition-colors print:hover:bg-transparent 
                        ${isProcessed ? 'bg-slate-50/50 opacity-60' : ''} 
                        ${isCancelled ? 'bg-amber-50/50 hover:bg-amber-100/50' : 'hover:bg-blue-50/30'}
                      `}
                    >
                      <TableCell className="pl-6 print:hidden">
                        <Checkbox 
                          checked={isProcessed}
                          onCheckedChange={() => toggleProcessed(key)}
                          className="h-5 w-5 border-slate-300 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                        />
                      </TableCell>
                      <TableCell className="py-6 pl-4 print:pl-4 print:py-2">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-slate-700 text-sm print:text-[10px]">
                            {new Date(row._date).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                          </span>
                          <span className="text-slate-400 text-xs flex items-center gap-1 print:text-[8px]">
                            <CalendarDays className="h-3 w-3 print:hidden" /> {row._time}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="print:py-2">
                        <div className="flex flex-col gap-1">
                          <span className={`font-bold print:text-[10px] ${isCancelled ? 'text-slate-400 line-through decoration-amber-500/50 decoration-2' : 'text-slate-800'}`}>
                            {row.nomePaciente || "Não informado"}
                          </span>
                          {isCancelled && (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="bg-amber-100 text-[9px] font-black text-amber-700 border-amber-200 py-0 h-4 px-1.5 uppercase tracking-tighter">
                                {cancelReason === "Consulta reagendada" ? "REAGENDADO" : "CANCELADO"}
                              </Badge>
                              {cancelReason && cancelReason !== "Consulta reagendada" && (
                                <span className="text-[9px] text-amber-600/70 italic font-medium truncate max-w-[150px]">
                                  {cancelReason}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="print:py-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium text-slate-600 print:text-[10px]">{row.convenio || "Plano não informado"}</span>
                          <div className="flex flex-wrap gap-1 print:hidden">
                            {(row.exames?.length ? row.exames : ["Consulta"]).map((proc, idx) => (
                              <Badge key={idx} variant="secondary" className="bg-slate-100 text-[10px] font-normal text-slate-500 py-0 h-5"> {proc} </Badge>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center print:py-2">
                        <div className="flex justify-center print:hidden">
                          <div className={`flex bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200 ${isCancelled ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                             <button onClick={() => updateDraft(row, "realizou", "S")} className={`px-4 h-8 rounded-lg text-[10px] font-bold transition-all shadow-sm ${draft.realizou === "S" ? 'bg-emerald-500 text-white scale-105' : 'text-slate-400 hover:text-slate-600 bg-transparent'}`}>SIM</button>
                             <button onClick={() => updateDraft(row, "realizou", "N")} className={`px-4 h-8 rounded-lg text-[10px] font-bold transition-all shadow-sm ${draft.realizou === "N" ? 'bg-rose-500 text-white scale-105' : 'text-slate-400 hover:text-slate-600 bg-transparent'}`}>NÃO</button>
                          </div>
                        </div>
                        <div className="hidden print:block font-bold"> {draft.realizou === 'S' ? 'SIM' : draft.realizou === 'N' ? 'NÃO' : '-'} </div>
                      </TableCell>
                      <TableCell className="print:py-2">
                        <Input type="date" disabled={isCancelled} value={formatInputDate(draft.dataAtendimento)} onChange={(e) => updateDraft(row, "dataAtendimento", e.target.value)} className={`mx-auto h-10 w-40 border-slate-200 text-xs rounded-xl focus:ring-blue-500 print:hidden ${isCancelled ? 'opacity-50' : ''}`} />
                        <div className="hidden print:block text-center text-xs"> {draft.dataAtendimento ? new Date(draft.dataAtendimento).toLocaleDateString('pt-BR') : '-'} </div>
                      </TableCell>
                      <TableCell className="pr-8 print:pr-4 print:py-2">
                        <div className="flex flex-col gap-2">
                          {draft.realizou === "N" && !isCancelled && (
                            <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-300">
                              <Button variant="outline" size="sm" onClick={() => {
                                  setAppointmentToReschedule({ ...row._raw, id: `${row._unit}-${row._date}-${row._time}`, nomePaciente: row.nomePaciente, nascimento: row._raw.nascimento, dataAgendamento: row._date, horario: row._time, convenio: row.convenio, exames: row.exames || [], unidade: row._unit, telefone: row._raw.telefone, });
                                  setIsRescheduleFormOpen(true);
                                }} className="h-8 text-[10px] font-bold border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 px-2"
                              > <CalendarRange className="h-3 w-3 mr-1" /> Reagendar </Button>
                              <Button variant="outline" size="sm" onClick={() => {
                                  setAppointmentToCancel({ ...row._raw, id: `${row._unit}-${row._date}-${row._time}`, nomePaciente: row.nomePaciente, nascimento: row._raw.nascimento, dataAgendamento: row._date, horario: row._time, convenio: row.convenio, exames: row.exames || [], unidade: row._unit, telefone: row._raw.telefone, });
                                  setIsConfirmCancelDialogOpen(true);
                                }} className="h-8 text-[10px] font-bold border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 px-2"
                              > <XCircle className="h-3 w-3 mr-1" /> Cancelar </Button>
                            </div>
                          )}
                          {isCancelled && (
                            <div className="flex items-center gap-2">
                               <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-slate-200 text-[10px] py-1 px-3">
                                  Sem ações pendentes
                               </Badge>
                            </div>
                          )}
                          <div className="flex items-center gap-2 print:hidden">
                            {draft.confidence && ( <Badge className={`rounded-full px-3 py-0.5 border text-[10px] font-bold ${getConfidenceBadge(draft.confidence)}`}> {draft.confidence.toUpperCase()} </Badge> )}
                            {isProcessed && ( <CheckCircle2 className="h-4 w-4 text-emerald-500" /> )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Diálogos de Ação */}
      <Dialog open={isConfirmCancelDialogOpen} onOpenChange={(isOpen) => { setIsConfirmCancelDialogOpen(isOpen); if (!isOpen) setCancelReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Cancelamento</DialogTitle>
            <DialogDescription> Tem certeza que deseja cancelar o agendamento de <span className="font-bold">{appointmentToCancel?.nomePaciente}</span>? </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label className="text-sm">Motivo do Cancelamento</Label>
            <Select onValueChange={setCancelReason} value={cancelReason}>
              <SelectTrigger className="rounded-xl border-slate-200"> <SelectValue placeholder="Selecione o motivo" /> </SelectTrigger>
              <SelectContent className="max-h-60 rounded-xl">
                <SelectItem value="Não compareceu à consulta">Não compareceu à consulta</SelectItem>
                <SelectItem value="Consulta reagendada">Consulta reagendada</SelectItem>
                <SelectItem value="Cancelado pelo paciente">Cancelado pelo paciente</SelectItem>
                <SelectItem value="Cancelado pela secretária">Cancelado pela secretária</SelectItem>
                <SelectItem value="Erro do sistema">Erro do sistema</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="ghost" className="rounded-xl">Desistir</Button>
            </DialogClose>
            <Button variant="destructive" className="rounded-xl px-8" disabled={!cancelReason || !appointmentToCancel} onClick={async () => {
                if (!appointmentToCancel) return;
                const loadingToast = toast.loading("Cancelando agendamento...");
                try {
                  await cancelAppointment(getFirebasePathBase(), { telefone: appointmentToCancel.telefone, unidade: appointmentToCancel.unidade, data: appointmentToCancel.dataAgendamento, hora: appointmentToCancel.horario, appointmentData: appointmentToCancel, cancelReason, enviarMsgSecretaria: true, }, ENVIRONMENT);
                  const key = getRowKey({ _unit: appointmentToCancel.unidade, _date: appointmentToCancel.dataAgendamento, _time: appointmentToCancel.horario, nomePaciente: appointmentToCancel.nomePaciente } as any);
                  
                  // Salva no estado local para manter em tela mesmo após sumir do Firebase
                  setManuallyCancelledRows(prev => ({
                    ...prev,
                    [key]: {
                      _unit: appointmentToCancel.unidade,
                      _date: appointmentToCancel.dataAgendamento,
                      _time: appointmentToCancel.horario,
                      _unitName: appointmentToCancel.unidade, // Fallback
                      nomePaciente: appointmentToCancel.nomePaciente,
                      convenio: appointmentToCancel.convenio,
                      exames: appointmentToCancel.exames,
                      _raw: { ...appointmentToCancel, motivoCancelamento: cancelReason },
                    } as AttendanceBillingRow
                  }));

                  toggleProcessed(key);
                  toast.success("Agendamento cancelado com sucesso!", { id: loadingToast });
                  setIsConfirmCancelDialogOpen(false);
                } catch (e) { toast.error("Erro ao cancelar.", { id: loadingToast }); }
              }}
            > Confirmar Cancelamento </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRescheduleFormOpen} onOpenChange={setIsRescheduleFormOpen}>
        <DialogContent className="sm:max-w-[425px] md:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 border-none shadow-2xl">
          <div className="p-6 bg-white sticky top-0 z-10 border-b border-slate-100">
            <DialogTitle className="text-2xl font-bold text-slate-900">Reagendar Paciente</DialogTitle>
            <DialogDescription> O agendamento atual será cancelado e um novo será criado na data escolhida. </DialogDescription>
          </div>
          <div className="p-6">
            {appointmentToReschedule && (
              <PatientForm initialData={appointmentToReschedule} onRescheduleComplete={() => {
                  setIsRescheduleFormOpen(false);
                  const key = getRowKey({ _unit: appointmentToReschedule.unidade, _date: appointmentToReschedule.dataAgendamento, _time: appointmentToReschedule.horario, nomePaciente: appointmentToReschedule.nomePaciente } as any);
                  
                  // Salva no estado local como "reagendado" (que é um tipo de cancelamento do original)
                  setManuallyCancelledRows(prev => ({
                    ...prev,
                    [key]: {
                      _unit: appointmentToReschedule.unidade,
                      _date: appointmentToReschedule.dataAgendamento,
                      _time: appointmentToReschedule.horario,
                      _unitName: appointmentToReschedule.unidade,
                      nomePaciente: appointmentToReschedule.nomePaciente,
                      convenio: appointmentToReschedule.convenio,
                      exames: appointmentToReschedule.exames,
                      _raw: { ...appointmentToReschedule, motivoCancelamento: "Consulta reagendada" },
                    } as AttendanceBillingRow
                  }));

                  toggleProcessed(key);
                  toast.success("Paciente reagendado com sucesso!");
                }} firebaseBase={getFirebasePathBase()}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Funções Utilitárias ---

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const payload = result.includes(",") ? result.split(",")[1] : result;
      resolve(payload);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatInputDate(value?: string | null) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function getRowKey(row: AttendanceBillingRow) {
  return `${row._unit}|${row._date}|${row._time}|${normalizeText(row.nomePaciente || "")}`;
}

function getConfidenceBadge(confidence?: AttendanceReviewAnalysisResult["confidence"]) {
  if (confidence === "alta") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (confidence === "baixa") return "bg-rose-500/10 text-rose-600 border-rose-500/20";
  return "bg-amber-500/10 text-amber-600 border-amber-500/20";
}

function matchScore(aiRow: AttendanceReviewRow, reportRow: AttendanceBillingRow) {
  const aiName = normalizeText(aiRow.patientName || "");
  const reportName = normalizeText(reportRow.nomePaciente || "");
  let score = 0;

  if (!aiName || !reportName) return 0;
  if (aiName === reportName) score += 100;
  else if (aiName.includes(reportName) || reportName.includes(aiName)) score += 60;
  else {
    const aiChunks = aiName.match(/.{1,4}/g) || [];
    const reportChunks = reportName.match(/.{1,4}/g) || [];
    const overlap = aiChunks.filter((chunk) => reportChunks.some((r) => r.includes(chunk)));
    score += overlap.length * 8;
  }

  if (aiRow.appointmentDate && aiRow.appointmentDate === reportRow._date) score += 20;
  if (aiRow.appointmentTime && aiRow.appointmentTime === reportRow._time) score += 15;
  return score;
}
