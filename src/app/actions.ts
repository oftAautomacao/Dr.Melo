"use server";

import { whatsappService } from "@/lib/whatsapp-service";
import { revalidatePath } from "next/cache";
import { ref, update, get } from "firebase/database";
import { getDatabaseInstance } from "@/lib/firebase";
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
   SAVE: grava em consultasAgendadas (por setor e por telefone)
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
    const precos: Record<string, string> = {};
    if (v.exames && v.exames.length > 0) {
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
    const updates: Record<string, any> = {};

    updates[`${agBase}/${idxNode}/${setor}/${datePath}/${timePath}`] = {
      ...appointmentRecord,
      obs: [v.observacoes || ""],
      ...(Object.keys(precos).length > 0 ? { precos } : {}),
    };

    updates[`${agBase}/telefones/${phone}/${datePath}/${timePath}`] = {
      ...appointmentRecord,
      obs: [v.observacoes || ""],
      ...(Object.keys(precos).length > 0 ? { precos } : {}),
    };

    const dbInstance = getDatabaseInstance(environment);
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

IMPORTANTE: esse agendamento está sujeito a alterações não previstas e a erros da assistente virtual. Recomendamos que entre em contato com a unidade até 24 horas antes para confirmar se está tudo certo com o horário agendado, com seu plano de saúde e com os procedimentos a serem realizados.

Se gostou, SALVE nosso contato e COMPARTILHE com um amigo que precisa de um oftalmologista.`;

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
      // Opcional: tentar buscar por telefone se por setor falhar, ou apenas lançar erro
      // Vamos lançar erro para o usuário saber que falhou
      // Mas antes, verifique telefone
      const phoneCheckPath = `${agBase}/telefones/${phone}/${data}/${hora}`;
      const phoneSnapshot = await get(ref(dbInstance, phoneCheckPath));

      if (!phoneSnapshot.exists()) {
        throw new Error(`Agendamento não encontrado no banco de dados. Caminho: ${checkPath}`);
      } else {
        console.warn(`CANCEL_WARN: Found by phone but not by sector/unit? Mismatch? Path: ${phoneCheckPath}`);
      }
    }
    // -------------------------------------

    // 1) índices de canceladas: telefones e unidades/medicos
    updates[`${cancelBase}/telefones/${phone}/${data}/${hora}`] = dataToSave;
    updates[`${cancelBase}/${idxNode}/${setor}/${data}/${hora}`] = dataToSave; // <- "medicos" no OFT, "unidades" no DRM

    // 2) remove de agendadas (telefones e unidades|medicos)
    updates[`${agBase}/telefones/${phone}/${data}/${hora}`] = null;
    updates[`${agBase}/${idxNode}/${setor}/${data}/${hora}`] = null;

    console.log("CANCEL_DEBUG: updates object:", JSON.stringify(updates, null, 2));

    await update(ref(dbInstance), updates);

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


interface RestoreAppointmentResult {
  success: boolean;
  message: string;
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
    updates[`${agBase}/telefones/${phone}/${data}/${hora}`] = appointmentRecord;
    updates[`${agBase}/${idxNode}/${setor}/${data}/${hora}`] = appointmentRecord;

    // Remover de consultasCanceladas
    updates[`${cancelBase}/telefones/${phone}/${data}/${hora}`] = null;
    updates[`${cancelBase}/${idxNode}/${setor}/${data}/${hora}`] = null;

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

