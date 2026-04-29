"use client";

import { useEffect, useState } from "react";
import SidebarLayout from "@/components/layout/sidebar-layout";
import { CancellationCalendar } from "@/components/cancellation-calendar";
import { useSearchParams } from "next/navigation";

export default function CancelamentosView() {
    const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null);
    const params = useSearchParams();
    
    const initialUnit = params.get("unidade") ?? undefined;
    const initialFilter = params.get("filtro") ?? undefined;
    const initialDay = params.get("dia") ?? undefined;

    useEffect(() => {
        const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
        if (storedPathBase) setSelectedUnit(storedPathBase);
    }, []);

    return (
        <SidebarLayout unit={selectedUnit} bgColor="bg-red-50">
            <div className="container mx-auto py-6">
                <CancellationCalendar 
                    initialUnit={initialUnit}
                    initialFilter={initialFilter}
                    initialDay={initialDay}
                />
            </div>
        </SidebarLayout>
    );
}
