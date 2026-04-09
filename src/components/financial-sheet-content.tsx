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
import { LOGO_OFT_BASE64, LOGO_DRM_BASE64 } from "@/lib/logo-base64";
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
  cpf?: string;
  Observacoes?: string;
  aiCategorization?: AICategorization;
}

export function FinancialSheetContent({ unit, patientData, initialMonth, unitConfig }: FinancialSheetContentProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null);
  const [isConfirmCancelDialogOpen, setIsConfirmCancelDialogOpen] = useState(false);
  const [isRescheduleFormOpen, setIsRescheduleFormOpen] = useState(false);
  const [isNewAppointmentFormOpen, setIsNewAppointmentFormOpen] = useState(false);
  const [isReportTypeDialogOpen, setIsReportTypeDialogOpen] = useState(false);
  const [appointmentToCancel, setAppointmentToCancel] = useState<CalendarAppointment | undefined>(undefined);
  const [appointmentToReschedule, setAppointmentToReschedule] = useState<CalendarAppointment | undefined>(undefined);
  const [cancelReason, setCancelReason] = useState("");

  const normalizeFileName = (str: string) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_').replace(/\//g, '_');
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
            cpf: appointmentData.cpf,
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

  const handleGenerateReport = async (reportType: 'secretaria' | 'administrativo') => {
    if (!selectedUnit) {
      toast.error("Unidade não identificada. Não é possível enviar a mensagem.");
      return;
    }

    setIsReportTypeDialogOpen(false);

    const unitName = unitConfig?.[unit]?.empresa ?? unit;
    const bairro = unitConfig?.[unit]?.bairro;
    const locationString = bairro ? `${unitName} - ${bairro}` : unitName;

    // 1. Criar o documento PDF
    const doc = new jsPDF();

    // Adicionar o Logo usando formato Data URI completo
    const isDRM = getFirebasePathBase() === "DRM";
    const selectedLogoBase64 = isDRM ? LOGO_DRM_BASE64 : LOGO_OFT_BASE64;
    const imgData = "data:image/png;base64," + selectedLogoBase64;
    // Stretch image (only horizontally: width from 48 -> 68)
    doc.addImage(imgData, 'PNG', 14, 10, 68, 14);

    const reportTypeLabel = reportType === 'secretaria' ? 'Secretária' : 'Financeiro';

    // Título do Relatório
    doc.setFontSize(18);
    const pdfTitle = reportType === 'secretaria' 
      ? `Pacientes Agendados - ${locationString}` 
      : `Pacientes Atendidos - ${locationString}`;

    doc.text(pdfTitle, 14, 34);
    doc.setFontSize(12);
    doc.text(`Período: ${selectedMonth}`, 14, 41);

    // 2. Preparar os dados da tabela
    const body: any[] = [];
    let isAlternatePatient = false;

    if (reportType === 'secretaria') {
      // ---- RELATÓRIO SECRETÁRIA ----
      const head = [['Data', 'Nome', 'Convênio', 'Procedimentos', 'Realizou (S/N)', 'Data Atendimento']];

      appointmentsForMonth.forEach(app => {
        const dateStr = new Date(app.dataAgendamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        const dateFull = `${dateStr}\n${app.horario}`;
        const nameRaw = app.nomePaciente || "Não informado";
        const name = app.cpf ? `${nameRaw}\nCPF: ${app.cpf}` : nameRaw;
        const convenio = app.convenio || "Não informado";
        const itens = (app.exames && app.exames.length > 0) ? app.exames : ["Consulta"];
        const bgColor: [number, number, number] = isAlternatePatient ? [240, 248, 255] : [255, 255, 255];

        itens.forEach((item, index) => {
          body.push([
            { content: index === 0 ? dateFull : "", styles: { fillColor: bgColor } },
            { content: index === 0 ? name : "", styles: { fillColor: bgColor } },
            { content: index === 0 ? convenio : "", styles: { fillColor: bgColor } },
            { content: item, styles: { fillColor: bgColor } },
            { content: "", styles: { fillColor: bgColor } }, // Realizou
            { content: "", styles: { fillColor: bgColor } }, // Data Atendimento
          ]);
        });
        isAlternatePatient = !isAlternatePatient;
      });

      autoTable(doc, {
        head: head,
        body: body,
        startY: 48,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.1 },
        headStyles: { fillColor: [0, 82, 204], textColor: [255, 255, 255], fontStyle: 'bold' },
        margin: { top: 48 },
      });

    } else {
      // ---- RELATÓRIO ADMINISTRATIVO ----
      toast.loading("Buscando preços dos exames...");

      // Buscar preços no Firebase — caminho dinâmico conforme a unidade
      const DB_URL = "https://oftautomacao-9b427-default-rtdb.firebaseio.com";
      const firebasePath = getFirebasePathBase(); // "DRM" ou "OFT/45"
      let examesConfig: Record<string, { preco?: number; drMelo?: number; clinica?: number }> = {};
      try {
        const resp = await fetch(`${DB_URL}/${firebasePath}/agendamentoWhatsApp/configuracoes/exames.json`);
        examesConfig = (await resp.json()) ?? {};
      } catch (e) {
        console.warn("Não foi possível buscar preços dos exames:", e);
      }
      const head = [['Data', 'Nome', 'Convênio', 'Procedimentos', 'Valor\nPaciente', 'Repasse\nDr. Melo', 'Margem\nClínica']];

      let totalPaciente = 0;
      let totalDrMelo = 0;
      let totalClinica = 0;

      appointmentsForMonth.forEach(app => {
        const dateStr = new Date(app.dataAgendamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        const dateFull = `${dateStr}\n${app.horario}`;
        const nameRaw = app.nomePaciente || "Não informado";
        const name = app.cpf ? `${nameRaw}\nCPF: ${app.cpf}` : nameRaw;
        const convenio = app.convenio || "Não informado";
        const itens = (app.exames && app.exames.length > 0) ? app.exames : ["Consulta"];
        const bgColor: [number, number, number] = isAlternatePatient ? [240, 248, 255] : [255, 255, 255];

        const formatBRL = (v: number | undefined) =>
          v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";

        const isParticular = convenio.trim().toLowerCase() === "particular";

        if (isParticular) {
          // Particular: busca preços individuais no Firebase
          itens.forEach((item, index) => {
            const cfg = examesConfig[item];
            const isIncluso = item.toLowerCase().includes("(incluso na consulta)");

            const precoPaciente = isIncluso ? 0 : cfg?.preco;
            const precoClinica = isIncluso ? 0 : cfg?.clinica;

            // Verifica se existe um preço diferenciado para a unidade deste agendamento.
            // O nó do exame pode conter campos extras com o nome da unidade (ex: "oftalmoRecreio").
            // Se esse campo existir no Firebase e tiver um valor válido (não nulo, não vazio),
            // ele sobrescreve o drMelo padrão APENAS para esse exame nessa unidade.
            const unitKey = app.unidade; // ex: "oftalmoRecreio"
            const unitSpecificDrMelo = cfg?.[unitKey];
            const precoDrMelo = isIncluso
              ? 0
              : unitSpecificDrMelo != null &&
                String(unitSpecificDrMelo).trim() !== ""
              ? Number(unitSpecificDrMelo)
              : cfg?.drMelo;

            if (precoPaciente != null) totalPaciente += precoPaciente;
            if (precoDrMelo != null) totalDrMelo += precoDrMelo;
            if (precoClinica != null) totalClinica += precoClinica;

            body.push([
              { content: index === 0 ? dateFull : "", styles: { fillColor: bgColor } },
              { content: index === 0 ? name : "", styles: { fillColor: bgColor } },
              { content: index === 0 ? convenio : "", styles: { fillColor: bgColor } },
              { content: item, styles: { fillColor: bgColor } },
              { content: formatBRL(precoPaciente), styles: { fillColor: bgColor, halign: 'right' } },
              { content: formatBRL(precoDrMelo), styles: { fillColor: bgColor, halign: 'right' } },
              { content: formatBRL(precoClinica), styles: { fillColor: bgColor, halign: 'right' } },
            ]);
          });
        } else {
          // Plano de saúde: cobrança fixa de R$ 30 para Dr. Melo no 1º exame; demais ficam em branco
          const PLANO_DRM_FIXO = 30;
          totalDrMelo += PLANO_DRM_FIXO;

          itens.forEach((item, index) => {
            const isFirst = index === 0;
            body.push([
              { content: isFirst ? dateFull : "", styles: { fillColor: bgColor } },
              { content: isFirst ? name : "", styles: { fillColor: bgColor } },
              { content: isFirst ? convenio : "", styles: { fillColor: bgColor } },
              { content: item, styles: { fillColor: bgColor } },
              // Paciente paga 0 (plano cobre)
              { content: "0,00", styles: { fillColor: bgColor, halign: 'right' } },
              // Dr. Melo recebe R$30 fixo apenas no primeiro exame; demais zerado
              { content: isFirst ? formatBRL(PLANO_DRM_FIXO) : "0,00", styles: { fillColor: bgColor, halign: 'right' } },
              // Clínica recebe 0 (plano)
              { content: "0,00", styles: { fillColor: bgColor, halign: 'right' } },
            ]);
          });
        }
        isAlternatePatient = !isAlternatePatient;
      });

      // Linha de totais
      const totalBgColor: [number, number, number] = [230, 240, 255];
      body.push([
        { content: "TOTAL", colSpan: 4, styles: { fillColor: totalBgColor, fontStyle: 'bold', halign: 'right' } },
        { content: `R$ ${totalPaciente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, styles: { fillColor: totalBgColor, fontStyle: 'bold', halign: 'right' } },
        { content: `R$ ${totalDrMelo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, styles: { fillColor: totalBgColor, fontStyle: 'bold', halign: 'right' } },
        { content: `R$ ${totalClinica.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, styles: { fillColor: totalBgColor, fontStyle: 'bold', halign: 'right' } },
      ]);

      autoTable(doc, {
        head: head,
        body: body,
        startY: 48,
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 2.5, lineColor: [200, 200, 200], lineWidth: 0.1 },
        headStyles: { fillColor: [0, 82, 204], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
        },
        margin: { top: 48 },
      });

      // 4. Adicionar caixa de destaque para o repasse total (na direita)
      const finalY = (doc as any).lastAutoTable.finalY || 100;
      doc.setDrawColor(0, 82, 204);
      doc.setLineWidth(0.5);
      doc.rect(116, finalY + 10, 80, 20); // Caixa na direita
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 82, 204);
      doc.text(`Total do Repasse: R$ ${totalDrMelo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 120, finalY + 22);
      doc.setTextColor(0, 0, 0); // Reset colors
      doc.setFont("helvetica", "normal");
    }

    // 4. Converter para Base64 (Data URI completo)
    const pdfOutput = doc.output('datauristring');
    const base64Content = pdfOutput;

    // Formatar Mês/Ano para o nome do arquivo (ex: "Março de 2026" -> "202603")
    const parts = selectedMonth.split(" de ");
    let anoMesFormatado = "";
    if (parts.length === 2) {
      const [mesNome, ano] = parts;
      const mesIdx = MESES.indexOf(mesNome);
      const mesNum = (mesIdx + 1).toString().padStart(2, "0");
      anoMesFormatado = `${ano}${mesNum}`;
    } else {
      // Fallback
      anoMesFormatado = normalizeFileName(selectedMonth);
    }

    const unitNameNorm = normalizeFileName(unitName);
    
    const fileName = reportType === 'secretaria' 
      ? `Dr.Melo_Age_${unitNameNorm}_${anoMesFormatado}`
      : `Dr.Melo_Atend_${unitNameNorm}_${anoMesFormatado}`;

    // Baixar o arquivo no navegador do usuário (removido a pedido)
    // doc.save(`${fileName}.pdf`);

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
        <Button onClick={() => setIsReportTypeDialogOpen(true)}>Gerar Relatório</Button>
        <Button onClick={() => setIsNewAppointmentFormOpen(true)}>Agendar</Button>
      </div>

      {/* ---------------- TIPO DE RELATÓRIO ---------------- */}
      <Dialog open={isReportTypeDialogOpen} onOpenChange={setIsReportTypeDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Tipo de Relatório</DialogTitle>
            <DialogDescription>
              Selecione para quem enviar o relatório de faturamento do mês de {selectedMonth}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <Button onClick={() => handleGenerateReport('secretaria')} variant="outline" className="w-full text-left justify-start">
              Para a Secretária
            </Button>
            <Button onClick={() => handleGenerateReport('administrativo')} variant="outline" className="w-full text-left justify-start">
              Para o financeiro
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
