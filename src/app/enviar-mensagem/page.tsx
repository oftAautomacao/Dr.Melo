"use client";

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import SidebarLayout from '@/components/layout/sidebar-layout';
import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { MessagesSquare, RefreshCcw, Send, ArrowLeft, BrainCircuit, Download, Zap, MessageSquare, X, Building, Archive } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getFirestoreInstance, getDatabaseInstance } from "@/lib/firebase";
import { getPhoneVariants } from "@/lib/patient-origin";
import { ref, get, update } from "firebase/database";
import { Toaster, toast } from 'sonner';

import {
  doc,
  deleteDoc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
} from "firebase/firestore";

type ConversationMessage = {
  content: any;
  role: "user" | "assistant";
  timelineMarker?:
    | { source: "realtime"; timestamp: string }
    | { source: "firestore" };
};

type ConversationHistoryResult = {
  exists: boolean;
  messages: ConversationMessage[];
  archivedMessages: ConversationMessage[];
  currentMessages: ConversationMessage[];
  hasArchivedConversation: boolean;
  hasCurrentConversation: boolean;
};

/* ---------- avatares aleatórios ---------- */
const AVATARS = [
  "/avatars/avatar1.png",
  "/avatars/avatar2.png",
  "/avatars/avatar3.png",
  "/avatars/avatar4.png",
  "/avatars/avatar5.png",
  "/avatars/avatar6.png",
  "/avatars/avatar7.png",
  "/avatars/avatar8.png",
];

function isConversationMessage(message: unknown): message is ConversationMessage {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    ((message as { role?: unknown }).role === "user" ||
      (message as { role?: unknown }).role === "assistant")
  );
}

function extractConversationMessages(data: unknown): ConversationMessage[] {
  if (!data || typeof data !== "object") return [];

  const documentData = data as Record<string, unknown>;
  let history: unknown[] = [];

  if (Array.isArray(documentData.glbHistoricoDaConversa)) {
    history = documentData.glbHistoricoDaConversa;
  } else {
    const firstHistory = Object.values(documentData).find(Array.isArray);
    if (Array.isArray(firstHistory)) history = firstHistory;
  }

  return history.filter(isConversationMessage);
}

function extractArchivedConversationMessages(data: unknown): ConversationMessage[] {
  if (!data || typeof data !== "object") return [];

  return Object.entries(data as Record<string, unknown>)
    .sort(([timestampA], [timestampB]) => timestampA.localeCompare(timestampB))
    .flatMap(([timestamp, archivedConversation]) => {
      let messages: ConversationMessage[] = [];

      if (Array.isArray(archivedConversation)) {
        messages = archivedConversation.filter(isConversationMessage);
      } else if (archivedConversation && typeof archivedConversation === "object") {
        messages = Object.entries(archivedConversation as Record<string, unknown>)
          .sort(([indexA], [indexB]) => {
            const numericIndexA = Number(indexA);
            const numericIndexB = Number(indexB);

            if (Number.isFinite(numericIndexA) && Number.isFinite(numericIndexB)) {
              return numericIndexA - numericIndexB;
            }

            return indexA.localeCompare(indexB);
          })
          .map(([, message]) => message)
          .filter(isConversationMessage);
      }

      return messages.map((message, index) =>
        index === 0
          ? { ...message, timelineMarker: { source: "realtime", timestamp } as const }
          : message
      );
    });
}

function formatArchivedConversationTimestamp(timestamp: string): string {
  const match = timestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
  );

  if (!match) return timestamp;

  const [, year, month, day, hour, minute] = match;
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function createSaoPauloArchiveTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

  return (
    `${values.year}-${values.month}-${values.day}` +
    `T${values.hour}:${values.minute}:${values.second}-${milliseconds}`
  );
}

async function getRealtimeShallowKeys(
  environment: "teste" | "producao",
  path: string,
  signal?: AbortSignal
): Promise<string[]> {
  const databaseUrl = getDatabaseInstance(environment).app.options.databaseURL;

  if (!databaseUrl) {
    throw new Error("URL do Realtime Database não configurada.");
  }

  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const response = await fetch(
    `${databaseUrl.replace(/\/$/, "")}/${encodedPath}.json?shallow=true`,
    { signal }
  );

  if (!response.ok) {
    throw new Error(`Falha ao consultar o Realtime Database (${response.status}).`);
  }

  const data: unknown = await response.json();
  return data && typeof data === "object" ? Object.keys(data) : [];
}

async function loadArchivedPatientIds(
  environment: "teste" | "producao",
  unit: "DRM" | "OFT/45"
): Promise<string[]> {
  const conversationsPath =
    `/${unit}/agendamentoWhatsApp/operacional/conversas`;
  const archiveIndexPath =
    `/${unit}/agendamentoWhatsApp/operacional/conversasArquivadas`;
  const [patientIds, indexedPatientIds] = await Promise.all([
    getRealtimeShallowKeys(environment, conversationsPath),
    getRealtimeShallowKeys(environment, archiveIndexPath),
  ]);
  const archivedPatientIds = new Set(indexedPatientIds);

  // Ambientes pequenos também reconhecem arquivos antigos, anteriores ao índice.
  // Em bases grandes, o índice evita milhares de consultas durante a abertura da tela.
  if (patientIds.length > 200) return Array.from(archivedPatientIds);

  let nextPatientIndex = 0;

  const scanNextPatient = async () => {
    while (nextPatientIndex < patientIds.length) {
      const patientId = patientIds[nextPatientIndex++];
      const archiveKeys = await getRealtimeShallowKeys(
        environment,
        `${conversationsPath}/${patientId}/conversasAntigas`
      );

      if (archiveKeys.length > 0) archivedPatientIds.add(patientId);
    }
  };
  const workerCount = Math.min(8, patientIds.length);

  await Promise.all(
    Array.from({ length: workerCount }, () => scanNextPatient())
  );

  return Array.from(archivedPatientIds);
}

function getPatientCacheKey(
  environment: "teste" | "producao",
  unit: "DRM" | "OFT/45"
): string {
  return `conversation-patients:${environment}:${unit}`;
}

function getCachedPatientIds(
  environment: "teste" | "producao",
  unit: "DRM" | "OFT/45"
): string[] {
  try {
    const cached = sessionStorage.getItem(getPatientCacheKey(environment, unit));
    const parsed: unknown = cached ? JSON.parse(cached) : [];
    return Array.isArray(parsed)
      ? parsed.filter((patientId): patientId is string => typeof patientId === "string")
      : [];
  } catch {
    return [];
  }
}

function cachePatientIds(
  environment: "teste" | "producao",
  unit: "DRM" | "OFT/45",
  patientIds: Iterable<string>
): void {
  try {
    const cachedPatientIds = getCachedPatientIds(environment, unit);
    const updatedPatientIds = Array.from(
      new Set([...cachedPatientIds, ...patientIds])
    );
    sessionStorage.setItem(
      getPatientCacheKey(environment, unit),
      JSON.stringify(updatedPatientIds)
    );
  } catch {
    // O cache é apenas uma otimização; a busca direta continua funcionando sem ele.
  }
}

async function discoverArchivedPatientsInBackground({
  environment,
  unit,
  knownPatientIds,
  signal,
  onPatientFound,
}: {
  environment: "teste" | "producao";
  unit: "DRM" | "OFT/45";
  knownPatientIds: Set<string>;
  signal: AbortSignal;
  onPatientFound: (patientId: string) => void;
}): Promise<void> {
  const conversationsPath =
    `/${unit}/agendamentoWhatsApp/operacional/conversas`;
  const patientIds = await getRealtimeShallowKeys(
    environment,
    conversationsPath,
    signal
  );

  for (const patientId of patientIds) {
    if (signal.aborted) return;
    if (knownPatientIds.has(patientId) || !/^\d{10,15}$/.test(patientId)) continue;

    const archiveKeys = await getRealtimeShallowKeys(
      environment,
      `${conversationsPath}/${patientId}/conversasAntigas`,
      signal
    );

    if (archiveKeys.length > 0) {
      knownPatientIds.add(patientId);
      onPatientFound(patientId);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
}

async function loadConversationHistory({
  patientId,
  environment,
  unit,
}: {
  patientId: string;
  environment: "teste" | "producao";
  unit: "DRM" | "OFT/45";
}): Promise<ConversationHistoryResult> {
  const historyKey = unit === "OFT/45" ? "oft45HistoricoDaConversa" : "historicoDaConversa";
  const archivedHistoryPath = `/${unit}/agendamentoWhatsApp/operacional/conversas/${patientId}/conversasAntigas`;

  const [currentConversationSnapshot, archivedConversationSnapshot] = await Promise.all([
    getDoc(doc(getFirestoreInstance(environment), historyKey, patientId)),
    get(ref(getDatabaseInstance(environment), archivedHistoryPath)),
  ]);

  const archivedMessages = extractArchivedConversationMessages(
    archivedConversationSnapshot.exists() ? archivedConversationSnapshot.val() : null
  );
  const currentMessages = extractConversationMessages(
    currentConversationSnapshot.exists() ? currentConversationSnapshot.data() : null
  );
  const currentMessagesWithMarker = currentMessages.map((message, index) =>
    archivedMessages.length > 0 && index === 0
      ? { ...message, timelineMarker: { source: "firestore" } as const }
      : message
  );

  return {
    exists: currentConversationSnapshot.exists() || archivedConversationSnapshot.exists(),
    messages: [...archivedMessages, ...currentMessagesWithMarker],
    archivedMessages,
    currentMessages,
    hasArchivedConversation: archivedConversationSnapshot.exists(),
    hasCurrentConversation: currentConversationSnapshot.exists(),
  };
}

async function loadCompletePhoneConversation({
  phone,
  environment,
  unit,
}: {
  phone: string;
  environment: "teste" | "producao";
  unit: "DRM" | "OFT/45";
}): Promise<{ exists: boolean; patientId: string; messages: ConversationMessage[] }> {
  const phoneVariants = getPhoneVariants(phone);
  const histories = await Promise.all(
    phoneVariants.map(async (patientId) => ({
      patientId,
      history: await loadConversationHistory({ patientId, environment, unit }),
    }))
  );
  const existingHistories = histories.filter(({ history }) => history.exists);
  const primaryHistory =
    existingHistories.find(({ history }) => history.hasCurrentConversation) ||
    existingHistories.find(({ history }) => history.hasArchivedConversation);

  if (!primaryHistory) {
    return {
      exists: false,
      patientId: phone.replace(/\D/g, ""),
      messages: [],
    };
  }

  const archivedMessages = existingHistories.flatMap(
    ({ history }) => history.archivedMessages
  );
  const currentMessages = existingHistories.flatMap(
    ({ history }) => history.currentMessages
  );
  const currentMessagesWithMarker = currentMessages.map((message, index) =>
    archivedMessages.length > 0 && index === 0
      ? { ...message, timelineMarker: { source: "firestore" } as const }
      : message
  );

  return {
    exists: true,
    patientId: primaryHistory.patientId,
    messages: [...archivedMessages, ...currentMessagesWithMarker],
  };
}

function DownloadHeaderControl({
  patientId,
  environment,
  unit,
  history,
}: {
  patientId: string | null;
  environment: "teste" | "producao";
  unit: "DRM" | "OFT/45" | null;
  history: ConversationMessage[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>(["conversa"]);
  const [isDownloading, setIsDownloading] = useState(false);

  const options = [
    { id: "conversa", label: "Conversa", icon: <MessageSquare className="h-3.5 w-3.5 text-green-600" /> },
    { id: "agenteAtendimento", label: "IA - Atendimento", icon: <BrainCircuit className="h-3.5 w-3.5 text-blue-600" /> },
    { id: "agenteExtracaoInfConversa", label: "IA - Extração", icon: <Zap className="h-3.5 w-3.5 text-purple-600" /> },
  ];

  const toggleItem = (id: string) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const extractDefinition = (data: any): string => {
    if (!data) return "";
    if (typeof data === "string") return data;
    let definitions: string[] = [];
    const findDefinitions = (obj: any) => {
      if (typeof obj === "object" && obj !== null) {
        if ("definicao" in obj) definitions.push(String(obj.definicao));
        for (const key in obj) findDefinitions(obj[key]);
      }
    };
    findDefinitions(data);
    return definitions.length > 0 ? definitions.join("\n\n") : JSON.stringify(data, null, 2);
  };

  const handleDownload = async () => {
    if (!patientId || selectedItems.length === 0 || !unit) return;
    setIsOpen(false);
    setIsDownloading(true);
    try {
      for (const item of selectedItems) {
        if (item === "conversa") {
          const historyWithoutTimelineMarkers = history.map(({ timelineMarker, ...message }) => message);
          downloadBlob(JSON.stringify(historyWithoutTimelineMarkers, null, 2), "conversa", "json");
        } else {
          const pathSuffix = item === "agenteAtendimento" 
            ? "/agendamentoWhatsApp/configuracoes/definicoesIA/agenteAtendimento"
            : "/agendamentoWhatsApp/configuracoes/definicoesIA/agenteExtracaoInfConversa";
          const fileName = item === "agenteAtendimento" ? "promptAtendimento" : "promptExtracao";
          
          const dbRTDB = getDatabaseInstance(environment);
          const snapshot = await get(ref(dbRTDB, `/${unit}${pathSuffix}`));
          if (snapshot.exists()) {
            downloadBlob(extractDefinition(snapshot.val()), fileName, "txt");
          }
        }
      }
      toast.success("Download concluído!");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Erro ao realizar download.");
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadBlob = (content: string, fileName: string, extension: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!patientId) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="ml-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border-none shadow-none gap-2 h-8">
          <Download className="h-4 w-4" />
          <span className="hidden md:inline">Baixar</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 mr-4" align="end">
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase px-2 py-1">Opções de Download</p>
          {options.map(opt => (
            <div 
              key={opt.id} 
              onClick={() => toggleItem(opt.id)}
              className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <Checkbox checked={selectedItems.includes(opt.id)} className="h-3.5 w-3.5" />
              <div className="flex items-center gap-1.5 flex-1">
                {opt.icon}
                <span className="text-xs font-medium text-slate-700">{opt.label}</span>
              </div>
            </div>
          ))}
          <Button 
            onClick={handleDownload} 
            disabled={isDownloading || selectedItems.length === 0} 
            className="w-full mt-2 h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white"
          >
            {isDownloading ? "Processando..." : "Iniciar Download"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EnviarMensagemComponent() {
  const router = useRouter();
  /* ---------- state ---------- */
  const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null);
  const [environment, setEnvironment] = useState<"teste" | "producao">("teste");
  const [isConfigurationReady, setIsConfigurationReady] = useState(false);
  const searchParams = useSearchParams();

  interface UnitConfig {
    id: string;
    nome: string;
    whatsApp: string;
  }

  const [unidadesEnvio, setUnidadesEnvio] = useState<UnitConfig[]>([]);
  const [selectedUnidadesEnvio, setSelectedUnidadesEnvio] = useState<string[]>([]);
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [sendingBulk, setSendingBulk] = useState(false);
  const [loadingUnidades, setLoadingUnidades] = useState(false);

  /* ---------- get config from localStorage ---------- */
  useEffect(() => {
    const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
    setSelectedUnit(storedPathBase === "DRM" || storedPathBase === "OFT/45" ? storedPathBase : "DRM");

    const storedEnv = localStorage.getItem("APP_ENVIRONMENT") as "teste" | "producao" | null;
    setEnvironment(storedEnv === "producao" ? "producao" : "teste");
    setIsConfigurationReady(true);
  }, []);

  /* --------------------- carrega lista de unidades ------------------ */
  useEffect(() => {
    if (!selectedUnit) return;
    (async () => {
      setLoadingUnidades(true);
      try {
        const dbRTDB = getDatabaseInstance(environment);
        const basePath = `${selectedUnit}/agendamentoWhatsApp/configuracoes/unidades`;
        const snapshot = await get(ref(dbRTDB, `/${basePath}`));
        if (snapshot.exists()) {
          const data = snapshot.val();
          const list: UnitConfig[] = [];
          Object.entries(data).forEach(([key, val]: [string, any]) => {
            if (val) {
              const whatsApp = val.whatsApp?.toString() || val.whatsapp?.toString() || "";
              list.push({
                id: key,
                nome: val.empresa ? `${val.empresa} (${val.bairro || key})` : key,
                whatsApp: whatsApp,
              });
            }
          });
          // Filtra apenas as unidades que possuem whatsapp configurado
          const filteredList = list.filter(u => u.whatsApp.trim() !== "");
          setUnidadesEnvio(filteredList.sort((a, b) => a.nome.localeCompare(b.nome)));
          // Pré-seleciona todas as unidades
          setSelectedUnidadesEnvio(filteredList.map(u => u.id));
        } else {
          setUnidadesEnvio([]);
          setSelectedUnidadesEnvio([]);
        }
      } catch (err) {
        console.error("Erro ao carregar unidades:", err);
        toast.error("Erro ao carregar lista de unidades.");
      } finally {
        setLoadingUnidades(false);
      }
    })();
  }, [selectedUnit, environment]);

  const toggleUnidadeEnvio = (unitId: string) => {
    setSelectedUnidadesEnvio(prev =>
      prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId]
    );
  };

  const selectAllUnidades = () => {
    setSelectedUnidadesEnvio(unidadesEnvio.map(u => u.id));
  };

  const deselectAllUnidades = () => {
    setSelectedUnidadesEnvio([]);
  };

  /* -------------------- envia mensagem em massa para clinicas -------------------- */
  const handleSendBulkMessage = async () => {
    const content = bulkMessage.trim();
    if (!content) {
      toast.warning("A mensagem não pode estar vazia.");
      return;
    }
    if (selectedUnidadesEnvio.length === 0) {
      toast.warning("Nenhuma unidade selecionada.");
      return;
    }

    setSendingBulk(true);

    let apiCredentials: { id: string; token: string; };
    if (environment === "teste") {
      apiCredentials = {
        id: "3B74CE9AFF0D20904A9E9E548CC778EF",
        token: "A8F754F1402CAE3625D5D578",
      };
    } else { // Ambiente de PRODUÇÃO
      if (selectedUnit === "DRM") {
        apiCredentials = {
          id: "3D460A6CB6DA10A09FAD12D00F179132",
          token: "1D2897F0A38EEEC81D2F66EE",
        };
      } else if (selectedUnit === "OFT/45") {
        apiCredentials = {
          id: "39C7A89881E470CC246252059E828D91",
          token: "B1CA83DE10E84496AECE8028",
        };
      } else {
        toast.error("Unidade de produção não reconhecida.");
        setSendingBulk(false);
        return;
      }
    }

    let successCount = 0;
    let failCount = 0;

    for (const unitId of selectedUnidadesEnvio) {
      const unit = unidadesEnvio.find(u => u.id === unitId);
      if (!unit || !unit.whatsApp) continue;

      const rawPhone = unit.whatsApp.replace(/\D/g, "");
      let formattedPhone = rawPhone;
      if (formattedPhone.startsWith("55") && formattedPhone.length > 11) {
        // já tem DDI
      } else if (formattedPhone.length === 10 || formattedPhone.length === 11) {
        formattedPhone = "55" + formattedPhone;
      }

      try {
        const response = await fetch(
          `https://api.z-api.io/instances/${apiCredentials.id}/token/${apiCredentials.token}/send-text`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Client-Token": "Fe948ba6a317942849b010c88cd9e6105S",
            },
            body: JSON.stringify({ phone: formattedPhone, message: content }),
          }
        );

        if (response.ok) {
          successCount++;
          
          // Salva no Firestore sob o número de telefone da clínica
          try {
            const historyKey =
              selectedUnit === "OFT/45" ? "oft45HistoricoDaConversa" : "historicoDaConversa";
            const refChat = doc(getFirestoreInstance(environment), historyKey, formattedPhone);
            const snap = await getDoc(refChat);
            const data = snap.exists() ? snap.data() : null;
            const currentHistory = (data && data.glbHistoricoDaConversa && Array.isArray(data.glbHistoricoDaConversa))
              ? data.glbHistoricoDaConversa
              : [];
            const updated = [...currentHistory, { content, role: "assistant" }];
            await updateDoc(refChat, { glbHistoricoDaConversa: updated });
          } catch (fireErr) {
            console.error("Erro ao salvar histórico do firestore para clínica:", formattedPhone, fireErr);
          }

        } else {
          failCount++;
          console.error(`Erro ao enviar para clínica ${unit.nome}:`, response.statusText);
        }
      } catch (err) {
        failCount++;
        console.error(`Erro de rede ao enviar para clínica ${unit.nome}:`, err);
      }
    }

    setSendingBulk(false);
    if (successCount > 0) {
      toast.success(`Mensagem enviada com sucesso para ${successCount} clínica(s)!`);
      setBulkMessage("");
      setShowBulkPanel(false);
    }
    if (failCount > 0) {
      toast.error(`Falha ao enviar mensagem para ${failCount} clínica(s).`);
    }

    // Se o paciente atual for uma das clínicas que enviamos mensagem, recarrega a conversa para atualizar na tela
    if (selectedPatient && selectedUnidadesEnvio.some(uid => {
      const u = unidadesEnvio.find(un => un.id === uid);
      if (!u) return false;
      const raw = u.whatsApp.replace(/\D/g, "");
      const formatted = (raw.startsWith("55") && raw.length > 11) ? raw : "55" + raw;
      return formatted === selectedPatient;
    })) {
      handlePatientSelect(selectedPatient);
    }
  };

  /* ------------------------------ estado ----------------------------- */
  const [searchTerm, setSearchTerm] = useState("");
  const [patientList, setPatientList] = useState<string[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [isPatientListReady, setIsPatientListReady] = useState(false);
  const [patientListError, setPatientListError] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<
    ConversationMessage[]
  >([]);
  const [messageContent, setMessageContent] = useState("");
  const [manualSelection, setManualSelection] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const patientListRef = useRef<string[]>([]);

  useEffect(() => {
    patientListRef.current = patientList;
  }, [patientList]);

  /* --------------------- autoscroll na conversa ---------------------- */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationHistory]);

  /* ---- Preenche a busca com o telefone da URL ---- */
  useEffect(() => {
    const phoneFromUrl = searchParams.get('telefone');
    if (phoneFromUrl) {
      setSearchTerm(phoneFromUrl);
    }
  }, [searchParams]);

  /* ---- Abre diretamente a conversa recebida pela URL ---- */
  useEffect(() => {
    if (!isConfigurationReady || !selectedUnit) return;

    const phoneFromUrl = String(searchParams.get("telefone") || "").replace(/\D/g, "");
    if (phoneFromUrl.length < 10) return;

    let isCurrentRequest = true;

    (async () => {
      try {
        const conversation = await loadCompletePhoneConversation({
          phone: phoneFromUrl,
          environment,
          unit: selectedUnit,
        });

        if (!isCurrentRequest || !conversation.exists) return;

        setSelectedPatient(conversation.patientId);
        setConversationHistory(conversation.messages);
      } catch (error) {
        console.error("Erro ao abrir diretamente a conversa recebida pela URL:", error);
        // A listagem completa continua carregando e funciona como fallback.
      }
    })();

    return () => {
      isCurrentRequest = false;
    };
  }, [environment, isConfigurationReady, searchParams, selectedUnit]);

  /* --------------------- carrega lista de pacientes ------------------ */
  useEffect(() => {
    if (!isConfigurationReady || !selectedUnit) return;

    let isCurrentRequest = true;

    (async () => {
      setIsLoadingPatients(true);
      setIsPatientListReady(false);
      setPatientListError(null);
      setPatientList([]);
      setSelectedPatient(null);
      setConversationHistory([]);

      try {
        const historyKey =
          selectedUnit === "OFT/45" ? "oft45HistoricoDaConversa" : "historicoDaConversa";
        const col = collection(getFirestoreInstance(environment), historyKey);
        const [snaps, archivedPatients] = await Promise.all([
          getDocs(col),
          loadArchivedPatientIds(environment, selectedUnit).catch((error) => {
            console.warn("Não foi possível listar as conversas antigas:", error);
            return [];
          }),
        ]);

        const firestorePatients = snaps.docs.map((document) => document.id);
        const cachedPatients = getCachedPatientIds(environment, selectedUnit);
        const allPatients = Array.from(
          new Set([...firestorePatients, ...archivedPatients, ...cachedPatients])
        ).sort((a, b) => a.localeCompare(b));

        if (isCurrentRequest) {
          setPatientList(allPatients);
          cachePatientIds(environment, selectedUnit, allPatients);
        }
      } catch (err) {
        console.error("Erro ao carregar lista de pacientes:", err);
        if (isCurrentRequest) {
          setPatientListError(
            environment === "teste"
              ? "Não foi possível acessar as conversas do ambiente de teste. Verifique o ambiente nas Configurações."
              : "Não foi possível carregar as conversas. Tente novamente."
          );
          toast.error("Falha ao carregar a lista de pacientes.");
        }
      } finally {
        if (isCurrentRequest) {
          setIsLoadingPatients(false);
          setIsPatientListReady(true);
        }
      }
    })();

    return () => {
      isCurrentRequest = false;
    };
  }, [selectedUnit, environment, isConfigurationReady]);

  /* -------- completa o catálogo de arquivos sem bloquear a tela -------- */
  useEffect(() => {
    if (
      !isConfigurationReady ||
      !isPatientListReady ||
      patientListError ||
      !selectedUnit
    ) {
      return;
    }

    const controller = new AbortController();
    const knownPatientIds = new Set(patientList);

    void discoverArchivedPatientsInBackground({
      environment,
      unit: selectedUnit,
      knownPatientIds,
      signal: controller.signal,
      onPatientFound: (patientId) => {
        setPatientList((patients) =>
          patients.includes(patientId)
            ? patients
            : [...patients, patientId].sort((a, b) => a.localeCompare(b))
        );
        cachePatientIds(environment, selectedUnit, [patientId]);
      },
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.warn("A descoberta de conversas antigas foi interrompida:", error);
    });

    return () => controller.abort();
  }, [
    environment,
    isConfigurationReady,
    isPatientListReady,
    patientListError,
    selectedUnit,
  ]);

  /* --------------------- busca conversa do paciente ------------------ */
  const handlePatientSelect = useCallback(async (patientId: string) => {
    setSelectedPatient(patientId);
    if (!selectedUnit) return;
    try {
      const conversation = await loadCompletePhoneConversation({
        phone: patientId,
        environment,
        unit: selectedUnit,
      });
      if (conversation.exists) setSelectedPatient(conversation.patientId);
      setConversationHistory(conversation.messages);
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
      toast.error("Falha ao carregar o histórico da conversa.");
      setConversationHistory([]);
    }
  }, [selectedUnit, environment]);

  /* -------- seleção automática enquanto digita ou via URL -------- */
  useEffect(() => {
    if (manualSelection) return;
    const normalizedSearchTerm = searchTerm.replace(/\D/g, "");
    if (normalizedSearchTerm === "") {
      setSelectedPatient(null);
      setConversationHistory([]);
      return;
    }
    if (patientList.length > 0) {
      const match = patientList.find((p) => p.includes(normalizedSearchTerm));
      if (match && match !== selectedPatient) {
        handlePatientSelect(match);
      }
    }
  }, [searchTerm, patientList, selectedPatient, handlePatientSelect, manualSelection]);

  /* -------- busca direta mesmo antes de o catálogo terminar -------- */
  useEffect(() => {
    if (
      manualSelection ||
      !isConfigurationReady ||
      isLoadingPatients ||
      !selectedUnit
    ) {
      return;
    }

    const phone = searchTerm.replace(/\D/g, "");
    if (
      phone.length < 10 ||
      patientListRef.current.some((patientId) => patientId.includes(phone))
    ) {
      return;
    }

    let isCurrentRequest = true;
    const timeoutId = window.setTimeout(async () => {
      try {
        const conversation = await loadCompletePhoneConversation({
          phone,
          environment,
          unit: selectedUnit,
        });

        if (!isCurrentRequest || !conversation.exists) return;

        setPatientList((patients) =>
          patients.includes(conversation.patientId)
            ? patients
            : [...patients, conversation.patientId].sort((a, b) => a.localeCompare(b))
        );
        cachePatientIds(environment, selectedUnit, [conversation.patientId]);
        setSelectedPatient(conversation.patientId);
        setConversationHistory(conversation.messages);
      } catch (error) {
        if (isCurrentRequest) {
          console.warn("Não foi possível realizar a busca direta da conversa:", error);
        }
      }
    }, 450);

    return () => {
      isCurrentRequest = false;
      window.clearTimeout(timeoutId);
    };
  }, [
    environment,
    isConfigurationReady,
    isLoadingPatients,
    manualSelection,
    searchTerm,
    selectedUnit,
  ]);

  /* -------------------- envia mensagem -------------------- */
  const handleSendMessage = async () => {
    if (!selectedPatient || !selectedUnit) {
      toast.error("Nenhum paciente ou unidade selecionada.");
      return;
    }
    const content = messageContent.trim();
    if (!content) {
      toast.warning("A mensagem não pode estar vazia.");
      return;
    }

    let apiCredentials: { id: string; token: string; };

    if (environment === "teste") {
      apiCredentials = {
        id: "3B74CE9AFF0D20904A9E9E548CC778EF",
        token: "A8F754F1402CAE3625D5D578",
      };
      toast.info(`AMBIENTE DE TESTE: Mensagem para ${selectedPatient} sendo enviada.`);

    } else { // Ambiente de PRODUÇÃO
      if (selectedUnit === "DRM") {
        apiCredentials = {
          id: "3D460A6CB6DA10A09FAD12D00F179132",
          token: "1D2897F0A38EEEC81D2F66EE",
        };
      } else if (selectedUnit === "OFT/45") {
        apiCredentials = {
          id: "39C7A89881E470CC246252059E828D91",
          token: "B1CA83DE10E84496AECE8028",
        };
      } else {
        toast.error("Unidade de produção não reconhecida. Não é possível enviar a mensagem.");
        return;
      }
    }

    try {
      const response = await fetch(
        `https://api.z-api.io/instances/${apiCredentials.id}/token/${apiCredentials.token}/send-text`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Client-Token": "Fe948ba6a317942849b010c88cd9e6105S",
          },
          body: JSON.stringify({ phone: selectedPatient, message: content }),
        }
      );

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: 'Não foi possível ler a resposta de erro da API.' }
        }
        toast.error(`Erro ao enviar mensagem: ${errorData?.error || response.statusText}`);
        console.error("Erro Z-API:", response.statusText, errorData);
        return;
      }

      toast.success("Mensagem enviada com sucesso!");
      setMessageContent("");

      const historyKey =
        selectedUnit === "OFT/45" ? "oft45HistoricoDaConversa" : "historicoDaConversa";

      const refChat = doc(getFirestoreInstance(environment), historyKey, selectedPatient);
      const snap = await getDoc(refChat);
      const data = snap.exists() ? snap.data() : null;

      const currentHistory = (data && data.glbHistoricoDaConversa && Array.isArray(data.glbHistoricoDaConversa))
        ? data.glbHistoricoDaConversa
        : [];

      const updated = [...currentHistory, { content, role: "assistant" }];
      await updateDoc(refChat, { glbHistoricoDaConversa: updated });
      // Recarrega a conversa para mostrar a mensagem enviada
      handlePatientSelect(selectedPatient);

    } catch (err) {
      toast.error("Ocorreu um erro inesperado ao tentar enviar a mensagem.");
      console.error("Erro no envio:", err);
    }
  };

  /* -------------------- arquiva conversa -------------------- */
  const handleArchiveConversation = async () => {
    if (!selectedPatient || !selectedUnit) {
      toast.error("Nenhum paciente ou unidade selecionada.");
      return;
    }

    setIsArchiving(true);

    try {
      const historyKey =
        selectedUnit === "OFT/45" ? "oft45HistoricoDaConversa" : "historicoDaConversa";
      const conversationRef = doc(
        getFirestoreInstance(environment),
        historyKey,
        selectedPatient
      );
      const conversationSnapshot = await getDoc(conversationRef);

      if (!conversationSnapshot.exists()) {
        toast.warning("Esta conversa não possui histórico atual no Firestore.");
        return;
      }

      const currentHistory = conversationSnapshot.data().glbHistoricoDaConversa;

      if (!Array.isArray(currentHistory) || currentHistory.length === 0) {
        toast.warning("O histórico atual está vazio e não pode ser arquivado.");
        return;
      }

      const timestamp = createSaoPauloArchiveTimestamp();
      const archivePath =
        `${selectedUnit}/agendamentoWhatsApp/operacional/conversas/` +
        `${selectedPatient}/conversasAntigas/${timestamp}`;
      const archiveIndexPath =
        `${selectedUnit}/agendamentoWhatsApp/operacional/conversasArquivadas/` +
        selectedPatient;

      // O histórico e seu índice são gravados juntos; só depois o Firestore é excluído.
      await update(ref(getDatabaseInstance(environment)), {
        [archivePath]: currentHistory,
        [archiveIndexPath]: true,
      });
      await deleteDoc(conversationRef);

      setPatientList((patients) =>
        patients.includes(selectedPatient)
          ? patients
          : [...patients, selectedPatient].sort((a, b) => a.localeCompare(b))
      );
      await handlePatientSelect(selectedPatient);
      toast.success("Conversa arquivada com sucesso!");
    } catch (error) {
      console.error("Erro ao arquivar conversa:", error);
      toast.error(
        "Não foi possível arquivar a conversa. O histórico não foi removido sem antes ser salvo."
      );
    } finally {
      setIsArchiving(false);
    }
  };

  const handleBack = () => {
    const unidade = searchParams.get('unidade');
    const data = searchParams.get('data');

    if (unidade && data) {
      router.push(`/visualizar-agendamentos?unidade=${unidade}&dia=${data}`);
    } else {
      router.back();
    }
  };

  /* -------------------------- UI -------------------------- */
  return (
    <SidebarLayout unit={selectedUnit}>
      <Toaster richColors position="top-center" />
      <div className="flex h-[90vh] bg-blue-50 w-full overflow-hidden">
        {/* painel esquerdo */}
        <aside className="hidden md:flex w-80 bg-white border-r flex-col flex-shrink-0">
          {/* barra de busca */}
          <div className="px-3 py-2 bg-blue-600">
            <input
              type="text"
              placeholder="🔍 Buscar telefone"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setManualSelection(false);
              }}
              className="w-full px-2 py-1 rounded-full text-sm placeholder-blue-200 bg-blue-500 text-white focus:outline-none"
            />
          </div>

          {/* lista de telefones (clica ainda funciona) */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {!isConfigurationReady || isLoadingPatients ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
                <Image
                  src="/video/Animação de alvo atingido.gif"
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-sm object-contain"
                  unoptimized
                  priority
                />
                <span>Carregando conversas...</span>
              </div>
            ) : patientListError ? (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {patientListError}
              </div>
            ) : patientList.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">
                Nenhuma conversa encontrada.
              </div>
            ) : patientList
              .filter((p) => p.includes(searchTerm.replace(/\D/g, "")))
              .map((phone, idx) => (
                <div
                  key={phone}
                  onClick={() => {
                    handlePatientSelect(phone);
                    setManualSelection(true);
                  }}
                  className={`flex items-center px-3 py-1.5 rounded cursor-pointer transition-colors ${selectedPatient === phone
                    ? "bg-blue-200"
                    : "hover:bg-blue-100"
                    }`}
                >
                  <Image
                    src={AVATARS[idx % AVATARS.length]}
                    alt="Avatar"
                    width={36}
                    height={36}
                    className="rounded-full"
                  />
                  <span className="ml-3 text-sm text-gray-800">{phone}</span>
                </div>
              ))}
          </div>
        </aside>

        {/* painel direito */}
        <main className="flex-1 flex flex-row min-w-0 overflow-hidden bg-blue-50">
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <header className="flex items-center px-4 py-2 bg-blue-600 text-white shadow-sm flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="mr-2 text-white hover:bg-blue-700 hover:text-white flex-shrink-0"
                onClick={handleBack}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <MessagesSquare className="mr-2 h-5 w-5 flex-shrink-0" />
              <h1 className="text-base font-medium mr-4 truncate">Conversa</h1>

              {/* AI Control in Header */}
              <div className="ml-auto flex items-center gap-2 flex-shrink-0 min-w-0">
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-blue-500 hover:bg-blue-400 text-white border-none shadow-none gap-2 h-8"
                  onClick={() => setShowBulkPanel(prev => !prev)}
                >
                  <Building className="h-4 w-4" />
                  <span className="hidden lg:inline">Enviar Clínicas</span>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-400 text-white border-none shadow-none gap-2 h-8"
                      disabled={!selectedPatient || isArchiving}
                    >
                      {isArchiving ? (
                        <RefreshCcw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                      <span className="hidden lg:inline">
                        {isArchiving ? "Arquivando..." : "Arquivar"}
                      </span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Arquivar esta conversa?</AlertDialogTitle>
                      <AlertDialogDescription>
                        O histórico atual de {selectedPatient} será salvo nas conversas antigas
                        do Realtime Database e, somente depois, removido do Firestore.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isArchiving}>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleArchiveConversation}
                        disabled={isArchiving}
                        className="bg-amber-600 text-white hover:bg-amber-700"
                      >
                        Confirmar arquivamento
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <DownloadHeaderControl
                  patientId={selectedPatient}
                  environment={environment}
                  unit={selectedUnit}
                  history={conversationHistory}
                />
              </div>
            </header>

            {/* ========================================================================================= */}
            {/* ÁREA DE CONVERSA */}
            {/* ========================================================================================= */}
            <section className="flex-1 overflow-y-auto overflow-x-hidden p-4 bg-blue-50 relative min-h-0"> {/* fixed overflow-y, and added overflow-x-hidden */}
              <div className="space-y-3">
                {conversationHistory.map((m, i) => (
                  <div
                    key={i}
                    className="space-y-3"
                  >
                    {m.timelineMarker && (
                      <div className="flex items-center gap-3 py-1" title={m.timelineMarker.source === "realtime" ? m.timelineMarker.timestamp : undefined}>
                        <div className="h-px flex-1 bg-blue-200" />
                        <span className="rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-[11px] font-medium text-blue-700 shadow-sm">
                          {m.timelineMarker.source === "realtime"
                            ? `Conversa antiga · ${formatArchivedConversationTimestamp(m.timelineMarker.timestamp)}`
                            : "Conversa atual · Firestore"}
                        </span>
                        <div className="h-px flex-1 bg-blue-200" />
                      </div>
                    )}
                    <div className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[85%] sm:max-w-[60%] px-3 py-1.5 rounded-2xl text-sm leading-relaxed break-words break-all whitespace-pre-wrap ${m.role === "user"
                          ? "bg-white text-gray-800"
                          : "bg-blue-600 text-white"
                          }`}
                      >
                        {(() => {
                          const content = m.content;
                          if (typeof content === 'string') return content;
                          if (Array.isArray(content)) {
                            return content.map((part: any) => {
                              if (typeof part === 'string') return part;
                              if (part.type === 'text') return part.text;
                              return '';
                            }).join(' ');
                          }
                          if (typeof content === 'object' && content !== null) {
                            // @ts-ignore
                            if (content.text) return content.text;
                            return JSON.stringify(content);
                          }
                          return String(content);
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            </section>

            {/* campo de envio */}
            <footer className="px-4 py-2 bg-white border-t border-gray-200 flex items-center space-x-2 flex-shrink-0">
              <Textarea
                placeholder="Digite uma mensagem"
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                className="flex-1 resize-none h-9 min-h-0 min-w-0 rounded-full bg-blue-50 px-5 py-2 text-sm focus:ring-2 focus:ring-blue-300"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  selectedPatient && handlePatientSelect(selectedPatient)
                }
                title="Recarregar Histórico"
              >
                <RefreshCcw className="h-5 w-5 text-blue-600" />
              </Button>
              <Button
                size="icon"
                onClick={handleSendMessage}
                title="Enviar Mensagem"
              >
                <Send className="h-5 w-5 text-white" />
              </Button>
            </footer>
          </div>

          {/* Painel Lateral de Envio em Massa */}
          {showBulkPanel && (
            <aside className="w-96 bg-white border-l shadow-2xl flex flex-col z-30 animate-in slide-in-from-right duration-300 flex-shrink-0">
              {/* Header do painel */}
              <div className="p-4 border-b bg-blue-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessagesSquare className="h-5 w-5" />
                  <h2 className="font-bold text-sm uppercase tracking-tight">Enviar para Clínicas</h2>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-white hover:bg-blue-700" 
                  onClick={() => setShowBulkPanel(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Conteúdo: Lista de unidades com checkboxes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Unidades</span>
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={selectAllUnidades}
                        className="text-[10px] font-black text-blue-600 hover:underline"
                      >
                        Selecionar todas
                      </button>
                      <span className="text-gray-300">|</span>
                      <button 
                        type="button"
                        onClick={deselectAllUnidades}
                        className="text-[10px] font-black text-rose-600 hover:underline"
                      >
                        Limpar todas
                      </button>
                    </div>
                  </div>
                  {loadingUnidades ? (
                    <div className="flex items-center justify-center py-8 text-blue-600 gap-2">
                      <RefreshCcw className="h-4 w-4 animate-spin" />
                      <span className="text-xs font-semibold">Carregando unidades...</span>
                    </div>
                  ) : unidadesEnvio.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">Nenhuma unidade com WhatsApp configurado.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {unidadesEnvio.map(unit => {
                        const isSelected = selectedUnidadesEnvio.includes(unit.id);
                        return (
                          <div 
                            key={unit.id}
                            onClick={() => toggleUnidadeEnvio(unit.id)}
                            className={`flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors
                              ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:bg-gray-50'}`}
                          >
                            <Checkbox checked={isSelected} className="h-4 w-4 shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-black text-gray-800 truncate">{unit.nome}</span>
                              <span className="text-[10px] text-gray-500 font-medium">{unit.whatsApp || "Sem WhatsApp"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Textarea para a mensagem */}
                <div className="space-y-2 pt-2 border-t">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mensagem</label>
                  <Textarea
                    placeholder="Escreva a mensagem que deseja enviar para todas as clínicas selecionadas..."
                    value={bulkMessage}
                    onChange={(e) => setBulkMessage(e.target.value)}
                    className="min-h-[140px] text-xs resize-none"
                  />
                </div>
              </div>

              {/* Footer com botão de Envio */}
              <div className="p-4 border-t bg-gray-50 flex flex-col gap-2">
                <Button
                  onClick={handleSendBulkMessage}
                  disabled={sendingBulk || selectedUnidadesEnvio.length === 0 || !bulkMessage.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 flex items-center justify-center gap-2"
                >
                  {sendingBulk ? (
                    <>
                      <RefreshCcw className="h-4 w-4 animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Enviar para {selectedUnidadesEnvio.length} unidade(s)</span>
                    </>
                  )}
                </Button>
              </div>
            </aside>
          )}
        </main>
      </div>
    </SidebarLayout>
  );
}


export default function EnviarMensagemPage() {
  return (
    <Suspense fallback={<div>Carregando conversa...</div>}>
      <EnviarMensagemComponent />
    </Suspense>
  )
}
