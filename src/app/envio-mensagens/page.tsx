"use client";

import { FormEvent, useEffect, useState } from "react";
import { CircleAlert, PhoneOff, Plus, Search, Trash2 } from "lucide-react";
import { onValue, ref, remove, set } from "firebase/database";

import { ENVIRONMENT } from "../../../ambiente";
import SidebarLayout from "@/components/layout/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDatabaseInstance } from "@/lib/firebase";

const CANCELLED_MESSAGES_PATH = "DRM/agendamentoWhatsApp/configuracoes/enviosCancelados";

interface CancelledRecipient {
  id: string;
  phone: string;
}

function getPhoneDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 20);
}

export default function EnvioMensagensPage() {
  const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [cancelledRecipients, setCancelledRecipients] = useState<CancelledRecipient[]>([]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const storedUnit = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
    if (storedUnit) setSelectedUnit(storedUnit);
  }, []);

  useEffect(() => {
    const database = getDatabaseInstance(ENVIRONMENT);
    const cancelledMessagesRef = ref(database, CANCELLED_MESSAGES_PATH);

    return onValue(
      cancelledMessagesRef,
      (snapshot) => {
        const savedRecipients = snapshot.val() as Record<string, { whatsapp?: unknown }> | null;
        const recipients = Object.entries(savedRecipients ?? {})
          .map(([phone, data]) => ({
            id: phone,
            phone: typeof data?.whatsapp === "string" ? data.whatsapp : phone,
          }))
          .sort((a, b) => a.phone.localeCompare(b.phone));

        setCancelledRecipients(recipients);
      },
      () => setError("Não foi possível carregar os números cancelados."),
    );
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = getPhoneDigits(phoneInput);

    if (!digits) {
      setError("Informe um número de telefone.");
      return;
    }

    const alreadyExists = cancelledRecipients.some(
      (recipient) => getPhoneDigits(recipient.phone) === digits,
    );

    if (alreadyExists) {
      setError("Este telefone já está na lista de envios cancelados.");
      return;
    }

    try {
      setIsSaving(true);
      const database = getDatabaseInstance(ENVIRONMENT);
      await set(ref(database, `${CANCELLED_MESSAGES_PATH}/${digits}`), {
        whatsapp: digits,
      });
      setPhoneInput("");
      setError("");
    } catch {
      setError("Não foi possível salvar o telefone no Firebase.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(phone: string) {
    try {
      const database = getDatabaseInstance(ENVIRONMENT);
      await remove(ref(database, `${CANCELLED_MESSAGES_PATH}/${phone}`));
      setError("");
    } catch {
      setError("Não foi possível remover o telefone do Firebase.");
    }
  }

  const filteredRecipients = searchTerm
    ? cancelledRecipients.filter((recipient) => recipient.phone.includes(searchTerm))
    : cancelledRecipients;

  return (
    <SidebarLayout unit={selectedUnit}>
      <div className="mx-auto max-w-[1600px] space-y-6 animate-in fade-in duration-700">
        <header className="border-b border-blue-100 pb-4">
          <div className="space-y-0.5">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
              <span className="rounded-lg bg-blue-600 p-1.5">
                <PhoneOff className="h-5 w-5 text-white" />
              </span>
              Envios Cancelados
            </h1>
            <p className="text-sm text-slate-500">
              Gerencie os números de pacientes que não devem receber mensagens.
            </p>
          </div>
        </header>

            <Card className="border-blue-200 shadow-sm">
              <CardContent className="space-y-6 pt-6">
                <form onSubmit={handleSubmit} className="space-y-2">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-2">
                      <label htmlFor="cancelled-phone" className="text-sm font-bold text-slate-700">
                        Telefone do paciente
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id="cancelled-phone"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel"
                          value={phoneInput}
                          onChange={(event) => {
                            setPhoneInput(getPhoneDigits(event.target.value));
                            if (error) setError("");
                          }}
                          placeholder="5521971938840"
                          aria-invalid={Boolean(error)}
                          className="sm:w-64"
                        />
                        <Button
                          type="submit"
                          size="icon"
                          disabled={isSaving}
                          aria-label="Adicionar número"
                          title="Adicionar número"
                          className="shrink-0 bg-blue-600 hover:bg-blue-700"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="relative w-full sm:w-64">
                      <label htmlFor="cancelled-phone-search" className="sr-only">
                        Buscar telefone
                      </label>
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="cancelled-phone-search"
                        type="search"
                        inputMode="numeric"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(getPhoneDigits(event.target.value))}
                        placeholder="Buscar telefone"
                        className="pl-9"
                      />
                    </div>
                  </div>
                  {error && (
                    <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
                      <CircleAlert className="h-4 w-4" />
                      {error}
                    </p>
                  )}
                </form>

                {filteredRecipients.length > 0 && (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
                    <ul className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
                      {filteredRecipients.map((recipient) => (
                        <li
                          key={recipient.id}
                          className="flex min-w-0 items-center gap-3 bg-white p-3 transition-colors hover:bg-blue-50"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                            <PhoneOff className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                            {recipient.phone}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleRemove(recipient.phone)}
                            aria-label={`Remover o número ${recipient.phone}`}
                            className="h-8 w-8 shrink-0 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
      </div>
    </SidebarLayout>
  );
}
