"use client";

import { useSearchParams } from "next/navigation";
import SidebarLayout from "@/components/layout/sidebar-layout";
import { AppointmentCalendar } from "@/components/appointment-calendar";
import { Unit } from "@/lib/firebaseConfig";

export default function ViewAppointmentsView() {
  const params = useSearchParams();
  const unidade = params.get("unidade") as Unit | null;
  const filtro = params.get("filtro") ?? undefined; // ?filtro=…
  const dia = params.get("dia") ?? undefined; // ?dia=yyyy-MM-dd
  const telefone = (params.get("telefone") || "").replace(/\D/g, "");
  const abrirNovoAgendamento =
    params.get("autopreencher") === "conversa" && telefone.length >= 10;

  return (
    <SidebarLayout unit={unidade}>
      <AppointmentCalendar
        key={abrirNovoAgendamento ? `conversa-${telefone}` : "agendamentos"}
        initialUnit={unidade ?? undefined}
        initialFilter={filtro}
        initialDay={dia}
        initialConversationPhone={abrirNovoAgendamento ? telefone : undefined}
        openNewAppointmentOnLoad={abrirNovoAgendamento}
      />
    </SidebarLayout>
  );
}
