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
const DAY_ORDER = ['2aFeira', '3aFeira', '4aFeira', '5aFeira', '6aFeira', 'Sabado'];

// ----- Types -----
export interface SearchParams {
  convenio: string;
  subplano: string;
  procedimentos: string[];
  periodo: 'Manha' | 'Tarde' | 'Ambos';
  selectedDates: string[]; // YYYY-MM-DD
  unidades?: string[];
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
  horariosFuncionamento?: string[];
  conveniosAceitos?: string[];
  subplanosAceitos?: string[];
  examesDisponiveis?: string[];
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

function buildHorariosFuncionamento(turnos: any[]): string[] {
  const grouped = new Map<string, Set<string>>();

  turnos.forEach((turno) => {
    if (!turno?.diaDaSemana || !turno?.horaInicio || !turno?.horaFim) return;
    const ranges = grouped.get(turno.diaDaSemana) ?? new Set<string>();
    ranges.add(`${turno.horaInicio} às ${turno.horaFim}`);
    grouped.set(turno.diaDaSemana, ranges);
  });

  return DAY_ORDER
    .filter((day) => grouped.has(day))
    .map((day) => `${DAY_LABELS[day] || day}: ${Array.from(grouped.get(day) || []).sort().join(" • ")}`);
}

// ----- Hook -----
export function useBuscaHorarios() {
  const [turnosCriterios, setTurnosCriterios] = useState<Record<string, any>>({});
  const [turnosCriteriosExcecoes, setTurnosCriteriosExcecoes] = useState<Record<string, any>>({});
  const [unidadesConfig, setUnidadesConfig] = useState<Record<string, any>>({});
  const [subplanosData, setSubplanosData] = useState<Record<string, any>>({});
  const [datasBloqueadas, setDatasBloqueadas] = useState<Record<string, any>>({});
  const [feriadosData, setFeriadosData] = useState<Record<string, any>>({});
  const [conveniosData, setConveniosData] = useState<Record<string, any>>({});
  const [examesData, setExamesData] = useState<Record<string, any>>({});
  const [cirurgiasData, setCirurgiasData] = useState<Record<string, any>>({});

  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UnitResult[] | null>(null);

  // Load config data from Firebase on mount
  useEffect(() => {
    const db = getDatabaseInstance(ENVIRONMENT);
    const base = getFirebasePathBase();
    const basePath = `${base}/agendamentoWhatsApp/configuracoes`;
    let loaded = 0;
    const totalToLoad = 9;
    const checkDone = () => { loaded++; if (loaded >= totalToLoad) setLoading(false); };

    const off1 = onValue(ref(db, `${basePath}/turnosCriterios`), s => {
      setTurnosCriterios(s.exists() ? s.val() : {}); checkDone();
    });
    const offEx = onValue(ref(db, `${basePath}/turnosCriteriosExcecoes`), s => {
      setTurnosCriteriosExcecoes(s.exists() ? s.val() : {}); checkDone();
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
      setExamesData(s.exists() ? s.val() : {}); checkDone();
    });
    const off8 = onValue(ref(db, `${basePath}/cirurgias`), s => {
      setCirurgiasData(s.exists() ? s.val() : {}); checkDone();
    });

    return () => { off1(); offEx(); off2(); off3(); off4(); off5(); off6(); off7(); off8(); };
  }, []);

  const examesMetadata = useMemo<Record<string, ExamInfo>>(() => {
    const mapped: Record<string, ExamInfo> = {};
    
    // Process exames
    Object.entries(examesData).forEach(([k, v]: [string, any]) => {
      mapped[k] = {
        nome: v.nome || k,
        preco: v.preco,
        drMelo: v.drMelo,
        clinica: v.clinica,
        incluso: v.preco === "incluso na consulta" || v.drMelo === "incluso na consulta"
      };
    });

    // Process cirurgias
    Object.entries(cirurgiasData).forEach(([k, v]: [string, any]) => {
      if (v) {
        mapped[k] = {
          nome: v.nome || mapped[k]?.nome || k,
          preco: v.preco !== undefined ? v.preco : (mapped[k]?.preco ?? ""),
          drMelo: v.drMelo !== undefined ? v.drMelo : (mapped[k]?.drMelo ?? ""),
          clinica: v.clinica !== undefined ? v.clinica : (mapped[k]?.clinica ?? ""),
          incluso: v.preco === "incluso na consulta" || v.drMelo === "incluso na consulta" || (mapped[k]?.incluso ?? false)
        };
      }
    });

    return mapped;
  }, [examesData, cirurgiasData]);

  // Derive convênio names from conveniosData
  const convenioNamesSet = useMemo(() => {
    const names = new Set<string>(Object.keys(conveniosData));
    Object.values(subplanosData).forEach((sp: any) => {
      if (sp?.convenio) names.add(sp.convenio);
    });
    names.add('Particular');
    return names;
  }, [conveniosData, subplanosData]);

  const conveniosList = useMemo(() => {
    const names = Array.from(convenioNamesSet).sort();
    if (!names.includes('Particular')) names.unshift('Particular');
    return names;
  }, [convenioNamesSet]);

  // Derive procedure/exam names from turnosCriterios
  const procedimentosList = useMemo(() => {
    const procSet = new Set<string>();
    Object.values(turnosCriterios).forEach((turno: any) => {
      Object.keys(turno).forEach(key => {
        if (!META_FIELDS.has(key) && !convenioNamesSet.has(key) && (turno[key] === 'Sim' || turno[key] === 'Nao')) {
          procSet.add(key);
        }
      });
    });
    return Array.from(procSet).sort();
  }, [turnosCriterios, convenioNamesSet]);

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

  // Check if a date/time is blocked for a unit
  const getBlockInfo = useCallback((dateStr: string, unitName: string) => {
    let isFullDay = false;
    const blockedTimes: { start: string; end: string }[] = [];

    // Check holidays
    if (feriadosData && feriadosData[dateStr]) {
      isFullDay = true;
    }

    // Check unit-specific blocked dates/times
    if (datasBloqueadas[unitName]) {
      const blocked = datasBloqueadas[unitName];
      if (typeof blocked === 'object') {
        Object.values(blocked).forEach((v: any) => {
          const vDate = typeof v === 'string' ? v : v?.data;
          if (vDate === dateStr) {
            if (v.horaInicio && v.horaFim) {
              blockedTimes.push({ start: v.horaInicio, end: v.horaFim });
            } else {
              isFullDay = true;
            }
          }
        });
      }
    }

    return { isFullDay, blockedTimes };
  }, [datasBloqueadas, feriadosData]);

  const isTimeInBlockedRanges = (time: string, ranges: { start: string; end: string }[]) => {
    if (!time || !ranges.length) return false;
    const parts = time.split(':');
    if (parts.length < 2) return false;
    const [h, m] = parts.map(Number);
    const timeVal = h * 60 + m;
    
    return ranges.some(range => {
      if (!range.start || !range.end) return false;
      const sParts = range.start.split(':');
      const eParts = range.end.split(':');
      if (sParts.length < 2 || eParts.length < 2) return false;
      
      const [sh, sm] = sParts.map(Number);
      const [eh, em] = eParts.map(Number);
      const startVal = sh * 60 + sm;
      const endVal = eh * 60 + em;
      return timeVal >= startVal && timeVal < endVal;
    });
  };

  // Main search function
  const buscar = useCallback(async (params: SearchParams) => {
    setSearching(true);
    setResults(null);

    try {
      const { convenio, subplano, procedimentos, periodo, selectedDates, unidades } = params;
      const isParticular = convenio === 'Particular';
      let turnosArr = Object.values(turnosCriterios) as any[];

      // Step 0: Filter by specific units if provided
      if (unidades && unidades.length > 0) {
        turnosArr = turnosArr.filter(turno => unidades.includes(turno.unidade));
      }

      // Step 1: Filter turnos by convênio (only if convenio is provided)
      let filteredTurnos = turnosArr;
      if (convenio) {
        filteredTurnos = turnosArr.filter(turno => {
          if (isParticular) return turno['Particular'] === 'Sim';
          return turno[convenio] === 'Sim';
        });
      }

      // Step 2: Subplano filtering (only if convenio is provided)
      if (convenio && !isParticular && subplano) {
        const spEntry = Object.values(subplanosData).find(
          (sp: any) => sp.convenio === convenio && sp.subplano === subplano
        ) as any;
        if (spEntry) {
          filteredTurnos = filteredTurnos.filter(turno => spEntry[turno.unidade] === 'Sim');
        }
      }

      // Step 3: Filter by procedures (with exceptions override)
      if (procedimentos.length > 0) {
        filteredTurnos = filteredTurnos.filter(turno => {
          const unit = turno.unidade;
          const day = turno.diaDaSemana;
          const shift = turno.turno;
          
          // Try to find an exception for this unit/day/shift
          // Exceptions are often keyed as 'Unidade_Dia_Turno' or similar in the user's patterns
          const exKey = `${unit}_${day}_${shift}`;
          const exception = turnosCriteriosExcecoes[exKey] || Object.values(turnosCriteriosExcecoes).find((ex: any) => 
            ex.unidade === unit && ex.diaDaSemana === day && ex.turno === shift
          );

          return procedimentos.every(proc => {
            if (exception && exception[proc] !== undefined) {
              return exception[proc] === 'Sim';
            }
            return turno[proc] === 'Sim';
          });
        });
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
      const isDateLessSearch = selectedDates.length === 0;

      for (const [unitName, turnos] of Object.entries(turnosByUnit)) {
        const unitConfig = unidadesConfig[unitName] || {};
        const unitBaseTurnos = turnosArr.filter((turno) => turno.unidade === unitName);
        const dayTurnoMap: Record<string, any[]> = {};
        turnos.forEach(t => {
          if (!dayTurnoMap[t.diaDaSemana]) dayTurnoMap[t.diaDaSemana] = [];
          dayTurnoMap[t.diaDaSemana].push(t);
        });

        const horariosDisponiveis: DaySlots[] = [];
        
        // Determine which dates to check
        let datesToCheck: string[] = [];
        if (isDateLessSearch) {
          // Check next 30 days
          const now = new Date();
          for (let i = 0; i < 30; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() + i);
            datesToCheck.push(formatDateKey(d));
          }
        } else {
          datesToCheck = [...selectedDates].sort();
        }

        const startStr = datesToCheck[0];
        const endStr = datesToCheck[datesToCheck.length - 1];
        
        let scheduledData: Record<string, any> = {};
        try {
          const unitRef = ref(db, `/DRM/agendamentoWhatsApp/operacional/consultasAgendadas/unidades/${unitName}`);
          const q = query(unitRef, orderByKey(), startAt(startStr), endAt(endStr));
          const snap = await get(q);
          if (snap.exists()) scheduledData = snap.val();
        } catch (e) {}

        for (const dateStr of datesToCheck) {
          if (dateStr < todayStr) continue;
          
          const [y, m, d] = dateStr.split('-').map(Number);
          const currentDate = new Date(y, m - 1, d);
          const dayName = DAY_MAP[currentDate.getDay()];
          const isToday = dateStr === todayStr;

          const blockInfo = getBlockInfo(dateStr, unitName);

          if (dayName !== 'Domingo' && !blockInfo.isFullDay) {
            const dayTurnos = dayTurnoMap[dayName];
            if (dayTurnos && dayTurnos.length > 0) {
              let allSlots: string[] = [];
              dayTurnos.forEach(turno => {
                const slots = generateSlots(turno.horaInicio, turno.horaFim);
                allSlots.push(...slots);
              });

              allSlots = [...new Set(allSlots)].sort();

              // Apply time blocks (datasBloqueadas with horaInicio/horaFim)
              if (blockInfo.blockedTimes.length > 0) {
                allSlots = allSlots.filter(slot => !isTimeInBlockedRanges(slot, blockInfo.blockedTimes));
              }

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
                
                // If it's a date-less search, we only want the FIRST available date for each unit
                if (isDateLessSearch) break;
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

        // Calculate accepted subplans for this unit
        let subplanosAceitos: string[] = [];
        if (convenio && !isParticular && !subplano) {
          Object.values(subplanosData).forEach((sp: any) => {
            if (sp.convenio === convenio && sp[unitName] === 'Sim') {
              subplanosAceitos.push(sp.subplano);
            }
          });
        }

        const conveniosAceitos = conveniosList.filter((conv) => {
          if (conv === 'Particular') {
            return unitBaseTurnos.some((turno) => turno.Particular === 'Sim');
          }
          return unitBaseTurnos.some((turno) => turno[conv] === 'Sim');
        });

        const horariosFuncionamento = buildHorariosFuncionamento(unitBaseTurnos);

        // Calculate all exams available in this unit (considering exceptions)
        const examesDisponiveisSet = new Set<string>();
        turnos.forEach(turno => {
          const unit = turno.unidade;
          const day = turno.diaDaSemana;
          const shift = turno.turno;
          const exKey = `${unit}_${day}_${shift}`;
          const exception = turnosCriteriosExcecoes[exKey] || Object.values(turnosCriteriosExcecoes).find((ex: any) => 
            ex.unidade === unit && ex.diaDaSemana === day && ex.turno === shift
          );

          procedimentosList.forEach(p => {
            const isAccepted = (exception && exception[p] !== undefined) 
              ? exception[p] === 'Sim' 
              : turno[p] === 'Sim';
              
            if (isAccepted) examesDisponiveisSet.add(p);
          });
        });

        const shouldIncludeInformationalResult =
          Boolean(unidades && unidades.length > 0) && !convenio && procedimentos.length === 0;

        if (horariosDisponiveis.length > 0 || shouldIncludeInformationalResult) {
          unitResults.push({
            unidade: unitName,
            empresa: unitConfig.empresa || unitName,
            bairro: unitConfig.bairro || '',
            endereco: unitConfig.endereco || '',
            telefone: unitConfig.telefoneUnidade?.toString() || unitConfig.telefone?.toString() || '',
            whatsApp: unitConfig.whatsApp?.toString() || '',
            procedimentosAceitos: procAceitos,
            horariosFuncionamento,
            conveniosAceitos,
            subplanosAceitos: [...new Set(subplanosAceitos)].sort(),
            examesDisponiveis: Array.from(examesDisponiveisSet).sort(),
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
  }, [turnosCriterios, turnosCriteriosExcecoes, unidadesConfig, subplanosData, getBlockInfo, conveniosList, procedimentosList]);

  // Generate copyable response text
  const gerarResposta = useCallback((resultados: UnitResult[]): string => {
    if (!resultados || resultados.length === 0) return '';
    return resultados.map(unit => {
      const companyName =
        unit.empresa.trim().toLowerCase() === "oftalmo" && unit.bairro.trim().toLowerCase() === "recreio"
          ? "Oftalmorecreio"
          : unit.empresa;
      const header = unit.bairro ? `*${companyName} - ${unit.bairro}*` : `*${companyName}*`;
      const lines = [header];
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
        const hasValidUnit = unitsOnThisDay.some(u => !getBlockInfo(dateStr, u).isFullDay);
        if (hasValidUnit) return dateStr;
      }
    }

    return null;
  }, [turnosCriterios, getBlockInfo]);

  const unidadesList = useMemo(() => {
    const units = new Set<string>();
    Object.values(turnosCriterios).forEach((t: any) => {
      if (t.unidade) units.add(t.unidade);
    });
    return Array.from(units).sort();
  }, [turnosCriterios]);

  return {
    loading,
    searching,
    results,
    conveniosList,
    procedimentosList,
    unidadesList,
    subplanosMap,
    examesMetadata,
    feriadosData,
    buscar,
    gerarResposta,
    getNextDiscoveryDate,
  };
}
