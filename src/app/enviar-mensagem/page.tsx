"use client";

import Image from 'next/image';
import SidebarLayout from '@/components/layout/sidebar-layout';
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from 'next/navigation';
import { MessagesSquare, RefreshCcw, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/firebase";
import { ENVIRONMENT } from "../../../ambiente";
import { Toaster, toast } from 'sonner';

import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  DocumentSnapshot,
} from "firebase/firestore";

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

function EnviarMensagemComponent() {
  /* ---------- state ---------- */
  const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null);
  const searchParams = useSearchParams();

  /* ---------- get unit from localStorage ---------- */
  useEffect(() => {
    const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
    if (storedPathBase) setSelectedUnit(storedPathBase);
  }, []);

  /* ------------------------------ estado ----------------------------- */
  const [searchTerm, setSearchTerm] = useState("");
  const [patientList, setPatientList] = useState<string[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<
    { content: string; role: "user" | "assistant" }[]
  >([]);
  const [messageContent, setMessageContent] = useState("");

  const endRef = useRef<HTMLDivElement>(null);

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

  /* --------------------- carrega lista de pacientes ------------------ */
  useEffect(() => {
    if (!selectedUnit) return;
    (async () => {
      try {
        const historyKey =
          selectedUnit === "OFT/45" ? "oft45HistoricoDaConversa" : "historicoDaConversa";
        const col = collection(db, historyKey);
        const snaps = await getDocs(col);
        setPatientList(snaps.docs.map((d) => d.id));
      } catch (err) {
        console.error("Erro ao carregar lista de pacientes:", err);
        toast.error("Falha ao carregar a lista de pacientes.");
      }
    })();
  }, [selectedUnit]);

  /* --------------------- busca conversa do paciente ------------------ */
  const handlePatientSelect = async (patientId: string) => {
    setSelectedPatient(patientId);
    if (!selectedUnit) return;
    try {
      const historyKey =
        selectedUnit === "OFT/45" ? "oft45HistoricoDaConversa" : "historicoDaConversa";

      const ref = doc(db, historyKey, patientId);
      const snap: DocumentSnapshot = await getDoc(ref);
      const data = snap.exists() ? snap.data() : null;

      let history: any[] = [];
      if (data) {
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
      }
      const filtered = history.filter(
        (m) => m.role === "user" || m.role === "assistant"
      );
      setConversationHistory(filtered);
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
      toast.error("Falha ao carregar o histórico da conversa.");
      setConversationHistory([]);
    }
  };

  /* -------- seleção automática enquanto digita ou via URL -------- */
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setSelectedPatient(null);
      setConversationHistory([]);
      return;
    }
    if (patientList.length > 0) {
        const match = patientList.find((p) => p.includes(searchTerm.trim()));
        if (match && match !== selectedPatient) {
          handlePatientSelect(match);
        }
    }
  }, [searchTerm, patientList, selectedPatient, handlePatientSelect]);

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

    if (ENVIRONMENT === "teste") {
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
        } catch(e) {
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

      const refChat = doc(db, historyKey, selectedPatient);
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

  /* -------------------------- UI -------------------------- */
  return (
    <SidebarLayout unit={selectedUnit}>
      <Toaster richColors position="top-center" />
      <div className="flex h-[90vh] bg-blue-50 w-full">
        {/* painel esquerdo */}
        <aside className="w-80 bg-white border-r flex flex-col">
          {/* barra de busca */}
          <div className="px-3 py-2 bg-blue-600">
            <input
              type="text"
              placeholder="🔍 Buscar telefone"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-2 py-1 rounded-full text-sm placeholder-blue-200 bg-blue-500 text-white focus:outline-none"
            />
          </div>

          {/* lista de telefones (clica ainda funciona) */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {patientList
              .filter((p) => p.includes(searchTerm.trim()))
              .map((phone, idx) => (
                <div
                  key={phone}
                  onClick={() => handlePatientSelect(phone)}
                  className={`flex items-center px-3 py-1.5 rounded cursor-pointer transition-colors ${
                    selectedPatient === phone
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
        <main className="flex-1 flex flex-col">
          <header className="flex items-center px-4 py-2 bg-blue-600 text-white shadow-sm">
            <MessagesSquare className="mr-2 h-5 w-5" />
            <h1 className="text-base font-medium">Conversa</h1>
          </header>

          {/* histórico */}
          <section className="flex-1 overflow-y-auto p-4 bg-blue-50">
            <div className="space-y-3">
              {conversationHistory.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${
                    m.role === "user" ? "justify-start" : "justify-end"
                  }`}
                >
                  <div
                    className={`max-w-[60%] px-3 py-1.5 rounded-2xl text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-white text-gray-800"
                        : "bg-blue-600 text-white"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </section>

          {/* campo de envio */}
          <footer className="px-4 py-2 bg-white border-t border-gray-200 flex items-center space-x-2">
            <Textarea
              placeholder="Digite uma mensagem"
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
              className="flex-1 resize-none h-4 rounded-full bg-blue-50 px-10 py-4 text-sm focus:ring-2 focus:ring-blue-300"
            />
            <button
              onClick={() =>
                selectedPatient && handlePatientSelect(selectedPatient)
              }
              className="p-2 rounded-full bg-blue-100 hover:bg-blue-200"
              title="Recarregar Histórico"
            >
              <RefreshCcw className="h-5 w-5 text-blue-600" />
            </button>
            <button
              onClick={handleSendMessage}
              className="p-2 rounded-full bg-blue-600 hover:bg-blue-700"
              title="Enviar Mensagem"
            >
              <Send className="h-5 w-5 text-white" />
            </button>
          </footer>
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
