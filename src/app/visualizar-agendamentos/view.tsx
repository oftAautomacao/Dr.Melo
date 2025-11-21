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

  return (
    <SidebarLayout unit={unidade}>
      <AppointmentCalendar
        initialUnit={unidade ?? undefined}
        initialFilter={filtro}
        initialDay={dia}
      />
    </SidebarLayout>
  );
}
