"use client";

// ================================================
//  Arquivo único: exporta ENVIRONMENT, setEnvironment
//  e a página ConfiguracoesPage com o mesmo visual.
//  Quem precisar da flag importa:
//    import { ENVIRONMENT } from "@/app/(caminho)/ConfiguracoesPage";
// ================================================

import { useState, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Cog, RefreshCw, Database } from "lucide-react";

// ------------------------------------------------
// FLAG GLOBAL (live-binding)
// ------------------------------------------------
export let ENVIRONMENT: "teste" | "producao" = "teste";

/**
 * Atualiza a flag global e persiste no localStorage.
 * Também recarrega a página.
 */
export function setEnvironment(newEnv: "teste" | "producao") {
  ENVIRONMENT = newEnv;
  if (typeof window !== "undefined") {
    localStorage.setItem("APP_ENVIRONMENT", newEnv);
    window.location.reload();
  }
}

/**
 * Atualiza a base do caminho do Firebase e persiste no localStorage.
 * Também recarrega a página.
 */
function setFirebasePathBase(newBase: "DRM" | "OFT/45") {
  if (typeof window !== "undefined") {
    localStorage.setItem("FIREBASE_PATH_BASE", newBase);
    window.location.reload();
  }
}

// ------------------------------------------------
//  Página de Configurações (mantém o mesmo design)
// ------------------------------------------------
export default function ConfiguracoesPage() {
  const [selectedUnit, setSelectedUnit] = useState<"DRM" | "OFT/45" | null>(null); // Adiciona estado para a unidade
  const [environment, setEnvironmentState] = useState<"teste" | "producao">("teste");
  const [firebasePathBase, setFirebasePathBaseState] = useState<"DRM" | "OFT/45">("DRM");

  useEffect(() => {
    const storedEnv = localStorage.getItem("APP_ENVIRONMENT") as "teste" | "producao" | null;
    if (storedEnv) setEnvironmentState(storedEnv);
  }, []);

  useEffect(() => {
    const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
    if (storedPathBase) {
      setFirebasePathBaseState(storedPathBase);
      setSelectedUnit(storedPathBase); // Atualiza também o novo estado
    }
  }, []);

  useEffect(() => {
    const handleStorageChange = () => {
      const storedEnv = localStorage.getItem("APP_ENVIRONMENT") as "teste" | "producao" | null;
      if (storedEnv && storedEnv !== environment) setEnvironmentState(storedEnv);
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [environment]);

  useEffect(() => {
    const handleStorageChange = () => {
      const storedPathBase = localStorage.getItem("FIREBASE_PATH_BASE") as "DRM" | "OFT/45" | null;
      if (storedPathBase && storedPathBase !== firebasePathBase) {
        setFirebasePathBaseState(storedPathBase);
        setSelectedUnit(storedPathBase); // Atualiza também o novo estado
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [firebasePathBase]);

  const toggleEnvironment = () => {
    const newEnv = environment === "teste" ? "producao" : "teste";
    setEnvironmentState(newEnv);
    setEnvironment(newEnv);
  };

  const isTeste = environment === "teste";

  return (
    <SidebarLayout unit={selectedUnit}> {/* Passa o estado `selectedUnit` como prop */}
      <div className="flex flex-col items-center p-6 md:p-10 lg:p-16 bg-gradient-to-br from-blue-50 to-white min-h-screen w-full">
        <div className="w-full max-w-3xl space-y-8">
          {/* Card de Configurações do Sistema */}
          <Card className="w-full shadow-xl border-blue-200 border-2 hover:shadow-2xl transition-shadow duration-300 ease-in-out">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl font-bold text-blue-700 flex items-center">
                    <Cog className="mr-3 h-7 w-7 text-blue-600 animate-spin-slow" />
                    Configurações do Sistema
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Defina o ambiente de operação do sistema.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={isTeste ? "secondary" : "destructive"}
                    className={`text-sm px-3 py-1 h-auto flex items-center border-2 ${
                      isTeste ? "border-gray-300 text-gray-800" : "border-red-400 text-red-800"
                    } bg-opacity-70 transition-colors duration-200`}
                  >
                    {environment.toUpperCase()}
                  </Badge>
                  <Button
                    variant="outline"
                    onClick={toggleEnvironment}
                    className="text-sm px-4 py-2 h-auto flex items-center gap-2 border-blue-500 text-blue-700 hover:bg-blue-50 hover:text-blue-800 transition-colors duration-200"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Alternar Ambiente
                  </Button>
                </div>
              </div>
            </CardHeader>
            {/* <CardContent>Conteúdo adicional se necessário</CardContent> */}
          </Card>

          {/* Card para a Base do Caminho do Firebase */}
          <Card className="w-full shadow-xl border-blue-200 border-2 hover:shadow-2xl transition-shadow duration-300 ease-in-out">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl font-semibold text-primary flex items-center">
                    <Database className="mr-3 h-7 w-7 text-blue-600" />
                    Base do Caminho do Firebase
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Selecione a base de dados principal para o Firebase.
                  </p>
                </div>
                <div className="flex items-center">
                  <Select value={firebasePathBase} onValueChange={setFirebasePathBase}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Selecione a base" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DRM">DRM</SelectItem>
                      <SelectItem value="OFT/45">OFT/45</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            {/* <CardContent>Conteúdo adicional se necessário</CardContent> */}
          </Card>
        </div>
      </div> {/* <-- fechamento do container flex que estava faltando */}
    </SidebarLayout>
  );
}
