"use client";

/* =============================================================
   AppointmentCalendar – agenda por unidade, com cancelamento,
   feriados e lista de unidades sempre visível.
   ============================================================= */

import { useState, useEffect, useMemo } from "react";
import Link from 'next/link';
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getDatabaseInstance } from "@/lib/firebase";
import { ref, onValue, type DataSnapshot } from "firebase/database";
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
  PlusCircle,
  Sparkle,
  Eraser,
  Undo2,
} from "lucide-react";
import WhatsAppIcon from "@/components/ui/whatsapp-icon";
import InternalChatIcon from "@/components/ui/internal-chat-icon";
import { Button } from "@/components/ui/button";
import {
  fetchHolidays,
  isHoliday as checkIsHoliday,
  type Holiday,
} from "@/lib/holidays";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
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
import { cancelAppointment, restoreAppointment } from "@/app/actions";

import { getFirebasePathBase } from "@/lib/firebaseConfig";
import { ENVIRONMENT } from "../../ambiente";

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/* --------------------------- UI Auxiliar --------------------------- */
const EmptyMsg: React.FC<{ msg: string }> = ({ msg }) => (
  <div className="flex flex-col items-center justify-center text-muted-foreground text-sm italic py-8">
    <AlertCircle className="h-6 w-6 mb-2" />
    {msg}
  </div>
);

/* ------------------------------ Tipos ------------------------------ */
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

type AppointmentsByUnit = Record<string, CalendarAppointment[]>;

/** Prop opcional com a unidade enviada pela URL */
interface AppointmentCalendarProps {
  initialUnit?: string | null;
  initialFilter?: string;
  initialDay?: string;
}

/* ---------- helper para converter o texto do filtro em Date ---------- */
function parseFilterDate(raw: string | undefined): Date | undefined {
  const filter = raw?.replace(/\+/g, " ").trim();
  if (!filter) return undefined;

  if (filter.includes(" de ")) {
    const [mesNome, anoStr] = filter.split(" de ");
    const mesIdx = MESES.indexOf(mesNome);
    const anoNum = Number(anoStr);
    if (mesIdx !== -1 && !Number.isNaN(anoNum)) {
      return new Date(anoNum, mesIdx, 1);
    }
  }

  if (/^\d{4}$/.test(filter)) {
    return new Date(Number(filter), 0, 1);
  }

  return undefined;
}

/* ---------- helper para calcular a idade ---------- */
const calculateAge = (birthDate: string | null | undefined): number | null => {
  if (!birthDate) return null;
  let date = parseISO(birthDate);
  if (!dateFnsIsValid(date)) {
    date = dateFnsParse(birthDate, "dd/MM/yyyy", new Date());
  }
  if (!dateFnsIsValid(date)) return null;
  return differenceInYears(new Date(), date);
};

/* ========================== Componente ============================ */
export const CancellationCalendar: React.FC<AppointmentCalendarProps> = ({
  initialUnit,
  initialFilter,
  initialDay,
}) => {
  const { toast } = useToast();
  /* ----------------------------- ESTADOS ----------------------------- */
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    if (initialDay) {
      const day = parseISO(initialDay);
      if (dateFnsIsValid(day)) return day;
    }
    return parseFilterDate(initialFilter) ?? new Date();
  });

  const [appointmentsByUnit, setAppointmentsByUnit] =
    useState<AppointmentsByUnit>({});

  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string | undefined>(() =>
    initialUnit ?? undefined
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);

  const [allHolidays, setAllHolidays] = useState<Holiday[]>([]);
  const [holidaysForCalendar, setHolidaysForCalendar] = useState<Date[]>([]);
  const [selectedDateHolidayInfo, setSelectedDateHolidayInfo] =
    useState<Holiday | undefined>();

  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [appointmentToRestore, setAppointmentToRestore] =
    useState<CalendarAppointment | undefined>(undefined);
  const [dontSendSecretaryMessage, setDontSendSecretaryMessage] = useState(true);



  /* ---------------------- CARREGA FERIADOS --------------------------- */
  useEffect(() => {
    fetchHolidays()
      .then((holidays) => {
        setAllHolidays(holidays);

        const holidayDates: Date[] = [];
        for (const h of holidays) {
          const d = "date" in h ? new Date((h as any).date) : undefined;
          if (d && dateFnsIsValid(d)) holidayDates.push(dateFnsStartOfDay(d));
        }
        setHolidaysForCalendar(holidayDates);

        if (selectedDate && dateFnsIsValid(selectedDate)) {
          setSelectedDateHolidayInfo(checkIsHoliday(selectedDate, holidays));
        }
      })
      .catch((err) => {
        console.error("CALENDAR: Failed to load holidays", err);
        setAllHolidays([]);
        setHolidaysForCalendar([]);
      })
      .finally(() => setIsLoadingHolidays(false));
  }, []);

  /* ---------- RE-checa feriado quando a data muda ---------- */
  useEffect(() => {
    if (selectedDate && dateFnsIsValid(selectedDate)) {
      setSelectedDateHolidayInfo(checkIsHoliday(selectedDate, allHolidays));
    }
  }, [selectedDate, allHolidays]);

  /* --------------------- OUVE RTDB das unidades ---------------------- */
  useEffect(() => {
    const base = getFirebasePathBase();
    const basePath = `${base}/agendamentoWhatsApp/operacional/consultasCanceladas/${base === "OFT/45" ? "medicos" : "unidades"}`;

    const unsub = onValue(
      ref(getDatabaseInstance(ENVIRONMENT), basePath),
      (snap: DataSnapshot) => {
        const data = snap.val() as any;
        const byUnit: AppointmentsByUnit = {};
        const units: string[] = [];

        if (data && typeof data === "object") {
          Object.keys(data).forEach((unit) => {
            units.push(unit);
            byUnit[unit] = [];
            const unitData = data[unit] ?? {};
            Object.entries(unitData).forEach(([dateKey, timesObj]) => {
              Object.entries(
                timesObj as Record<string, AppointmentFirebaseRecord>
              ).forEach(([timeKey, record]) => {
                byUnit[unit].push({
                  id: `${unit}-${dateKey}-${timeKey}`,
                  nomePaciente: record.nomePaciente,
                  nascimento: record.nascimento,
                  dataAgendamento: dateKey,
                  horario: timeKey,
                  convenio: record.convenio,
                  exames: record.exames || [],
                  motivacao: record.motivacao,
                  unidade: base === "OFT/45" ? unit : record.unidade,
                  telefone: record.telefone,
                  Observacoes: record.Observacoes,
                  aiCategorization: record.aiCategorization,
                });
              });
            });
          });
        }

        setAppointmentsByUnit(byUnit);
        setAvailableUnits(units);

        if (!selectedUnit && !initialUnit && units.length) {
          setSelectedUnit(units[0]);
        }

        setIsLoading(false);
      },
      (err) => {
        console.error("Firebase read error", err);
        setIsLoading(false);
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUnit, selectedUnit]);

  // Atualiza selectedUnit se initialUnit mudar
  useEffect(() => {
    if (
      initialUnit !== undefined &&
      initialUnit !== null &&
      initialUnit !== selectedUnit
    ) {
      setSelectedUnit(initialUnit);
    } else if (
      selectedUnit === undefined &&
      availableUnits.length > 0 &&
      (initialUnit === undefined || initialUnit === null)
    ) {
      setSelectedUnit(availableUnits[0]);
    }
  }, [initialUnit, selectedUnit, availableUnits]);

  /* ------------------- Estado e Efeito para FirebaseBase no cliente --------------- */
  const [clientFirebaseBase, setClientFirebaseBase] = useState<string | null>(null);

  useEffect(() => {
    // Executa apenas no cliente
    setClientFirebaseBase(getFirebasePathBase());
  }, []); // Array de dependências vazio para executar apenas uma vez após a montagem


  /* --------------- MEMOS ---------------- */
  const currentUnitAppointments = useMemo(
    () => (selectedUnit ? appointmentsByUnit[selectedUnit] ?? [] : []),
    [appointmentsByUnit, selectedUnit]
  );

  const bookedDays = useMemo(
    () =>
      currentUnitAppointments.map((a) =>
        dateFnsStartOfDay(parseISO(a.dataAgendamento))
      ),
    [currentUnitAppointments]
  );

  const appointmentsForSelectedDate = useMemo(() => {
    if (!selectedDate || !dateFnsIsValid(selectedDate) || selectedDateHolidayInfo)
      return [];
    const startDay = dateFnsStartOfDay(selectedDate);
    return currentUnitAppointments
      .filter((a) =>
        isEqual(dateFnsStartOfDay(parseISO(a.dataAgendamento)), startDay)
      )
      .sort((a, b) => a.horario.localeCompare(b.horario));
  }, [selectedDate, currentUnitAppointments, selectedDateHolidayInfo]);

  /* ---------------------------- RENDER ------------------------------- */
  return (
    <>
      <Card className="w-full shadow-lg">
        {/* ------------------- CABEÇALHO + lista unidades ---------------- */}
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div>
              <CardTitle className="text-2xl font-semibold text-primary flex items-center">
                <CalendarCheck2 className="mr-2 h-6 w-6" />
                Cancelamentos
              </CardTitle>
            </div>
          </div>
        </CardHeader>

        {/* --------------------- COLUNAS PRINCIPAIS ---------------------- */}
        <CardContent className="flex flex-col md:flex-row gap-6 h-full">
          {/* --------- COLUNA ESQUERDA — UNIDADES --------- */}
          <aside className="w-full md:w-60 shrink-0">
            <Card className="h-full flex flex-col">
              {/* REMOVIDO O HEADER "Médicos"/"Unidades" CONFORME SOLICITADO */}
              <ScrollArea className="flex-1 px-4 py-4">
                <div className="space-y-2">
                  {availableUnits.length === 0 && !isLoading && (
                    <EmptyMsg msg="Nenhuma unidade" />
                  )}
                  {availableUnits.map((unit) => {
                    const isActive = unit === selectedUnit;
                    const formatted = unit.replace(/([A-Z])/g, " $1").trim();
                    return (
                      <Button
                        key={unit}
                        variant={isActive ? "default" : "outline"}
                        className="w-full justify-start"
                        size="sm"
                        onClick={() => setSelectedUnit(unit)}
                      >
                        {formatted}
                      </Button>
                    );
                  })}
                </div>
              </ScrollArea>
            </Card>
          </aside>

          {/* --------- CENTER + RIGHT (calendário + detalhes) --------- */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* --------- CALENDÁRIO --------- */}
            <div>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                defaultMonth={selectedDate}
                className="rounded-md border p-3"
                locale={ptBR}
                modifiers={{
                  booked: bookedDays,
                  holiday: holidaysForCalendar,
                  sunday: (d: Date) => getDay(d) === 0,
                }}
                modifiersClassNames={{
                  booked: "border border-yellow-500 rounded-full",
                  holiday:
                    "text-destructive bg-destructive/20 rounded-full font-semibold border-destructive",
                  sunday: "bg-blue-100 text-blue-700 rounded-full",
                }}
              />

              {/* legenda */}
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p className="flex items-center">
                  <Badge
                    variant="destructive"
                    className="mr-2 w-4 h-4 rounded-full bg-destructive/20 text-destructive border border-destructive"
                  />
                  Feriados nacionais
                </p>
                <p className="flex items-center">
                  <Badge className="mr-2 w-4 h-4 rounded-full bg-red-100 text-red-700" />
                  Domingos (sem agendamentos)
                </p>
                <p className="flex items-center">
                  <Badge className="mr-2 w-4 h-4 rounded-full border border-yellow-500 bg-white" />
                  Dias com agendamentos
                </p>
              </div>
            </div>

            {/* --------- DETALHES / LISTA DO DIA --------- */}
            {/* Alterado para flex-col para ter o header fixo acima do ScrollArea */}
            <div className="h-[420px] border rounded-md flex flex-col">
              {/* Header Fixo */}
              <div className="flex justify-between items-center p-3 border-b bg-background rounded-t-md shrink-0 z-10">
                <h3 className="text-lg font-semibold">
                  {selectedDate && dateFnsIsValid(selectedDate)
                    ? `${format(selectedDate, "dd 'de' MMMM 'de' yyyy", {
                      locale: ptBR,
                    })}`
                    : "Selecione uma data"}
                </h3>
              </div>

              {/* Área Rolável */}
              <ScrollArea className="flex-1 p-3">
                {(isLoading || isLoadingHolidays) && <p>Carregando…</p>}

                {!isLoading &&
                  !isLoadingHolidays &&
                  selectedDate &&
                  dateFnsIsValid(selectedDate) && (
                    <>
                      {selectedDateHolidayInfo ? (
                        <Card className="mb-3 bg-destructive/10 border-destructive">
                          <CardHeader className="pb-2 pt-3">
                            <CardTitle className="text-md text-destructive flex items-center">
                              <BellRing className="mr-2 h-5 w-5" /> Feriado Nacional
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm space-y-1 text-destructive/90">
                            <p>
                              <strong>{selectedDateHolidayInfo.name}</strong>
                            </p>
                            <p className="text-xs italic">
                              Agendamentos não são permitidos neste dia.
                            </p>
                          </CardContent>
                        </Card>
                      ) : getDay(selectedDate) === 0 ? (
                        <Card className="mb-3 bg-red-50 border-red-200">
                          <CardHeader className="pb-2 pt-3">
                            <CardTitle className="text-md text-red-700 flex items-center">
                              <CalendarIcon className="mr-2 h-5 w-5" /> Domingo
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm space-y-1 text-red-700/90">
                            <p>Este é um domingo. Agendamentos não são realizados.</p>
                          </CardContent>
                        </Card>
                      ) : (
                        <>
                          {selectedUnit &&
                            appointmentsForSelectedDate.length === 0 && (
                              <EmptyMsg msg="Nenhum agendamento para esta data." />
                            )}

                          {selectedUnit &&
                            appointmentsForSelectedDate.map((app, idx) => {
                              const age = calculateAge(app.nascimento);
                              const formattedUnit = app.unidade
                                .replace(/([A-Z])/g, " $1")
                                .trim();

                              return (
                                <div key={app.id}>
                                  <Card className="mb-3 bg-white border-l-4 border-l-red-500 shadow-sm">
                                    <CardHeader className="pb-2 pt-3">
                                      <div className="flex items-center justify-between">
                                        <CardTitle className="text-md text-secondary-foreground">
                                          {app.nomePaciente}
                                          {age !== null && ` (${age} anos)`}
                                        </CardTitle>
                                        <Badge variant="destructive" className="ml-2">Cancelado</Badge>
                                      </div>
                                      <CardDescription className="text-xs">
                                        {app.motivacao}
                                      </CardDescription>
                                    </CardHeader>
                                    <CardContent className="text-sm space-y-1">
                                      <p>
                                        <strong>Horário:</strong> {app.horario}
                                      </p>
                                      <p className="flex items-center">
                                        <strong>Telefone:</strong>
                                        <a
                                          href={`https://wa.me/${app.telefone.replace(/\D/g, '')}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="ml-2 flex items-center text-primary hover:underline"
                                        >
                                          {app.telefone}
                                          <WhatsAppIcon className="ml-1 h-4 w-4" />
                                        </a>
                                        <Link
                                          href={`/enviar-mensagem?telefone=${app.telefone.replace(/\D/g, '')}&unidade=${selectedUnit}&data=${selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''}`}
                                          className="ml-2 flex items-center text-primary hover:underline"
                                        >
                                          <InternalChatIcon className="h-5 w-5" />
                                        </Link>
                                      </p>
                                      <p>
                                        <strong>Convênio:</strong> {app.convenio}
                                      </p>
                                      <p>
                                        <strong>Exames:</strong>{" "}
                                        {app.exames.join(", ")}
                                      </p>
                                      <p>
                                        <strong>
                                          {getFirebasePathBase() === 'OFT/45' ? 'Médico:' : 'Unidade:'}
                                        </strong> {formattedUnit}
                                      </p>
                                      {app.Observacoes && (
                                        <p>
                                          <strong>Obs.:</strong> {app.Observacoes}
                                        </p>
                                      )}
                                      {(app as any).motivoCancelamento && (
                                        <p className="text-red-700 text-sm italic mt-2">
                                          <strong>Motivo do cancelamento:</strong> {(app as any).motivoCancelamento}
                                        </p>
                                      )}
                                    </CardContent>


                                    <Button
                                      className="bg-green-100 text-green-800 hover:bg-green-200 border border-green-800 w-full"
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => {
                                        setAppointmentToRestore(app);
                                        setIsRestoreDialogOpen(true);
                                      }}
                                    >
                                      <Undo2 className="mr-2 h-4 w-4" />
                                      Restaurar
                                    </Button>
                                  </Card>

                                  {idx <
                                    appointmentsForSelectedDate.length - 1 && (
                                      <Separator className="my-3" />
                                    )}
                                </div>
                              );
                            })}
                        </>
                      )}
                    </>
                  )}

                {!isLoading &&
                  !isLoadingHolidays &&
                  (!selectedDate || !dateFnsIsValid(selectedDate)) && (
                    <EmptyMsg msg="Selecione uma data no calendário." />
                  )}
              </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- CONFIRMAR RESTAURAÇÃO ---------------- */}
      <Dialog
        open={isRestoreDialogOpen}
        onOpenChange={(isOpen) => {
          setIsRestoreDialogOpen(isOpen);
          if (!isOpen) {
            setAppointmentToRestore(undefined);
            setDontSendSecretaryMessage(true);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Restauração</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja restaurar o agendamento de{" "}
              <strong>{appointmentToRestore?.nomePaciente}</strong>?
              <br />
              <span className="text-sm text-muted-foreground">
                Data: {appointmentToRestore?.dataAgendamento && format(parseISO(appointmentToRestore.dataAgendamento), "dd/MM/yyyy", { locale: ptBR })} às {appointmentToRestore?.horario}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="dont-send-secretary-message"
                checked={dontSendSecretaryMessage}
                onCheckedChange={(checked) =>
                  setDontSendSecretaryMessage(Boolean(checked))
                }
              />
              <Label
                htmlFor="dont-send-secretary-message"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Não enviar mensagem para secretária
              </Label>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!appointmentToRestore}
              onClick={async () => {
                if (!appointmentToRestore) return;

                try {
                  const appointmentRecord: AppointmentFirebaseRecord = {
                    nomePaciente: appointmentToRestore.nomePaciente,
                    nascimento: appointmentToRestore.nascimento,
                    dataAgendamento: appointmentToRestore.dataAgendamento,
                    horaAgendamento: appointmentToRestore.horario as any,
                    convenio: appointmentToRestore.convenio,
                    exames: appointmentToRestore.exames,
                    motivacao: appointmentToRestore.motivacao,
                    unidade: appointmentToRestore.unidade,
                    telefone: appointmentToRestore.telefone,
                    Observacoes: appointmentToRestore.Observacoes || "",
                    ...(appointmentToRestore.aiCategorization && {
                      aiCategorization: appointmentToRestore.aiCategorization,
                    }),
                  };

                  const shouldSendMsg = !dontSendSecretaryMessage;
                  const result = await restoreAppointment(getFirebasePathBase(), appointmentRecord, ENVIRONMENT, shouldSendMsg);

                  if (result.success) {
                    toast({
                      title: "Sucesso",
                      description: "Agendamento restaurado com sucesso!",
                    });
                    setIsRestoreDialogOpen(false);
                    setAppointmentToRestore(undefined);
                  } else {
                    toast({
                      variant: "destructive",
                      title: "Erro ao Restaurar",
                      description: result.message,
                    });
                  }
                } catch (error) {
                  console.error("Erro ao restaurar:", error);
                  toast({
                    variant: "destructive",
                    title: "Erro",
                    description: "Falha ao processar restauração.",
                  });
                }
              }}
            >
              <Undo2 className="mr-2 h-4 w-4" />
              Confirmar Restauração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
