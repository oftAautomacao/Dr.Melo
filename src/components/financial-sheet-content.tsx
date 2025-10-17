"use client";

import { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { User, Calendar } from "lucide-react";

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
}

export function FinancialSheetContent({ unit, patientData, initialMonth }: FinancialSheetContentProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);

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

  return (
    <div className="p-4">
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

      <div className="mt-4">
        {appointmentsForMonth.length > 0 ? (
          <ScrollArea className="h-[calc(100vh-12rem)] pr-4">
            <div className="space-y-2">
              {appointmentsForMonth.map((app, index) => (
                <Card key={index} className="border-l-4 border-blue-500">
                  <CardHeader className="p-3">
                    <CardTitle className="text-base font-semibold flex items-center text-blue-800">
                      <User className="mr-2 h-4 w-4" />
                      {app.nomePaciente}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 text-sm text-gray-700">
                    <div className="flex items-center">
                      <Calendar className="mr-2 h-4 w-4 text-green-600" />
                      <span>{new Date(app.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} às {app.time}</span>
                    </div>
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
