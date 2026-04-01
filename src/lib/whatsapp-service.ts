export interface WhatsAppConfig {
    instanceId: string;
    token: string;
}

export interface SendMessageParams {
    phone: string;
    message: string;
}

const TEST_CONFIG: WhatsAppConfig = {
    instanceId: "3B74CE9AFF0D20904A9E9E548CC778EF",
    token: "A8F754F1402CAE3625D5D578",
};

const PROD_CONFIGS: Record<string, WhatsAppConfig> = {
    "DRM": {
        instanceId: "3D460A6CB6DA10A09FAD12D00F179132",
        token: "1D2897F0A38EEEC81D2F66EE",
    },
    "OFT/45": {
        instanceId: "39C7A89881E470CC246252059E828D91",
        token: "B1CA83DE10E84496AECE8028",
    }
};

export const whatsappService = {
    async sendMessage(
        params: SendMessageParams,
        unit: "DRM" | "OFT/45",
        env: "teste" | "producao"
    ): Promise<boolean> {
        let config: WhatsAppConfig;

        if (env === "teste") {
            config = TEST_CONFIG;
        } else {
            config = PROD_CONFIGS[unit];
            if (!config) return false;
        }

        try {
            const response = await fetch(
                `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/send-text`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Client-Token": "Fe948ba6a317942849b010c88cd9e6105S",
                    },
                    body: JSON.stringify({
                        phone: params.phone,
                        message: params.message
                    }),
                }
            );

            return response.ok;
        } catch (error) {
            console.error("[WhatsAppService] Erro ao enviar mensagem:", error);
            return false;
        }
    },

    async sendDocument(
        params: { phone: string; document: string; fileName: string; extension: string },
        unit: "DRM" | "OFT/45",
        env: "teste" | "producao"
    ): Promise<boolean> {
        let config: WhatsAppConfig;

        if (env === "teste") {
            config = TEST_CONFIG;
        } else {
            config = PROD_CONFIGS[unit];
            if (!config) return false;
        }

        try {
            console.log("[WhatsAppService] Chamando send-document via Base64 para:", params.phone);
            const response = await fetch(
                `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/send-document/${params.extension}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Client-Token": "Fe948ba6a317942849b010c88cd9e6105S",
                    },
                    body: JSON.stringify({
                        phone: params.phone,
                        document: params.document,
                        fileName: params.fileName
                    }),
                }
            );

            const data = await response.json().catch(() => ({}));
            console.log("[WhatsAppService] Resposta da Z-API:", response.status, data);
            return response.ok;
        } catch (error) {
            console.error("[WhatsAppService] Erro ao enviar documento:", error);
            return false;
        }
    }
};
// Sincronizando arquivo...
