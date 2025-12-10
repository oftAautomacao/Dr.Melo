import { z } from 'zod';
import { startOfDay as dateFnsStartOfDay, parse as dateFnsParse, isValid as dateFnsIsValid, format as dateFnsFormat } from 'date-fns';
// Removed checkIsHoliday import as it's not used directly in schema validation anymore.
// Validation for holidays is handled in the component UI.

export const PatientFormSchema = z.object({
  nomePaciente: z.string().min(3, { message: "Nome do paciente deve ter pelo menos 3 caracteres." }),
  dataNascimento: z.coerce.date({
    required_error: "Data de Nascimento é obrigatória.",
    invalid_type_error: "Data de Nascimento inválida. Use o seletor de data.",
  }).transform(date => dateFnsStartOfDay(date)),
  dataAgendamento: z.coerce.date({
    required_error: "Data Agendada é obrigatória.",
    invalid_type_error: "Data Agendada inválida. Use o seletor de data.",
  }).transform(date => dateFnsStartOfDay(date)),
  horario: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: "Horário inválido. Use HH:MM." }),
  convenio: z.string().min(1, { message: "Convênio é obrigatório." }),
  exames: z.array(z.string()).min(1, { message: "Selecione ao menos um exame." }),
  motivacao: z.string().min(1, { message: "Motivação é obrigatória." }),
  local: z.string().min(1, { message: "Local é obrigatório." }),
  telefone: z.string().regex(/^\d{10,15}$/, { message: "Telefone inválido. Deve conter apenas números (10 a 15 dígitos)." }),
  observacoes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.dataNascimento instanceof Date && dateFnsIsValid(data.dataNascimento)) {
    const today = dateFnsStartOfDay(new Date());
    if (data.dataNascimento > today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Data de nascimento não pode ser uma data futura.",
        path: ["dataNascimento"],
      });
    }
    if (data.dataNascimento.getFullYear() < 1900) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ano para Data de Nascimento inválido. Deve ser a partir de 1900.",
        path: ["dataNascimento"],
      });
    }
  }

  if (data.dataAgendamento instanceof Date && dateFnsIsValid(data.dataAgendamento)) {
    const today = dateFnsStartOfDay(new Date());
    // This avoids the error "Cannot read properties of undefined (reading 'find')"
    // because the Zod schema doesn't have access to the dynamically fetched holidays list.
  }

  if (data.dataNascimento instanceof Date && dateFnsIsValid(data.dataNascimento) &&
    data.dataAgendamento instanceof Date && dateFnsIsValid(data.dataAgendamento)) {
    if (data.dataAgendamento < data.dataNascimento) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Data agendada não pode ser anterior à data de nascimento.",
        path: ["dataAgendamento"],
      });
    }
  }
});


export type PatientFormData = z.infer<typeof PatientFormSchema>;

export interface AICategorization {
  category: string;
  reason: string;
}

export interface AppointmentFirebaseRecord {
  nomePaciente: string;
  nascimento: string;
  dataAgendamento: string;
  horaAgendamento: string;
  convenio: string;
  exames: string[];
  motivacao: string;
  unidade: string;
  telefone: string;
  Observacoes?: string;
  aiCategorization?: AICategorization;
  bairro?: string;
  enviarMsgSecretaria?: boolean;
}

export interface PatientData extends Omit<PatientFormData, 'dataNascimento' | 'dataAgendamento' | 'exames' | 'observacoes' | 'local' | 'horario'> {
  id: string;
  nomePaciente: string;
  dataNascimento: string;
  dataAgendamento: string;
  horario: string;
  convenio: string;
  exames: string[];
  motivacao: string;
  unidade: string;
  telefone: string;
  Observacoes?: string;
  aiCategorization?: AICategorization;
  bairro?: string;
}
