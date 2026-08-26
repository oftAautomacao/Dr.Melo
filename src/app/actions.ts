"use server";

import { whatsappService } from "@/lib/whatsapp-service";
import { revalidatePath } from "next/cache";
import { ref, update, get, query, orderByKey, startAt, limitToFirst } from "firebase/database";
import { getDatabaseInstance } from "@/lib/firebase";
import { getPhoneVariants, normalizePatientOrigin } from "@/lib/patient-origin";
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

/**
 * Helper para formatar a data por extenso (ex: 09/mar (2a feira))
 */
function formatLongDate(date: Date): string {
  const days = ["domingo", "2a feira", "3a feira", "4a feira", "5a feira", "6a feira", "sábado"];
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  const dayName = days[date.getDay()];
  const dayOfMonth = date.getDate().toString().padStart(2, '0');
  const monthName = months[date.getMonth()];

  return `${dayOfMonth}/${monthName} (${dayName})`;
}

/* =============================================================
   CHECK AVAILABILITY: verifica se já existe agendamento
   ============================================================= */
export async function checkAppointmentAvailabilityAction(
  firebaseBase: string,
  date: string,   // yyyy-MM-dd
  time: string,   // HH:mm
  unitOrMedic: string,
  environment: "teste" | "producao" // NEW PARAM
): Promise<{ available: boolean; message?: string }> {
  try {
    const idxNode = getIdxNode(firebaseBase); // "unidades" | "medicos"
    // Caminho: /<base>/agendamentoWhatsApp/operacional/consultasAgendadas/<medicos|unidades>/<nome>/<data>/<hora>
    const path = `/${firebaseBase}/agendamentoWhatsApp/operacional/consultasAgendadas/${idxNode}/${unitOrMedic}/${date}/${time}`;

    console.log("CHECK_AVAILABILITY path:", path, "ENV:", environment);
    const dbInstance = getDatabaseInstance(environment);
    const snapshot = await get(ref(dbInstance, path));

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
   SAVE: grava em consultasAgendadas (por setor) e em conversas
   ============================================================= */

export async function saveAppointmentAction(
  firebaseBase: string,
  formData: PatientFormData,
  environment: "teste" | "producao",
  aiCategorizationResult?: AICategorization,
  enviarMsgSecretaria?: boolean,
  enviarMsgPaciente?: boolean,
  checkConflict: boolean = true
): Promise<SaveAppointmentResult> {
  console.log("SAVE_ACTION - firebaseBase:", firebaseBase);
  console.log("SAVE_ACTION - formData:", formData);
  console.log("SAVE_ACTION - ENVIRONMENT:", environment);

  try {
    const validation = PatientFormSchema.safeParse(formData);
    if (!validation.success) {
      return {
        success: false,
        message: "Dados inválidos: " + validation.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
      };
    }

    const v = validation.data;

    // Determinar o valor correto para o campo 'unidade' nos dados a serem salvos
    const unidadeParaCampo = firebaseBase === 'OFT/45' ? "OftalmoDayTijuca" : v.local;
    const normalizedOrigin = normalizePatientOrigin(v.origem);

    // Monta o registro no formato usado
    const appointmentRecord: Partial<AppointmentFirebaseRecord & { medico?: string }> = {
      nomePaciente: v.nomePaciente,
      ...(v.cpf ? { cpf: v.cpf } : {}),
      nascimento: formatDateFn(v.dataNascimento, "dd/MM/yyyy"),
      dataAgendamento: formatDateFn(v.dataAgendamento, "dd/MM/yyyy"),
      horaAgendamento: v.horario,
      convenio: v.convenio,
      exames: v.exames,
      motivacao: v.motivacao,
      unidade: unidadeParaCampo,
      telefone: v.telefone,
      origem: normalizedOrigin,
      ...(firebaseBase === 'OFT/45' ? { medico: v.local } : {}),
      ...(aiCategorizationResult && aiCategorizationResult.category && !["unknown", "desconhecido", "n/a"].includes(aiCategorizationResult.category.toLowerCase().trim())
        ? { aiCategorization: aiCategorizationResult }
        : {}),
      Observacoes: v.observacoes ?? "",
    };

    if (enviarMsgSecretaria !== undefined) {
      appointmentRecord.enviarMsgSecretaria = enviarMsgSecretaria;
    }

    const idxNode = getIdxNode(firebaseBase);
    const setor = v.local;
    const datePath = formatDateFn(v.dataAgendamento, "yyyy-MM-dd");
    const timePath = v.horario;
    const phone = String(v.telefone);

    // --- CHECK CONFLICT ---
    if (checkConflict) {
      const availability = await checkAppointmentAvailabilityAction(firebaseBase, datePath, timePath, setor, environment);
      if (!availability.available) {
        return { success: false, message: availability.message || "Horário indisponível." };
      }
    }

    // --- BUSCAR PREÇOS ---
    const isParticularForPrecos = v.convenio?.trim().toLowerCase() === "particular";
    const precos: Record<string, string> = {};
    if (isParticularForPrecos && v.exames && v.exames.length > 0) {
      try {
        const examesConfigPath = `/${firebaseBase}/agendamentoWhatsApp/configuracoes/exames`;
        const dbInstance = getDatabaseInstance(environment);
        const examesSnap = await get(ref(dbInstance, examesConfigPath));
        const examesData = examesSnap.val();

        if (examesData && typeof examesData === "object") {
          for (const exameId of v.exames) {
            const exameInfo = examesData[exameId];
            if (exameInfo && exameInfo.preco !== undefined) {
              const precoRaw = exameInfo.preco;
              if (typeof precoRaw === "number") {
                precos[exameId] = `R$ ${precoRaw.toFixed(2).replace(".", ",")}`;
              } else if (typeof precoRaw === "string") {
                const cleaned = precoRaw.replace(/[^\d.,]/g, "").replace(",", ".");
                const val = Number(cleaned);
                if (!isNaN(val)) {
                  precos[exameId] = `R$ ${val.toFixed(2).replace(".", ",")}`;
                } else {
                  precos[exameId] = precoRaw;
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("SAVE_ACTION: Não foi possível buscar preços dos exames:", err);
      }
    }

    const pathBase = `/${firebaseBase}/agendamentoWhatsApp/operacional`;
    const agBase = `${pathBase}/consultasAgendadas`;
    const convBase = `${pathBase}/conversas`;
    const dbInstance = getDatabaseInstance(environment);
    const updates: Record<string, any> = {};

    const appointmentDataToSave = {
      ...appointmentRecord,
      obs: [v.observacoes || ""],
      ...(Object.keys(precos).length > 0 ? { precos } : {}),
    };

    updates[`${agBase}/${idxNode}/${setor}/${datePath}/${timePath}`] = appointmentDataToSave;

    // --- TERCEIRO LOCAL (CONVERSAS) - APENAS DRM ---
    if (isDRMBase(firebaseBase)) {
      const cleanPhone = phone.replace(/\D/g, "");
      updates[`${convBase}/${cleanPhone}/consultasAgendadas/${datePath}/${timePath}`] = appointmentDataToSave;
      updates[`${convBase}/${cleanPhone}/origem`] = normalizedOrigin;

      for (const variant of getPhoneVariants(cleanPhone)) {
        if (variant === cleanPhone) continue;

        const variantSnap = await get(ref(dbInstance, `${convBase}/${variant}`));
        if (variantSnap.exists()) {
          updates[`${convBase}/${variant}/origem`] = normalizedOrigin;
        }
      }
    }

    await update(ref(dbInstance), updates);

    // --- DISPARAR WHATSAPP PARA O PACIENTE ---
    if (enviarMsgPaciente) {
      // 1. Buscar dados da Unidade
      let endereco = "Endereço não informado";
      let telefoneUnidade = "Telefone não informado";
      let nomeUnidadeAmigavel = unidadeParaCampo;

      try {
        const unidadeConfigPath = `/${firebaseBase}/agendamentoWhatsApp/configuracoes/unidades/${v.local}`;
        const unidadeSnap = await get(ref(dbInstance, unidadeConfigPath));
        const unidadeData = unidadeSnap.val();
        if (unidadeData) {
          endereco = unidadeData.endereco || endereco;
          telefoneUnidade = unidadeData.telefoneUnidade || telefoneUnidade;
          nomeUnidadeAmigavel = unidadeData.unidade || nomeUnidadeAmigavel;
        }
      } catch (err) {
        console.warn("SAVE_ACTION: Erro ao buscar dados da unidade:", err);
      }

      // 2. Calcular Valor (Somente Particular)
      let valorString = "";
      const isParticular = v.convenio.toLowerCase().includes("particular");

      if (isParticular) {
        let total = 0;
        let consultaPrice = 0;
        let hasIncluso = false;
        let consultaExameId = "";
        const listaExamesPrecos: string[] = [];

        // Tenta achar o preço base da "consulta"
        try {
          const examesConfigPath = `/${firebaseBase}/agendamentoWhatsApp/configuracoes/exames`;
          const examesSnap = await get(ref(dbInstance, examesConfigPath));
          const examesData = examesSnap.val();

          if (examesData) {
            // Acha o ID do exame "consulta" (ou similar)
            consultaExameId = Object.keys(examesData).find(id =>
              id.toLowerCase() === "consulta" ||
              examesData[id].nome?.toLowerCase() === "consulta"
            ) || "";

            if (consultaExameId) {
              const p = examesData[consultaExameId].preco;
              if (typeof p === "number") {
                consultaPrice = p;
              } else if (typeof p === "string") {
                const parsed = Number(p.replace(/[^\d.,]/g, "").replace(",", "."));
                if (!isNaN(parsed)) consultaPrice = parsed;
              }
            }

            let consultaJaSomadaNoIndividual = false;

            for (const id of v.exames) {
              const info = examesData[id];
              if (!info) continue;

              const nomeExame = info.nome || id;
              let exPrecoStr = "";

              const precoRaw = info.preco;
              let precoNum = 0;
              let isNumeric = false;

              if (typeof precoRaw === "number") {
                precoNum = precoRaw;
                isNumeric = true;
              } else if (typeof precoRaw === "string") {
                const cleaned = precoRaw.replace(/[^\d.,]/g, "").replace(",", ".");
                const val = Number(cleaned);
                if (!isNaN(val)) {
                  precoNum = val;
                  isNumeric = true;
                }
              }

              if (isNumeric) {
                total += precoNum;
                exPrecoStr = `R$ ${precoNum.toFixed(2).replace(".", ",")}`;
                if (id === consultaExameId) consultaJaSomadaNoIndividual = true;
              } else if (String(precoRaw).toLowerCase().includes("incluso na consulta")) {
                hasIncluso = true;
                exPrecoStr = "Incluso";
              } else {
                exPrecoStr = String(precoRaw);
              }

              listaExamesPrecos.push(`   - ${nomeExame} - ${exPrecoStr}`);
            }

            // Se tem "incluso" mas a "consulta" não estava na lista individual, somamos o preço base
            if (hasIncluso && !consultaJaSomadaNoIndividual) {
              total += consultaPrice;
            }
          }
        } catch (err) {
          console.warn("SAVE_ACTION: Erro ao calcular preços para WhatsApp:", err);
        }

        const listaFormatada = listaExamesPrecos.length > 0
          ? `\n- *Exames:*\n${listaExamesPrecos.join("\n")}`
          : "";

        valorString = `${listaFormatada}\n- *Valor:* R$ ${total.toFixed(2).replace(".", ",")}`;
      }

      const message = `Seu agendamento foi realizado com sucesso! Aqui estão os detalhes:

- *Nome:* ${v.nomePaciente}
- *Data de Nascimento:* ${formatDateFn(v.dataNascimento, "dd/MM/yyyy")}
- *Unidade:* ${nomeUnidadeAmigavel}
- *Data:* ${formatLongDate(v.dataAgendamento)}
- *Horário:* ${v.horario}
- *Endereço:* ${endereco}
- *Telefone:* ${telefoneUnidade}${valorString}

*A UNIDADE ENTRARÁ EM CONTATO COM VOCÊ:* esse agendamento está sujeito a alterações não previstas e a erros da assistente virtual. A unidade entrará em contato para garantir que está tudo certo com o seu agendamento ou para realizar alguma alteração/cancelamento.

Se gostou, *SALVE* nosso contato e *COMPARTILHE* com um amigo que precisa de um oftalmologista.`;

      await whatsappService.sendMessage(
        { phone: v.telefone, message },
        firebaseBase as "DRM" | "OFT/45",
        environment
      );
    }

    return {
      success: true,
      message: "Agendamento salvo com sucesso!",
      appointmentPath: `${agBase}/${idxNode}/${setor}/${datePath}/${timePath}`,
    };
  } catch (error) {
    console.error("Error saving appointment:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return { success: false, message: `Erro ao salvar agendamento: ${msg}` };
  }
}

/* =============================================================
   CANCEL: move para consultasCanceladas e remove de agendadas
   (unidades/medicos + conversas), com update atômico
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
  }: CancelAppointmentParams,
  environment: "teste" | "producao" // NEW PARAM
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
      cpf: record.cpf ?? null, // Adicionado para preservar o CPF
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

    // --- CHECK EXISTENCE for Debugging ---
    const checkPath = `${agBase}/${idxNode}/${setor}/${data}/${hora}`;
    const dbInstance = getDatabaseInstance(environment);
    const snapshot = await get(ref(dbInstance, checkPath));
    if (!snapshot.exists()) {
      console.warn(`CANCEL_FAIL: Appointment not found at ${checkPath}`);
      throw new Error(`Agendamento não encontrado no banco de dados. Caminho: ${checkPath}`);
    }
    // -------------------------------------

    // 1) índice de canceladas: unidades/medicos
    updates[`${cancelBase}/${idxNode}/${setor}/${data}/${hora}`] = dataToSave; // <- "medicos" no OFT, "unidades" no DRM

    // 2) remove de agendadas (unidades|medicos)
    updates[`${agBase}/${idxNode}/${setor}/${data}/${hora}`] = null;

    // 3) TERCEIRO LOCAL (CONVERSAS) - APENAS DRM
    if (isDRMBase(firebaseBase)) {
      const convBase = `${pathBase}/conversas`;
      const cleanPhone = phone.replace(/\D/g, "");
      // Move de 'agendadas' para 'canceladas' dentro do nó de conversas
      updates[`${convBase}/${cleanPhone}/consultasAgendadas/${data}/${hora}`] = null;
      updates[`${convBase}/${cleanPhone}/consultasCanceladas/${data}/${hora}`] = dataToSave;
    }

    console.log("CANCEL_DEBUG: updates object:", JSON.stringify(updates, null, 2));

    await update(ref(dbInstance), updates);

    return {
      success: true,
      message: "Agendamento cancelado com sucesso!",
      cancelledAppointmentPath: `${cancelBase}/${idxNode}/${setor}/${data}/${hora}`,
    };
  } catch (error) {
    console.error("Error cancelling appointment:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return { success: false, message: `Erro ao cancelar agendamento: ${msg}` };
  }
}


interface RestoreAppointmentResult {
  success: boolean;
  message: string;
}

interface RemoveCancelledAppointmentAfterRestoreInput {
  telefone: string;
  unidade: string;
  dataAgendamento: string;
  horario: string;
}

export async function restoreAppointment(
  firebaseBase: string,
  appointmentData: AppointmentFirebaseRecord,
  environment: "teste" | "producao", // NEW PARAM
  enviarMsgSecretaria?: boolean
): Promise<RestoreAppointmentResult> {
  try {
    const { telefone, unidade, dataAgendamento, horaAgendamento } = appointmentData;

    if (!telefone || !unidade || !dataAgendamento || !horaAgendamento) {
      return {
        success: false,
        message: "Dados incompletos para restaurar o agendamento.",
      };
    }

    const phone = telefone.replace(/\D/g, "");
    const data = dataAgendamento;
    const hora = horaAgendamento;
    const setor = unidade;

    const idxNode = getIdxNode(firebaseBase);
    const agBase = `${firebaseBase}/agendamentoWhatsApp/operacional/consultasAgendadas`;
    const cancelBase = `${firebaseBase}/agendamentoWhatsApp/operacional/consultasCanceladas`;

    // Verificar se o horário já está ocupado
    const checkPath = `${agBase}/${idxNode}/${setor}/${data}/${hora}`;
    const dbInstance = getDatabaseInstance(environment);
    const snapshot = await get(ref(dbInstance, checkPath));

    if (snapshot.exists()) {
      return {
        success: false,
        message: "Este horário já está ocupado. Não é possível restaurar.",
      };
    }

    // Preparar dados para restauração
    const appointmentRecord: AppointmentFirebaseRecord = {
      ...appointmentData,
      telefone: phone,
      enviarMsgSecretaria: enviarMsgSecretaria,
    };

    const updates: Record<string, any> = {};

    // Adicionar de volta em consultasAgendadas
    updates[`${agBase}/${idxNode}/${setor}/${data}/${hora}`] = appointmentRecord;

    // Remover de consultasCanceladas
    updates[`${cancelBase}/${idxNode}/${setor}/${data}/${hora}`] = null;

    // TERCEIRO LOCAL (CONVERSAS) - APENAS DRM
    if (isDRMBase(firebaseBase)) {
      const convBase = `${firebaseBase}/agendamentoWhatsApp/operacional/conversas`;
      const cleanPhone = phone.replace(/\D/g, "");
      // Restaura em 'agendadas' e remove de 'canceladas' dentro do nó de conversas
      updates[`${convBase}/${cleanPhone}/consultasAgendadas/${data}/${hora}`] = appointmentRecord;
      updates[`${convBase}/${cleanPhone}/consultasCanceladas/${data}/${hora}`] = null;
    }

    await update(ref(dbInstance), updates);

    return {
      success: true,
      message: "Agendamento restaurado com sucesso!",
    };
  } catch (error) {
    console.error("Error restoring appointment:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return { success: false, message: `Erro ao restaurar agendamento: ${msg}` };
  }
}

export async function removeCancelledAppointmentAfterRestore(
  firebaseBase: string,
  appointmentData: RemoveCancelledAppointmentAfterRestoreInput,
  environment: "teste" | "producao"
): Promise<RestoreAppointmentResult> {
  try {
    const { telefone, unidade, dataAgendamento, horario } = appointmentData;

    if (!telefone || !unidade || !dataAgendamento || !horario) {
      return {
        success: false,
        message: "Dados incompletos para finalizar a restauracao.",
      };
    }

    const idxNode = getIdxNode(firebaseBase);
    const cancelBase = `${firebaseBase}/agendamentoWhatsApp/operacional/consultasCanceladas`;
    const convBase = `${firebaseBase}/agendamentoWhatsApp/operacional/conversas`;
    const phone = telefone.replace(/\D/g, "");
    const dbInstance = getDatabaseInstance(environment);
    const updates: Record<string, any> = {};

    updates[`${cancelBase}/${idxNode}/${unidade}/${dataAgendamento}/${horario}`] = null;

    if (isDRMBase(firebaseBase)) {
      updates[`${convBase}/${phone}/consultasCanceladas/${dataAgendamento}/${horario}`] = null;
    }

    await update(ref(dbInstance), updates);

    return {
      success: true,
      message: "Cancelamento antigo removido com sucesso.",
    };
  } catch (error) {
    console.error("Error removing cancelled appointment after restore:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return {
      success: false,
      message: `Erro ao remover cancelamento antigo: ${msg}`,
    };
  }
}

export async function getConversasOriginsAction(
  firebaseBase: string,
  environment: "teste" | "producao"
): Promise<Record<string, string>> {
  try {
    const dbInstance = getDatabaseInstance(environment);
    const path = `/${firebaseBase}/agendamentoWhatsApp/operacional/conversas`;
    const snap = await get(ref(dbInstance, path));
    if (!snap.exists()) return {};
    
    const val = snap.val();
    const result: Record<string, string> = {};
    for (const phone in val) {
      if (val[phone] && val[phone].origem) {
        result[phone] = val[phone].origem;
      }
    }
    return result;
  } catch (e) {
    console.error("Erro ao carregar origens das conversas:", e);
    throw e;
  }
}

export interface ConversasOriginPreviewItem {
  phone: string;
  origem: string;
}

export interface ConversasOriginsPreviewResult {
  items: ConversasOriginPreviewItem[];
  nextCursor: string | null;
  done: boolean;
  scannedCount: number;
}

export interface PhoneAppointmentsCopyPreviewItem {
  phone: string;
  appointmentsCount: number;
}

export interface PhoneAppointmentsCopyPreviewResult {
  items: PhoneAppointmentsCopyPreviewItem[];
  nextCursor: string | null;
  done: boolean;
  scannedCount: number;
}

export interface ConversasLegacyCleanupPreviewItem {
  phone: string;
  hasPacientesAgendados: boolean;
  hasPacientesCancelados: boolean;
}

export interface ConversasLegacyCleanupPreviewResult {
  items: ConversasLegacyCleanupPreviewItem[];
  nextCursor: string | null;
  done: boolean;
  scannedCount: number;
}

export interface UnitOrphanOriginPreviewItem {
  target: OriginSyncTarget;
  unidade: string;
  date: string;
  time: string;
  origem: string;
}

export interface UnitOrphanOriginPreviewResult {
  items: UnitOrphanOriginPreviewItem[];
  nextCursor: string | null;
  done: boolean;
  scannedCount: number;
}

export async function getConversasOriginsPreviewAction(
  firebaseBase: string,
  environment: "teste" | "producao",
  requestedSize: number,
  cursor: string | null
): Promise<ConversasOriginsPreviewResult> {
  try {
    const dbInstance = getDatabaseInstance(environment);
    const path = `/${firebaseBase}/agendamentoWhatsApp/operacional/conversas`;
    const batchSize = Math.max(1, Math.min(requestedSize, 1000));
    const scanChunkSize = Math.max(batchSize * 4, 100);
    const items: ConversasOriginPreviewItem[] = [];
    let scannedCount = 0;
    let nextCursor = cursor;
    let done = false;

    while (items.length < batchSize && !done) {
      const currentQuery = nextCursor
        ? query(ref(dbInstance, path), orderByKey(), startAt(nextCursor), limitToFirst(scanChunkSize + 1))
        : query(ref(dbInstance, path), orderByKey(), limitToFirst(scanChunkSize));

      const snap = await get(currentQuery);
      if (!snap.exists()) {
        return { items, nextCursor: null, done: true, scannedCount };
      }

      const rawEntries = Object.entries(snap.val() as Record<string, any>);
      const entries =
        nextCursor && rawEntries.length > 0 && rawEntries[0][0] === nextCursor
          ? rawEntries.slice(1)
          : rawEntries;

      if (entries.length === 0) {
        done = true;
        break;
      }

      let lastVisitedKey: string | null = null;
      for (const [phone, data] of entries) {
        scannedCount++;
        lastVisitedKey = phone;

        if (data && typeof data === "object" && typeof data.origem === "string" && data.origem.trim() !== "") {
          items.push({ phone, origem: data.origem });
        }

        if (items.length >= batchSize) {
          nextCursor = lastVisitedKey;
          break;
        }
      }

      if (items.length >= batchSize) {
        done = false;
        break;
      }

      if (entries.length < scanChunkSize) {
        nextCursor = null;
        done = true;
        break;
      }

      nextCursor = lastVisitedKey;
      if (!nextCursor) {
        done = true;
      }
    }

    return {
      items,
      nextCursor: done ? null : nextCursor,
      done,
      scannedCount,
    };
  } catch (e) {
    console.error("Erro ao carregar previa de origens das conversas:", e);
    throw e;
  }
}

export interface MigrationResult {
  phone: string;
  origem: string;
  appointmentsUpdated: number;
  success: boolean;
  error?: string;
}

export type OriginSyncTarget = "consultasAgendadas" | "consultasCanceladas";

export interface PhoneAppointmentsCopyResult {
  phone: string;
  appointmentsCopied: number;
  success: boolean;
  error?: string;
}

export interface ConversasLegacyCleanupResult {
  phone: string;
  nodesRemoved: number;
  success: boolean;
  error?: string;
}

export interface UnitOrphanOriginCleanupResult {
  target: OriginSyncTarget;
  unidade: string;
  date: string;
  time: string;
  nodesRemoved: number;
  success: boolean;
  error?: string;
}

export async function getPhoneAppointmentsCopyPreviewAction(
  firebaseBase: string,
  environment: "teste" | "producao",
  requestedSize: number,
  cursor: string | null,
  target: OriginSyncTarget = "consultasAgendadas"
): Promise<PhoneAppointmentsCopyPreviewResult> {
  try {
    const dbInstance = getDatabaseInstance(environment);
    const path = `/${firebaseBase}/agendamentoWhatsApp/operacional/${target}/telefones`;
    const batchSize = Math.max(1, Math.min(requestedSize, 1000));
    const scanChunkSize = Math.max(batchSize * 4, 100);
    const items: PhoneAppointmentsCopyPreviewItem[] = [];
    let scannedCount = 0;
    let nextCursor = cursor;
    let done = false;

    while (items.length < batchSize && !done) {
      const currentQuery = nextCursor
        ? query(ref(dbInstance, path), orderByKey(), startAt(nextCursor), limitToFirst(scanChunkSize + 1))
        : query(ref(dbInstance, path), orderByKey(), limitToFirst(scanChunkSize));

      const snap = await get(currentQuery);
      if (!snap.exists()) {
        return { items, nextCursor: null, done: true, scannedCount };
      }

      const rawEntries = Object.entries(snap.val() as Record<string, any>);
      const entries =
        nextCursor && rawEntries.length > 0 && rawEntries[0][0] === nextCursor
          ? rawEntries.slice(1)
          : rawEntries;

      if (entries.length === 0) {
        done = true;
        break;
      }

      let lastVisitedKey: string | null = null;
      for (const [phone, data] of entries) {
        scannedCount++;
        lastVisitedKey = phone;

        if (data && typeof data === "object") {
          let appointmentsCount = 0;

          for (const times of Object.values(data as Record<string, any>)) {
            if (!times || typeof times !== "object") continue;
            appointmentsCount += Object.keys(times).length;
          }

          if (appointmentsCount > 0) {
            items.push({ phone, appointmentsCount });
          }
        }

        if (items.length >= batchSize) {
          nextCursor = lastVisitedKey;
          break;
        }
      }

      if (items.length >= batchSize) {
        done = false;
        break;
      }

      if (entries.length < scanChunkSize) {
        nextCursor = null;
        done = true;
        break;
      }

      nextCursor = lastVisitedKey;
      if (!nextCursor) {
        done = true;
      }
    }

    return {
      items,
      nextCursor: done ? null : nextCursor,
      done,
      scannedCount,
    };
  } catch (e) {
    console.error("Erro ao carregar previa da copia de telefones:", e);
    throw e;
  }
}

export async function getConversasLegacyCleanupPreviewAction(
  firebaseBase: string,
  environment: "teste" | "producao",
  requestedSize: number,
  cursor: string | null
): Promise<ConversasLegacyCleanupPreviewResult> {
  try {
    const dbInstance = getDatabaseInstance(environment);
    const path = `/${firebaseBase}/agendamentoWhatsApp/operacional/conversas`;
    const batchSize = Math.max(1, Math.min(requestedSize, 1000));
    const scanChunkSize = Math.max(batchSize * 4, 100);
    const items: ConversasLegacyCleanupPreviewItem[] = [];
    let scannedCount = 0;
    let nextCursor = cursor;
    let done = false;

    while (items.length < batchSize && !done) {
      const currentQuery = nextCursor
        ? query(ref(dbInstance, path), orderByKey(), startAt(nextCursor), limitToFirst(scanChunkSize + 1))
        : query(ref(dbInstance, path), orderByKey(), limitToFirst(scanChunkSize));

      const snap = await get(currentQuery);
      if (!snap.exists()) {
        return { items, nextCursor: null, done: true, scannedCount };
      }

      const rawEntries = Object.entries(snap.val() as Record<string, any>);
      const entries =
        nextCursor && rawEntries.length > 0 && rawEntries[0][0] === nextCursor
          ? rawEntries.slice(1)
          : rawEntries;

      if (entries.length === 0) {
        done = true;
        break;
      }

      let lastVisitedKey: string | null = null;
      for (const [phone, data] of entries) {
        scannedCount++;
        lastVisitedKey = phone;

        const hasPacientesAgendados = !!(data && typeof data === "object" && data.pacientesAgendados);
        const hasPacientesCancelados = !!(data && typeof data === "object" && data.pacientesCancelados);

        if (hasPacientesAgendados || hasPacientesCancelados) {
          items.push({
            phone,
            hasPacientesAgendados,
            hasPacientesCancelados,
          });
        }

        if (items.length >= batchSize) {
          nextCursor = lastVisitedKey;
          break;
        }
      }

      if (items.length >= batchSize) {
        done = false;
        break;
      }

      if (entries.length < scanChunkSize) {
        nextCursor = null;
        done = true;
        break;
      }

      nextCursor = lastVisitedKey;
      if (!nextCursor) {
        done = true;
      }
    }

    return {
      items,
      nextCursor: done ? null : nextCursor,
      done,
      scannedCount,
    };
  } catch (e) {
    console.error("Erro ao carregar previa da limpeza de nos legados:", e);
    throw e;
  }
}

export async function getUnitOrphanOriginPreviewAction(
  firebaseBase: string,
  environment: "teste" | "producao",
  requestedSize: number,
  cursor: string | null,
  target: OriginSyncTarget = "consultasAgendadas"
): Promise<UnitOrphanOriginPreviewResult> {
  try {
    const dbInstance = getDatabaseInstance(environment);
    const path = `/${firebaseBase}/agendamentoWhatsApp/operacional/${target}/unidades`;
    const snap = await get(ref(dbInstance, path));

    if (!snap.exists()) {
      return { items: [], nextCursor: null, done: true, scannedCount: 0 };
    }

    const raw = snap.val() as Record<string, any>;
    const matches: UnitOrphanOriginPreviewItem[] = [];
    let scannedCount = 0;

    for (const unidade of Object.keys(raw).sort()) {
      const dates = raw[unidade];
      if (!dates || typeof dates !== "object") continue;

      for (const date of Object.keys(dates).sort()) {
        if (!/^2026-(06|07|08)-/.test(date)) continue;

        const times = dates[date];
        if (!times || typeof times !== "object") continue;

        for (const time of Object.keys(times).sort()) {
          scannedCount++;
          const appt = times[time];
          if (!appt || typeof appt !== "object") continue;

          const propNames = Object.keys(appt);
          if (propNames.length === 1 && propNames[0] === "origem") {
            matches.push({
              target,
              unidade,
              date,
              time,
              origem: typeof appt.origem === "string" ? appt.origem : "",
            });
          }
        }
      }
    }

    const startIndex = cursor ? Number(cursor) : 0;
    const safeStartIndex = Number.isFinite(startIndex) && startIndex > 0 ? startIndex : 0;
    const batchSize = Math.max(1, Math.min(requestedSize, 1000));
    const items = matches.slice(safeStartIndex, safeStartIndex + batchSize);
    const nextIndex = safeStartIndex + items.length;
    const done = nextIndex >= matches.length;

    return {
      items,
      nextCursor: done ? null : String(nextIndex),
      done,
      scannedCount,
    };
  } catch (e) {
    console.error("Erro ao carregar previa dos nos com apenas origem em unidades:", e);
    throw e;
  }
}

export async function migratePhoneOriginAction(
  firebaseBase: string,
  phone: string,
  origem: string,
  environment: "teste" | "producao",
  target: OriginSyncTarget = "consultasAgendadas"
): Promise<MigrationResult> {
  try {
    const dbInstance = getDatabaseInstance(environment);
    const pathBase = `/${firebaseBase}/agendamentoWhatsApp/operacional`;
    const targetBase = `${pathBase}/${target}`;
    const convBase = `${pathBase}/conversas`;

    // 1. Buscar registros do telefone no espelho de conversas
    const convTargetRef = ref(dbInstance, `${convBase}/${phone}/${target}`);
    const snap = await get(convTargetRef);
    
    if (!snap.exists()) {
      return { phone, origem, appointmentsUpdated: 0, success: true };
    }

    const appointmentsByDate = snap.val();
    const updates: Record<string, any> = {};
    let count = 0;

    for (const date in appointmentsByDate) {
      const times = appointmentsByDate[date];
      for (const time in times) {
        const appt = times[time];
        if (appt && typeof appt === "object") {
          if (appt.origem !== origem) {
            count++;
            
            // 1. Atualizar no indice por unidade/medico
            const idxNode = getIdxNode(firebaseBase); // "unidades" ou "medicos"
            const setor = appt.unidade || appt.medico;
            if (setor) {
              updates[`${targetBase}/${idxNode}/${setor}/${date}/${time}/origem`] = origem;
            }

            // 2. Atualizar no espelho dentro de conversas
            updates[`${convBase}/${phone}/${target}/${date}/${time}/origem`] = origem;
          }
        }
      }
    }

    if (count > 0) {
      await update(ref(dbInstance), updates);
    }

    return { phone, origem, appointmentsUpdated: count, success: true };
  } catch (err: any) {
    console.error(`Erro ao migrar telefone ${phone}:`, err);
    return { phone, origem, appointmentsUpdated: 0, success: false, error: err.message || String(err) };
  }
}

export async function copyPhoneAppointmentsToConversasAction(
  firebaseBase: string,
  phone: string,
  environment: "teste" | "producao",
  target: OriginSyncTarget = "consultasAgendadas"
): Promise<PhoneAppointmentsCopyResult> {
  try {
    const dbInstance = getDatabaseInstance(environment);
    const pathBase = `/${firebaseBase}/agendamentoWhatsApp/operacional`;
    const sourceRef = ref(dbInstance, `${pathBase}/${target}/telefones/${phone}`);
    const convBase = `${pathBase}/conversas`;
    const snap = await get(sourceRef);

    if (!snap.exists()) {
      return { phone, appointmentsCopied: 0, success: true };
    }

    const appointmentsByDate = snap.val() as Record<string, Record<string, any>>;
    const updates: Record<string, any> = {};
    let count = 0;

    for (const [date, times] of Object.entries(appointmentsByDate)) {
      if (!times || typeof times !== "object") continue;

      for (const [time, appt] of Object.entries(times as Record<string, any>)) {
        updates[`${convBase}/${phone}/${target}/${date}/${time}`] = appt;
        count++;
      }
    }

    if (count > 0) {
      await update(ref(dbInstance), updates);
    }

    return { phone, appointmentsCopied: count, success: true };
  } catch (err: any) {
    console.error(`Erro ao copiar consultas do telefone ${phone}:`, err);
    return { phone, appointmentsCopied: 0, success: false, error: err.message || String(err) };
  }
}

export async function cleanupConversasLegacyNodesAction(
  firebaseBase: string,
  phone: string,
  environment: "teste" | "producao"
): Promise<ConversasLegacyCleanupResult> {
  try {
    const dbInstance = getDatabaseInstance(environment);
    const convBase = `/${firebaseBase}/agendamentoWhatsApp/operacional/conversas/${phone}`;
    const snap = await get(ref(dbInstance, convBase));

    if (!snap.exists()) {
      return { phone, nodesRemoved: 0, success: true };
    }

    const data = snap.val() as Record<string, any>;
    const updates: Record<string, any> = {};
    let nodesRemoved = 0;

    if (data && typeof data === "object" && data.pacientesAgendados) {
      updates[`${convBase}/pacientesAgendados`] = null;
      nodesRemoved++;
    }

    if (data && typeof data === "object" && data.pacientesCancelados) {
      updates[`${convBase}/pacientesCancelados`] = null;
      nodesRemoved++;
    }

    if (nodesRemoved > 0) {
      await update(ref(dbInstance), updates);
    }

    return { phone, nodesRemoved, success: true };
  } catch (err: any) {
    console.error(`Erro ao limpar nos legados do telefone ${phone}:`, err);
    return { phone, nodesRemoved: 0, success: false, error: err.message || String(err) };
  }
}

export async function cleanupUnitOrphanOriginAction(
  firebaseBase: string,
  target: OriginSyncTarget,
  unidade: string,
  date: string,
  time: string,
  environment: "teste" | "producao"
): Promise<UnitOrphanOriginCleanupResult> {
  try {
    const dbInstance = getDatabaseInstance(environment);
    const path = `/${firebaseBase}/agendamentoWhatsApp/operacional/${target}/unidades/${unidade}/${date}/${time}`;
    const snap = await get(ref(dbInstance, path));

    if (!snap.exists()) {
      return { target, unidade, date, time, nodesRemoved: 0, success: true };
    }

    const data = snap.val();
    if (!data || typeof data !== "object") {
      return { target, unidade, date, time, nodesRemoved: 0, success: true };
    }

    const propNames = Object.keys(data);
    if (propNames.length !== 1 || propNames[0] !== "origem") {
      return { target, unidade, date, time, nodesRemoved: 0, success: true };
    }

    const updates: Record<string, any> = {};
    updates[path] = null;
    await update(ref(dbInstance), updates);

    return { target, unidade, date, time, nodesRemoved: 1, success: true };
  } catch (err: any) {
    console.error(`Erro ao limpar no com apenas origem em ${target}/${unidade}/${date}/${time}:`, err);
    return {
      target,
      unidade,
      date,
      time,
      nodesRemoved: 0,
      success: false,
      error: err.message || String(err),
    };
  }
}



