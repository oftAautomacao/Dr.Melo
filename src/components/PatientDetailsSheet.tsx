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
import { Search, Phone, Calendar, Clock, MapPin, User, Activity } from "lucide-react";
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
            <SheetContent side="right" className="sm:max-w-[600px] w-full p-0 flex flex-col">
                <SheetHeader className="p-6 pb-2">
                    <SheetTitle className="text-xl font-bold flex items-center gap-2">
                        <Activity className="h-5 w-5 text-blue-600" />
                        {title}
                    </SheetTitle>
                    <SheetDescription>
                        Mostrando {filteredPatients.length} de {patients.length} registros.
                    </SheetDescription>
                    <div className="relative mt-4">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                        <Input
                            placeholder="Buscar paciente pelo nome..."
                            className="pl-9 bg-gray-50 border-gray-200"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </SheetHeader>

                <ScrollArea className="flex-grow">
                    <div className="p-6 pt-2">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-b border-gray-100">
                                    <TableHead className="w-[200px] font-bold">Paciente</TableHead>
                                    <TableHead className="font-bold">Info</TableHead>
                                    <TableHead className="text-right font-bold">Consulta</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredPatients.map((patient, idx) => (
                                    <TableRow key={idx} className="hover:bg-gray-50/50">
                                        <TableCell className="py-4">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8 bg-blue-100 text-blue-700 font-semibold text-xs">
                                                    <AvatarFallback>{getInitials(patient.nome)}</AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-sm text-gray-900 leading-tight">
                                                        {patient.nome}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500">
                                                        {patient.idade} anos • {patient.convenio}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                                                    <MapPin className="h-3 w-3 text-blue-500" />
                                                    <span className="truncate max-w-[120px]">{patient.unidadeName}</span>
                                                </div>
                                                {patient.telefone && (
                                                    <div className="flex items-center gap-1.5 text-[10px] text-green-600 font-medium">
                                                        <Phone className="h-3 w-3" />
                                                        <a href={`tel:${patient.telefone}`} className="hover:underline">
                                                            {patient.telefone}
                                                        </a>
                                                    </div>
                                                )}
                                                {patient.exames.length > 0 && (
                                                    <div className="text-[10px] text-orange-600 flex gap-1 truncate max-w-[120px]">
                                                        <Activity className="h-3 w-3 shrink-0" />
                                                        <span className="truncate">{patient.exames.join(", ")}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4 text-right">
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                                                    <Calendar className="h-3 w-3 text-blue-500" />
                                                    {patient.dataConsulta}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                                    <Clock className="h-3 w-3" />
                                                    {patient.horario}
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredPatients.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-10 text-gray-500 italic">
                                            Nenhum paciente encontrado.
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
