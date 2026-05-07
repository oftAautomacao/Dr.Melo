"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ref, onValue, get, query, orderByKey, startAt, endAt } from "firebase/database";
import { getDatabaseInstance } from "@/lib/firebase";
import { getFirebasePathBase } from "@/lib/firebaseConfig";
import { ENVIRONMENT } from "../../ambiente";

// ----- Constants -----
const META_FIELDS = new Set([
  'chave', 'desconsiderarFim', 'desconsiderarInicio',
  'diaDaSemana', 'horaFim', 'horaInicio', 'turno', 'unidade'
]);

const DAY_MAP: Record<number, string> = {
  0: 'Domingo', 1: '2aFeira', 2: '3aFeira', 3: '4aFeira',
  4: '5aFeira', 5: '6aFeira', 6: 'Sabado',
};

const DAY_LABELS: Record<string, string> = {
  '2aFeira': '2ª feira', '3aFeira': '3ª feira', '4aFeira': '4ª feira',
  '5aFeira': '5ª feira', '6aFeira': '6ª feira', 'Sabado': 'sábado',
};

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ----- Types -----
export interface SearchParams {
  convenio: string;
  subplano: string;
  procedimentos: string[];
  periodo: 'Manha' | 'Tarde' | 'Ambos';
  selectedDates: string[]; // YYYY-MM-DD
}

export interface DaySlots {
  date: string;
  dateLabel: string;
  slots: string[];
}

export interface ExamInfo {
  nome: string;
  preco: number | string;
  drMelo?: number | string;
  clinica?: number | string;
  incluso: boolean;
}

export interface UnitResult {
  unidade: string;
  empresa: string;
  bairro: string;
  endereco: string;
  telefone: string;
  whatsApp: string;
  procedimentosAceitos: Record<string, boolean>;
  horariosDisponiveis: DaySlots[];
}

// ----- Helpers -----
function generateSlots(horaInicio: string, horaFim: string): string[] {
  const slots: string[] = [];
  const [startH, startM] = horaInicio.split(':').map(Number);
  const [endH, endM] = horaFim.split(':').map(Number);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  for (let min = startMin; min < endMin; min += 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
  }
  return slots;
}

function formatDateLabel(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = MONTH_ABBR[date.getMonth()];
  const dow = DAY_MAP[date.getDay()];
  const label = DAY_LABELS[dow] || dow;
  return `${day}/${month} (${label})`;
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ----- Hook -----
export function useBuscaHorarios() {
  const [turnosCriterios, setTurnosCriterios] = useState<Record<string, any>>({});
  const [unidadesConfig, setUnidadesConfig] = useState<Record<string, any>>({});
  const [subplanosData, setSubplanosData] = useState<Record<string, any>>({});
  const [datasBloqueadas, setDatasBloqueadas] = useState<Record<string, any>>({});
  const [feriadosData, setFeriadosData] = useState<Record<string, any>>({});
  const [conveniosData, setConveniosData] = useState<Record<string, any>>({});
  const [examesMetadata, setExamesMetadata] = useState<Record<string, ExamInfo>>({});

  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UnitResult[] | null>(null);

  // Load config data from Firebase on mount
  useEffect(() => {
    const db = getDatabaseInstance(ENVIRONMENT);
    const base = getFirebasePathBase();
    const basePath = `${base}/agendamentoWhatsApp/configuracoes`;
    let loaded = 0;
    const totalToLoad = 7;
    const checkDone = () => { loaded++; if (loaded >= totalToLoad) setLoading(false); };

    const off1 = onValue(ref(db, `${basePath}/turnosCriterios`), s => {
      setTurnosCriterios(s.exists() ? s.val() : {}); checkDone();
    });
    const off2 = onValue(ref(db, `${basePath}/unidades`), s => {
      setUnidadesConfig(s.exists() ? s.val() : {}); checkDone();
    });
    const off3 = onValue(ref(db, `${basePath}/subplanos`), s => {
      setSubplanosData(s.exists() ? s.val() : {}); checkDone();
    });
    const off4 = onValue(ref(db, `${basePath}/datasBloqueadas`), s => {
      setDatasBloqueadas(s.exists() ? s.val() : {}); checkDone();
    });
    const off5 = onValue(ref(db, `${basePath}/feriados`), (snap) => {
      const data = snap.val() || {};
      const processed: Record<string, string> = {};
      Object.values(data).forEach((h: any) => {
        if (h && h.data) {
          const dStr = h.data.split('T')[0];
          processed[dStr] = h.nome || h.name || "Feriado";
        }
      });
      setFeriadosData(processed);
      checkDone();
    });
    const off6 = onValue(ref(db, `${basePath}/convenios`), s => {
      setConveniosData(s.exists() ? s.val() : {}); checkDone();
    });
    const off7 = onValue(ref(db, `${basePath}/exames`), s => {
      const val = s.exists() ? s.val() : {};
      const mapped: Record<string, ExamInfo> = {};
      Object.entries(val).forEach(([k, v]: [string, any]) => {
        mapped[k] = {
          nome: v.nome || k,
          preco: v.preco,
          drMelo: v.drMelo,
          clinica: v.clinica,
          incluso: v.preco === "incluso na consulta" || v.drMelo === "incluso na consulta"
        };
      });
      setExamesMetadata(mapped);
      checkDone();
    });

    return () => { off1(); off2(); off3(); off4(); off5(); off6(); off7(); };
  }, []);

  // Derive convênio names from conveniosData
  const conveniosList = useMemo(() => {
    const names = Object.keys(conveniosData).sort();
    if (!names.includes('Particular')) names.unshift('Particular');
    return names;
  }, [conveniosData]);

  // Derive procedure/exam names from turnosCriterios
  const procedimentosList = useMemo(() => {
    const convSet = new Set(Object.keys(conveniosData));
    convSet.add('Particular');
    const procSet = new Set<string>();
    Object.values(turnosCriterios).forEach((turno: any) => {
      Object.keys(turno).forEach(key => {
        if (!META_FIELDS.has(key) && !convSet.has(key) && (turno[key] === 'Sim' || turno[key] === 'Nao')) {
          procSet.add(key);
        }
      });
    });
    return Array.from(procSet).sort();
  }, [turnosCriterios, conveniosData]);

  // Derive subplanos map: convenio -> subplano names
  const subplanosMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    Object.values(subplanosData).forEach((sp: any) => {
      if (sp.convenio && sp.subplano) {
        if (!map[sp.convenio]) map[sp.convenio] = [];
        if (!map[sp.convenio].includes(sp.subplano)) {
          map[sp.convenio].push(sp.subplano);
        }
      }
    });
    Object.keys(map).forEach(k => map[k].sort());
    return map;
  }, [subplanosData]);

  // Check if a date is blocked for a unit or is a holiday
  const isDateBlocked = useCallback((dateStr: string, unitName: string): boolean => {
    // Check unit-specific blocked dates
    if (datasBloqueadas[unitName]) {
      const blocked = datasBloqueadas[unitName];
      if (typeof blocked === 'object') {
        if (Object.values(blocked).some((v: any) => v === dateStr || v?.data === dateStr)) return true;
      }
    }
    // Check holidays
    if (feriadosData && feriadosData[dateStr]) return true;
    return false;
  }, [datasBloqueadas, feriadosData]);

  // Main search function
  const buscar = useCallback(async (params: SearchParams) => {
    setSearching(true);
    setResults(null);

    try {
      const { convenio, subplano, procedimentos, periodo, selectedDates } = params;
      const isParticular = convenio === 'Particular';
      const turnosArr = Object.values(turnosCriterios) as any[];

      // Step 1: Filter turnos by convênio
      let filteredTurnos = turnosArr.filter(turno => {
        if (isParticular) return turno['Particular'] === 'Sim';
        return turno[convenio] === 'Sim';
      });

      // Step 2: Subplano filtering
      if (!isParticular && subplano) {
        const spEntry = Object.values(subplanosData).find(
          (sp: any) => sp.convenio === convenio && sp.subplano === subplano
        ) as any;
        if (spEntry) {
          filteredTurnos = filteredTurnos.filter(turno => spEntry[turno.unidade] === 'Sim');
        }
      }

      // Step 3: Filter by procedures
      if (procedimentos.length > 0) {
        filteredTurnos = filteredTurnos.filter(turno =>
          procedimentos.every(proc => turno[proc] === 'Sim')
        );
      }

      // Step 4: Filter by periodo
      if (periodo !== 'Ambos') {
        filteredTurnos = filteredTurnos.filter(turno => turno.turno === periodo);
      }

      // Step 5: Group by unit
      const turnosByUnit: Record<string, any[]> = {};
      filteredTurnos.forEach(turno => {
        if (!turnosByUnit[turno.unidade]) turnosByUnit[turno.unidade] = [];
        turnosByUnit[turno.unidade].push(turno);
      });

      const db = getDatabaseInstance(ENVIRONMENT);
      const now = new Date();
      const todayStr = formatDateKey(now);

      const unitResults: UnitResult[] = [];

      for (const [unitName, turnos] of Object.entries(turnosByUnit)) {
        const unitConfig = unidadesConfig[unitName] || {};
        const dayTurnoMap: Record<string, any[]> = {};
        turnos.forEach(t => {
          if (!dayTurnoMap[t.diaDaSemana]) dayTurnoMap[t.diaDaSemana] = [];
          dayTurnoMap[t.diaDaSemana].push(t);
        });

        const sortedDates = [...selectedDates].sort();
        const startStr = sortedDates[0];
        const endStr = sortedDates[sortedDates.length - 1];
        
        let scheduledData: Record<string, any> = {};
        
        try {
          const unitRef = ref(db, `/DRM/agendamentoWhatsApp/operacional/consultasAgendadas/unidades/${unitName}`);
          const q = query(unitRef, orderByKey(), startAt(startStr), endAt(endStr));
          const snap = await get(q);
          if (snap.exists()) scheduledData = snap.val();
        } catch (e) {}

        const horariosDisponiveis: DaySlots[] = [];
        
        for (const dateStr of sortedDates) {
          if (dateStr < todayStr) continue;
          
          const [y, m, d] = dateStr.split('-').map(Number);
          const currentDate = new Date(y, m - 1, d);
          const dayName = DAY_MAP[currentDate.getDay()];
          const isToday = dateStr === todayStr;

          if (dayName !== 'Domingo' && !isDateBlocked(dateStr, unitName)) {
            const dayTurnos = dayTurnoMap[dayName];
            if (dayTurnos && dayTurnos.length > 0) {
              let allSlots: string[] = [];
              dayTurnos.forEach(turno => {
                const slots = generateSlots(turno.horaInicio, turno.horaFim);
                allSlots.push(...slots);
              });

              allSlots = [...new Set(allSlots)].sort();

              if (isToday) {
                const limitTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
                const limitH = limitTime.getHours();
                const limitM = limitTime.getMinutes();
                allSlots = allSlots.filter(slot => {
                  const [h, m] = slot.split(':').map(Number);
                  return h > limitH || (h === limitH && m >= limitM);
                });
              }

              const scheduled = scheduledData[dateStr];
              if (scheduled) {
                const occupiedTimes = new Set(Object.keys(scheduled));
                allSlots = allSlots.filter(slot => !occupiedTimes.has(slot));
              }

              if (allSlots.length > 0) {
                horariosDisponiveis.push({
                  date: dateStr,
                  dateLabel: formatDateLabel(currentDate),
                  slots: allSlots,
                });
              }
            }
          }
        }

        const procAceitos: Record<string, boolean> = {};
        if (procedimentos.length > 0) {
          procedimentos.forEach(proc => {
            procAceitos[proc] = turnos.some(t => t[proc] === 'Sim');
          });
        }

        if (horariosDisponiveis.length > 0) {
          unitResults.push({
            unidade: unitName,
            empresa: unitConfig.empresa || unitName,
            bairro: unitConfig.bairro || '',
            endereco: unitConfig.endereco || '',
            telefone: unitConfig.telefoneUnidade?.toString() || unitConfig.telefone?.toString() || '',
            whatsApp: unitConfig.whatsApp?.toString() || '',
            procedimentosAceitos: procAceitos,
            horariosDisponiveis,
          });
        }
      }

      unitResults.sort((a, b) => {
        const slotsA = a.horariosDisponiveis.reduce((sum, d) => sum + d.slots.length, 0);
        const slotsB = b.horariosDisponiveis.reduce((sum, d) => sum + d.slots.length, 0);
        return slotsB - slotsA;
      });

      setResults(unitResults);
    } catch (error) {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [turnosCriterios, unidadesConfig, subplanosData, isDateBlocked]);

  // Generate copyable response text
  const gerarResposta = useCallback((resultados: UnitResult[]): string => {
    if (!resultados || resultados.length === 0) return '';
    return resultados.map(unit => {
      const lines = [`*${unit.empresa}*`];
      unit.horariosDisponiveis.forEach(day => {
        lines.push(`- ${day.dateLabel}: ${day.slots.join(', ')}`);
      });
      return lines.join('\n');
    }).join('\n\n');
  }, []);

  // Helper to calculate the SOONEST date where a NEW unit offers specific procedures
  const getNextDiscoveryDate = useCallback((selectedProcs: string[], excludeUnits: string[] = [], excludeDates: string[] = []) => {
    if (selectedProcs.length === 0) return null;
    
    const excludeSet = new Set(excludeUnits);
    const excludeDatesSet = new Set(excludeDates);
    const dayToNum: Record<string, number> = {
      'Domingo': 0, '2aFeira': 1, '3aFeira': 2, '4aFeira': 3,
      '5aFeira': 4, '6aFeira': 5, 'Sabado': 6
    };

    // 1. Find all possible days of week for discovery units
    const discoveryDaysOfWeek = new Set<number>();
    const unitsByDay: Record<number, string[]> = {};

    Object.values(turnosCriterios).forEach((turno: any) => {
      if (excludeSet.has(turno.unidade)) return;
      const matchesAll = selectedProcs.every(p => turno[p] === 'Sim');
      if (matchesAll) {
        const num = dayToNum[turno.diaDaSemana];
        if (num !== undefined) {
          discoveryDaysOfWeek.add(num);
          if (!unitsByDay[num]) unitsByDay[num] = [];
          unitsByDay[num].push(turno.unidade);
        }
      }
    });

    if (discoveryDaysOfWeek.size === 0) return null;

    // 2. Find the soonest date matching one of these days, excluding already selected dates
    const now = new Date();
    for (let i = 0; i < 31; i++) { // Check up to 30 days ahead
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() + i);
      const dateStr = formatDateKey(checkDate);

      // Skip if date is already selected by the user
      if (excludeDatesSet.has(dateStr)) continue;

      const dow = checkDate.getDay();
      if (discoveryDaysOfWeek.has(dow)) {
        const unitsOnThisDay = unitsByDay[dow];
        const hasValidUnit = unitsOnThisDay.some(u => !isDateBlocked(dateStr, u));
        if (hasValidUnit) return dateStr;
      }
    }

    return null;
  }, [turnosCriterios, isDateBlocked]);

  return {
    loading,
    searching,
    results,
    conveniosList,
    procedimentosList,
    subplanosMap,
    examesMetadata,
    feriadosData,
    buscar,
    gerarResposta,
    getNextDiscoveryDate,
  };
}
