"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Loader2,
  CalendarX,
  CalendarCheck2,
  MapPin,
  Calendar,
  Clock,
  ChevronDown,
  Phone,
  FileText,
} from "lucide-react";
import { getDatabaseInstance } from "@/lib/firebase";
import { ref, get } from "firebase/database";
import { ENVIRONMENT } from "../../ambiente";
import { getFirebasePathBase } from "@/lib/firebaseConfig";
import { useToast } from "@/hooks/use-toast";
import { PatientForm } from "@/components/patient-form";
import { cancelAppointment } from "@/app/actions";
import type { AICategorization, AppointmentFirebaseRecord } from "@/types/patient";

export interface PatientSearchResult {
  status: "agendado" | "cancelado";
  id: string;
  nomePaciente: string;
  telefone: string;
  cpf?: string;
  nascimento?: string;
  dataAgendamento: string;
  horario: string;
  convenio: string;
  exames: string[];
  unidade: string;
  motivacao?: string;
  origem?: string;
  Observacoes?: string;
  aiCategorization?: AICategorization;
  confirmado?: boolean;
  motivoCancelamento?: string;
}

interface PatientSearchSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (record: PatientSearchResult) => void;
  enableInlineActions?: boolean;
}

const CANCEL_REASONS = [
  "Consulta reagendada",
  "Nao compareceu a consulta",
  "Cancelado pelo paciente",
  "Cancelado pela secretaria",
  "Erro do sistema",
  "Teste do sistema",
];

function formatUnitLabel(value: string) {
  return value.replace(/([A-Z])/g, " $1").trim();
}

function mapRecordToAppointment(record: PatientSearchResult) {
  return {
    id: record.id,
    nomePaciente: record.nomePaciente,
    cpf: record.cpf,
    nascimento: record.nascimento || "",
    dataAgendamento: record.dataAgendamento,
    horario: record.horario,
    convenio: record.convenio,
    exames: record.exames || [],
    motivacao: record.motivacao || "",
    unidade: record.unidade,
    telefone: record.telefone || "",
    origem: record.origem,
    Observacoes: record.Observacoes || "",
    aiCategorization: record.aiCategorization,
    confirmado: record.confirmado,
  };
}

export function PatientSearchSheet({
  isOpen,
  onClose,
  onSelect,
  enableInlineActions = false,
}: PatientSearchSheetProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [allRecords, setAllRecords] = useState<PatientSearchResult[]>([]);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [isConfirmCancelDialogOpen, setIsConfirmCancelDialogOpen] = useState(false);
  const [isRescheduleFormOpen, setIsRescheduleFormOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [recordToCancel, setRecordToCancel] = useState<PatientSearchResult | undefined>(undefined);
  const [recordToReschedule, setRecordToReschedule] = useState<PatientSearchResult | undefined>(undefined);
  const [cancelReason, setCancelReason] = useState("Nao compareceu a consulta");
  const [dontSendSecretaryMessage, setDontSendSecretaryMessage] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      setExpandedRecordId(null);
      setIsConfirmCancelDialogOpen(false);
      setIsRescheduleFormOpen(false);
      setRecordToCancel(undefined);
      setRecordToReschedule(undefined);
      setCancelReason("Nao compareceu a consulta");
      setDontSendSecretaryMessage(true);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const db = getDatabaseInstance(ENVIRONMENT);
        const base = getFirebasePathBase();
        const isMedico = base === "OFT/45";
        const nodeName = isMedico ? "medicos" : "unidades";

        const agendadosRef = ref(db, `${base}/agendamentoWhatsApp/operacional/consultasAgendadas/${nodeName}`);
        const canceladosRef = ref(db, `${base}/agendamentoWhatsApp/operacional/consultasCanceladas/${nodeName}`);

        const [agendadosSnap, canceladosSnap] = await Promise.all([
          get(agendadosRef),
          get(canceladosRef),
        ]);

        const records: PatientSearchResult[] = [];

        const processSnap = (snap: any, status: "agendado" | "cancelado") => {
          if (!snap.exists()) return;

          const data = snap.val();
          Object.keys(data).forEach((unit) => {
            const unitData = data[unit] || {};
            Object.keys(unitData).forEach((dateKey) => {
              const timesObj = unitData[dateKey] || {};
              Object.keys(timesObj).forEach((timeKey) => {
                const record = timesObj[timeKey] || {};
                records.push({
                  status,
                  id: `${status}-${unit}-${dateKey}-${timeKey}`,
                  nomePaciente: record.nomePaciente || "",
                  telefone: record.telefone || "",
                  cpf: record.cpf,
                  nascimento: record.nascimento,
                  dataAgendamento: dateKey,
                  horario: timeKey,
                  convenio: record.convenio || "",
                  exames: Array.isArray(record.exames) ? record.exames : [],
                  unidade: isMedico ? unit : record.unidade || unit,
                  motivacao: record.motivacao || "",
                  origem: record.origem,
                  Observacoes: record.Observacoes || record.obs || "",
                  aiCategorization: record.aiCategorization,
                  confirmado: Boolean(record.confirmado),
                  motivoCancelamento: record.motivoCancelamento,
                });
              });
            });
          });
        };

        processSnap(agendadosSnap, "agendado");
        processSnap(canceladosSnap, "cancelado");

        setAllRecords(records);
      } catch (error) {
        console.error("Erro ao buscar dados de pacientes:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [isOpen]);

  const filteredRecords = useMemo(() => {
    if (!searchTerm || searchTerm.trim().length < 2) return [];

    const normalize = (str: string) =>
      str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    const lowerTerm = normalize(searchTerm);
    const termNumbersOnly = searchTerm.replace(/\D/g, "");

    const matches = allRecords.filter((r) => {
      const matchesName = normalize(r.nomePaciente).includes(lowerTerm);
      const matchesPhone =
        termNumbersOnly && (r.telefone || "").replace(/\D/g, "").includes(termNumbersOnly);
      return matchesName || matchesPhone;
    });

    matches.sort((a, b) => {
      const dateA = new Date(`${a.dataAgendamento}T${a.horario}`);
      const dateB = new Date(`${b.dataAgendamento}T${b.horario}`);
      return dateB.getTime() - dateA.getTime();
    });

    return matches;
  }, [allRecords, searchTerm]);

  const handleCardPrimaryAction = (record: PatientSearchResult) => {
    if (!enableInlineActions) {
      onSelect(record);
      return;
    }

    setExpandedRecordId((current) => (current === record.id ? null : record.id));
  };

  const handleOpenCancel = (record: PatientSearchResult) => {
    setRecordToCancel(record);
    setCancelReason("Nao compareceu a consulta");
    setDontSendSecretaryMessage(true);
    setIsConfirmCancelDialogOpen(true);
  };

  const handleOpenReschedule = (record: PatientSearchResult) => {
    setRecordToReschedule(record);
    setIsRescheduleFormOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!recordToCancel) return;

    setIsCancelling(true);
    try {
      const appointmentData: AppointmentFirebaseRecord = {
        nomePaciente: recordToCancel.nomePaciente,
        cpf: recordToCancel.cpf,
        nascimento: recordToCancel.nascimento || "",
        dataAgendamento: recordToCancel.dataAgendamento,
        horaAgendamento: recordToCancel.horario,
        convenio: recordToCancel.convenio,
        exames: recordToCancel.exames || [],
        motivacao: recordToCancel.motivacao || "",
        unidade: recordToCancel.unidade,
        telefone: recordToCancel.telefone || "",
        origem: recordToCancel.origem,
        Observacoes: recordToCancel.Observacoes || "",
        ...(recordToCancel.aiCategorization && {
          aiCategorization: recordToCancel.aiCategorization,
        }),
        ...(recordToCancel.confirmado !== undefined && {
          confirmado: recordToCancel.confirmado,
        }),
      };

      const result = await cancelAppointment(
        getFirebasePathBase(),
        {
          telefone: recordToCancel.telefone || "",
          unidade: recordToCancel.unidade,
          data: recordToCancel.dataAgendamento,
          hora: recordToCancel.horario,
          appointmentData,
          cancelReason,
          enviarMsgSecretaria: !dontSendSecretaryMessage,
        },
        ENVIRONMENT
      );

      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Erro ao cancelar",
          description: result.message,
        });
        return;
      }

      setAllRecords((prev) =>
        prev.map((item) =>
          item.id === recordToCancel.id
            ? {
                ...item,
                id: `cancelado-${item.unidade}-${item.dataAgendamento}-${item.horario}`,
                status: "cancelado",
                motivoCancelamento: cancelReason,
              }
            : item
        )
      );

      setExpandedRecordId(null);
      setIsConfirmCancelDialogOpen(false);
      setRecordToCancel(undefined);
      toast({
        title: "Sucesso",
        description: "Agendamento cancelado com sucesso.",
      });
    } catch (error) {
      console.error("Falha ao cancelar agendamento via busca:", error);
      toast({
        variant: "destructive",
        title: "Erro inesperado",
        description: "Ocorreu um erro ao cancelar o agendamento.",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className="sm:max-w-[560px] w-full p-0 flex flex-col bg-white border-l border-slate-200">
          <SheetHeader className="p-5 border-b border-slate-100 bg-slate-50/50">
            <SheetTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Search className="h-5 w-5 text-blue-600" />
              Buscar Paciente
            </SheetTitle>

            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                className="pl-8 h-10 bg-white border-slate-200 focus:ring-1 focus:ring-blue-500 rounded-md text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          </SheetHeader>

          <ScrollArea className="flex-grow p-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p className="text-sm">Buscando registros...</p>
              </div>
            ) : filteredRecords.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  {filteredRecords.length} resultado(s)
                </p>

                {filteredRecords.map((record) => {
                  const isCancelado = record.status === "cancelado";
                  const isExpanded = expandedRecordId === record.id;

                  return (
                    <div
                      key={record.id}
                      className="rounded-xl border bg-white shadow-sm transition-all"
                    >
                      <button
                        type="button"
                        onClick={() => handleCardPrimaryAction(record)}
                        className={`w-full text-left p-4 transition-all ${
                          enableInlineActions ? "hover:bg-slate-50/70" : "hover:border-blue-300"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-bold text-slate-900 leading-tight">
                            {record.nomePaciente}
                          </p>

                          <div className="flex items-center gap-2">
                            <Badge
                              variant={isCancelado ? "destructive" : "default"}
                              className={isCancelado ? "" : "bg-green-600 hover:bg-green-700"}
                            >
                              {isCancelado ? (
                                <>
                                  <CalendarX className="h-3 w-3 mr-1" /> Cancelado
                                </>
                              ) : (
                                <>
                                  <CalendarCheck2 className="h-3 w-3 mr-1" /> Agendado
                                </>
                              )}
                            </Badge>

                            {enableInlineActions && (
                              <ChevronDown
                                className={`h-4 w-4 text-slate-400 transition-transform ${
                                  isExpanded ? "rotate-180" : ""
                                }`}
                              />
                            )}
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                            <MapPin className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            <span className="truncate">{formatUnitLabel(record.unidade)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                            <Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            <span>{record.dataAgendamento.split("-").reverse().join("/")}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                            <Clock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            <span>{record.horario}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700 truncate">
                              {record.convenio || "Sem convenio"}
                            </span>
                          </div>
                        </div>
                      </button>

                      {enableInlineActions && isExpanded && (
                        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                                Telefone
                              </span>
                              <span className="font-medium text-slate-700">
                                {record.telefone || "-"}
                              </span>
                            </div>

                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                                Nascimento
                              </span>
                              <span className="font-medium text-slate-700">
                                {record.nascimento || "-"}
                              </span>
                            </div>

                            <div className="rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                                Motivacao
                              </span>
                              <span className="font-medium text-slate-700">
                                {record.motivacao || "-"}
                              </span>
                            </div>

                            <div className="rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                                Exames
                              </span>
                              <span className="font-medium text-slate-700">
                                {record.exames.length > 0 ? record.exames.join(", ") : "-"}
                              </span>
                            </div>

                            {record.Observacoes && (
                              <div className="rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                                <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                                  Observacoes
                                </span>
                                <span className="font-medium text-slate-700">
                                  {record.Observacoes}
                                </span>
                              </div>
                            )}

                            {isCancelado && record.motivoCancelamento && (
                              <div className="rounded-lg bg-red-50 px-3 py-2 text-red-700 sm:col-span-2">
                                <span className="block text-[10px] font-black uppercase tracking-wider text-red-400">
                                  Motivo do cancelamento
                                </span>
                                <span className="font-medium">{record.motivoCancelamento}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {!isCancelado && (
                              <>
                                <Button
                                  className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border border-yellow-800"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleOpenReschedule(record)}
                                >
                                  Reagendar
                                </Button>

                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleOpenCancel(record)}
                                >
                                  Cancelar
                                </Button>
                              </>
                            )}

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onSelect(record)}
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              Abrir na agenda
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : searchTerm.length >= 2 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-center">
                <Search className="h-10 w-10 mb-3 opacity-20" />
                <p className="font-medium">Nenhum registro encontrado.</p>
                <p className="text-xs mt-1">Tente outro nome ou telefone.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-center">
                <p className="text-sm">Digite no minimo 2 caracteres para iniciar a busca.</p>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog
        open={isConfirmCancelDialogOpen}
        onOpenChange={(isOpen) => {
          setIsConfirmCancelDialogOpen(isOpen);
          if (!isOpen) {
            setCancelReason("Nao compareceu a consulta");
            setDontSendSecretaryMessage(true);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Cancelamento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar este agendamento de{" "}
              <span className="font-bold">{recordToCancel?.nomePaciente}</span>?
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-sm">Motivo</Label>
              <Select onValueChange={setCancelReason} value={cancelReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {CANCEL_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-secretary-message-search"
                checked={!dontSendSecretaryMessage}
                onCheckedChange={(checked) => setDontSendSecretaryMessage(!checked)}
              />
              <Label htmlFor="send-secretary-message-search" className="text-sm font-medium leading-none">
                Enviar mensagem para a secretaria
              </Label>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Fechar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={!cancelReason || !recordToCancel || isCancelling}
              onClick={handleConfirmCancel}
            >
              {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRescheduleFormOpen} onOpenChange={setIsRescheduleFormOpen}>
        <DialogContent className="sm:max-w-[425px] md:max-w-2xl lg:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Reagendar Agendamento</DialogTitle>
            <DialogDescription>
              Edite os dados e salve para criar um novo agendamento. O antigo sera
              cancelado com o motivo "Consulta reagendada".
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[calc(100vh-200px)]">
            {recordToReschedule && (
              <PatientForm
                key={`${recordToReschedule.id}-${recordToReschedule.dataAgendamento}-${recordToReschedule.horario}`}
                initialData={mapRecordToAppointment(recordToReschedule) as any}
                onRescheduleComplete={() => {
                  setIsRescheduleFormOpen(false);
                  setRecordToReschedule(undefined);
                }}
                firebaseBase={getFirebasePathBase()}
              />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
