"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2, CalendarX, CalendarCheck2, MapPin, Calendar, Clock } from "lucide-react";
import { getDatabaseInstance } from "@/lib/firebase";
import { ref, get } from "firebase/database";
import { ENVIRONMENT } from "../../ambiente";
import { getFirebasePathBase } from "@/lib/firebaseConfig";
import { Badge } from "@/components/ui/badge";

export interface PatientSearchResult {
    status: 'agendado' | 'cancelado';
    id: string;
    nomePaciente: string;
    telefone: string;
    nascimento?: string;
    dataAgendamento: string;
    horario: string;
    convenio: string;
    exames: string[];
    unidade: string;
    motivoCancelamento?: string;
}

interface PatientSearchSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (record: PatientSearchResult) => void;
}

export function PatientSearchSheet({
    isOpen,
    onClose,
    onSelect,
}: PatientSearchSheetProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [allRecords, setAllRecords] = useState<PatientSearchResult[]>([]);

    useEffect(() => {
        if (!isOpen) {
            setSearchTerm("");
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const db = getDatabaseInstance(ENVIRONMENT);
                const base = getFirebasePathBase();
                const isMedico = base === "OFT/45";
                const nodeName = isMedico ? "medicos" : "unidades";

                const agendadosRef = ref(db, `${base}/agendamentoWhatsApp/operacional/consultasAgendadas/${nodeName}`);
                const canceladosRef = ref(db, `${base}/agendamentoWhatsApp/operacional/consultasCanceladas/${nodeName}`);

                const [agendadosSnap, canceladosSnap] = await Promise.all([
                    get(agendadosRef),
                    get(canceladosRef)
                ]);

                const records: PatientSearchResult[] = [];

                const processSnap = (snap: any, status: 'agendado' | 'cancelado') => {
                    if (snap.exists()) {
                        const data = snap.val();
                        Object.keys(data).forEach(unit => {
                            const unitData = data[unit] || {};
                            Object.keys(unitData).forEach(dateKey => {
                                const timesObj = unitData[dateKey] || {};
                                Object.keys(timesObj).forEach(timeKey => {
                                    const record = timesObj[timeKey];
                                    records.push({
                                        status,
                                        id: `${status}-${unit}-${dateKey}-${timeKey}`,
                                        nomePaciente: record.nomePaciente || "",
                                        telefone: record.telefone || "",
                                        nascimento: record.nascimento,
                                        dataAgendamento: dateKey,
                                        horario: timeKey,
                                        convenio: record.convenio || "",
                                        exames: record.exames || [],
                                        unidade: isMedico ? unit : record.unidade || unit,
                                        motivoCancelamento: record.motivoCancelamento,
                                    });
                                });
                            });
                        });
                    }
                };

                processSnap(agendadosSnap, 'agendado');
                processSnap(canceladosSnap, 'cancelado');

                setAllRecords(records);
            } catch (error) {
                console.error("Erro ao buscar dados de pacientes:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [isOpen]);

    const filteredRecords = useMemo(() => {
        if (!searchTerm || searchTerm.trim().length < 2) return [];

        const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const lowerTerm = normalize(searchTerm);
        
        // Filtro exato para nome ou telefone (telefone apenas números)
        const termNumbersOnly = searchTerm.replace(/\D/g, '');
        
        const matches = allRecords.filter(r => {
            const matchesName = normalize(r.nomePaciente).includes(lowerTerm);
            const matchesPhone = termNumbersOnly && r.telefone.replace(/\D/g, '').includes(termNumbersOnly);
            return matchesName || matchesPhone;
        });

        // Ordenar records por data mais recente primeiro
        matches.sort((a, b) => {
            const dateA = new Date(`${a.dataAgendamento}T${a.horario}`);
            const dateB = new Date(`${b.dataAgendamento}T${b.horario}`);
            return dateB.getTime() - dateA.getTime();
        });

        return matches;
    }, [allRecords, searchTerm]);

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="right" className="sm:max-w-[500px] w-full p-0 flex flex-col bg-white border-l border-slate-200">
                <SheetHeader className="p-5 border-b border-slate-100 bg-slate-50/50">
                    <SheetTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Search className="h-5 w-5 text-blue-600" />
                        Buscar Paciente
                    </SheetTitle>

                    <div className="relative mt-3">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por nome ou telefone..."
                            className="pl-8 h-10 bg-white border-slate-200 focus:ring-1 focus:ring-blue-500 rounded-md text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                    </div>
                </SheetHeader>

                <ScrollArea className="flex-grow p-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                            <Loader2 className="h-8 w-8 animate-spin mb-2" />
                            <p className="text-sm">Buscando registros...</p>
                        </div>
                    ) : filteredRecords.length > 0 ? (
                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                {filteredRecords.length} resultado(s)
                            </p>
                            {filteredRecords.map((record) => {
                                const isCancelado = record.status === 'cancelado';
                                
                                return (
                                    <div 
                                        key={record.id}
                                        onClick={() => onSelect(record)}
                                        className="flex flex-col p-4 rounded-xl border bg-white shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition-all gap-3"
                                    >
                                        <div className="flex justify-between items-start gap-2">
                                            <p className="font-bold text-slate-900 leading-tight">
                                                {record.nomePaciente}
                                            </p>
                                            <Badge variant={isCancelado ? "destructive" : "default"} className={isCancelado ? "" : "bg-green-600 hover:bg-green-700"}>
                                                {isCancelado ? (
                                                    <><CalendarX className="h-3 w-3 mr-1"/> Cancelado</>
                                                ) : (
                                                    <><CalendarCheck2 className="h-3 w-3 mr-1"/> Agendado</>
                                                )}
                                            </Badge>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                                                <MapPin className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                                <span className="truncate">{record.unidade.replace(/([A-Z])/g, " $1").trim()}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                                                <Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                                <span>{record.dataAgendamento.split('-').reverse().join('/')}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                                                <Clock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                                <span>{record.horario}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700">
                                                    {record.convenio}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {isCancelado && record.motivoCancelamento && (
                                            <div className="text-[11px] text-red-600 bg-red-50 p-1.5 rounded font-medium mt-1">
                                                <span className="font-bold">Motivo:</span> {record.motivoCancelamento}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : searchTerm.length >= 2 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-center">
                            <Search className="h-10 w-10 mb-3 opacity-20" />
                            <p className="font-medium">Nenhum registro encontrado.</p>
                            <p className="text-xs mt-1">Tente outro nome ou telefone.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-center">
                            <p className="text-sm">Digite no mínimo 2 caracteres para iniciar a busca.</p>
                        </div>
                    )}
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
