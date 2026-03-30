"use client";

import { useState, useMemo, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { User, Calendar, Phone, Shield, FlaskConical } from "lucide-react";
import { Toaster, toast } from 'sonner';
import { ENVIRONMENT } from "../../ambiente";
import Link from 'next/link';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { whatsappService } from "@/lib/whatsapp-service";
import type {
  AppointmentFirebaseRecord,
  AICategorization,
} from "@/types/patient";
import {
  format,
  parseISO,
  isEqual,
  startOfDay as dateFnsStartOfDay,
  isValid as dateFnsIsValid,
  getDay,
  differenceInYears,
  parse as dateFnsParse,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  CalendarCheck2,
  BellRing,
  Calendar as CalendarIcon,
} from "lucide-react";
import WhatsAppIcon from "@/components/ui/whatsapp-icon";
import InternalChatIcon from "@/components/ui/internal-chat-icon";
import {
  fetchHolidays,
  isHoliday as checkIsHoliday,
  type Holiday,
} from "@/lib/holidays";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { PatientForm } from "@/components/patient-form";
import { cancelAppointment } from "@/app/actions";
import { getFirebasePathBase } from "@/lib/firebaseConfig";
import { Separator } from "./ui/separator";
import { Label } from "@radix-ui/react-label";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const obterNomeMes = (dataStr: string) => {
  const [ano, mes] = dataStr.split("-");
  const idx = Number(mes) - 1;
  return idx >= 0 && idx < 12 ? `${MESES[idx]} de ${ano}` : null;
};

interface FinancialSheetContentProps {
  unit: string;
  patientData: Record<string, Record<string, any>>;
  initialMonth: string;
  unitConfig: Record<string, { bairro?: string; empresa?: string }>;
}

export interface CalendarAppointment {
  id: string;
  nomePaciente: string;
  nascimento: string;
  dataAgendamento: string; // ISO YYYY-MM-DD
  horario: string; // HH:mm
  convenio: string;
  exames: string[];
  motivacao: string;
  unidade: string;
  telefone: string;
  Observacoes?: string;
  aiCategorization?: AICategorization;
}

export function FinancialSheetContent({ unit, patientData, initialMonth, unitConfig }: FinancialSheetContentProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null);
  const [isConfirmCancelDialogOpen, setIsConfirmCancelDialogOpen] = useState(false);
  const [isRescheduleFormOpen, setIsRescheduleFormOpen] = useState(false);
  const [isNewAppointmentFormOpen, setIsNewAppointmentFormOpen] = useState(false);
  const [appointmentToCancel, setAppointmentToCancel] = useState<CalendarAppointment | undefined>(undefined);
  const [appointmentToReschedule, setAppointmentToReschedule] = useState<CalendarAppointment | undefined>(undefined);
  const [cancelReason, setCancelReason] = useState("");

  const normalizeFileName = (str: string) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_');
  };

  useEffect(() => {
    const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
    if (storedPathBase) setSelectedUnit(storedPathBase);
  }, []);

  const appointmentsForMonth = useMemo(() => {
    if (!selectedMonth) return [];
    const unitData = patientData[unit];
    if (!unitData) return [];

    const appointments: CalendarAppointment[] = [];
    for (const dateStr in unitData) {
      const monthName = obterNomeMes(dateStr);
      if (monthName === selectedMonth) {
        const dayAppointments = unitData[dateStr];
        for (const time in dayAppointments) {
          const appointmentData = dayAppointments[time];
          appointments.push({
            id: `${unit}-${dateStr}-${time}`,
            nomePaciente: appointmentData.nomePaciente,
            nascimento: appointmentData.nascimento,
            dataAgendamento: dateStr,
            horario: time,
            convenio: appointmentData.convenio,
            exames: appointmentData.exames || [],
            motivacao: appointmentData.motivacao,
            unidade: unit,
            telefone: appointmentData.telefone,
            Observacoes: appointmentData.Observacoes,
            aiCategorization: appointmentData.aiCategorization,
          });
        }
      }
    }
    return appointments.sort((a, b) => a.dataAgendamento.localeCompare(b.dataAgendamento) || a.horario.localeCompare(b.horario));
  }, [patientData, unit, selectedMonth]);

  const calculateAge = (birthDate: string): number | null => {
    if (!birthDate) return null;
    let date = parseISO(birthDate);
    if (!dateFnsIsValid(date)) {
      date = dateFnsParse(birthDate, "dd/MM/yyyy", new Date());
    }
    if (!dateFnsIsValid(date)) return null;
    return differenceInYears(new Date(), date);
  };

  const handleGenerateReport = async () => {
    if (!selectedUnit) {
      toast.error("Unidade não identificada. Não é possível enviar a mensagem.");
      return;
    }

    const unitName = unitConfig?.[unit]?.empresa ?? unit;
    const bairro = unitConfig?.[unit]?.bairro;
    const locationString = bairro ? `${unitName} - ${bairro}` : unitName;

    // 1. Criar o documento PDF
    const doc = new jsPDF();
    
    // Título do Relatório
    doc.setFontSize(18);
    doc.text(`Relatório de Faturamento - ${locationString}`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Período: ${selectedMonth}`, 14, 30);

    // 2. Preparar os dados da tabela
    const head = [['Data', 'Nome', 'Convenio', 'Exames', 'Realizou (S/N)']];
    const body: any[] = [];

    appointmentsForMonth.forEach(app => {
      const date = new Date(app.dataAgendamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      const name = app.nomePaciente || "Não informado";
      const convenio = app.convenio || "Não informado";
      const exames = app.exames || [];

      if (exames.length === 0) {
        body.push([date, name, convenio, "Nenhum exame", ""]);
      } else {
        const numExames = exames.length;
        exames.forEach((exame, index) => {
          if (index === 0) {
            // Primeira linha do paciente: define o rowSpan para os dados principais
            body.push([
              { content: date, rowSpan: numExames, styles: { valign: 'middle' } },
              { content: name, rowSpan: numExames, styles: { valign: 'middle' } },
              { content: convenio, rowSpan: numExames, styles: { valign: 'middle' } },
              exame,
              ""
            ]);
          } else {
            // Linhas extras: os dados principais são preenchidos com null para serem ocupados pelo rowSpan
            body.push([null, null, null, exame, ""]);
          }
        });
      }
    });

    // 3. Gerar a tabela
    autoTable(doc, {
      head: head,
      body: body,
      startY: 40,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [0, 82, 204], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { top: 40 },
    });

    // 4. Converter para Base64 (Data URI completo)
    const pdfOutput = doc.output('datauristring');
    const base64Content = pdfOutput; 

    const fileName = `Faturamento_${normalizeFileName(unitName)}_${normalizeFileName(selectedMonth)}`;
    const phoneNumber = ENVIRONMENT === "teste" ? "5521971938840" : "5521984934862";

    try {
      toast.loading("Gerando e enviando PDF...");
      
      const success = await whatsappService.sendDocument(
        {
          phone: phoneNumber,
          document: base64Content,
          fileName: fileName,
          extension: "pdf"
        },
        selectedUnit as "DRM" | "OFT/45",
        ENVIRONMENT === "teste" ? "teste" : "producao"
      );

      toast.dismiss();
      if (success) {
        toast.success("PDF enviado com sucesso!");
      } else {
        toast.error("Erro ao enviar o PDF via WhatsApp.");
      }
    } catch (err) {
      toast.dismiss();
      toast.error("Ocorreu um erro inesperado ao tentar enviar o PDF.");
      console.error("Erro no envio:", err);
    }
  };

  const availableMonths = useMemo(() => {
    const unitData = patientData[unit];
    if (!unitData) return [];
    const months = new Set<string>();
    for (const dateStr in unitData) {
      const monthName = obterNomeMes(dateStr);
      if (monthName) {
        months.add(monthName);
      }
    }
    return Array.from(months).sort((a, b) => {
      const [mA, yA] = a.split(" de ");
      const [mB, yB] = b.split(" de ");
      const idxA = MESES.indexOf(mA);
      const idxB = MESES.indexOf(mB);
      return Number(yA) === Number(yB) ? idxA - idxB : Number(yA) - Number(yB);
    });
  }, [patientData, unit]);

  return (
    <div className="p-4">
      <Toaster richColors position="top-center" />
      <div className="flex items-center space-x-2">
        <Select onValueChange={setSelectedMonth} value={selectedMonth}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um mês" />
          </SelectTrigger>
          <SelectContent>
            {availableMonths.map((month) => (
              <SelectItem key={month} value={month}>
                {month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleGenerateReport}>Gerar Relatório</Button>
        <Button onClick={() => setIsNewAppointmentFormOpen(true)}>Agendar</Button>
      </div>

      <div className="mt-4">
        {appointmentsForMonth.length > 0 ? (
          <ScrollArea className="h-[calc(100vh-12rem)] pr-4">
            <div className="space-y-2">
              {appointmentsForMonth.map((app, index) => {
                const age = calculateAge(app.nascimento);
                return (
                  <Card key={index} className="border-l-4 border-blue-500">
                    <CardHeader className="p-3">
                      <CardTitle className="text-base font-semibold flex items-center text-blue-800">
                        <User className="mr-2 h-4 w-4" />
                        {app.nomePaciente || "Paciente sem nome"}
                        {age !== null && ` (${age} anos)`}
                      </CardTitle>
                    </CardHeader>
                    <div className="flex justify-between items-start">
                      <CardContent className="p-3 pt-0 text-sm text-gray-700 space-y-1">
                        <div className="flex items-center">
                          <Calendar className="mr-2 h-4 w-4 text-green-600" />
                          <span>{new Date(app.dataAgendamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} às {app.horario}</span>
                        </div>
                        <div className="flex items-center">
                          <Phone className="mr-2 h-4 w-4 text-gray-500" />
                          <span>{app.telefone}</span>
                        </div>
                        <div className="flex items-center">
                          <Shield className="mr-2 h-4 w-4 text-gray-500" />
                          <span>{app.convenio}</span>
                        </div>
                        {app.exames && app.exames.length > 0 && (
                          <div className="flex items-center">
                            <FlaskConical className="mr-2 h-4 w-4 text-gray-500" />
                            <span>{app.exames.join(', ')}</span>
                          </div>
                        )}
                      </CardContent>
                      <div className="p-4 pt-0 flex flex-col gap-2">
                        <Button
                          className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border border-yellow-800"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setAppointmentToReschedule(app);
                            setIsRescheduleFormOpen(true);
                          }}
                        >
                          Reagendar
                        </Button>

                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setAppointmentToCancel(app);
                            setIsConfirmCancelDialogOpen(true);
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </ScrollArea>
        ) : (
          <p className="text-center text-gray-500 mt-4">
            {selectedMonth ? "Nenhum agendamento para este mês." : "Selecione um mês para ver os agendamentos."}
          </p>
        )}
      </div>

      {/* ---------------- CONFIRMAR CANCELAMENTO ---------------- */}
      <Dialog
        open={isConfirmCancelDialogOpen}
        onOpenChange={(isOpen) => {
          setIsConfirmCancelDialogOpen(isOpen);
          if (!isOpen) {
            setCancelReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Cancelamento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar este agendamento de{' '}
              {appointmentToCancel?.nomePaciente}?
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <Label className="text-sm">Motivo</Label>
            <Select onValueChange={setCancelReason} value={cancelReason}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="Convênio não aceito na unidade">
                  Convênio não aceito na unidade
                </SelectItem>
                <SelectItem value="Consulta reagendada">
                  Consulta reagendada
                </SelectItem>
                <SelectItem value="Consulta de Retorno">
                  Consulta de Retorno
                </SelectItem>
                <SelectItem value="Não compareceu à consulta">
                  Não compareceu à consulta
                </SelectItem>
                <SelectItem value="Cancelado pelo paciente">
                  Cancelado pelo paciente
                </SelectItem>
                <SelectItem value="Cancelado pela secretária">
                  Cancelado pela secretária
                </SelectItem>
                <SelectItem value="Exame não aceito pela unidade">
                  Exame não aceito pela unidade
                </SelectItem>
                <SelectItem value="Paciente Reagendado">
                  Paciente Reagendado
                </SelectItem>
                <SelectItem value="Preço da consulta">
                  Preço da consulta
                </SelectItem>
                <SelectItem value="Erro do sistema">Erro do sistema</SelectItem>
                <SelectItem value="Teste do sistema">Teste do sistema</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={!cancelReason || !appointmentToCancel}
              onClick={async () => {
                if (!appointmentToCancel) return;

                const appointmentData: AppointmentFirebaseRecord = {
                  nomePaciente: appointmentToCancel.nomePaciente,
                  nascimento: appointmentToCancel.nascimento,
                  dataAgendamento: appointmentToCancel.dataAgendamento,
                  horaAgendamento: appointmentToCancel.horario as any,
                  convenio: appointmentToCancel.convenio,
                  exames: appointmentToCancel.exames,
                  motivacao: appointmentToCancel.motivacao,
                  unidade: appointmentToCancel.unidade,
                  telefone: appointmentToCancel.telefone,
                  Observacoes: appointmentToCancel.Observacoes || "",
                  ...(appointmentToCancel.aiCategorization && {
                    aiCategorization: appointmentToCancel.aiCategorization,
                  }),
                };

                await cancelAppointment(getFirebasePathBase(), {
                  telefone: appointmentToCancel.telefone,
                  unidade: appointmentToCancel.unidade,
                  data: appointmentToCancel.dataAgendamento,
                  hora: appointmentToCancel.horario,
                  appointmentData: appointmentData,
                  cancelReason,
                  enviarMsgSecretaria: true, // Adicionado para consistência
                }, ENVIRONMENT);
                setIsConfirmCancelDialogOpen(false);
                setAppointmentToCancel(undefined);
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- REAGENDAR AGENDAMENTO ---------------- */}
      <Dialog open={isRescheduleFormOpen} onOpenChange={setIsRescheduleFormOpen}>
        <DialogContent className="sm:max-w-[425px] md:max-w-2xl lg:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Reagendar Agendamento</DialogTitle>
            <DialogDescription>
              Edite os dados e salve para criar um novo agendamento. O antigo
              será cancelado com o motivo “Consulta reagendada”.
            </DialogDescription>
          </DialogHeader>

          <div className="h-[calc(100vh-200px)] overflow-y-auto p-1">
            {appointmentToReschedule && (
              <PatientForm
                initialData={appointmentToReschedule}
                onRescheduleComplete={() => {
                  setIsRescheduleFormOpen(false);
                  setAppointmentToReschedule(undefined);
                }}
                firebaseBase={getFirebasePathBase()}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------------- NOVO AGENDAMENTO ---------------- */}
      <Dialog open={isNewAppointmentFormOpen} onOpenChange={setIsNewAppointmentFormOpen}>
        <DialogContent className="sm:max-w-[425px] md:max-w-2xl lg:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
            <DialogDescription>
              Preencha os dados do paciente para criar um novo agendamento.
            </DialogDescription>
          </DialogHeader>

          <div className="h-[calc(100vh-200px)] overflow-y-auto p-1">
            <PatientForm
              onRescheduleComplete={() => {
                setIsNewAppointmentFormOpen(false);
              }}
              firebaseBase={getFirebasePathBase()}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
