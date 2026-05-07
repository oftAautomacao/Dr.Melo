"use client";

import SidebarLayout from "@/components/layout/sidebar-layout";
import BuscaHorarios from "@/components/busca-horarios/BuscaHorarios";
import { useEffect, useState } from "react";

export default function BuscaHorariosPage() {
  const [unit, setUnit] = useState<"DRM" | "OFT/45" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
    if (stored) setUnit(stored);
    else setUnit("DRM");
  }, []);

  return (
    <SidebarLayout unit={unit}>
      <BuscaHorarios />
    </SidebarLayout>
  );
}
