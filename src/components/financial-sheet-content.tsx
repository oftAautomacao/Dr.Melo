"use client";

import { useState, useMemo, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { User, Calendar, Phone, Shield, FlaskConical } from "lucide-react";
import { Toaster, toast } from 'sonner';
import { ENVIRONMENT } from "../../ambiente";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const obterNomeMes = (dataStr: string) => {
  const [ano, mes] = dataStr.split("-");
  const idx = Number(mes) - 1;
  return idx >= 0 && idx < 12 ? `${MESES[idx]} de ${ano}` : null;
};

interface FinancialSheetContentProps {
  unit: string;
  patientData: Record<string, Record<string, any>>;
  initialMonth: string;
  unitConfig: Record<string, { bairro?: string; empresa?: string }>;
}

export function FinancialSheetContent({ unit, patientData, initialMonth, unitConfig }: FinancialSheetContentProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null);

  useEffect(() => {
    const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
    if (storedPathBase) setSelectedUnit(storedPathBase);
  }, []);

  const appointmentsForMonth = useMemo(() => {
    if (!selectedMonth) return [];
    const unitData = patientData[unit];
    if (!unitData) return [];

    const appointments: any[] = [];
    for (const dateStr in unitData) {
      const monthName = obterNomeMes(dateStr);
      if (monthName === selectedMonth) {
        const dayAppointments = unitData[dateStr];
        for (const time in dayAppointments) {
          appointments.push({
            ...dayAppointments[time],
            date: dateStr,
            time: time,
          });
        }
      }
    }
    return appointments.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  }, [patientData, unit, selectedMonth]);

  const handleGenerateReport = async () => {
    if (!selectedUnit) {
        toast.error("Unidade não identificada. Não é possível enviar a mensagem.");
        return;
    }

    const unitName = unitConfig?.[unit]?.empresa ?? unit;

    const patientListString = appointmentsForMonth.map(app => {
        const name = app.nomePaciente || "Paciente sem nome";
        const cpf = app.cpf ? `, CPF: ${app.cpf}` : "";
        const date = new Date(app.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        const time = app.time;
        const convenio = app.convenio || "Não informado";

        return `* ${name}${cpf}, ${date} às ${time}, ${convenio}`;
    }).join('\n');

    const message = `Olá, tudo bem?\n\nVocê poderia verificar quais desses pacientes vindos do Dr. Melo foram realmente atendidos na ${unitName}?\n\n🧾 Pacientes agendados:\n\n${patientListString}`;

    let apiCredentials: { id: string; token: string; };
    let phoneNumber: string;

    if (ENVIRONMENT === "teste") {
      apiCredentials = {
        id: "3B74CE9AFF0D20904A9E9E548CC778EF",
        token: "A8F754F1402CAE3625D5D578",
      };
      phoneNumber = "5521971938840";
      toast.info(`AMBIENTE DE TESTE: Mensagem para ${phoneNumber} sendo enviada.`);

    } else { // Ambiente de PRODUÇÃO
      phoneNumber = "5521984934862";
      if (selectedUnit === "DRM") {
        apiCredentials = {
          id: "3D460A6CB6DA10A09FAD12D00F179132",
          token: "1D2897F0A38EEEC81D2F66EE",
        };
      } else if (selectedUnit === "OFT/45") {
        apiCredentials = {
          id: "39C7A89881E470CC246252059E828D91",
          token: "B1CA83DE10E84496AECE8028",
        };
      } else {
        toast.error("Unidade de produção não reconhecida. Não é possível enviar a mensagem.");
        return;
      }
    }

    try {
      const response = await fetch(
        `https://api.z-api.io/instances/${apiCredentials.id}/token/${apiCredentials.token}/send-text`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Client-Token": "Fe948ba6a317942849b010c88cd9e6105S",
          },
          body: JSON.stringify({ phone: phoneNumber, message: message }),
        }
      );

      if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch(e) {
            errorData = { error: 'Não foi possível ler a resposta de erro da API.' }
        }
        toast.error(`Erro ao enviar mensagem: ${errorData?.error || response.statusText}`);
        console.error("Erro Z-API:", response.statusText, errorData);
        return;
      }

      toast.success("Mensagem enviada com sucesso!");

    } catch (err) {
      toast.error("Ocorreu um erro inesperado ao tentar enviar a mensagem.");
      console.error("Erro no envio:", err);
    }
  };

  const availableMonths = useMemo(() => {
    const unitData = patientData[unit];
    if (!unitData) return [];
    const months = new Set<string>();
    for (const dateStr in unitData) {
      const monthName = obterNomeMes(dateStr);
      if (monthName) {
        months.add(monthName);
      }
    }
    return Array.from(months).sort((a, b) => {
        const [mA, yA] = a.split(" de ");
        const [mB, yB] = b.split(" de ");
        const idxA = MESES.indexOf(mA);
        const idxB = MESES.indexOf(mB);
        return Number(yA) === Number(yB) ? idxA - idxB : Number(yA) - Number(yB);
    });
  }, [patientData, unit]);

  return (
    <div className="p-4">
      <Toaster richColors position="top-center" />
      <div className="flex items-center space-x-2">
        <Select onValueChange={setSelectedMonth} value={selectedMonth}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um mês" />
          </SelectTrigger>
          <SelectContent>
            {availableMonths.map((month) => (
              <SelectItem key={month} value={month}>
                {month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleGenerateReport}>Gerar Relatório</Button>
      </div>

      <div className="mt-4">
        {appointmentsForMonth.length > 0 ? (
          <ScrollArea className="h-[calc(100vh-12rem)] pr-4">
            <div className="space-y-2">
              {appointmentsForMonth.map((app, index) => (
                <Card key={index} className="border-l-4 border-blue-500">
                  <CardHeader className="p-3">
                    <CardTitle className="text-base font-semibold flex items-center text-blue-800">
                      <User className="mr-2 h-4 w-4" />
                      {app.nomePaciente || "Paciente sem nome"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 text-sm text-gray-700 space-y-1">
                    <div className="flex items-center">
                      <Calendar className="mr-2 h-4 w-4 text-green-600" />
                      <span>{new Date(app.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} às {app.time}</span>
                    </div>
                    <div className="flex items-center">
                        <Phone className="mr-2 h-4 w-4 text-gray-500" />
                        <span>{app.telefone}</span>
                    </div>
                    <div className="flex items-center">
                        <Shield className="mr-2 h-4 w-4 text-gray-500" />
                        <span>{app.convenio}</span>
                    </div>
                    {app.exames && app.exames.length > 0 && (
                        <div className="flex items-center">
                            <FlaskConical className="mr-2 h-4 w-4 text-gray-500" />
                            <span>{app.exames.join(', ')}</span>
                        </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <p className="text-center text-gray-500 mt-4">
            {selectedMonth ? "Nenhum agendamento para este mês." : "Selecione um mês para ver os agendamentos."}
          </p>
        )}
      </div>
    </div>
  );
}
