"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { FilePlus, Sparkle, Eraser } from "lucide-react";
import { useSearchParams } from "next/navigation";

import SidebarLayout from "@/components/layout/sidebar-layout";
import { PatientForm } from "@/components/patient-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFirebasePathBase, Unit } from "@/lib/firebaseConfig";
import { Button } from "@/components/ui/button";

export default function NovoAgendamentoView() {
  const [autoFillKey, setAutoFillKey] = useState(0);
  const [defaults, setDefaults] = useState<Record<string, any>>();
  /* unidade passada na URL */
  const searchParams = useSearchParams();
  const unidadeFromUrl = searchParams.get("unidade");
  const unit = (unidadeFromUrl as Unit) || "DRM";

  /* preenche campo Local + força remontar o formulário */
  useEffect(() => {
    const initialDefaults: Record<string, any> = {};
    if (unidadeFromUrl) {
      initialDefaults.local = unidadeFromUrl;
    }
    setDefaults(initialDefaults);
  }, [unidadeFromUrl]);

  /* ------------------- Autopreenchimento ------------------- */
  const handleAutoFill = () => {
    const now = dayjs();
    const tomorrow = now.add(1, "day");

    setDefaults({
      nomePaciente: "Alexandre Lobo - Teste do Sistema",
      dataNascimento: "1900-01-01",
      telefone: "5521984934862",
      dataAgendamento: tomorrow.format("YYYY-MM-DD"),
      horario: now.format("HH:mm"),
      convenio: "Particular",
      motivacao: "Revisão de Grau",
      local:
        getFirebasePathBase() === "OFT/45"
          ? "WilsonBarros"
          : unidadeFromUrl || "OftalmoDayTijuca",
      exames: ["Consulta"],
      observacoes: `Teste de Autopreenchimento ${now.format(
        "HH:mm DD/MM/YYYY"
      )}`,
    });

    setAutoFillKey((k) => k + 1);
  };

  /* ------------------- Limpar formulário ------------------- */
  const handleClearForm = () => {
    setDefaults(undefined);
    setAutoFillKey((k) => k + 1);
  };

  const formDefaults = useMemo(() => defaults, [defaults]);

  /* --------------------------- UI -------------------------- */
  return (
    <SidebarLayout unit={unit}>
      <div className="flex flex-col items-center p-6 md:p-10 lg:p-16 bg-gradient-to-b from-blue-100 via-white to-blue-100 min-h-screen w-full overflow-hidden">
        <Card className="w-full shadow-lg relative">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold text-primary flex items-center">
              <FilePlus className="mr-2 h-8 w-8" />
              Novo Agendamento
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Preencha os dados do paciente para criar um novo agendamento.
            </p>

            {/* botões canto superior-direito */}
            <div className="absolute top-6 right-6 flex gap-2">
              <Button
                variant="ghost"
                onClick={handleAutoFill}
                className="text-sm px-4 py-2 h-auto flex items-center gap-2 border border-blue-500"
              >
                <Sparkle className="h-4 w-4 mr-2 text-blue-600" />
                Autopreencher
              </Button>

              <Button
                variant="outline"
                onClick={handleClearForm}
                className="text-sm px-4 py-2 h-auto flex items-center gap-2 border border-gray-300"
              >
                <Eraser className="h-4 w-4 mr-2" />
                Limpar
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            <PatientForm key={autoFillKey} defaultValues={formDefaults} />
          </CardContent>
        </Card>
      </div>
    </SidebarLayout>
  );
}
