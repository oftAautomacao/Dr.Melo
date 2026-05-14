"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeAttendanceDocumentAction, analyzeAttendanceValidationAction } from "@/app/actions/attendance-review";
import type { AttendanceBillingRow, AttendanceReviewAnalysisResult, AttendanceReviewRow } from "@/types/attendance-review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  ScanSearch,
  Sparkles,
  Trash2,
} from "lucide-react";

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
  analysisReady?: boolean;
}

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

function formatDisplayDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR", { timeZone: "UTC" });
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
  if (confidence === "alta") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (confidence === "baixa") return "bg-red-100 text-red-800 border-red-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
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

export function AttendanceReviewPanel({
  reportRows,
  loading,
  onAnalysisResult,
  analysisReady = false,
}: AttendanceReviewPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewKind, setPreviewKind] = useState<"image" | "pdf" | "other">("other");
  const [analysisResult, setAnalysisResult] = useState<AttendanceReviewAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [draftRows, setDraftRows] = useState<Record<string, DraftRow>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const validationKeyRef = useRef<string>("");
  const autoFillKeyRef = useRef<string>("");

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
    return reportRows.map((row) => {
      const key = getRowKey(row);
      return {
        row,
        draft: draftRows[key] ?? {
          realizou: row.realizouConsulta ?? "",
          dataAtendimento: formatInputDate(row.dataAtendimento),
        },
      };
    });
  }, [draftRows, reportRows]);

  const analysisStats = useMemo(() => {
    const total = rowsWithDrafts.length;
    const filled = rowsWithDrafts.filter(({ draft }) => draft.realizou || draft.dataAtendimento).length;
    const matched = rowsWithDrafts.filter(({ draft }) => draft.aiPatientName).length;
    const pending = Math.max(total - matched, 0);
    return { total, filled, matched, pending };
  }, [rowsWithDrafts]);

  const groupedRows = useMemo(() => {
    return rowsWithDrafts.reduce<Array<(typeof rowsWithDrafts)[number][]>>((groups, item, index) => {
      const chunkSize = 6;
      if (index % chunkSize === 0) groups.push([]);
      groups[groups.length - 1].push(item);
      return groups;
    }, []);
  }, [rowsWithDrafts]);

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file);
    setAnalysisResult(null);
    validationKeyRef.current = "";
    autoFillKeyRef.current = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setPreviewKind("other");

    if (!file) return;

    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    if (file.type.startsWith("image/")) setPreviewKind("image");
    else if (file.type === "application/pdf") setPreviewKind("pdf");
    else setPreviewKind("other");
  };

  const applyAnalysisToDrafts = (result: AttendanceReviewAnalysisResult) => {
    const nextDrafts: Record<string, DraftRow> = {};
    const usedIndexes = new Set<number>();

    for (const row of reportRows) {
      const key = getRowKey(row);
      nextDrafts[key] = {
        realizou: row.realizouConsulta ?? "",
        dataAtendimento: formatInputDate(row.dataAtendimento),
      };
    }

    for (const aiRow of result.rows) {
      const preferredIndex = typeof aiRow.matchedLineIndex === "number" ? aiRow.matchedLineIndex - 1 : -1;
      let targetIndex = -1;

      if (preferredIndex >= 0 && preferredIndex < reportRows.length && !usedIndexes.has(preferredIndex)) {
        targetIndex = preferredIndex;
      } else {
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

          if (exactBySchedule) {
            targetIndex = exactBySchedule.index;
          }
        }
      }

      if (targetIndex < 0) {
        let bestScore = 0;

        for (let i = 0; i < reportRows.length; i += 1) {
          if (usedIndexes.has(i)) continue;
          const candidate = reportRows[i];
          const score = matchScore(aiRow, candidate);
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
        dataAtendimento: formatInputDate(aiRow.dataAtendimento),
        confidence: aiRow.confidence,
        aiPatientName: aiRow.patientName,
        matchedFrom: `Linha ${aiRow.lineIndex}`,
        notes: aiRow.notes,
      };
    }

    setDraftRows(nextDrafts);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      toast.error("Selecione um arquivo antes de analisar.");
      return;
    }

    if (selectedFile.size > 20 * 1024 * 1024) {
      toast.error("O arquivo Ã© muito grande. Tente um arquivo menor que 20 MB.");
      return;
    }

    setIsAnalyzing(true);
    const loadingToast = toast.loading("Lendo documento com IA...");

    try {
      const fileData = await fileToBase64(selectedFile);
      const result = await analyzeAttendanceDocumentAction({
        fileData,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "application/octet-stream",
      });

      if (!result) {
        toast.error("NÃ£o foi possÃ­vel analisar o documento.");
        return;
      }

      setAnalysisResult(result);
      onAnalysisResult?.(result);
      toast.success("Documento analisado com sucesso.");
    } catch (error) {
      console.error(error);
      toast.error("Falha ao analisar o documento.");
    } finally {
      toast.dismiss(loadingToast);
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    const unidade = analysisResult?.unidade;
    const mes = analysisResult?.mes;
    const ano = analysisResult?.ano;

    if (!selectedFile || !unidade || !mes || !ano) return;
    if (!reportRows.length || isValidating) return;

    const validationKey = [
      selectedFile.name,
      selectedFile.size,
      analysisResult.unidade,
      analysisResult.mes,
      analysisResult.ano,
      reportRows.length,
    ].join("|");

    if (validationKeyRef.current === validationKey) return;

    let active = true;

    const runValidation = async () => {
      setIsValidating(true);
      const loadingToast = toast.loading("Comparando com os agendamentos internos...");

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

        const result = await analyzeAttendanceValidationAction({
          fileData,
          fileName: selectedFile.name,
          mimeType: selectedFile.type || "application/octet-stream",
          unidade,
          mes,
          ano,
          rows: candidateRows,
        });

        if (!active || !result) return;

        validationKeyRef.current = validationKey;
        applyAnalysisToDrafts(result);
        toast.success("ComparaÃ§Ã£o interna concluÃ­da.");
      } catch (error) {
        console.error(error);
        toast.error("Falha ao comparar os dados internos.");
      } finally {
        toast.dismiss(loadingToast);
        if (active) setIsValidating(false);
      }
    };

    runValidation();

    return () => {
      active = false;
    };
  }, [analysisResult, isValidating, reportRows, selectedFile]);

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

  const updateDraft = (row: AttendanceBillingRow, field: keyof DraftRow, value: string) => {
    const key = getRowKey(row);
    setDraftRows((current) => ({
      ...current,
      [key]: {
        realizou: current[key]?.realizou ?? (row.realizouConsulta ?? ""),
        dataAtendimento: current[key]?.dataAtendimento ?? formatInputDate(row.dataAtendimento),
        confidence: current[key]?.confidence,
        aiPatientName: current[key]?.aiPatientName,
        matchedFrom: current[key]?.matchedFrom,
        notes: current[key]?.notes,
        [field]: value,
      },
    }));
  };

  const handleReset = () => {
    setSelectedFile(null);
    setAnalysisResult(null);
    setDraftRows({});
    validationKeyRef.current = "";
    autoFillKeyRef.current = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setPreviewKind("other");
  };

  return (
    <div className="space-y-6">
      <Card className="border-blue-100 bg-gradient-to-br from-white via-slate-50 to-blue-50 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-xl text-blue-950 flex items-center gap-2">
                <ScanSearch className="h-5 w-5 text-blue-600" />
                ConferÃªncia de faturamento
              </CardTitle>
              <CardDescription className="text-sm text-slate-600">
                Envie a foto, PDF ou Word da secretÃ¡ria. A IA lÃª o documento e preenche a revisÃ£o.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-blue-200 bg-white/80 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <Label htmlFor="attendance-file" className="text-xs font-bold uppercase tracking-wider text-blue-900">
                      Arquivo da secretÃ¡ria
                    </Label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="border-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Escolher arquivo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReset}
                      className="border-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Limpar
                    </Button>
                  </div>
                </div>

                <Input
                  ref={fileInputRef}
                  id="attendance-file"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx"
                  onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                  className="hidden"
                />

                {selectedFile && (
                  <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
                    <div className="rounded-lg border bg-slate-50 p-3">
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                        <FileText className="h-4 w-4 text-blue-600" />
                        {selectedFile.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        Tipo: {selectedFile.type || "desconhecido"} | Tamanho: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                      <div className="mt-4">
                        <Button
                          type="button"
                          onClick={handleAnalyze}
                          disabled={isAnalyzing || isValidating}
                          className="w-full bg-blue-700 text-white hover:bg-blue-800"
                        >
                          {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                          Analisar documento
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-lg border bg-white p-3 text-xs text-slate-600">
                      <div className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
                        <ImageIcon className="h-4 w-4 text-slate-600" />
                        PrÃ©-visualizaÃ§Ã£o
                      </div>
                      {previewKind === "image" && previewUrl && (
                        <img src={previewUrl} alt="PrÃ©-visualizaÃ§Ã£o do documento" className="max-h-52 w-full rounded-md object-contain" />
                      )}
                      {previewKind === "pdf" && previewUrl && (
                        <iframe src={previewUrl} className="h-52 w-full rounded-md border bg-slate-100" title="PrÃ©-visualizaÃ§Ã£o PDF" />
                      )}
                      {previewKind === "other" && (
                        <div className="flex h-52 items-center justify-center rounded-md border border-dashed bg-slate-50 text-center">
                          <div>
                            <FileText className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                            <p className="font-medium text-slate-700">Documento anexado</p>
                            <p className="mt-1 text-xs text-slate-500">A IA vai processar o conteÃºdo do arquivo.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-slate-200 bg-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">Resumo da revisÃ£o</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Linhas internas</span>
                    <span className="font-semibold text-slate-900">{analysisStats.total}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Preenchidas</span>
                    <span className="font-semibold text-slate-900">{analysisStats.filled}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Encontradas na foto</span>
                    <span className="font-semibold text-slate-900">{analysisStats.matched}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Pendentes</span>
                    <span className="font-semibold text-slate-900">{analysisStats.pending}</span>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900 space-y-1">
                    <div className="font-semibold">
                      {isValidating
                        ? "2. Cruzando com os agendamentos internos..."
                        : analysisResult
                          ? "Comparação pronta para revisão."
                          : "1. Aguarde a leitura do documento."}
                    </div>
                    <div>
                      {analysisStats.total === 0
                        ? "Nenhuma linha interna encontrada para o filtro identificado."
                        : `${analysisStats.matched} de ${analysisStats.total} linhas já foram associadas pela IA.`}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">Resultado da IA</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Unidade</span>
                    <span className="font-semibold text-slate-900">{analysisResult?.unidade || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">MÃªs/Ano</span>
                    <span className="font-semibold text-slate-900">
                      {analysisResult?.mes && analysisResult?.ano ? `${analysisResult.mes} / ${analysisResult.ano}` : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Tipo</span>
                    <span className="font-semibold text-slate-900">{analysisResult?.documentType || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">ConfianÃ§a</span>
                    <Badge className={analysisResult ? getConfidenceBadge(analysisResult.confidence) : "bg-slate-100 text-slate-600 border-slate-200"}>
                      {analysisResult?.confidence || "pendente"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Os dados extraidos da imagem alimentam a lista abaixo automaticamente.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-blue-100 bg-white shadow-sm">
        <CardHeader className="border-b bg-blue-50/70">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-lg text-blue-950">RevisÃ£o das consultas</CardTitle>
              <CardDescription>
                A imagem preenche automaticamente as colunas <span className="font-semibold text-slate-700">Realizou</span> e{" "}<span className="font-semibold text-slate-700">Data de atendimento</span>.
              </CardDescription>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Modo somente leitura. A conferÃªncia fica apenas na tela e nÃ£o grava nada no banco.
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-blue-600" />
              <p className="font-medium text-slate-700">Carregando dados do faturamento...</p>
            </div>
          ) : !analysisReady ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <ScanSearch className="mb-3 h-8 w-8 text-blue-600" />
              <p className="font-medium text-slate-700">A lista aparece depois que a IA identificar unidade, mÃªs e ano.</p>
            </div>
          ) : reportRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <AlertTriangle className="mb-3 h-8 w-8 text-amber-500" />
              <p className="font-medium text-slate-700">Nenhum agendamento encontrado para o perÃ­odo selecionado.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {groupedRows.map((group, groupIndex) => (
                <div key={groupIndex} className="grid gap-4 xl:grid-cols-2">
                  {group.map(({ row, draft }) => (
                    <div key={getRowKey(row)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <span>{row.nomePaciente || "NÃ£o informado"}</span>
                            <Badge className={getConfidenceBadge(draft.confidence)}>{draft.confidence || "manual"}</Badge>
                          </div>
                          <div className="text-xs text-slate-500">
                            {new Date(row._date).toLocaleDateString("pt-BR", { timeZone: "UTC" })} Ã s {row._time}
                          </div>
                          <div className="text-xs text-blue-700 font-medium">{row._unitName}</div>
                          {row._bairro && <div className="text-[10px] uppercase tracking-tight text-slate-500">{row._bairro}</div>}
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          {draft.matchedFrom ? `IA: ${draft.matchedFrom}` : "Sem correspondÃªncia da IA"}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-[11px] uppercase tracking-wider text-slate-500">ConvÃªnio</Label>
                          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                            {row.convenio || "NÃ£o informado"}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] uppercase tracking-wider text-slate-500">Realizou (S/N)</Label>
                          <Select
                            value={draft.realizou || ""}
                            onValueChange={(value) => updateDraft(row, "realizou", value)}
                          >
                            <SelectTrigger className="border-slate-200 bg-white">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="S">S</SelectItem>
                              <SelectItem value="N">N</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] uppercase tracking-wider text-slate-500">Data atendimento</Label>
                          <Input
                            type="date"
                            value={formatInputDate(draft.dataAtendimento)}
                            onChange={(event) => updateDraft(row, "dataAtendimento", event.target.value)}
                            className="border-slate-200 bg-white"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] uppercase tracking-wider text-slate-500">Procedimentos</Label>
                          <div className="flex flex-wrap gap-1 rounded-md border bg-slate-50 px-3 py-2">
                            {(row.exames?.length ? row.exames : ["Consulta"]).map((proc, idx) => (
                              <span key={idx} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-700">
                                {proc}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {draft.notes && (
                        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          {draft.notes}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {draft.matchedFrom ? (
                          <Badge className="border border-blue-200 bg-blue-50 text-blue-800">
                            Preenchido pela IA
                          </Badge>
                        ) : (
                          <Badge className="border border-slate-200 bg-slate-100 text-slate-600">
                            Pendente de comparaÃ§Ã£o
                          </Badge>
                        )}
                        {draft.aiPatientName && (
                          <span>
                            Linha da foto: <span className="font-medium text-slate-700">{draft.aiPatientName}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

