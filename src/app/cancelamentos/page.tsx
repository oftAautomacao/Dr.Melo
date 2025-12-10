"use client";

import { useEffect, useState } from "react";
import SidebarLayout from "@/components/layout/sidebar-layout";
import { CancellationCalendar } from "@/components/cancellation-calendar";

export default function CancelamentosPage() {
    const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null);

    useEffect(() => {
        const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
        if (storedPathBase) setSelectedUnit(storedPathBase);
    }, []);

    return (
        <SidebarLayout unit={selectedUnit} bgColor="bg-red-50">
            <div className="container mx-auto py-6">
                <CancellationCalendar />
            </div>
        </SidebarLayout>
    );
}
