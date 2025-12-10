"use client";

import type * as React from 'react';
import { useState, useEffect } from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ref, onValue, type DataSnapshot } from "firebase/database";
import { database } from "@/lib/firebase";
import { parse as dateFnsParse, format as dateFnsFormat, isValid as dateFnsIsValid } from 'date-fns';

import { getFirebasePathBase } from "@/lib/firebaseConfig";

import {
  User,
  CalendarDays,
  Eraser,
  Clock,
  FileText,
  ClipboardList,
  MessageSquare,
  Phone,
  FileEdit,
  Sparkles,
  Loader2,
  Save,
  Building,
  HeartPulse,
  Stethoscope,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { PatientFormSchema, type PatientFormData, type AICategorization } from "@/types/patient";
import { saveAppointmentAction, cancelAppointment, checkAppointmentAvailabilityAction } from "@/app/actions";
import { categorizePatientObservations } from "@/ai/flows/categorize-patient-observations";
import { fetchHolidays, isHoliday as checkIsHoliday, type Holiday as HolidayType } from '@/lib/holidays';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import type { CalendarAppointment } from "./appointment-calendar"; // Corrected import path
interface PatientFormProps {
  onAppointmentSaved?: (appointmentPath: string) => void;
  defaultValues?: Record<string, any>;
  initialData?: CalendarAppointment | null | undefined; // Added initialData prop
  firebaseBase?: string;
  onRescheduleComplete?: () => void;
}

interface Unidade {
  id: string;
  nome: string;
}

interface Convenio {
  id: string;
  nome: string;
}

interface Exame {
  id: string;
  nome: string;
}

function formatUnitName(unitId: string, unitDetails: any): string {
  if (unitDetails && typeof unitDetails.unidade === 'string' && unitDetails.unidade.trim() !== '') {
    return unitDetails.unidade;
  }
  return unitId
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
}

function formatConvenioName(convenioId: string, convenioDetails: any): string {
  if (convenioDetails && typeof convenioDetails.nome === 'string' && convenioDetails.nome.trim() !== '') {
    return convenioDetails.nome;
  }
  if (typeof convenioDetails === 'string' && convenioDetails.trim() !== '') {
    return convenioDetails;
  }
  return convenioId
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
}

function formatExameName(exameId: string, exameDetails: any): string {
  if (exameDetails && typeof exameDetails.nome === 'string' && exameDetails.nome.trim() !== '') {
    return exameDetails.nome;
  }
  if (typeof exameDetails === 'string' && exameDetails.trim() !== '') {
    return exameDetails;
  }
  return exameId.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}


export const PatientForm: React.FC<PatientFormProps> = ({ onAppointmentSaved, defaultValues, initialData, firebaseBase, onRescheduleComplete }) => {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [aiResult, setAiResult] = useState<AICategorization | null>(null);
  const [unidadesList, setUnidadesList] = useState<Unidade[]>([]);
  const [isLoadingUnidades, setIsLoadingUnidades] = useState(true);
  const [conveniosList, setConveniosList] = useState<Convenio[]>([]);
  const [isLoadingConvenios, setIsLoadingConvenios] = useState(true);
  const [examesList, setExamesList] = useState<Exame[]>([]);
  const [isLoadingExames, setIsLoadingExames] = useState(true);
  const [selectedDateIsHoliday, setSelectedDateIsHoliday] = useState<HolidayType | undefined>(undefined);
  const [allHolidays, setAllHolidays] = useState<HolidayType[]>([]);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);
  const [dontSendSecretaryMessage, setDontSendSecretaryMessage] = useState(true);
  const [dontSendSecretaryMessageOnCreate, setDontSendSecretaryMessageOnCreate] = useState(true);

  const [isClient, setIsClient] = useState(false);
  const form = useForm<PatientFormData>({
    resolver: zodResolver(PatientFormSchema),
    defaultValues: initialData
      ? {
        nomePaciente: initialData.nomePaciente ?? "",
        dataNascimento: initialData.nascimento
          ? dateFnsParse(initialData.nascimento, "dd/MM/yyyy", new Date())
          : undefined,
        dataAgendamento: initialData.dataAgendamento
          ? dateFnsParse(initialData.dataAgendamento, "yyyy-MM-dd", new Date())
          : undefined,
        horario: initialData.horario ?? "",
        convenio: initialData.convenio ?? "",
        exames: initialData.exames ?? [],
        motivacao: initialData.motivacao ?? "",
        local: initialData.unidade ?? "",
        telefone: initialData.telefone ?? "",
        observacoes: initialData.Observacoes ?? "",
      }
      : {
        nomePaciente: "",
        dataNascimento: undefined,
        dataAgendamento: undefined,
        horario: "",
        convenio: "",
        exames: [],
        motivacao: "",
        local: "",
        telefone: "",
        observacoes: "",
      },
  });


  useEffect(() => {
    setIsClient(true);
  }, []);

  const { reset } = form;

  // Removed redundant useEffect to avoid double resets. The logic is handled by the comprehensive effect below.


  const handleClearFields = () => {
    form.setValue("dataAgendamento", "" as any);
    form.setValue("nomePaciente", "");
    form.setValue("dataNascimento", "" as any);
    form.setValue("telefone", "");
    form.setValue("horario", "");
    form.setValue("convenio", "");
    form.setValue("exames", []);
    form.setValue("motivacao", "");
    form.setValue("local", "");
    form.setValue("observacoes", "");
    setAiResult(null);
  };
  const dataAgendadaValue = form.watch("dataAgendamento");

  // Efeito para aplicar defaultValues/initialData SOMENTE DEPOIS que as unidades carregarem
  // imports garantidos:
  // import { parse as dateFnsParse, isValid as dateFnsIsValid } from "date-fns";

  useEffect(() => {
    if (!defaultValues) return;

    let vals: Record<string, any> = {};

    if (initialData) {
      vals = {
        nomePaciente: initialData.nomePaciente ?? "",
        // string "dd/MM/yyyy" -> Date
        dataNascimento: initialData.nascimento
          ? dateFnsParse(initialData.nascimento, "dd/MM/yyyy", new Date())
          : undefined,
        // string "yyyy-MM-dd" -> Date
        dataAgendamento: initialData.dataAgendamento
          ? dateFnsParse(initialData.dataAgendamento, "yyyy-MM-dd", new Date())
          : undefined,
        horario: initialData.horario ?? "",
        convenio: initialData.convenio ?? "",
        exames: initialData.exames ?? [],
        motivacao: initialData.motivacao ?? "",
        local: initialData.unidade ?? "",
        telefone: initialData.telefone ?? "",
        observacoes: initialData.Observacoes ?? "",
      };

      // valida datas
      if (vals.dataNascimento && !dateFnsIsValid(vals.dataNascimento)) {
        vals.dataNascimento = undefined;
      }
      if (vals.dataAgendamento && !dateFnsIsValid(vals.dataAgendamento)) {
        vals.dataAgendamento = undefined;
      }
    } else {
      // copiar defaults
      vals = { ...defaultValues };

      // yyyy-MM-dd → Date
      if (
        typeof vals.dataAgendamento === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(vals.dataAgendamento)
      ) {
        const parsed = dateFnsParse(vals.dataAgendamento, "yyyy-MM-dd", new Date());
        if (dateFnsIsValid(parsed)) vals.dataAgendamento = parsed;
        else vals.dataAgendamento = undefined;
      }

      // dd/MM/yyyy → Date (ou tente yyyy-MM-dd como fallback)
      if (typeof vals.dataNascimento === "string") {
        let parsed = dateFnsParse(vals.dataNascimento, "dd/MM/yyyy", new Date());
        if (!dateFnsIsValid(parsed)) {
          parsed = dateFnsParse(vals.dataNascimento, "yyyy-MM-dd", new Date());
        }
        vals.dataNascimento = dateFnsIsValid(parsed) ? parsed : undefined;
      }
    }

    // Normalizar "Particular" se necessário
    if (vals.convenio === "Particular" && conveniosList.length > 0) {
      const particularItem = conveniosList.find(c =>
        c.id.toLowerCase() === "particular" ||
        c.nome.toLowerCase() === "particular"
      );
      if (particularItem) {
        vals.convenio = particularItem.id;
      }
    }

    // Só dá reset quando já temos unidades (se precisar delas)
    if (!vals.local || unidadesList.length > 0) {
      // Check if values are actually different to avoid unnecessary resets
      const currentValues = form.getValues();

      // Helper to format date for comparison
      const formatDate = (d: any) => d instanceof Date && dateFnsIsValid(d) ? d.toISOString().split('T')[0] : '';
      const normalizeStr = (s: any) => String(s || '').trim();

      const isDifferent =
        normalizeStr(vals.nomePaciente) !== normalizeStr(currentValues.nomePaciente) ||
        normalizeStr(vals.telefone) !== normalizeStr(currentValues.telefone) ||
        normalizeStr(vals.horario) !== normalizeStr(currentValues.horario) ||
        normalizeStr(vals.convenio) !== normalizeStr(currentValues.convenio) ||
        normalizeStr(vals.motivacao) !== normalizeStr(currentValues.motivacao) ||
        normalizeStr(vals.local) !== normalizeStr(currentValues.local) ||
        normalizeStr(vals.observacoes) !== normalizeStr(currentValues.observacoes) ||
        formatDate(vals.dataAgendamento) !== formatDate(currentValues.dataAgendamento) ||
        formatDate(vals.dataNascimento) !== formatDate(currentValues.dataNascimento) ||
        // Cheap check for arrays (exames) - length different or first item different (simplification)
        (vals.exames?.length ?? 0) !== (currentValues.exames?.length ?? 0) ||
        (vals.exames?.[0] !== currentValues.exames?.[0]);

      if (isDifferent) {
        // console.log("Resetando formulário com defaults (valores diferentes detectados):", vals);
        reset(vals);
      }
    } else {
      // console.log("Defaults têm 'local', mas unidades não carregaram. Aguardando…");
    }
  }, [defaultValues, initialData, reset, unidadesList, conveniosList]);


  const selectedPatientPhoneNumber = form.watch("telefone"); // Watching the phone field for auto-fill button

  // Function to handle auto-filling data based on the selected patient's phone number
  const handleAutoFill = () => {
    // This function would typically fetch data based on selectedPatientPhoneNumber
    // For now, it's a placeholder. You would replace this with your actual data fetching logic.
    console.log(`Attempting to auto-fill for phone: ${selectedPatientPhoneNumber}`);

    // Example: Simulate auto-filling some data (replace with real logic)
    // form.setValue('nomePaciente', 'Nome Auto-preenchido');
    // form.setValue('dataNascimento', new Date('1990-01-01'));
    // form.setValue('motivacao', 'Motivação Auto-preenchida');

    toast({ title: "Auto Preencher (Placeholder)", description: "A funcionalidade de auto preenchimento precisa ser implementada." });
  };


  useEffect(() => {
    if (dataAgendadaValue instanceof Date && dateFnsIsValid(dataAgendadaValue)) {
      setSelectedDateIsHoliday(checkIsHoliday(dataAgendadaValue, allHolidays));
    } else if (typeof dataAgendadaValue === 'string' && (dataAgendadaValue as string).match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parsedDate = dateFnsParse(dataAgendadaValue, 'yyyy-MM-dd', new Date());
      if (dateFnsIsValid(parsedDate)) {
        setSelectedDateIsHoliday(checkIsHoliday(parsedDate, allHolidays));
      } else {
        setSelectedDateIsHoliday(undefined);
      }
    } else {
      setSelectedDateIsHoliday(undefined);
    }
  }, [dataAgendadaValue, allHolidays]);

  useEffect(() => {
    setIsLoadingHolidays(true);
    fetchHolidays()
      .then(holidays => {
        setAllHolidays(holidays);
        if (dataAgendadaValue instanceof Date && dateFnsIsValid(dataAgendadaValue)) {
          setSelectedDateIsHoliday(checkIsHoliday(dataAgendadaValue, holidays));
        } else if (typeof dataAgendadaValue === 'string' && (dataAgendadaValue as string).match(/^\d{4}-\d{2}-\d{2}$/)) {
          const parsedDate = dateFnsParse(dataAgendadaValue, 'yyyy-MM-dd', new Date());
          if (dateFnsIsValid(parsedDate)) {
            setSelectedDateIsHoliday(checkIsHoliday(parsedDate, holidays));
          }
        }
      })
      .catch(error => {
        console.error("PATIENT_FORM: Failed to load holidays:", error);
        toast({ title: "Erro ao carregar feriados", description: "Não foi possível buscar a lista de feriados.", variant: "destructive" });
        setAllHolidays([]);
      })
      .finally(() => {
        setIsLoadingHolidays(false); // Moved this outside the .then to ensure it's always set
      });
  }, [toast]);


  useEffect(() => {
    setIsLoadingUnidades(true);
    const unidadesRefPath = `/${getFirebasePathBase()}/agendamentoWhatsApp/configuracoes/${getFirebasePathBase() === 'OFT/45' ? 'medicos' : 'unidades'}`;
    console.log("PATIENT_FORM: Tentando buscar unidades de:", unidadesRefPath);
    const unidadesRef = ref(database, unidadesRefPath);

    const unsubscribe = onValue(unidadesRef, (snapshot: DataSnapshot) => {
      const data = snapshot.val();
      console.log("PATIENT_FORM: Dados do Firebase para unidades:", data);
      const loadedUnidades: Unidade[] = [];

      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, valueNode]) => {
          if (typeof valueNode === 'object' && valueNode !== null && typeof (valueNode as any).unidade === 'string') {
            const unitDetails = valueNode as { unidade: string };
            loadedUnidades.push({ id: key, nome: formatUnitName(key, unitDetails) });
          } else {
            console.warn(`PATIENT_FORM: Unidade com chave ${key} não possui o campo 'unidade' ou está malformada. Usando chave como nome.`, valueNode);
            loadedUnidades.push({ id: key, nome: formatUnitName(key, null) });
          }
        });
      }

      console.log("PATIENT_FORM: Lista de unidades processada:", loadedUnidades);
      setUnidadesList(loadedUnidades);
      setIsLoadingUnidades(false);
      if (loadedUnidades.length === 0 && data) {
        console.warn("PATIENT_FORM: A lista de unidades está vazia após o processamento, mas dados foram recebidos do Firebase. Verifique a estrutura dos dados no Firebase (espera-se um campo 'unidade' dentro de cada objeto da unidade) e a lógica de parsing.");
      } else if (!data) {
        console.warn("PATIENT_FORM: Nenhum dado recebido do Firebase para unidades. Verifique o caminho e as permissões.");
        toast({
          title: "Aviso: Unidades não carregadas",
          description: "A lista de unidades não pôde ser carregada. Verifique as configurações do Firebase ou permissões.",
          variant: "default",
        });
      }
    }, (error) => {
      console.error("PATIENT_FORM: Erro de leitura do Firebase ao buscar unidades. Verifique permissões e caminho. Erro:", error);
      setUnidadesList([]);
      setIsLoadingUnidades(false);
      toast({
        title: "Erro ao carregar unidades",
        description: "Não foi possível buscar a lista de locais. Verifique o console para detalhes do erro e as permissões do Firebase.",
        variant: "destructive",
      });
    });

    return () => {
      console.log("PATIENT_FORM: Removendo listener do Firebase para unidades.");
      unsubscribe();
    };
  }, [toast]);

  useEffect(() => { // Removed unidadesList from dependencies
    setIsLoadingConvenios(true);
    setIsLoadingConvenios(true);
    const base = getFirebasePathBase();
    // Usa path dinâmico para OFT e DRM
    const conveniosRefPath = `/${base}/agendamentoWhatsApp/configuracoes/convenios`;
    console.log("PATIENT_FORM: Tentando buscar convênios de:", conveniosRefPath);
    const conveniosRef = ref(database, conveniosRefPath);

    const unsubscribe = onValue(conveniosRef, (snapshot: DataSnapshot) => {
      const data = snapshot.val();
      console.log("PATIENT_FORM: Dados do Firebase para convênios:", data);
      const loadedConvenios: Convenio[] = [];

      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, valueNode]) => {
          if (typeof valueNode === 'boolean' && valueNode === true) {
            loadedConvenios.push({ id: key, nome: formatConvenioName(key, null) });
          } else if (typeof valueNode === 'string') {
            loadedConvenios.push({ id: key, nome: formatConvenioName(key, valueNode) });
          } else if (typeof valueNode === 'object' && valueNode !== null && typeof (valueNode as any).nome === 'string') {
            loadedConvenios.push({ id: key, nome: formatConvenioName(key, valueNode) });
          } else {
            loadedConvenios.push({ id: key, nome: formatConvenioName(key, null) });
            console.warn(`PATIENT_FORM: Convênio com chave ${key} tem formato não esperado ou falta campo 'nome'. Usando chave como nome.`, valueNode);
          }
        });
      } else if (Array.isArray(data)) {
        data.forEach(item => {
          if (typeof item === 'string') {
            loadedConvenios.push({ id: item, nome: formatConvenioName(item, null) });
          }
        });
      }

      console.log("PATIENT_FORM: Lista de convênios processada:", loadedConvenios);
      setConveniosList(loadedConvenios);
      setIsLoadingConvenios(false);
      if (loadedConvenios.length === 0 && data) {
        console.warn("PATIENT_FORM: A lista de convênios está vazia após o processamento, mas dados foram recebidos do Firebase. Verifique a estrutura dos dados e a lógica de parsing.");
      } else if (!data) {
        console.warn("PATIENT_FORM: Nenhum dado recebido do Firebase para convênios. Verifique o caminho e as permissões.");
        toast({
          title: "Aviso: Convênios não carregados",
          description: "A lista de convênios não pôde ser carregada. Verifique as configurações ou permissões.",
          variant: "default",
        });
      }
    }, (error) => {
      console.error("PATIENT_FORM: Erro de leitura do Firebase ao buscar convênios:", error);
      setConveniosList([]);
      setIsLoadingConvenios(false);
      toast({
        title: "Erro ao carregar convênios",
        description: "Não foi possível buscar a lista de convênios. Verifique o console e permissões.",
        variant: "destructive",
      });
    });

    return () => {
      console.log("PATIENT_FORM: Removendo listener do Firebase para convênios.");
      unsubscribe();
    };
  }, [toast]); // Added toast as dependency

  useEffect(() => {
    setIsLoadingExames(true);
    setIsLoadingExames(true);
    const base = getFirebasePathBase();
    const examesRefPath = `/${base}/agendamentoWhatsApp/configuracoes/exames`;
    console.log("PATIENT_FORM: Tentando buscar exames de:", examesRefPath);
    const examesRef = ref(database, examesRefPath);

    const unsubscribe = onValue(examesRef, (snapshot: DataSnapshot) => {
      const data = snapshot.val();
      console.log("PATIENT_FORM: Dados do Firebase para exames:", data);
      const loadedExames: Exame[] = [];

      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, valueNode]) => {
          if (typeof valueNode === 'boolean' && valueNode === true) {
            loadedExames.push({ id: key, nome: formatExameName(key, null) });
          } else if (typeof valueNode === 'string') {
            loadedExames.push({ id: key, nome: formatExameName(key, valueNode) });
          } else if (typeof valueNode === 'object' && valueNode !== null && typeof (valueNode as any).nome === 'string') {
            loadedExames.push({ id: key, nome: formatExameName(key, valueNode) });
          } else {
            loadedExames.push({ id: key, nome: formatExameName(key, null) });
            console.warn(`PATIENT_FORM: Exame com chave ${key} tem formato não esperado. Usando chave como nome.`, valueNode);
          }
        });
      } else if (Array.isArray(data)) {
        data.forEach((item, index) => {
          if (typeof item === 'string') {
            loadedExames.push({ id: item, nome: formatExameName(item, null) });
          } else if (typeof item === 'object' && item !== null && typeof item.nome === 'string') {
            loadedExames.push({ id: item.id || `exame_${index}`, nome: item.nome });
          }
        });
      }

      console.log("PATIENT_FORM: Lista de exames processada:", loadedExames);
      setExamesList(loadedExames);
      setIsLoadingExames(false);
      if (loadedExames.length === 0 && data) {
        console.warn("PATIENT_FORM: A lista de exames está vazia após o processamento, mas dados foram recebidos. Verifique a estrutura e parsing.");
      } else if (!data) {
        console.warn("PATIENT_FORM: Nenhum dado recebido do Firebase para exames.");
        toast({
          title: "Aviso: Exames não carregados",
          description: "A lista de exames não pôde ser carregada.",
          variant: "default",
        });
      }
    }, (error) => {
      console.error("PATIENT_FORM: Erro de leitura do Firebase ao buscar exames:", error);
      setExamesList([]);
      setIsLoadingExames(false);
      toast({
        title: "Erro ao carregar exames",
        description: "Não foi possível buscar a lista de exames.",
        variant: "destructive",
      });
    });

    return () => {
      console.log("PATIENT_FORM: Removendo listener do Firebase para exames.");
      unsubscribe();
    };
  }, [toast]);


  const isReschedule = !!initialData;
  const onSubmit = async (data: PatientFormData) => {
    setIsSaving(true);

    try {
      // Se for um reagendamento, verifique se precisa cancelar o antigo
      if (isReschedule && initialData) {
        const oldDate = initialData.dataAgendamento; // yyyy-MM-dd
        const oldTime = initialData.horario; // HH:mm
        const oldUnit = initialData.unidade;

        const newDate = dateFnsFormat(data.dataAgendamento, "yyyy-MM-dd");
        const newTime = data.horario;
        const newUnit = data.local;

        const hasDateChanged = oldDate !== newDate;
        const hasTimeChanged = oldTime !== newTime;
        const hasUnitChanged = oldUnit !== newUnit;

        const isSameSlot = !hasDateChanged && !hasTimeChanged && !hasUnitChanged;

        // --- CHECK AVAILABILITY BEFORE CANCELLING ---
        // Se mudou de horário/dia/unidade, precisamos verificar se o NOVO slot está livre
        // antes de cancelar o antigo, para evitar perder o agendamento original se o destino estiver ocupado.
        if (!isSameSlot) {
          const availability = await checkAppointmentAvailabilityAction(
            firebaseBase || getFirebasePathBase(),
            newDate,
            newTime,
            newUnit
          );

          if (!availability.available) {
            toast({
              variant: "destructive",
              title: "Horário Indisponível",
              description: availability.message || "Já existe um agendamento para este horário e local.",
            });
            setIsSaving(false);
            return; // Aborta tudo
          }
        }

        // Se data, hora ou unidade mudaram, cancela o agendamento antigo PRIMEIRO
        if (hasDateChanged || hasTimeChanged || hasUnitChanged) {
          const cancelResult = await cancelAppointment(
            firebaseBase || getFirebasePathBase(),
            {
              telefone: initialData.telefone,
              unidade: initialData.unidade,
              data: initialData.dataAgendamento,
              hora: initialData.horario,
              appointmentData: {
                nomePaciente: initialData.nomePaciente,
                nascimento: initialData.nascimento,
                dataAgendamento: initialData.dataAgendamento,
                horaAgendamento: initialData.horario,
                convenio: initialData.convenio,
                exames: initialData.exames,
                motivacao: initialData.motivacao,
                unidade: initialData.unidade,
                telefone: initialData.telefone,
                Observacoes: initialData.Observacoes,
                aiCategorization: initialData.aiCategorization,
              },
              cancelReason: "Consulta reagendada",
              enviarMsgSecretaria: !dontSendSecretaryMessage,
            }
          );

          if (!cancelResult.success) {
            throw new Error(
              `Falha ao cancelar o agendamento antigo: ${cancelResult.message}`
            );
          }
        }
      }

      // --- CHECK AVAILABILITY FOR NEW APPOINTMENTS ---
      // Se NÃO for reagendamento (ou seja, criação nova), precisamos checar se já existe.
      // E também passar o flag correto para o saveAppointmentAction.
      // Já fizemos a checagem manual acima para o caso de "reschedule with move", mas para "new appointment" não.

      let shouldCheckConflictInSave = true;

      // Se é um 'reschedule' mantendo o mesmo slot, NÃO checamos conflito (pois é o próprio registro)
      if (isReschedule && initialData) {
        const oldDate = initialData.dataAgendamento;
        const oldTime = initialData.horario;
        const oldUnit = initialData.unidade;
        const newDate = dateFnsFormat(data.dataAgendamento, "yyyy-MM-dd");
        const newTime = data.horario;
        const newUnit = data.local;

        if (oldDate === newDate && oldTime === newTime && oldUnit === newUnit) {
          shouldCheckConflictInSave = false;
        }
      }

      // Se for novo agendamento, checamos antes de chamar a action de save, para dar feedback rápido
      // (Embora a action salvar também cheque, fazer aqui evita uma chamada desnecessária de escrita se já soubermos que falha)
      if (!isReschedule) {
        const availability = await checkAppointmentAvailabilityAction(
          firebaseBase || getFirebasePathBase(),
          dateFnsFormat(data.dataAgendamento, "yyyy-MM-dd"),
          data.horario,
          data.local
        );
        if (!availability.available) {
          toast({
            variant: "destructive",
            title: "Horário Indisponível",
            description: availability.message || "Já existe um agendamento para este horário e local.",
          });
          setIsSaving(false);
          return;
        }
      }

      // Salva o novo agendamento ou atualiza o existente
      const result = await saveAppointmentAction(
        firebaseBase || getFirebasePathBase(),
        data,
        aiResult || undefined,
        !dontSendSecretaryMessageOnCreate, // Pass the flag directly for both new and reschedule
        shouldCheckConflictInSave
      );

      if (result.success) {
        toast({
          title: isReschedule
            ? "Reagendamento Concluído"
            : "Agendamento Criado",
          description: `O agendamento para ${data.nomePaciente} foi salvo com sucesso.`,
        });

        form.reset();
        setAiResult(null);
        setSelectedDateIsHoliday(undefined);

        if (onAppointmentSaved && result.appointmentPath) {
          onAppointmentSaved(result.appointmentPath);
        }

        if (isReschedule && onRescheduleComplete) {
          onRescheduleComplete();
        }
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Ocorreu um erro desconhecido";
      toast({
        title: "Erro ao Salvar",
        description: `Não foi possível salvar o agendamento. ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Renderiza um placeholder ou null no servidor e na primeira renderização do cliente
  if (!isClient) {
    return null;
  }

  const handleCategorizeObservations = async () => {
    const observations = form.getValues("observacoes");
    if (!observations || observations.trim() === "") {
      toast({ title: "Observações vazias", description: "Por favor, insira as observações do paciente.", variant: "destructive" });
      return;
    }
    setIsCategorizing(true);
    setAiResult(null);
    try {
      const result = await categorizePatientObservations({ observations });
      if (result && result.category && result.category.toLowerCase() !== "unknown" && result.category.toLowerCase() !== "desconhecido" && result.category.trim() !== "" && result.category.toLowerCase() !== "n/a") {
        setAiResult(result);
        toast({ title: "Categorização Concluída", description: `Categoria: ${result.category}` });
      } else if (result && result.category) {
        toast({ title: "Categorização Não Conclusiva", description: `A IA retornou: '${result.category}'. Esta informação não será salva.`, variant: "default" });
        setAiResult(null);
      } else {
        toast({ title: "Categorização Não Conclusiva", description: "A IA não retornou uma categoria válida. Esta informação não será salva.", variant: "default" });
        setAiResult(null);
      }

    } catch (error) {
      console.error("AI Error:", error);
      toast({ title: "Erro na IA", description: "Não foi possível categorizar as observações.", variant: "destructive" });
      setAiResult(null);
    }
    setIsCategorizing(false);
  };

  return (
    <Card className="w-full shadow-lg">
      <CardHeader /> {/* Keep CardHeader, but remove content */}
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Row 1: Name, Date of Birth, Phone */}
              <FormField
                control={form.control}
                name="nomePaciente"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4" />Nome do Paciente</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Gabriel Ferreira da Silva" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dataNascimento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><CalendarDays className="mr-2 h-4 w-4" />Data de Nascimento</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value instanceof Date && dateFnsIsValid(field.value) ? dateFnsFormat(field.value, 'yyyy-MM-dd') : (typeof field.value === 'string' ? field.value : '')}
                        onChange={(e) => {
                          const dateValue = e.target.value;
                          const parsedDate = dateFnsParse(dateValue, 'yyyy-MM-dd', new Date());
                          if (dateFnsIsValid(parsedDate)) {
                            field.onChange(parsedDate);
                          } else {
                            field.onChange(dateValue);
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="telefone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4" />Telefone do Paciente</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="Ex: 5521998252849" {...field} />
                    </FormControl>
                    <FormMessage />
                    {field.value && field.value.length >= 10 && !/^55\d{10,11}$/.test(field.value) && (
                      <p className="text-xs text-amber-600 mt-1">
                        Número fora do padrão (55 + DDD...).
                      </p>
                    )}
                  </FormItem>
                )}
              />
              {/* Row 2: Scheduled Date, Time */}
              <FormField
                control={form.control}
                name="dataAgendamento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><CalendarDays className="mr-2 h-4 w-4" />Data Agendada</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value instanceof Date && dateFnsIsValid(field.value) ? dateFnsFormat(field.value, 'yyyy-MM-dd') : (typeof field.value === 'string' ? field.value : '')}
                        onChange={(e) => {
                          const dateValue = e.target.value;
                          const parsedDate = dateFnsParse(dateValue, 'yyyy-MM-dd', new Date());
                          if (dateFnsIsValid(parsedDate)) {
                            field.onChange(parsedDate);
                          } else {
                            field.onChange(dateValue);
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                    {selectedDateIsHoliday && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertTitle>Atenção! A data selecionada é feriado de {selectedDateIsHoliday.name}.</AlertTitle>
                        <AlertDescription>
                          Não é possível agendar nesta data.
                        </AlertDescription>
                      </Alert>
                    )}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="horario"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><Clock className="mr-2 h-4 w-4" />Horário</FormLabel>
                    <FormControl>
                      <Input type="time" placeholder="Ex: 11:00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Row 3: Location, Convenio */}
              <FormField
                control={form.control}
                name="local"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center">
                      {getFirebasePathBase() === 'OFT/45' ? (
                        <Stethoscope className="mr-2 h-4 w-4" />
                      ) : (
                        <Building className="mr-2 h-4 w-4" />
                      )}
                      {getFirebasePathBase() === 'OFT/45' ? 'Médicos' : 'Local (Unidade)'}
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isLoadingUnidades || unidadesList.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              getFirebasePathBase() === 'OFT/45'
                                ? "Selecione o médico" // This was already updated correctly in a previous step.
                                : isLoadingUnidades
                                  ? "Carregando unidades..."
                                  : unidadesList.length === 0
                                    ? "Nenhuma unidade disponível"
                                    : "Selecione a unidade"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingUnidades ? (
                          <SelectItem value="loading" disabled>Carregando...</SelectItem>
                        ) : unidadesList.length === 0 ? (
                          <SelectItem value="no-units" disabled>Nenhuma unidade configurada.</SelectItem>
                        ) : (
                          unidadesList.map(unidade => (
                            <SelectItem key={unidade.id} value={unidade.id}>
                              {unidade.nome}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {unidadesList.length === 0 && !isLoadingUnidades && (
                      <p className="text-sm text-destructive mt-1">
                        A lista de unidades está vazia. Verifique a configuração no Firebase.
                      </p>
                    )}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="convenio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><HeartPulse className="mr-2 h-4 w-4" />Convênio</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isLoadingConvenios || conveniosList.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              isLoadingConvenios
                                ? "Carregando convênios..."
                                : (conveniosList.length === 0
                                  ? "Nenhum convênio disponível"
                                  : "Selecione o convênio")
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingConvenios ? (
                          <SelectItem value="loading" disabled>Carregando...</SelectItem>
                        ) : conveniosList.length === 0 ? (
                          <SelectItem value="no-convenios" disabled>Nenhum convênio configurado.</SelectItem>
                        ) : (
                          conveniosList.map(convenio => (
                            <SelectItem key={convenio.id} value={convenio.id}>
                              {convenio.nome}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {conveniosList.length === 0 && !isLoadingConvenios && (
                      <p className="text-sm text-destructive mt-1">
                        A lista de convênios está vazia. Verifique a configuração no Firebase.
                      </p>
                    )}
                  </FormItem>
                )}
              />
              {/* Row 4: Motivation */}
              <FormField
                control={form.control}
                name="motivacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><MessageSquare className="mr-2 h-4 w-4" />Motivação</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Consulta de rotina" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="exames"
                render={() => (
                  <FormItem>
                    <FormLabel className="flex items-center"><ClipboardList className="mr-2 h-4 w-4" />Exames</FormLabel>
                    {isLoadingExames ? (
                      <div className="flex items-center space-x-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <p className="text-muted-foreground">Carregando exames...</p>
                      </div>
                    ) : examesList.length === 0 ? (
                      <p className="text-sm text-destructive mt-1">Nenhum exame configurado. Verifique o Firebase.</p>
                    ) : (
                      <ScrollArea className="h-40 w-full rounded-md border p-4">
                        <div className="space-y-2">
                          {examesList.map((exame) => (
                            <FormField
                              key={exame.id}
                              control={form.control}
                              name="exames"
                              render={({ field: examesField }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={examesField.value?.includes(exame.id)}
                                      onCheckedChange={(checked) => {
                                        const currentExames = examesField.value || [];
                                        if (checked) {
                                          examesField.onChange([...currentExames, exame.id]);
                                        } else {
                                          examesField.onChange(
                                            currentExames.filter((value) => value !== exame.id)
                                          );
                                        }
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="font-normal text-sm">
                                    {exame.nome}
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />


              <FormField
                control={form.control}
                name="observacoes"

                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><FileEdit className="mr-2 h-4 w-4" />Observações</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Digite as observações sobre o paciente..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {isReschedule && (
              <div className="my-4 p-4 border rounded-md space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="reschedule-send-secretary-message-create"
                    checked={dontSendSecretaryMessageOnCreate}
                    onCheckedChange={(checked) =>
                      setDontSendSecretaryMessageOnCreate(Boolean(checked))
                    }
                  />
                  <Label
                    htmlFor="reschedule-send-secretary-message-create"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Não enviar mensagem para secretária sobre o <strong>novo agendamento</strong>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="reschedule-send-secretary-message-cancel"
                    checked={dontSendSecretaryMessage}
                    onCheckedChange={(checked) =>
                      setDontSendSecretaryMessage(Boolean(checked))
                    }
                  />
                  <Label
                    htmlFor="reschedule-send-secretary-message-cancel"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Não enviar mensagem para secretária sobre o <strong>cancelamento</strong>
                  </Label>
                </div>
              </div>
            )}
            {!isReschedule && (
              <div className="my-4 p-4 border rounded-md space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="new-appointment-send-secretary-message"
                    checked={dontSendSecretaryMessageOnCreate}
                    onCheckedChange={(checked) =>
                      setDontSendSecretaryMessageOnCreate(Boolean(checked))
                    }
                  />
                  <Label
                    htmlFor="new-appointment-send-secretary-message"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Não enviar mensagem para secretária sobre este agendamento
                  </Label>
                </div>
              </div>
            )}
            <Button type="submit"
              disabled={isSaving || !!selectedDateIsHoliday || isLoadingHolidays || isCategorizing}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />

              )}
              Salvar Agendamento {/* Changed text for clarity */}
            </Button>

            <div className="flex justify-end gap-2 mt-4">
            </div>

          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
