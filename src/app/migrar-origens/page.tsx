"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SidebarLayout from "@/components/layout/sidebar-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ENVIRONMENT } from "../../../ambiente";
import { getFirebasePathBase } from "@/lib/firebaseConfig";
import {
  cleanupConversasLegacyNodesAction,
  copyPhoneAppointmentsToConversasAction,
  getConversasLegacyCleanupPreviewAction,
  getConversasOriginsPreviewAction,
  getPhoneAppointmentsCopyPreviewAction,
  migratePhoneOriginAction,
  type ConversasLegacyCleanupPreviewItem,
  type ConversasLegacyCleanupPreviewResult,
  type ConversasLegacyCleanupResult,
  type ConversasOriginPreviewItem,
  type ConversasOriginsPreviewResult,
  type MigrationResult,
  type OriginSyncTarget,
  type PhoneAppointmentsCopyPreviewItem,
  type PhoneAppointmentsCopyPreviewResult,
  type PhoneAppointmentsCopyResult,
} from "@/app/actions";
import { AlertTriangle, PlayCircle, PauseCircle, RefreshCw, CheckCircle2 } from "lucide-react";

const PROCESS_OPTIONS = [5, 10, 50, 100, 500, 1000] as const;
const PARALLEL_BATCH_SIZE = 5;
const TARGET_OPTIONS: Array<{ value: OriginSyncTarget; label: string }> = [
  { value: "consultasAgendadas", label: "consultasAgendadas" },
  { value: "consultasCanceladas", label: "consultasCanceladas" },
];

type LogEntry = {
  type: "ok" | "skip" | "error" | "info";
  message: string;
};

export default function MigrarOrigensPage() {
  const pathBase = getFirebasePathBase();

  const [previewItems, setPreviewItems] = useState<ConversasOriginPreviewItem[]>([]);
  const [previewCursor, setPreviewCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isExhausted, setIsExhausted] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [runSize, setRunSize] = useState<(typeof PROCESS_OPTIONS)[number]>(5);
  const [syncTarget, setSyncTarget] = useState<OriginSyncTarget>("consultasAgendadas");

  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalUpdated, setTotalUpdated] = useState(0);
  const [totalSkipped, setTotalSkipped] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(false);
  const isRunningRef = useRef(false);
  const lastRunSizeRef = useRef(runSize);

  const [copyPreviewItems, setCopyPreviewItems] = useState<PhoneAppointmentsCopyPreviewItem[]>([]);
  const [copyPreviewCursor, setCopyPreviewCursor] = useState<string | null>(null);
  const [copyNextCursor, setCopyNextCursor] = useState<string | null>(null);
  const [copyIsExhausted, setCopyIsExhausted] = useState(false);
  const [copyIsRunning, setCopyIsRunning] = useState(false);
  const [copyIsDone, setCopyIsDone] = useState(false);
  const [copyIsLoading, setCopyIsLoading] = useState(false);
  const [copyHasLoaded, setCopyHasLoaded] = useState(false);
  const [copyRunSize, setCopyRunSize] = useState<(typeof PROCESS_OPTIONS)[number]>(5);
  const [copyTarget, setCopyTarget] = useState<OriginSyncTarget>("consultasAgendadas");

  const [copyTotalProcessed, setCopyTotalProcessed] = useState(0);
  const [copyTotalUpdated, setCopyTotalUpdated] = useState(0);
  const [copyTotalSkipped, setCopyTotalSkipped] = useState(0);
  const [copyTotalErrors, setCopyTotalErrors] = useState(0);

  const [copyLogs, setCopyLogs] = useState<LogEntry[]>([]);
  const copyLogsEndRef = useRef<HTMLDivElement>(null);
  const copyIsPausedRef = useRef(false);
  const copyIsRunningRef = useRef(false);
  const copyLastRunSizeRef = useRef(copyRunSize);

  const [cleanupPreviewItems, setCleanupPreviewItems] = useState<ConversasLegacyCleanupPreviewItem[]>([]);
  const [cleanupPreviewCursor, setCleanupPreviewCursor] = useState<string | null>(null);
  const [cleanupNextCursor, setCleanupNextCursor] = useState<string | null>(null);
  const [cleanupIsExhausted, setCleanupIsExhausted] = useState(false);
  const [cleanupIsRunning, setCleanupIsRunning] = useState(false);
  const [cleanupIsDone, setCleanupIsDone] = useState(false);
  const [cleanupIsLoading, setCleanupIsLoading] = useState(false);
  const [cleanupHasLoaded, setCleanupHasLoaded] = useState(false);
  const [cleanupRunSize, setCleanupRunSize] = useState<(typeof PROCESS_OPTIONS)[number]>(5);

  const [cleanupTotalProcessed, setCleanupTotalProcessed] = useState(0);
  const [cleanupTotalUpdated, setCleanupTotalUpdated] = useState(0);
  const [cleanupTotalSkipped, setCleanupTotalSkipped] = useState(0);
  const [cleanupTotalErrors, setCleanupTotalErrors] = useState(0);

  const [cleanupLogs, setCleanupLogs] = useState<LogEntry[]>([]);
  const cleanupLogsEndRef = useRef<HTMLDivElement>(null);
  const cleanupIsPausedRef = useRef(false);
  const cleanupIsRunningRef = useRef(false);
  const cleanupLastRunSizeRef = useRef(cleanupRunSize);

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev.slice(-200), entry]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const addCopyLog = useCallback((entry: LogEntry) => {
    setCopyLogs((prev) => [...prev.slice(-200), entry]);
    setTimeout(() => copyLogsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const addCleanupLog = useCallback((entry: LogEntry) => {
    setCleanupLogs((prev) => [...prev.slice(-200), entry]);
    setTimeout(() => cleanupLogsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const loadPreview = useCallback(
    async (startCursor: string | null, resetSession: boolean, showLoadingMessage: boolean) => {
      setIsLoading(true);

      if (resetSession) {
        setLogs([]);
        setIsDone(false);
        setTotalProcessed(0);
        setTotalUpdated(0);
        setTotalSkipped(0);
        setTotalErrors(0);
      }

      try {
        if (showLoadingMessage) {
          addLog({ type: "info", message: "Carregando proxima rodada do no de conversas..." });
        }

        const result: ConversasOriginsPreviewResult = await getConversasOriginsPreviewAction(
          "DRM",
          ENVIRONMENT,
          runSize,
          startCursor
        );

        setPreviewItems(result.items);
        setPreviewCursor(startCursor);
        setNextCursor(result.nextCursor);
        setIsExhausted(result.done);
        setHasLoaded(true);

        if (result.items.length === 0 && result.done) {
          setIsDone(true);
          addLog({
            type: "info",
            message: "Nenhum telefone com origem pendente foi encontrado na fila atual.",
          });
          return;
        }

        addLog({
          type: "info",
          message: `Previa carregada com ${result.items.length} telefone(s) para ${syncTarget}. Estes sao os proximos da rodada.`,
        });
      } catch (e: any) {
        addLog({ type: "error", message: `Erro ao carregar previa: ${e.message}` });
      } finally {
        setIsLoading(false);
      }
    },
    [ENVIRONMENT, addLog, runSize, syncTarget]
  );

  const loadCopyPreview = useCallback(
    async (startCursor: string | null, resetSession: boolean, showLoadingMessage: boolean) => {
      setCopyIsLoading(true);

      if (resetSession) {
        setCopyLogs([]);
        setCopyIsDone(false);
        setCopyTotalProcessed(0);
        setCopyTotalUpdated(0);
        setCopyTotalSkipped(0);
        setCopyTotalErrors(0);
      }

      try {
        if (showLoadingMessage) {
          addCopyLog({ type: "info", message: "Carregando proxima rodada do no de telefones..." });
        }

        const result: PhoneAppointmentsCopyPreviewResult = await getPhoneAppointmentsCopyPreviewAction(
          "DRM",
          ENVIRONMENT,
          copyRunSize,
          startCursor,
          copyTarget
        );

        setCopyPreviewItems(result.items);
        setCopyPreviewCursor(startCursor);
        setCopyNextCursor(result.nextCursor);
        setCopyIsExhausted(result.done);
        setCopyHasLoaded(true);

        if (result.items.length === 0 && result.done) {
          setCopyIsDone(true);
          addCopyLog({
            type: "info",
            message: `Nenhum telefone com consultas em ${copyTarget}/telefones foi encontrado na fila atual.`,
          });
          return;
        }

        addCopyLog({
          type: "info",
          message: `Previa carregada com ${result.items.length} telefone(s) para copiar de ${copyTarget}/telefones para conversas.`,
        });
      } catch (e: any) {
        addCopyLog({ type: "error", message: `Erro ao carregar previa: ${e.message}` });
      } finally {
        setCopyIsLoading(false);
      }
    },
    [ENVIRONMENT, addCopyLog, copyRunSize, copyTarget]
  );

  const loadCleanupPreview = useCallback(
    async (startCursor: string | null, resetSession: boolean, showLoadingMessage: boolean) => {
      setCleanupIsLoading(true);

      if (resetSession) {
        setCleanupLogs([]);
        setCleanupIsDone(false);
        setCleanupTotalProcessed(0);
        setCleanupTotalUpdated(0);
        setCleanupTotalSkipped(0);
        setCleanupTotalErrors(0);
      }

      try {
        if (showLoadingMessage) {
          addCleanupLog({ type: "info", message: "Carregando proxima rodada do no de conversas..." });
        }

        const result: ConversasLegacyCleanupPreviewResult = await getConversasLegacyCleanupPreviewAction(
          "DRM",
          ENVIRONMENT,
          cleanupRunSize,
          startCursor
        );

        setCleanupPreviewItems(result.items);
        setCleanupPreviewCursor(startCursor);
        setCleanupNextCursor(result.nextCursor);
        setCleanupIsExhausted(result.done);
        setCleanupHasLoaded(true);

        if (result.items.length === 0 && result.done) {
          setCleanupIsDone(true);
          addCleanupLog({
            type: "info",
            message: "Nenhum telefone com nos legados para apagar foi encontrado na fila atual.",
          });
          return;
        }

        addCleanupLog({
          type: "info",
          message: `Previa carregada com ${result.items.length} telefone(s) com nos legados para limpar.`,
        });
      } catch (e: any) {
        addCleanupLog({ type: "error", message: `Erro ao carregar previa: ${e.message}` });
      } finally {
        setCleanupIsLoading(false);
      }
    },
    [ENVIRONMENT, addCleanupLog, cleanupRunSize]
  );

  useEffect(() => {
    if (!hasLoaded || isRunning) {
      lastRunSizeRef.current = runSize;
      return;
    }
    if (lastRunSizeRef.current === runSize) return;
    lastRunSizeRef.current = runSize;
    void loadPreview(previewCursor, false, false);
  }, [runSize, hasLoaded, isRunning, previewCursor, loadPreview]);

  useEffect(() => {
    if (!copyHasLoaded || copyIsRunning) {
      copyLastRunSizeRef.current = copyRunSize;
      return;
    }
    if (copyLastRunSizeRef.current === copyRunSize) return;
    copyLastRunSizeRef.current = copyRunSize;
    void loadCopyPreview(copyPreviewCursor, false, false);
  }, [copyRunSize, copyHasLoaded, copyIsRunning, copyPreviewCursor, loadCopyPreview]);

  useEffect(() => {
    if (!cleanupHasLoaded || cleanupIsRunning) {
      cleanupLastRunSizeRef.current = cleanupRunSize;
      return;
    }
    if (cleanupLastRunSizeRef.current === cleanupRunSize) return;
    cleanupLastRunSizeRef.current = cleanupRunSize;
    void loadCleanupPreview(cleanupPreviewCursor, false, false);
  }, [cleanupRunSize, cleanupHasLoaded, cleanupIsRunning, cleanupPreviewCursor, loadCleanupPreview]);

  const handleLoad = async () => {
    await loadPreview(null, true, true);
  };

  const handleStart = async () => {
    if (previewItems.length === 0) return;

    isPausedRef.current = false;
    isRunningRef.current = true;
    setIsRunning(true);

    addLog({
      type: "info",
      message: `Sincronizando os ${previewItems.length} telefone(s) exibidos na previa em ${syncTarget}.`,
    });

    let processedInRun = 0;

    for (let idx = 0; idx < previewItems.length; idx += PARALLEL_BATCH_SIZE) {
      if (isPausedRef.current) break;

      const batch = previewItems.slice(idx, idx + PARALLEL_BATCH_SIZE);
      const results: MigrationResult[] = await Promise.all(
        batch.map(({ phone, origem }) => migratePhoneOriginAction("DRM", phone, origem, ENVIRONMENT, syncTarget))
      );

      for (const r of results) {
        processedInRun++;

        if (r.success) {
          if (r.appointmentsUpdated > 0) {
            setTotalUpdated((prev) => prev + r.appointmentsUpdated);
            addLog({
              type: "ok",
              message: `[OK] ${r.phone} -> origem "${r.origem}" aplicada em ${r.appointmentsUpdated} consulta(s).`,
            });
          } else {
            setTotalSkipped((prev) => prev + 1);
            addLog({
              type: "skip",
              message: `[SKIP] ${r.phone} -> sem consultas a atualizar.`,
            });
          }
        } else {
          setTotalErrors((prev) => prev + 1);
          addLog({
            type: "error",
            message: `[ERRO] ${r.phone} -> ${r.error}`,
          });
        }

        setTotalProcessed((prev) => prev + 1);
      }

      await new Promise((res) => setTimeout(res, 300));
    }

    isRunningRef.current = false;
    setIsRunning(false);

    if (isPausedRef.current) {
      addLog({ type: "info", message: "Sincronizacao pausada. Clique em sincronizar para continuar a rodada." });
      return;
    }

    addLog({
      type: "info",
      message: `Rodada concluida em ${syncTarget}. ${processedInRun} telefone(s) foram processados.`,
    });

    if (nextCursor === null) {
      setPreviewItems([]);
      setIsDone(true);
      setIsExhausted(true);
      addLog({ type: "info", message: "Sincronizacao concluida. Nao ha mais telefones na fila atual." });
      return;
    }

    await loadPreview(nextCursor, false, true);
  };

  const handlePause = () => {
    isPausedRef.current = true;
    setIsRunning(false);
  };

  const handleReset = () => {
    isPausedRef.current = false;
    isRunningRef.current = false;
    setIsRunning(false);
    setIsDone(false);
    setHasLoaded(false);
    setPreviewItems([]);
    setPreviewCursor(null);
    setNextCursor(null);
    setIsExhausted(false);
    setTotalProcessed(0);
    setTotalUpdated(0);
    setTotalSkipped(0);
    setTotalErrors(0);
    setLogs([]);
  };

  const handleCopyLoad = async () => {
    await loadCopyPreview(null, true, true);
  };

  const handleCopyStart = async () => {
    if (copyPreviewItems.length === 0) return;

    copyIsPausedRef.current = false;
    copyIsRunningRef.current = true;
    setCopyIsRunning(true);

    addCopyLog({
      type: "info",
      message: `Copiando os ${copyPreviewItems.length} telefone(s) exibidos na previa de ${copyTarget}/telefones para conversas.`,
    });

    let processedInRun = 0;

    for (let idx = 0; idx < copyPreviewItems.length; idx += PARALLEL_BATCH_SIZE) {
      if (copyIsPausedRef.current) break;

      const batch = copyPreviewItems.slice(idx, idx + PARALLEL_BATCH_SIZE);
      const results: PhoneAppointmentsCopyResult[] = await Promise.all(
        batch.map(({ phone }) => copyPhoneAppointmentsToConversasAction("DRM", phone, ENVIRONMENT, copyTarget))
      );

      for (const r of results) {
        processedInRun++;

        if (r.success) {
          if (r.appointmentsCopied > 0) {
            setCopyTotalUpdated((prev) => prev + r.appointmentsCopied);
            addCopyLog({
              type: "ok",
              message: `[OK] ${r.phone} -> ${r.appointmentsCopied} consulta(s) copiada(s) para conversas/${r.phone}/${copyTarget}.`,
            });
          } else {
            setCopyTotalSkipped((prev) => prev + 1);
            addCopyLog({
              type: "skip",
              message: `[SKIP] ${r.phone} -> sem consultas para copiar.`,
            });
          }
        } else {
          setCopyTotalErrors((prev) => prev + 1);
          addCopyLog({
            type: "error",
            message: `[ERRO] ${r.phone} -> ${r.error}`,
          });
        }

        setCopyTotalProcessed((prev) => prev + 1);
      }

      await new Promise((res) => setTimeout(res, 300));
    }

    copyIsRunningRef.current = false;
    setCopyIsRunning(false);

    if (copyIsPausedRef.current) {
      addCopyLog({ type: "info", message: "Copia pausada. Clique em copiar para continuar a rodada." });
      return;
    }

    addCopyLog({
      type: "info",
      message: `Rodada concluida em ${copyTarget}. ${processedInRun} telefone(s) foram processados.`,
    });

    if (copyNextCursor === null) {
      setCopyPreviewItems([]);
      setCopyIsDone(true);
      setCopyIsExhausted(true);
      addCopyLog({ type: "info", message: "Copia concluida. Nao ha mais telefones na fila atual." });
      return;
    }

    await loadCopyPreview(copyNextCursor, false, true);
  };

  const handleCopyPause = () => {
    copyIsPausedRef.current = true;
    setCopyIsRunning(false);
  };

  const handleCopyReset = () => {
    copyIsPausedRef.current = false;
    copyIsRunningRef.current = false;
    setCopyIsRunning(false);
    setCopyIsDone(false);
    setCopyHasLoaded(false);
    setCopyPreviewItems([]);
    setCopyPreviewCursor(null);
    setCopyNextCursor(null);
    setCopyIsExhausted(false);
    setCopyTotalProcessed(0);
    setCopyTotalUpdated(0);
    setCopyTotalSkipped(0);
    setCopyTotalErrors(0);
    setCopyLogs([]);
  };

  const handleCleanupLoad = async () => {
    await loadCleanupPreview(null, true, true);
  };

  const handleCleanupStart = async () => {
    if (cleanupPreviewItems.length === 0) return;

    cleanupIsPausedRef.current = false;
    cleanupIsRunningRef.current = true;
    setCleanupIsRunning(true);

    addCleanupLog({
      type: "info",
      message: `Apagando os nos legados exibidos na previa em ${cleanupPreviewItems.length} telefone(s).`,
    });

    let processedInRun = 0;

    for (let idx = 0; idx < cleanupPreviewItems.length; idx += PARALLEL_BATCH_SIZE) {
      if (cleanupIsPausedRef.current) break;

      const batch = cleanupPreviewItems.slice(idx, idx + PARALLEL_BATCH_SIZE);
      const results: ConversasLegacyCleanupResult[] = await Promise.all(
        batch.map(({ phone }) => cleanupConversasLegacyNodesAction("DRM", phone, ENVIRONMENT))
      );

      for (const r of results) {
        processedInRun++;

        if (r.success) {
          if (r.nodesRemoved > 0) {
            setCleanupTotalUpdated((prev) => prev + r.nodesRemoved);
            addCleanupLog({
              type: "ok",
              message: `[OK] ${r.phone} -> ${r.nodesRemoved} no(s) legado(s) apagado(s).`,
            });
          } else {
            setCleanupTotalSkipped((prev) => prev + 1);
            addCleanupLog({
              type: "skip",
              message: `[SKIP] ${r.phone} -> nenhum no legado para apagar.`,
            });
          }
        } else {
          setCleanupTotalErrors((prev) => prev + 1);
          addCleanupLog({
            type: "error",
            message: `[ERRO] ${r.phone} -> ${r.error}`,
          });
        }

        setCleanupTotalProcessed((prev) => prev + 1);
      }

      await new Promise((res) => setTimeout(res, 300));
    }

    cleanupIsRunningRef.current = false;
    setCleanupIsRunning(false);

    if (cleanupIsPausedRef.current) {
      addCleanupLog({ type: "info", message: "Limpeza pausada. Clique em apagar para continuar a rodada." });
      return;
    }

    addCleanupLog({
      type: "info",
      message: `Rodada concluida. ${processedInRun} telefone(s) foram processados.`,
    });

    if (cleanupNextCursor === null) {
      setCleanupPreviewItems([]);
      setCleanupIsDone(true);
      setCleanupIsExhausted(true);
      addCleanupLog({ type: "info", message: "Limpeza concluida. Nao ha mais telefones na fila atual." });
      return;
    }

    await loadCleanupPreview(cleanupNextCursor, false, true);
  };

  const handleCleanupPause = () => {
    cleanupIsPausedRef.current = true;
    setCleanupIsRunning(false);
  };

  const handleCleanupReset = () => {
    cleanupIsPausedRef.current = false;
    cleanupIsRunningRef.current = false;
    setCleanupIsRunning(false);
    setCleanupIsDone(false);
    setCleanupHasLoaded(false);
    setCleanupPreviewItems([]);
    setCleanupPreviewCursor(null);
    setCleanupNextCursor(null);
    setCleanupIsExhausted(false);
    setCleanupTotalProcessed(0);
    setCleanupTotalUpdated(0);
    setCleanupTotalSkipped(0);
    setCleanupTotalErrors(0);
    setCleanupLogs([]);
  };

  if (pathBase !== "DRM") {
    return (
      <SidebarLayout unit={pathBase as any}>
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="h-16 w-16 text-yellow-500" />
          <h1 className="text-2xl font-bold text-gray-800">Operacao Restrita</h1>
          <p className="max-w-md text-gray-600">
            Este painel temporario de manutencao da base e permitido apenas para a base <strong>DRM</strong>.
            Troque a base ativa no sistema antes de continuar.
          </p>
        </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout unit="DRM">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Base de Dados</h1>
          <p className="mt-1 text-sm text-gray-500">
            Painel temporario para manutencao da base. Cada subaba executa uma acao especifica nos dados do Firebase.
          </p>
        </div>

        <Tabs defaultValue="sincronizar-origem" className="space-y-4">
          <TabsList className="bg-white">
            <TabsTrigger value="sincronizar-origem">Sincronizar Origem</TabsTrigger>
            <TabsTrigger value="copiar-telefones-conversas">Copiar Telefones para Conversas</TabsTrigger>
            <TabsTrigger value="limpar-nos-legados">Limpar Nos Legados</TabsTrigger>
          </TabsList>

          <TabsContent value="sincronizar-origem" className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Sincronizar Origem</h2>
              <p className="mt-1 text-sm text-gray-500">
                Busca a proxima rodada do no{" "}
                <code className="rounded bg-gray-100 px-1">conversas/{"{telefone}"}/origem</code>, mostra a previa e
                sincroniza somente o campo <code className="rounded bg-gray-100 px-1">origem</code> no alvo selecionado.
              </p>
            </div>

            <div className="mb-4 grid grid-cols-4 gap-3">
              {[
                { label: "Processados", value: totalProcessed, color: "text-blue-700", bg: "bg-blue-50" },
                { label: "Consultas Atualizadas", value: totalUpdated, color: "text-green-700", bg: "bg-green-50" },
                { label: "Sem consultas", value: totalSkipped, color: "text-gray-600", bg: "bg-gray-50" },
                { label: "Erros", value: totalErrors, color: "text-red-700", bg: "bg-red-50" },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`${bg} rounded-xl border border-gray-100 p-4 text-center`}>
                  <div className={`text-3xl font-bold ${color}`}>{value}</div>
                  <div className="mt-1 text-xs text-gray-500">{label}</div>
                </div>
              ))}
            </div>

            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Destino</span>
                <select
                  value={syncTarget}
                  onChange={(e) => setSyncTarget(e.target.value as OriginSyncTarget)}
                  disabled={isLoading || isRunning}
                  className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {TARGET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Qtd. por execucao</span>
                <select
                  value={runSize}
                  onChange={(e) => setRunSize(Number(e.target.value) as (typeof PROCESS_OPTIONS)[number])}
                  disabled={isLoading || isRunning}
                  className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {PROCESS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option} telefone(s)
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={handleLoad}
                disabled={isLoading || isRunning}
                className="flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                {isLoading ? "Carregando..." : hasLoaded ? "Recarregar Previa" : "Carregar Previa"}
              </button>

              {!isRunning ? (
                <button
                  onClick={handleStart}
                  disabled={previewItems.length === 0 || isDone || isLoading}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlayCircle className="h-4 w-4" />
                  Sincronizar {syncTarget}
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="flex items-center gap-2 rounded-lg bg-yellow-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-yellow-600"
                >
                  <PauseCircle className="h-4 w-4" />
                  Pausar
                </button>
              )}

              <button
                onClick={handleReset}
                disabled={isRunning}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Reiniciar
              </button>

              {isDone && (
                <span className="ml-2 flex items-center gap-2 text-sm font-semibold text-green-700">
                  <CheckCircle2 className="h-5 w-5" /> Concluido!
                </span>
              )}
            </div>

            <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Proxima Rodada</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Estes sao os telefones que serao sincronizados em {syncTarget} ao clicar no botao azul.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {previewItems.length} telefone(s)
                </span>
              </div>

              {!hasLoaded ? (
                <p className="text-sm text-gray-500">Clique em "Carregar Previa" para buscar a primeira rodada.</p>
              ) : previewItems.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {isExhausted
                    ? "Nao ha mais telefones com origem pendentes na fila atual."
                    : "Nenhum telefone foi encontrado nesta previa."}
                </p>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto pr-2">
                  {previewItems.map((item, index) => (
                    <div
                      key={`${item.phone}-${index}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-semibold text-gray-800">
                          {index + 1}. {item.phone}
                        </div>
                        <div className="break-all text-xs text-gray-500">origem: {item.origem}</div>
                      </div>
                      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Pendente</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <span>
                  Cursor atual: <strong>{previewCursor ?? "inicio"}</strong>
                </span>
                <span>
                  Proximo cursor: <strong>{nextCursor ?? "fim da fila"}</strong>
                </span>
              </div>
            </div>

            <div className="h-72 overflow-y-auto rounded-xl border border-gray-700 bg-gray-950 p-4 font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-gray-500">Os eventos da carga e da sincronizacao aparecerao aqui.</p>
              ) : (
                logs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      log.type === "ok"
                        ? "text-green-400"
                        : log.type === "error"
                          ? "text-red-400"
                          : log.type === "skip"
                            ? "text-gray-400"
                            : "text-blue-300"
                    }
                  >
                    {log.message}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </TabsContent>

          <TabsContent value="copiar-telefones-conversas" className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Copiar Telefones para Conversas</h2>
              <p className="mt-1 text-sm text-gray-500">
                Busca a proxima rodada do no{" "}
                <code className="rounded bg-gray-100 px-1">{copyTarget}/telefones/{"{telefone}"}</code>, mostra a previa e
                copia o agendamento completo para{" "}
                <code className="rounded bg-gray-100 px-1">conversas/{"{telefone}"}/{copyTarget}</code>.
                Se o registro ja existir no destino, ele sera sobrescrito. Nada e apagado.
              </p>
            </div>

            <div className="mb-4 grid grid-cols-4 gap-3">
              {[
                { label: "Processados", value: copyTotalProcessed, color: "text-blue-700", bg: "bg-blue-50" },
                { label: "Consultas Copiadas", value: copyTotalUpdated, color: "text-green-700", bg: "bg-green-50" },
                { label: "Sem consultas", value: copyTotalSkipped, color: "text-gray-600", bg: "bg-gray-50" },
                { label: "Erros", value: copyTotalErrors, color: "text-red-700", bg: "bg-red-50" },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`${bg} rounded-xl border border-gray-100 p-4 text-center`}>
                  <div className={`text-3xl font-bold ${color}`}>{value}</div>
                  <div className="mt-1 text-xs text-gray-500">{label}</div>
                </div>
              ))}
            </div>

            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Origem</span>
                <select
                  value={copyTarget}
                  onChange={(e) => {
                    setCopyTarget(e.target.value as OriginSyncTarget);
                    setCopyHasLoaded(false);
                    setCopyIsDone(false);
                    setCopyPreviewItems([]);
                    setCopyPreviewCursor(null);
                    setCopyNextCursor(null);
                    setCopyIsExhausted(false);
                  }}
                  disabled={copyIsLoading || copyIsRunning}
                  className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {TARGET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}/telefones
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Qtd. por execucao</span>
                <select
                  value={copyRunSize}
                  onChange={(e) => setCopyRunSize(Number(e.target.value) as (typeof PROCESS_OPTIONS)[number])}
                  disabled={copyIsLoading || copyIsRunning}
                  className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {PROCESS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option} telefone(s)
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={handleCopyLoad}
                disabled={copyIsLoading || copyIsRunning}
                className="flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${copyIsLoading ? "animate-spin" : ""}`} />
                {copyIsLoading ? "Carregando..." : copyHasLoaded ? "Recarregar Previa" : "Carregar Previa"}
              </button>

              {!copyIsRunning ? (
                <button
                  onClick={handleCopyStart}
                  disabled={copyPreviewItems.length === 0 || copyIsDone || copyIsLoading}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlayCircle className="h-4 w-4" />
                  Copiar {copyTarget}
                </button>
              ) : (
                <button
                  onClick={handleCopyPause}
                  className="flex items-center gap-2 rounded-lg bg-yellow-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-yellow-600"
                >
                  <PauseCircle className="h-4 w-4" />
                  Pausar
                </button>
              )}

              <button
                onClick={handleCopyReset}
                disabled={copyIsRunning}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Reiniciar
              </button>

              {copyIsDone && (
                <span className="ml-2 flex items-center gap-2 text-sm font-semibold text-green-700">
                  <CheckCircle2 className="h-5 w-5" /> Concluido!
                </span>
              )}
            </div>

            <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Proxima Rodada</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Estes sao os telefones que serao copiados de {copyTarget}/telefones para conversas ao clicar no botao azul.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {copyPreviewItems.length} telefone(s)
                </span>
              </div>

              {!copyHasLoaded ? (
                <p className="text-sm text-gray-500">Clique em "Carregar Previa" para buscar a primeira rodada.</p>
              ) : copyPreviewItems.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {copyIsExhausted
                    ? `Nao ha mais telefones em ${copyTarget}/telefones na fila atual.`
                    : "Nenhum telefone foi encontrado nesta previa."}
                </p>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto pr-2">
                  {copyPreviewItems.map((item, index) => (
                    <div
                      key={`${item.phone}-${index}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-semibold text-gray-800">
                          {index + 1}. {item.phone}
                        </div>
                        <div className="text-xs text-gray-500">{item.appointmentsCount} consulta(s) para copiar</div>
                      </div>
                      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Pendente</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <span>
                  Cursor atual: <strong>{copyPreviewCursor ?? "inicio"}</strong>
                </span>
                <span>
                  Proximo cursor: <strong>{copyNextCursor ?? "fim da fila"}</strong>
                </span>
              </div>
            </div>

            <div className="h-72 overflow-y-auto rounded-xl border border-gray-700 bg-gray-950 p-4 font-mono text-xs">
              {copyLogs.length === 0 ? (
                <p className="text-gray-500">Os eventos da carga e da copia aparecerao aqui.</p>
              ) : (
                copyLogs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      log.type === "ok"
                        ? "text-green-400"
                        : log.type === "error"
                          ? "text-red-400"
                          : log.type === "skip"
                            ? "text-gray-400"
                            : "text-blue-300"
                    }
                  >
                    {log.message}
                  </div>
                ))
              )}
              <div ref={copyLogsEndRef} />
            </div>
          </TabsContent>

          <TabsContent value="limpar-nos-legados" className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Limpar Nos Legados</h2>
              <p className="mt-1 text-sm text-gray-500">
                Busca a proxima rodada do no <code className="rounded bg-gray-100 px-1">conversas/{"{telefone}"}</code> e
                apaga apenas os nos legados <code className="rounded bg-gray-100 px-1">pacientesAgendados</code> e{" "}
                <code className="rounded bg-gray-100 px-1">pacientesCancelados</code>, sem tocar nos demais dados.
              </p>
            </div>

            <div className="mb-4 grid grid-cols-4 gap-3">
              {[
                { label: "Processados", value: cleanupTotalProcessed, color: "text-blue-700", bg: "bg-blue-50" },
                { label: "Nos Apagados", value: cleanupTotalUpdated, color: "text-green-700", bg: "bg-green-50" },
                { label: "Sem nos", value: cleanupTotalSkipped, color: "text-gray-600", bg: "bg-gray-50" },
                { label: "Erros", value: cleanupTotalErrors, color: "text-red-700", bg: "bg-red-50" },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`${bg} rounded-xl border border-gray-100 p-4 text-center`}>
                  <div className={`text-3xl font-bold ${color}`}>{value}</div>
                  <div className="mt-1 text-xs text-gray-500">{label}</div>
                </div>
              ))}
            </div>

            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Qtd. por execucao</span>
                <select
                  value={cleanupRunSize}
                  onChange={(e) => setCleanupRunSize(Number(e.target.value) as (typeof PROCESS_OPTIONS)[number])}
                  disabled={cleanupIsLoading || cleanupIsRunning}
                  className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {PROCESS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option} telefone(s)
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={handleCleanupLoad}
                disabled={cleanupIsLoading || cleanupIsRunning}
                className="flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${cleanupIsLoading ? "animate-spin" : ""}`} />
                {cleanupIsLoading ? "Carregando..." : cleanupHasLoaded ? "Recarregar Previa" : "Carregar Previa"}
              </button>

              {!cleanupIsRunning ? (
                <button
                  onClick={handleCleanupStart}
                  disabled={cleanupPreviewItems.length === 0 || cleanupIsDone || cleanupIsLoading}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlayCircle className="h-4 w-4" />
                  Apagar Nos Legados
                </button>
              ) : (
                <button
                  onClick={handleCleanupPause}
                  className="flex items-center gap-2 rounded-lg bg-yellow-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-yellow-600"
                >
                  <PauseCircle className="h-4 w-4" />
                  Pausar
                </button>
              )}

              <button
                onClick={handleCleanupReset}
                disabled={cleanupIsRunning}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Reiniciar
              </button>

              {cleanupIsDone && (
                <span className="ml-2 flex items-center gap-2 text-sm font-semibold text-green-700">
                  <CheckCircle2 className="h-5 w-5" /> Concluido!
                </span>
              )}
            </div>

            <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Proxima Rodada</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Estes sao os telefones que possuem nos legados e serao limpos ao clicar no botao vermelho.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {cleanupPreviewItems.length} telefone(s)
                </span>
              </div>

              {!cleanupHasLoaded ? (
                <p className="text-sm text-gray-500">Clique em "Carregar Previa" para buscar a primeira rodada.</p>
              ) : cleanupPreviewItems.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {cleanupIsExhausted
                    ? "Nao ha mais telefones com nos legados na fila atual."
                    : "Nenhum telefone foi encontrado nesta previa."}
                </p>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto pr-2">
                  {cleanupPreviewItems.map((item, index) => (
                    <div
                      key={`${item.phone}-${index}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-semibold text-gray-800">
                          {index + 1}. {item.phone}
                        </div>
                        <div className="text-xs text-gray-500">
                          {[
                            item.hasPacientesAgendados ? "pacientesAgendados" : null,
                            item.hasPacientesCancelados ? "pacientesCancelados" : null,
                          ]
                            .filter(Boolean)
                            .join(" + ")}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Pendente</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <span>
                  Cursor atual: <strong>{cleanupPreviewCursor ?? "inicio"}</strong>
                </span>
                <span>
                  Proximo cursor: <strong>{cleanupNextCursor ?? "fim da fila"}</strong>
                </span>
              </div>
            </div>

            <div className="h-72 overflow-y-auto rounded-xl border border-gray-700 bg-gray-950 p-4 font-mono text-xs">
              {cleanupLogs.length === 0 ? (
                <p className="text-gray-500">Os eventos da carga e da limpeza aparecerao aqui.</p>
              ) : (
                cleanupLogs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      log.type === "ok"
                        ? "text-green-400"
                        : log.type === "error"
                          ? "text-red-400"
                          : log.type === "skip"
                            ? "text-gray-400"
                            : "text-blue-300"
                    }
                  >
                    {log.message}
                  </div>
                ))
              )}
              <div ref={cleanupLogsEndRef} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </SidebarLayout>
  );
}
