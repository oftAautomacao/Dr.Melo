import { getDatabase, ref, get } from "firebase/database";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  databaseURL: "https://oftautomacao-9b427-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function debugData() {
  const base = "DRM";
  const path = `${base}/agendamentoWhatsApp/configuracoes/turnosCriterios`;
  
  const snapshot = await get(ref(db, path));
  const data = snapshot.val();
  
  if (!data) return;

  const ciomTurnos = Object.values(data).filter((t: any) => 
    t.unidade && t.unidade.toUpperCase().includes("CIOM") && t.diaDaSemana === "3aFeira"
  );

  console.log(`Found ${ciomTurnos.length} turnos for CIOM on Tuesday (3aFeira).`);
  
  ciomTurnos.forEach((t: any, i) => {
    console.log(`\nTurno ${i+1}:`);
    console.log(`  Dia: ${t.diaDaSemana}`);
    console.log(`  Unidade: ${t.unidade}`);
    console.log(`  Mapeamento de Retina: ${t['Mapeamento de Retina'] || t['MapeamentoDeRetina'] || 'N/A'}`);
    console.log(`  Ultrassonografia: ${t['Ultrassonografia'] || t['UltrassonografiaDeGloboOcular'] || t['UltrassonografiaOcular'] || 'N/A'}`);
    console.log(`  Particular: ${t['Particular']}`);
    console.log(`  Full data keys:`, Object.keys(t).filter(k => t[k] === 'Sim'));
  });
}

debugData().catch(console.error);
