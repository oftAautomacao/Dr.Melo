// use server
import { ENVIRONMENT } from "../../ambiente";

import { ref, update, get } from "firebase/database";
import { database } from "@/lib/firebase";
import type {
  PatientFormData,
  AICategorization,
  AppointmentFirebaseRecord,
} from "@/types/patient";
import { PatientFormSchema } from "@/types/patient";
import { format as formatDateFn } from "date-fns";

/* =============================================================
   Tipos de retorno
   ============================================================= */
interface SaveAppointmentResult {
  success: boolean;
  message: string;
  appointmentPath?: string;
  phoneAppointmentPath?: string;
}

interface CancelAppointmentParams {
  telefone: string;
  unidade: string; // DRM: unidade | OFT: médico (id/nome)
  data: string;    // yyyy-MM-dd
  hora: string;    // HH:mm
  appointmentData: AppointmentFirebaseRecord;
  cancelReason: string;
  enviarMsgSecretaria: boolean;
}

interface CancelAppointmentResult {
  success: boolean;
  message: string;
  cancelledAppointmentPath?: string;
  cancelledPhoneAppointmentPath?: string;
}

/* =============================================================
   Helpers
   ============================================================= */
function isDRMBase(firebaseBase: string) {
  // Ex.: "DRM" → true | "OFT/45" → false
  return firebaseBase?.toUpperCase().startsWith("DRM");
}

function getIdxNode(firebaseBase: string) {
  // DRM indexa por unidades; OFT indexa por medicos
  return isDRMBase(firebaseBase) ? "unidades" : "medicos";
}

function buildId(setor: string, dataISO: string, hora: string) {
  // id consistente com o calendário: <setor>-YYYY-MM-DD-HH:mm
  return `${setor}-${dataISO}-${hora}`;
}

function ensureOFTMedicoOnRecord(
  base: string,
  record: AppointmentFirebaseRecord
): AppointmentFirebaseRecord & { medico?: string; motivoCancelamento?: string } {
  if (!isDRMBase(base)) {
    // No OFT, garantimos a presença do campo 'medico' para facilitar consultas posteriores
    const medico = (record as any).medico ?? (record as any).unidade;
    return { ...record, medico };
  }
  return record;
}

/* =============================================================
   CHECK AVAILABILITY: verifica se já existe agendamento
   ============================================================= */
export async function checkAppointmentAvailabilityAction(
  firebaseBase: string,
  date: string,   // yyyy-MM-dd
  time: string,   // HH:mm
  unitOrMedic: string
): Promise<{ available: boolean; message?: string }> {
  try {
    const idxNode = getIdxNode(firebaseBase); // "unidades" | "medicos"
    // Caminho: /<base>/agendamentoWhatsApp/operacional/consultasAgendadas/<medicos|unidades>/<nome>/<data>/<hora>
    const path = `/${firebaseBase}/agendamentoWhatsApp/operacional/consultasAgendadas/${idxNode}/${unitOrMedic}/${date}/${time}`;

    console.log("CHECK_AVAILABILITY path:", path);
    const snapshot = await get(ref(database, path));

    if (snapshot.exists()) {
      return {
        available: false,
        message: `Já existe um agendamento para ${time} em ${unitOrMedic}.`
      };
    }

    return { available: true };
  } catch (error) {
    console.error("Error checking availability:", error);
    // Em caso de erro de leitura (ex: permissão), bloqueamos por segurança ou permitimos?
    // Melhor permitir e deixar o save falhar se for o caso, ou bloquear? 
    // Vamos retornar falso para forçar verificação manual se der erro de rede grave, 
    // mas pode ser irritante. Vamos lançar msg.
    return { available: false, message: "Erro ao verificar disponibilidade." };
  }
}

/* =============================================================
   SAVE: grava em consultasAgendadas (por setor e por telefone)
   ============================================================= */
export async function saveAppointmentAction(
  firebaseBase: string,
  formData: PatientFormData,
  aiCategorizationResult?: AICategorization,
  enviarMsgSecretaria?: boolean,
  checkConflict: boolean = true
): Promise<SaveAppointmentResult> {
  console.log("SAVE_ACTION - firebaseBase:", firebaseBase);
  console.log("SAVE_ACTION - formData:", formData); // Adicionado log para depuração
  console.log("SAVE_ACTION - ENVIRONMENT:", ENVIRONMENT);

  try {
    const validation = PatientFormSchema.safeParse(formData);
    if (!validation.success) {
      return {
        success: false,
        message:
          "Dados inválidos: " +
          validation.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", "),
      };
    }

    const v = validation.data;

    // Determinar o valor correto para o campo 'unidade' nos dados a serem salvos
    const unidadeParaCampo = firebaseBase === 'OFT/45' ? "OftalmoDayTijuca" : v.local;

    // Monta o registro no formato usado (mantendo horaAgendamento)
    // Corrigido o nome do campo para 'medico' e atualizado o tipo
    const appointmentRecord: Partial<AppointmentFirebaseRecord & { medico?: string }> = {
      nomePaciente: v.nomePaciente,
      ...(v.cpf ? { cpf: v.cpf } : {}),
      nascimento: formatDateFn(v.dataNascimento, "dd/MM/yyyy"),
      dataAgendamento: formatDateFn(v.dataAgendamento, "dd/MM/yyyy"),
      horaAgendamento: v.horario, // HH:mm
      convenio: v.convenio,
      exames: v.exames,
      motivacao: v.motivacao,
      unidade: unidadeParaCampo, // Usar o valor determinado acima
      telefone: v.telefone,
      ...(firebaseBase === 'OFT/45' ? { medico: v.local } : {}), // Adicionar campo medico para OFT/45
      ...(aiCategorizationResult &&
        aiCategorizationResult.category &&
        !["unknown", "desconhecido", "n/a"].includes(
          aiCategorizationResult.category.toLowerCase().trim()
        )
        ? { aiCategorization: aiCategorizationResult }
        : {}),
    };

    if (enviarMsgSecretaria !== undefined) {
      appointmentRecord.enviarMsgSecretaria = enviarMsgSecretaria;
    }

    const idxNode = getIdxNode(firebaseBase); // "unidades" | "medicos"
    const setor = v.local;
    const datePath = formatDateFn(v.dataAgendamento, "yyyy-MM-dd");
    const timePath = v.horario; // HH:mm
    const phone = String(v.telefone);

    // --- CHECK CONFLICT (Server-side safety) ---
    if (checkConflict) {
      const availability = await checkAppointmentAvailabilityAction(firebaseBase, datePath, timePath, setor);
      if (!availability.available) {
        return {
          success: false,
          message: availability.message || "Horário indisponível.",
        };
      }
    }

    const pathBase = `/${firebaseBase}/agendamentoWhatsApp/operacional`;
    const agBase = `${pathBase}/consultasAgendadas`;

    const updates: Record<string, any> = {};

    // raiz por setor (organizado por data/hora)
    updates[`${agBase}/${idxNode}/${setor}/${datePath}/${timePath}`] = {
      ...appointmentRecord,
      obs: [v.observacoes || ""],
    };

    // por telefone (organizado por data/hora)
    updates[`${agBase}/telefones/${phone}/${datePath}/${timePath}`] = {
      ...appointmentRecord,
      obs: [v.observacoes || ""],
    };

    console.log("FIREBASE_SAVE_PATHS:", updates);

    await update(ref(database), updates);

    return {
      success: true,
      message: "Agendamento salvo com sucesso em ambas as localidades!",
      appointmentPath: `${agBase}/${idxNode}/${setor}/${datePath}/${timePath}`,
      phoneAppointmentPath: `${agBase}/telefones/${phone}/${datePath}/${timePath}`,
    };
  } catch (error) {
    console.error("Error saving appointment:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return { success: false, message: `Erro ao salvar agendamento: ${msg}` };
  }
}

/* =============================================================
   CANCEL: move para consultasCanceladas e remove de agendadas
   (telefone + unidades/medicos), com update atômico
   ============================================================= */
export async function cancelAppointment(
  firebaseBase: string,
  {
    telefone,
    unidade,
    data,
    hora,
    appointmentData,
    cancelReason,
    enviarMsgSecretaria,
  }: CancelAppointmentParams
): Promise<CancelAppointmentResult> {
  try {
    const idxNode = getIdxNode(firebaseBase); // "unidades" | "medicos"
    const phone = String(telefone);
    const setor = unidade; // DRM: unidade | OFT: médico (id/nome)
    const id = buildId(setor, data, hora);

    const pathBase = `/${firebaseBase}/agendamentoWhatsApp/operacional`;
    const agBase = `${pathBase}/consultasAgendadas`;
    const cancelBase = `${pathBase}/consultasCanceladas`;

    // Objeto defensivo: garante que nenhum campo salvo seja `undefined`
    const record = appointmentData as any;
    const medicoInfo = isDRMBase(firebaseBase)
      ? {}
      : { medico: record.medico ?? record.unidade ?? setor };

    const dataToSave = {
      // Campos essenciais do agendamento original com valores padrão
      nomePaciente: record.nomePaciente ?? "Não informado",
      nascimento: record.nascimento ?? "Não informado",
      dataAgendamento: record.dataAgendamento ?? data,
      horaAgendamento: record.horaAgendamento ?? hora,
      convenio: record.convenio ?? "Particular",
      exames: record.exames ?? "Não informado",
      unidade: record.unidade ?? setor,
      telefone: record.telefone ?? phone,

      // Campos opcionais, garantindo que não sejam undefined
      motivacao: record.motivacao ?? "",
      Observacoes: record.Observacoes ?? null,
      obs: record.obs ?? null,
      aiCategorization: record.aiCategorization ?? null,

      ...medicoInfo, // Adiciona o campo 'medico' se for OFT

      // Novos campos do cancelamento
      id,
      motivoCancelamento: cancelReason || "Consulta cancelada",
      enviarMsgSecretaria: enviarMsgSecretaria,
    };

    const updates: Record<string, any> = {};

    // ⚠️ NÃO criar raiz por ID em canceladas (removido):
    // updates[`${cancelBase}/${id}`] = dataToSave;

    // 1) índices de canceladas: telefones e unidades/medicos
    updates[`${cancelBase}/telefones/${phone}/${data}/${hora}`] = dataToSave;
    updates[`${cancelBase}/${idxNode}/${setor}/${data}/${hora}`] = dataToSave; // <- "medicos" no OFT, "unidades" no DRM

    // 2) remove de agendadas (telefones e unidades|medicos)
    updates[`${agBase}/telefones/${phone}/${data}/${hora}`] = null;
    updates[`${agBase}/${idxNode}/${setor}/${data}/${hora}`] = null;

    await update(ref(database), updates);

    return {
      success: true,
      message: "Agendamento cancelado com sucesso!",
      cancelledAppointmentPath: `${cancelBase}/${idxNode}/${setor}/${data}/${hora}`,
      cancelledPhoneAppointmentPath: `${cancelBase}/telefones/${phone}/${data}/${hora}`,
    };
  } catch (error) {
    console.error("Error cancelling appointment:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return { success: false, message: `Erro ao cancelar agendamento: ${msg}` };
  }
}


