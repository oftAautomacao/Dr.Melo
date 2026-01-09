"use client";

import React, { useState, useMemo } from "react";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Phone, Calendar, Clock, MapPin, User, Users, Activity } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export interface AppointmentDetail {
    nome: string;
    nascimento: string;
    idade: number | string;
    convenio: string;
    unidade: string;
    unidadeName: string;
    dataConsulta: string;
    horario: string;
    exames: string[];
    telefone: string;
}

interface PatientDetailsSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    patients: AppointmentDetail[];
}

export function PatientDetailsSheet({
    isOpen,
    onClose,
    title,
    patients,
}: PatientDetailsSheetProps) {
    const [searchTerm, setSearchTerm] = useState("");

    const filteredPatients = useMemo(() => {
        return patients.filter((p) =>
            p.nome.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [patients, searchTerm]);

    const getInitials = (name: string) => {
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .substring(0, 2);
    };

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="right" className="sm:max-w-[700px] w-full p-0 flex flex-col bg-white border-l border-slate-200">
                <SheetHeader className="p-5 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-lg shadow-sm">
                            <Users className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <SheetTitle className="text-lg font-bold text-slate-900 leading-tight">
                                {title}
                            </SheetTitle>
                            <SheetDescription className="text-[11px] font-semibold text-slate-500 uppercase tracking-tighter">
                                {filteredPatients.length} REGISTROS ENCONTRADOS
                            </SheetDescription>
                        </div>
                    </div>

                    <div className="relative mt-3">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por nome do paciente..."
                            className="pl-8 h-9 bg-white border-slate-200 focus:ring-1 focus:ring-blue-500 rounded-md text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </SheetHeader>

                <ScrollArea className="flex-grow">
                    <div className="min-w-full">
                        <Table className="text-xs table-fixed w-full border-collapse">
                            <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-[42%] font-extrabold text-slate-900 h-10 px-4">PACIENTE / INFO</TableHead>
                                    <TableHead className="w-[33%] font-extrabold text-slate-900 h-10 px-4">UNIDADE / CONTATO</TableHead>
                                    <TableHead className="w-[25%] text-right font-extrabold text-slate-900 h-10 px-4">CONSULTA</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredPatients.map((patient, idx) => (
                                    <TableRow key={idx} className="hover:bg-blue-50/40 border-b border-slate-100 transition-colors">
                                        <TableCell className="py-3 px-4 align-top">
                                            <div className="flex items-center gap-2.5">
                                                <Avatar className="h-8 w-8 rounded-md border border-slate-200 shrink-0 shadow-sm">
                                                    <AvatarFallback className="bg-blue-600 text-white font-bold text-[10px]">
                                                        {getInitials(patient.nome)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col min-w-0 pr-1">
                                                    <span className="font-bold text-slate-900 text-[13px] leading-tight truncate">
                                                        {patient.nome}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100/50">
                                                            {patient.idade} ANOS
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                                            {patient.convenio}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-3 px-4 align-top">
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                                                    <MapPin className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                                    <span className="truncate leading-none">{patient.unidadeName}</span>
                                                </div>
                                                {patient.telefone && (
                                                    <a href={`tel:${patient.telefone}`} className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-bold transition-colors">
                                                        <Phone className="h-3.5 w-3.5 shrink-0" />
                                                        <span className="leading-none tracking-tight">{patient.telefone}</span>
                                                    </a>
                                                )}
                                                {patient.exames.length > 0 && (
                                                    <div className="flex items-start gap-1.5 text-orange-600 font-bold">
                                                        <Activity className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                        <span className="leading-tight uppercase text-[9px] break-words line-clamp-2">
                                                            {patient.exames.join(", ")}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-3 px-4 align-top text-right">
                                            <div className="inline-flex flex-col items-end gap-2">
                                                <div className="flex items-center gap-1.5 font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-md border border-slate-200 whitespace-nowrap shadow-sm group-hover:bg-white transition-colors">
                                                    <Calendar className="h-3.5 w-3.5 text-blue-600" />
                                                    {patient.dataConsulta || "S/ Data"}
                                                </div>
                                                <div className="flex items-center gap-1 font-bold text-slate-500 pr-1">
                                                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                    {patient.horario || "--:--"}
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredPatients.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-16 text-slate-400">
                                            <div className="flex flex-col items-center gap-3">
                                                <Search className="h-10 w-10 opacity-10" />
                                                <p className="font-medium italic">Nenhum registro encontrado.</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
