"use server";

import { openaiService, ChatMessage } from "@/lib/ai/openai-service";

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
