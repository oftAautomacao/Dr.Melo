"use client";

import { Suspense } from "react";
import NovoAgendamentoView from "./view";

export default function NovoAgendamentoPage() {
  return (
    <Suspense>
      <NovoAgendamentoView />
    </Suspense>
  );
}
