"use client";

import { Suspense } from "react";
import CancelamentosView from "./view";

export default function CancelamentosPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center">Carregando tela...</div>}>
            <CancelamentosView />
        </Suspense>
    );
}
