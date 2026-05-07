import { getDatabase, ref, get } from "firebase/database";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  databaseURL: "https://oftautomacao-9b427-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function debugSearch() {
  const base = "DRM";
  const basePath = `${base}/agendamentoWhatsApp/configuracoes`;
  
  const turnosSnap = await get(ref(db, `${basePath}/turnosCriterios`));
  const turnosCriterios = turnosSnap.val() || {};
  
  const convenio = "Particular";
  const procedimentos = ["MapeamentoDeRetina", "UltrassonografiaOcular"];
  const periodo = "Ambos";
  
  console.log(`Simulating search for: ${convenio}, Procs: ${procedimentos}, Periodo: ${periodo}`);

  const turnosArr = Object.values(turnosCriterios);
  
  let filtered = turnosArr.filter((t: any) => t[convenio] === 'Sim');
  console.log(`Step 1 (Convenio): ${filtered.length} turnos left.`);

  filtered = filtered.filter((t: any) => procedimentos.every(p => t[p] === 'Sim'));
  console.log(`Step 2 (Procs): ${filtered.length} turnos left.`);

  const ciomTurnos = filtered.filter((t: any) => t.unidade === "CiomMeier");
  console.log(`CIOM Turnos matching so far: ${ciomTurnos.length}`);
  
  ciomTurnos.forEach((t: any) => {
    console.log(`  - ${t.diaDaSemana} (${t.turno}): ${t.horaInicio} - ${t.horaFim}`);
  });
}

debugSearch().catch(console.error);
