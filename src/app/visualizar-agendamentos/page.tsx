"use client";

import { Suspense } from "react";
import ViewAppointmentsView from "./view";

export default function ViewAppointmentsPage() {
  return (
    <Suspense>
      <ViewAppointmentsView />
    </Suspense>
  );
}
