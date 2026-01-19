import OpenAI from 'openai';

// Inicializa o cliente OpenAI diretamente no servidor (não exposto ao cliente)
// A verificação da chave ocorre aqui para falhar graciosamente se não estiver configurada
const apiKey = process.env.OPENAI_API_KEY;

let openai: OpenAI | null = null;

if (apiKey) {
    openai = new OpenAI({
        apiKey: apiKey,
    });
} else {
    console.warn("AVISO: Chave da OpenAI não encontrada em OPENAI_API_KEY. O serviço de IA não funcionará corretamente.");
}

export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
    role: MessageRole;
    content: string;
}

/**
 * Serviço genérico para interação com a OpenAI.
 * Este serviço deve ser usado apenas em Server Actions ou API Routes.
 */
export const openaiService = {
    /**
     * Analisa uma conversa completa e retorna uma resposta estruturada (JSON se solicitado).
     * @param messages Histórico de mensagens da conversa
     * @param systemPrompt Instrução para a IA (contexto e objetivo)
     * @param model Modelo a ser usado (default: gpt-4o-mini)
     */
    async analyzeConversation(
        messages: ChatMessage[],
        systemPrompt: string,
        model: string = "gpt-4o-mini"
    ): Promise<string | null> {
        if (!openai) {
            console.error("OpenAI client not initialized.");
            return null;
        }

        try {
            const response = await openai.chat.completions.create({
                model: model,
                messages: [
                    { role: "system", content: systemPrompt },
                    ...messages
                ],
                temperature: 0.3, // Temperatura baixa para análises mais objetivas
            });

            return response.choices[0].message.content;
        } catch (error) {
            console.error("Erro ao chamar OpenAI:", error);
            return null;
        }
    },

    /**
     * Analisa um texto simples.
     */
    async analyzeText(
        text: string,
        prompt: string,
        model: string = "gpt-4o-mini"
    ): Promise<string | null> {
        return this.analyzeConversation([{ role: "user", content: text }], prompt, model);
    }
};
