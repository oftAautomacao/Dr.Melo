import React, { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { ref, onValue, type DataSnapshot } from "firebase/database";
import { getDatabaseInstance } from "@/lib/firebase";
import { ENVIRONMENT } from "../../ambiente";
import { getFirebasePathBase } from "@/lib/firebaseConfig";

interface PatientSelectWithSearchProps {
  onPatientSelect: (phoneNumber: string | null) => void;
  selectedPatient: string | null;
}

const PatientSelectWithSearch: React.FC<PatientSelectWithSearchProps> = ({
  onPatientSelect,
  selectedPatient,
}) => {
  const [patientPhones, setPatientPhones] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  /* --- carrega telefones uma vez --- */
  useEffect(() => {
    const dbPath = `/${getFirebasePathBase()}/agendamentoWhatsApp/operacional/conversas`;
    const unsub = onValue(
      ref(getDatabaseInstance(ENVIRONMENT), dbPath),
      (snap: DataSnapshot) => {
        const data = snap.val();
        setPatientPhones(
          data && typeof data === "object"
            ? Object.keys(data).sort((a, b) => a.localeCompare(b))
            : []
        );
        setIsLoading(false);
      },
      (err) => {
        console.error("Firebase:", err);
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  /* --- lista filtrada --- */
  const filtered = useMemo(() => {
    const term = searchTerm.trim();
    return term === ""
      ? patientPhones
      : patientPhones.filter((p) => p.includes(term));
  }, [patientPhones, searchTerm]);

  /* --- seleção automática sempre que digitar --- */
  useEffect(() => {
    if (isLoading) return;
    if (searchTerm.trim() === "") {
      onPatientSelect(null);
      return;
    }
    if (filtered.length > 0 && filtered[0] !== selectedPatient) {
      onPatientSelect(filtered[0]);
    }
  }, [searchTerm, filtered, isLoading, onPatientSelect, selectedPatient]);

  const handleClick = (phone: string) => {
    onPatientSelect(phone);
    setSearchTerm(phone);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="patient-search">Buscar telefone</Label>
      <Input
        id="patient-search"
        placeholder="Digite o nº…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <ScrollArea className="h-32 rounded-md border p-2">
        {isLoading ? (
          <p className="text-sm text-gray-500">Carregando…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum resultado.</p>
        ) : (
          filtered.map((phone) => (
            <div
              key={phone}
              onClick={() => handleClick(phone)}
              className={`px-2 py-1 cursor-pointer rounded ${selectedPatient === phone
                ? "bg-blue-200 font-medium"
                : "hover:bg-gray-100"
                }`}
            >
              {phone}
            </div>
          ))
        )}
      </ScrollArea>
    </div>
  );
};

export default PatientSelectWithSearch;
