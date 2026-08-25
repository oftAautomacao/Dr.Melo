"use server";

import { ai } from "@/ai/genkit";
import { openaiService, ChatMessage } from "@/lib/ai/openai-service";
import { z } from "zod";

export interface SourceAnalysisResult {
    source: string;
    confidence: "alta" | "média" | "baixa";
    reason: string;
}

/**
 * Identifica a origem do paciente (Marketing Source) com base no histórico da conversa.
 */
export async function identifyPatientSourceAction(
    history: { role: string; content: string }[]
): Promise<SourceAnalysisResult | null> {
    // Limita o histórico para não exceder tokens desnecessariamente e focar nas primeiras mensagens
    // Onde geralmente ocorre a "apresentação" ou menção de onde veio.
    // Pegamos as 15 primeiras mensagens e as 10 últimas, caso a conversa seja longa.
    let selectedMessages = history;
    if (history.length > 25) {
        selectedMessages = [...history.slice(0, 15), ...history.slice(-10)];
    }

    // Converter para formato do OpenAI
    const messages: ChatMessage[] = selectedMessages.map((m) => ({
        role: (m.role === "admin" || m.role === "assistant") ? "assistant" : "user",
        content: m.content || "",
    }));

    const systemPrompt = `
    Você é um especialista em marketing e análise de dados para clínicas médicas.
    
    OBJETIVO:
    Analisar a conversa e identificar COMO O PACIENTE CONHECEU A CLÍNICA (Origem/Canal de Aquisição).
    
    CATEGORIAS POSSÍVEIS:
    - Instagram (Anúncio ou perfil)
    - Facebook (Anúncio ou perfil)
    - Google (Pesquisa, Site, Maps)
    - Indicação (Amigos, familiares, outro médico)
    - TikTok
    - Passante (Passou na frente)
    - Já é Paciente (Retorno, já tem cadastro antigo)
    - Indefinido (Não foi mencionado na conversa)
    
    FORMATO DE RESPOSTA OBRIGATÓRIO (JSON):
    {
      "source": "Nome da Categoria",
      "confidence": "alta" | "média" | "baixa",
      "reason": "Breve justificativa (ex: Paciente disse 'vi no insta')"
    }
    
    IMPORTANTE:
    - Se o paciente não mencionar nada sobre como chegou, responda "Indefinido".
    - Seja preciso. "Vi anúncio" sem especificar rede social pode ser "Instagram/Facebook" ou se for ambíguo, "Indefinido" com nota. Mas tente inferir pelo contexto se possível, senão "Indefinido".
    - Responda APENAS o JSON, sem markdown (backticks).
  `;

    const result = await openaiService.analyzeConversation(messages, systemPrompt);

    if (!result) return null;

    try {
        // Tenta limpar markdown se a IA colocar
        const cleaned = result.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleaned) as SourceAnalysisResult;
    } catch (e) {
        console.error("Erro ao fazer parse da resposta da IA:", e);
        return null;
    }
}
export interface AppointmentExtractionResult {
    nomePaciente?: string;
    dataNascimento?: string;
    cpf?: string;
    unidade?: string;
    dataAgendamento?: string;
    horario?: string;
    telefone?: string;
    convenio?: string;
}

const confidenceSchema = z.enum(["alta", "média", "baixa"]);

const conversationAppointmentExtractionSchema = z.object({
    nomePaciente: z.string().nullable(),
    dataNascimento: z.string().nullable(),
    cpf: z.string().nullable(),
    unidade: z.string().nullable(),
    dataAgendamento: z.string().nullable(),
    horario: z.string().nullable(),
    convenio: z.string().nullable(),
    motivacao: z.string().nullable(),
    exames: z.array(z.string()).default([]),
    observacoes: z.string().nullable(),
    confidence: confidenceSchema,
    warnings: z.array(z.string()).default([]),
});

export type ConversationAppointmentExtractionResult = z.infer<
    typeof conversationAppointmentExtractionSchema
>;

function hasGeminiApiKey() {
    return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

function hasOpenAiApiKey() {
    return Boolean(process.env.OPENAI_API_KEY);
}

function serializeConversationHistory(history: { role: string; content: string }[]): string {
    let selectedMessages = history;

    if (history.length > 90) {
        selectedMessages = [...history.slice(0, 20), ...history.slice(-70)];
    }

    return selectedMessages
        .map((message, index) => {
            const role = message.role === "assistant" ? "assistente" : "paciente";
            const content = String(message.content || "")
                .replace(/\s+/g, " ")
                .trim();

            return `${index + 1}. [${role}] ${content}`;
        })
        .join("\n");
}

export async function extractAppointmentFromConversationAction(params: {
    history: { role: string; content: string }[];
}): Promise<ConversationAppointmentExtractionResult | null> {
    if (!params.history.length) return null;

    const conversationText = serializeConversationHistory(params.history);
    const prompt = `
Voce e um especialista em leitura de conversas de WhatsApp para clinicas medicas.

Hoje e 24/08/2026.

OBJETIVO:
- Ler a conversa completa entre paciente e assistente.
- Extrair apenas os dados CONFIRMADOS ou informados claramente pelo paciente para pre-preencher um formulario de agendamento.
- Quando houver correcao, considerar sempre o valor MAIS RECENTE dito ou confirmado pelo paciente.

CAMPOS A EXTRAIR:
- nomePaciente: nome completo do paciente.
- dataNascimento: formato DD/MM/AAAA.
- cpf: apenas numeros.
- unidade: nome da unidade escolhida e confirmada.
- dataAgendamento: formato AAAA-MM-DD da data escolhida/confirmada.
- horario: formato HH:MM do horario escolhido/confirmado.
- convenio: nome do convenio. Se o paciente disser que e particular, sem plano, ou consulta particular, retornar "Particular".
- motivacao: motivo da consulta ou principal queixa/objetivo do agendamento.
- exames: lista de exames confirmados. Se a conversa indicar que sera apenas consulta, retornar ["Consulta"].
- observacoes: observacoes clinicas/logisticas relevantes para a unidade, como cadeirante, bebe, autismo, laudo especifico, gestante, dificuldade de locomocao, urgencia, acompanhante, necessidades especiais ou outros pontos importantes citados.
- confidence: "alta", "média" ou "baixa".
- warnings: lista curta de ambiguidades ou pontos que precisam revisao humana.

REGRAS IMPORTANTES:
- Nao invente dados.
- Nao use sugestoes do assistente que nao foram aceitas pelo paciente.
- Se um campo nao estiver claro, retorne null nesse campo.
- Preserve nomes de unidades e exames do jeito mais proximo possivel ao que foi dito.
- "observacoes" deve conter apenas informacoes realmente relevantes para a unidade.
- Se nao houver exame confirmado e tambem nao houver indicacao clara de "apenas consulta", retorne exames como lista vazia.
- Responda apenas com o objeto estruturado.
`;

    if (hasGeminiApiKey()) {
        const { output } = await ai.generate({
            prompt: `${prompt}\n\nCONVERSA:\n${conversationText}`,
            output: { schema: conversationAppointmentExtractionSchema },
        });

        return (output as ConversationAppointmentExtractionResult | null) ?? null;
    }

    if (hasOpenAiApiKey()) {
        return openaiService.analyzeTextParsed<ConversationAppointmentExtractionResult>(
            conversationText,
            prompt,
            conversationAppointmentExtractionSchema,
            "conversation_appointment_extraction",
            "gpt-4o"
        );
    }

    throw new Error(
        "Nenhuma chave de IA foi configurada. Defina GEMINI_API_KEY, GOOGLE_API_KEY ou OPENAI_API_KEY."
    );
}

/**
 * Extrai dados de agendamento de uma imagem (print) usando OpenAI Vision.
 */
export async function extractAppointmentFromImageAction(
    base64Image: string
): Promise<AppointmentExtractionResult | null> {
    const prompt = `
    Analise a imagem de agendamento médico e extraia as informações RELEVANTES E CONFIRMADAS no formato JSON:
    - nomePaciente (Nome completo)
    - dataNascimento (Formato DD/MM/AAAA)
    - cpf (Apenas números)
    - unidade (Nome exato da clínica/unidade que foi ESCOLHIDA ou CONFIRMADA. ATENÇÃO: Preste atenção tanto no NOME da clínica quanto no BAIRRO em conjunto para não confundi-las (ex: diferencie rigorosamente "Oftalmoday Tijuca" e "Kids 360 Tijuca" caso ambos estejam na Tijuca). Não se baseie apenas no bairro; identifique qual é a clínica correta. Se houver nomes entre parênteses ou bairros, una-os, ex: 'Meier Ciom')
    - dataAgendamento (Formato AAAA-MM-DD da data ESCOLHIDA ou CONFIRMADA. Se o texto disser "09/mar", infira o ano corrente 2026, pois hoje é março de 2026)
    - horario (Formato HH:MM do horário ESCOLHIDO ou CONFIRMADO)
    - telefone (Apenas números, incluindo 55 e DDD. Se não houver 55, assuma o do Brasil)
    - convenio (Nome do plano de saúde, se houver clareza na imagem)

    IMPORTANTE:
    - ANÁLISE DE CONTEXTO: Se houver múltiplos locais, datas ou horários mencionados em um print de conversa, extraia apenas o que o paciente ACEITOU ou CONFIRMOU. Ignore sugestões que foram recusadas. No caso do print enviado, o paciente confirmou 'Meier (Ciom)'.
    - PREENCHIMENTO SELETIVO: Se não encontrar um campo ou se ele não estiver confirmado, deixe-o em branco ou nulo no JSON. NÃO invente informações.
    - Retorne APENAS o JSON.
    - Converta datas relativas para o formato solicitado.
  `;

    const result = await openaiService.analyzeImage(base64Image, prompt);

    if (!result) return null;

    try {
        const cleaned = result.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleaned) as AppointmentExtractionResult;
    } catch (e) {
        console.error("Erro ao fazer parse da extração de imagem:", e);
        return null;
    }
}
