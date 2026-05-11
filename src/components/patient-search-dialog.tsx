"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2, CalendarX, CalendarCheck2 } from "lucide-react";
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

interface PatientSearchDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (nome: string, records: PatientSearchResult[]) => void;
}

export function PatientSearchDialog({
    isOpen,
    onClose,
    onSelect,
}: PatientSearchDialogProps) {
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

    const filteredPatients = useMemo(() => {
        if (!searchTerm || searchTerm.trim().length < 2) return [];

        const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const lowerTerm = normalize(searchTerm);
        // Filtrar records
        const matches = allRecords.filter(r => 
            normalize(r.nomePaciente).includes(lowerTerm) || 
            r.telefone.replace(/\D/g, '').includes(searchTerm.replace(/\D/g, ''))
        );

        // Agrupar por nome (ou telefone se não tiver nome) para listar uma vez por paciente
        const grouped = new Map<string, PatientSearchResult[]>();
        matches.forEach(m => {
            const key = m.nomePaciente.trim().toLowerCase() || m.telefone;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(m);
        });

        return Array.from(grouped.entries()).map(([key, records]) => {
            // Ordenar records por data mais recente primeiro
            records.sort((a, b) => {
                const dateA = new Date(`${a.dataAgendamento}T${a.horario}`);
                const dateB = new Date(`${b.dataAgendamento}T${b.horario}`);
                return dateB.getTime() - dateA.getTime();
            });
            return {
                nome: records[0].nomePaciente,
                records
            };
        });
    }, [allRecords, searchTerm]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[600px] gap-0 p-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle className="flex items-center gap-2">
                        <Search className="h-5 w-5" />
                        Buscar Paciente
                    </DialogTitle>
                </DialogHeader>
                
                <div className="p-6">
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por nome ou telefone (min. 2 caracteres)..."
                            className="pl-9 h-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <ScrollArea className="h-[300px] border rounded-md p-2">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                                <p>Buscando registros...</p>
                            </div>
                        ) : filteredPatients.length > 0 ? (
                            <div className="space-y-2">
                                {filteredPatients.map((patient, idx) => {
                                    const mostRecent = patient.records[0];
                                    const isCancelado = mostRecent.status === 'cancelado';
                                    
                                    return (
                                        <div 
                                            key={idx}
                                            onClick={() => onSelect(patient.nome, patient.records)}
                                            className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50 cursor-pointer transition-colors"
                                        >
                                            <div>
                                                <p className="font-semibold text-sm">{patient.nome}</p>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    Último registro: {mostRecent.dataAgendamento.split('-').reverse().join('/')} às {mostRecent.horario}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <Badge variant={isCancelado ? "destructive" : "default"} className={isCancelado ? "" : "bg-green-600 hover:bg-green-700"}>
                                                    {isCancelado ? (
                                                        <><CalendarX className="h-3 w-3 mr-1"/> Cancelado</>
                                                    ) : (
                                                        <><CalendarCheck2 className="h-3 w-3 mr-1"/> Agendado</>
                                                    )}
                                                </Badge>
                                                <span className="text-xs font-medium text-slate-600">
                                                    {patient.records.length} registro(s)
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : searchTerm.length >= 2 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                <Search className="h-8 w-8 mb-2 opacity-20" />
                                <p>Nenhum paciente encontrado.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <p>Digite o nome ou telefone para buscar</p>
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
}
