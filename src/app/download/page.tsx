"use client";

import { useState, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar-layout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Download, FileText, Database, MessageSquare, Search } from "lucide-react";
import { getDatabaseInstance, getFirestoreInstance } from "@/lib/firebase";
import { ref, get } from "firebase/database";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "sonner";

// Definição dos arquivos disponíveis para download no Realtime Database
interface DownloadOption {
    id: string;
    label: string;
    pathSuffix: string;
}

const AVAILABLE_FILES: DownloadOption[] = [
    {
        id: "subespecialidades",
        label: "IA - Subespecialidades",
        // Path atualizado conforme solicitado
        pathSuffix: "/agendamentoWhatsApp/configuracoes/definicoesIA/outros/agenteSubespecialidade",
    },
    {
        id: "agenteAtendimento",
        label: "IA - Atendimento",
        pathSuffix: "/agendamentoWhatsApp/configuracoes/definicoesIA/agenteAtendimento",
    },
    {
        id: "agenteExtracaoInfConversa",
        label: "IA - Extração",
        pathSuffix: "/agendamentoWhatsApp/configuracoes/definicoesIA/agenteExtracaoInfConversa",
    },
];

export default function DownloadPage() {
    const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null);
    const [firebasePathBase, setFirebasePathBaseState] = useState<"DRM" | "OFT/45">("DRM");
    const [environment, setEnvironmentState] = useState<"teste" | "producao">("teste");

    // Selection State
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

    // New State: Controls if conversation should be downloaded (default true)
    const [includeConversation, setIncludeConversation] = useState(true);

    // Data State
    const [patientPhone, setPatientPhone] = useState("");
    const [isDownloading, setIsDownloading] = useState(false);

    // Preview State
    const [previewMessages, setPreviewMessages] = useState<any[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [searchStatus, setSearchStatus] = useState<"idle" | "found" | "not-found">("idle");

    // Carregar configurações do LocalStorage na montagem
    useEffect(() => {
        const storedEnv = localStorage.getItem("APP_ENVIRONMENT") as "teste" | "producao" | null;
        if (storedEnv) setEnvironmentState(storedEnv);

        const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
        if (storedPathBase) {
            setFirebasePathBaseState(storedPathBase);
            setSelectedUnit(storedPathBase);
        }
    }, []);

    const toggleFileSelection = (fileId: string) => {
        setSelectedFiles((prev) =>
            prev.includes(fileId)
                ? prev.filter((id) => id !== fileId)
                : [...prev, fileId]
        );
    };

    const handleSelectAll = () => {
        if (selectedFiles.length === AVAILABLE_FILES.length) {
            setSelectedFiles([]);
        } else {
            setSelectedFiles(AVAILABLE_FILES.map((f) => f.id));
        }
    };

    const handleSearchConversation = async () => {
        const cleanPhone = patientPhone.replace(/\D/g, "");
        if (cleanPhone.length < 8) {
            toast.error("Digite um telefone válido (apenas números, com DDD).");
            return;
        }

        setIsSearching(true);
        setPreviewMessages(null);
        setSearchStatus("idle");

        try {
            // Firestore usa environment correto
            const dbFirestore = getFirestoreInstance(environment);
            const historyKey = firebasePathBase === "OFT/45" ? "oft45HistoricoDaConversa" : "historicoDaConversa";

            console.log(`Buscando em Firestore [Unit: ${firebasePathBase}, Col: ${historyKey}, Doc: ${cleanPhone}]`);

            const docRef = doc(dbFirestore, historyKey, cleanPhone);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                let history: any[] = [];

                if (Array.isArray((data as any).glbHistoricoDaConversa)) {
                    history = (data as any).glbHistoricoDaConversa;
                } else {
                    for (const key in data) {
                        if (Array.isArray((data as any)[key])) {
                            history = (data as any)[key];
                            break;
                        }
                    }
                }

                const filtered = history.filter(
                    (m: any) => m.role === "user" || m.role === "assistant"
                );

                if (filtered.length > 0) {
                    setPreviewMessages(filtered.slice(-3));
                    setSearchStatus("found");
                    toast.success("Conversa encontrada!");
                } else {
                    setSearchStatus("not-found");
                    toast.warning("Paciente encontrado, mas sem histórico de mensagens.");
                }
            } else {
                setSearchStatus("not-found");
                toast.error("Paciente não encontrado nesta base.");
            }

        } catch (error) {
            console.error("Erro ao buscar preview:", error);
            toast.error("Erro ao buscar dados do paciente.");
        } finally {
            setIsSearching(false);
        }
    };

    const extractDefinition = (data: any): string => {
        if (!data) return "";

        let definitions: string[] = [];

        // Função recursiva para encontrar chaves "definicao"
        const findDefinitions = (obj: any) => {
            if (typeof obj === 'object' && obj !== null) {
                if ('definicao' in obj) {
                    definitions.push(String(obj.definicao));
                }
                for (const key in obj) {
                    findDefinitions(obj[key]);
                }
            }
        };

        // Se for string direta, retorna ela
        if (typeof data === 'string') return data;

        findDefinitions(data);

        // Se não achou "definicao" mas tem conteúdo, formata o objeto inteiro
        if (definitions.length === 0) {
            return JSON.stringify(data, null, 2);
        }

        return definitions.join("\n\n--------------------------------------------------\n\n");
    };

    const handleUnifiedDownload = async () => {
        // Validar se há algo para baixar
        // Cenário 1: Nada selecionado e (conversa desmarcada OU conversa marcada mas não encontrada)
        if (selectedFiles.length === 0 && (!includeConversation || searchStatus !== "found")) {
            if (includeConversation && searchStatus !== "found") {
                toast.warning("Para baixar a conversa, busque um paciente primeiro. Ou selecione arquivos do sistema.");
            } else {
                toast.warning("Selecione arquivos ou habilite a conversa para baixar.");
            }
            return;
        }

        // Se a conversa está marcada mas não encontrada, nós avemos, mas SE tiver arquivos, deixamos baixar os arquivos.
        // Apenas bloqueamos se o usuário quisesse baixar tb a conversa mas esqueceu de buscar -> Isso validamos pelo selectedFiles === 0 acima.

        setIsDownloading(true);
        let successCount = 0;

        try {
            // 1. Download System Files (RTDB)
            if (selectedFiles.length > 0) {
                // RTDB usa environment correto
                const dbRTDB = getDatabaseInstance(environment);

                for (const fileId of selectedFiles) {
                    const fileOption = AVAILABLE_FILES.find((f) => f.id === fileId);
                    if (!fileOption) continue;

                    const fullPath = `/${firebasePathBase}${fileOption.pathSuffix}`;
                    const snapshot = await get(ref(dbRTDB, fullPath));

                    if (snapshot.exists()) {
                        const rawData = snapshot.val();
                        // Extrai apenas a definição e formata
                        const formattedContent = extractDefinition(rawData);

                        // Nome sem data: [Unidade]_[NomeArquivo].txt
                        const fileName = `${firebasePathBase.replace("/", "-")}_${fileOption.label.replace(/\s+/g, '_')}`;

                        downloadText(formattedContent, fileName);
                        successCount++;
                    } else {
                        toast.error(`Dados não encontrados para: ${fileOption.label}`);
                    }
                }
            }

            // 2. Download Conversation (Firestore)
            if (includeConversation && searchStatus === "found") {
                const dbFirestore = getFirestoreInstance(environment);
                const cleanPhone = patientPhone.replace(/\D/g, "");
                const historyKey = firebasePathBase === "OFT/45" ? "oft45HistoricoDaConversa" : "historicoDaConversa";

                const docRef = doc(dbFirestore, historyKey, cleanPhone);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    let history: any[] = [];
                    if (Array.isArray((data as any).glbHistoricoDaConversa)) {
                        history = (data as any).glbHistoricoDaConversa;
                    } else {
                        for (const key in data) {
                            if (Array.isArray((data as any)[key])) {
                                history = (data as any)[key];
                                break;
                            }
                        }
                    }

                    const filtered = history.filter((m: any) => m.role === "user" || m.role === "assistant");

                    // Download como JSON puro, nome sem telefone: "Conversa_Paciente" (ou só Conversa)
                    // O usuário pediu "para conversa não deve vir o telefone"
                    downloadJson(filtered, `Conversa_Paciente`);
                    successCount++;
                }
            }

            if (successCount > 0) {
                toast.success("Download iniciado!");
            }

        } catch (error) {
            console.error("Erro no download unificado:", error);
            toast.error("Ocorreu um erro durante o download.");
        } finally {
            setIsDownloading(false);
        }
    };

    // --- Helpers ---

    const downloadJson = (data: any, fileName: string) => {
        const jsonString = JSON.stringify(data, null, 2);
        downloadBlob(jsonString, fileName, "json"); // Removendo .txt para JSON puro se preferir, ou .json.txt
    }

    const downloadText = (text: string, fileName: string) => {
        downloadBlob(text, fileName, "txt");
    }

    const downloadBlob = (content: string, fileName: string, extension: string) => {
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        // Nome limpo sem data/telefone extra (o fileName já vem tratado)
        link.download = `${fileName}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    return (
        <SidebarLayout unit={selectedUnit}>
            <div className="flex flex-col p-6 min-h-screen w-full bg-gray-50/50">

                <div className="max-w-4xl mx-auto w-full space-y-6">
                    {/* Header reformulado e estilizado + Botão de Ação no Topo */}
                    <header className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-200/60 gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
                                <Download className="h-8 w-8 text-white" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-800 to-blue-500">
                                    Central de Exportação
                                </h1>
                                <p className="text-sm text-slate-500 font-medium mt-1">
                                    <span className="font-bold uppercase text-slate-400 text-xs tracking-wider mr-2">Ambiente: {environment === 'producao' ? 'PROD' : 'TESTE'}</span>
                                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 font-bold text-xs">{firebasePathBase}</span>
                                </p>
                            </div>
                        </div>

                        {/* Botão de Ação Principal movido para o topo */}
                        <Button
                            onClick={handleUnifiedDownload}
                            disabled={isDownloading || (selectedFiles.length === 0 && (!includeConversation || searchStatus !== "found"))}
                            size="default"
                            className={`
                  px-4 font-medium shadow-sm transition-all h-10 text-sm min-w-[160px]
                  ${isDownloading ? "opacity-80" : "hover:-translate-y-0.5 hover:shadow-md"}
                  bg-slate-900 text-white hover:bg-slate-800
                `}
                        >
                            {isDownloading ? (
                                <>
                                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                    Baixando...
                                </>
                            ) : (
                                <>
                                    <Download className="mr-2 h-5 w-5" />
                                    {/* Texto Dinâmico */}
                                    {selectedFiles.length > 0 && includeConversation && searchStatus === "found" ? "Baixar Tudo" :
                                        selectedFiles.length > 0 ? "Baixar Selecionados" :
                                            "Baixar Conversa"}
                                </>
                            )}
                        </Button>
                    </header>

                    {/* Layout em Grid de 2 Colunas */}
                    <div className="grid md:grid-cols-2 gap-6">

                        {/* Coluna 1: Dados do Sistema */}
                        <Card className="shadow-sm border-slate-200 bg-white h-full flex flex-col">
                            <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/50">
                                <div className="flex justify-between items-center">
                                    <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
                                        <Database className="h-4 w-4 text-blue-500" />
                                        Dados do Sistema
                                    </CardTitle>
                                    <Button variant="ghost" size="sm" onClick={handleSelectAll} className="h-6 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50">
                                        {selectedFiles.length === AVAILABLE_FILES.length ? "Desmarcar Todos" : "Todos"}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 flex-1">
                                <div className="space-y-2">
                                    {AVAILABLE_FILES.map((file) => (
                                        <div
                                            key={file.id}
                                            // Correção: onClick na div seleciona a caixa + Checkbox sem pointer-events para não bloquear mas também não ter handler próprio que de conflito?
                                            // Melhor: Checkbox onCheckedChange lida com a mudança de estado, e onClick da div chama a mesma função.
                                            // Se clicar na Checkbox, o evento sobe. Se tiver stopPropagation na Checkbox, resolve.
                                            onClick={() => toggleFileSelection(file.id)}
                                            className={`
                          relative flex items-center p-3 rounded-lg border cursor-pointer transition-all duration-200
                          ${selectedFiles.includes(file.id)
                                                    ? "border-blue-500 bg-blue-50/30"
                                                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                                                }
                        `}
                                        >
                                            <Checkbox
                                                checked={selectedFiles.includes(file.id)}
                                                // onCheckedChange={(v) => toggleFileSelection(file.id)} // Removendo handler direto para evitar duplo disparo se o click propagar
                                                className="mr-3 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 pointer-events-none" // Mantendo pointer-events-none para garantir que só o click da DIV conte (solução mais robusta do anterior que não estava aplicando)
                                            />
                                            <span className="text-sm font-medium text-slate-700">{file.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Coluna 2: Conversa com Paciente (Sempre visível) */}
                        <Card className="shadow-sm border-slate-200 bg-white h-full flex flex-col">
                            <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/50">
                                <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4 text-green-600" />
                                    Baixar Histórico de Conversa
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 flex-1 flex flex-col">

                                {/* Caixinha de "Incluir conversa" sempre visível e padrão marcada */}
                                <div
                                    className="flex items-center cursor-pointer mb-4 p-3 bg-green-50 border border-green-100 rounded-md hover:bg-green-50/80 transition-colors"
                                    onClick={() => setIncludeConversation(!includeConversation)}
                                >
                                    <Checkbox
                                        checked={includeConversation}
                                        // Mesma lógica de pointer-events-none para evitar conflito de click
                                        className="mr-3 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 border-green-400 pointer-events-none"
                                    />
                                    <span className="text-sm font-medium text-green-900">
                                        Incluir conversa neste download
                                    </span>
                                </div>

                                <p className="text-xs text-slate-500 mb-2">
                                    Busque o paciente para validar o histórico:
                                </p>

                                {/* Área de Pesquisa */}
                                <div className={`flex gap-2 w-full mb-4 transition-opacity ${!includeConversation ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                        <Input
                                            placeholder="Ex: 5521999999999"
                                            value={patientPhone}
                                            onChange={(e) => {
                                                setPatientPhone(e.target.value);
                                                setSearchStatus("idle"); // Reset status on edit
                                            }}
                                            onKeyDown={(e) => e.key === "Enter" && handleSearchConversation()}
                                            className="pl-9 bg-white"
                                        />
                                    </div>
                                    <Button
                                        onClick={handleSearchConversation}
                                        disabled={isSearching}
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                    >
                                        {isSearching ? <div className="h-4 w-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : "Buscar"}
                                    </Button>
                                </div>

                                {/* Feedback de não encontrado */}
                                {searchStatus === "not-found" && includeConversation && (
                                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md border border-red-100 flex items-center mb-4">
                                        <div className="h-2 w-2 bg-red-500 rounded-full mr-2 flex-shrink-0" />
                                        Paciente não encontrado na base.
                                    </div>
                                )}

                                {/* Preview da Conversa */}
                                {searchStatus === "found" && previewMessages && includeConversation && (
                                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-3 shadow-inner overflow-hidden flex flex-col min-h-[150px]">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center flex-shrink-0">
                                            Prévia da Conversa:
                                        </h4>
                                        <div className="space-y-2 text-xs text-slate-600 overflow-y-auto pr-1">
                                            {previewMessages.map((msg, idx) => (
                                                <div key={idx} className={`p-2 rounded border ${msg.role === 'assistant' ? 'bg-blue-100 border-blue-200 ml-4 rounded-tr-none' : 'bg-white border-slate-200 mr-4 rounded-tl-none'}`}>
                                                    <strong className="block text-[10px] text-slate-400 mb-0.5">{msg.role === 'assistant' ? '🤖 Atendente' : '👤 Paciente'}</strong>
                                                    <span>{msg.content}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Estado Inicial ou Vazio */}
                                {searchStatus === "idle" && includeConversation && (
                                    <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-lg min-h-[150px]">
                                        <MessageSquare className="h-8 w-8 text-slate-200 mb-2" />
                                        <span className="text-xs text-slate-400 text-center px-4">
                                            Necessário buscar para confirmar.
                                        </span>
                                    </div>
                                )}

                            </CardContent>
                        </Card>

                    </div>

                    <div className="text-center mt-6">
                        <p className="text-xs text-slate-400">
                            Certifique-se de que os pop-ups estão permitidos para realizar múltiplos downloads.
                        </p>
                    </div>

                </div>
            </div>
        </SidebarLayout>
    );
}
