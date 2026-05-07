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

  const ciomTuesday = Object.values(data).filter((t: any) => 
    t.unidade === "CiomMeier" && t.diaDaSemana === "3aFeira"
  );

  ciomTuesday.forEach((t: any, i) => {
    console.log(`\nTurno ${i+1}:`);
    console.log(`  Amil: ${t.Amil}`);
    console.log(`  Unimed: ${t.Unimed}`);
    console.log(`  SulAmerica: ${t.SulAmerica}`);
    console.log(`  Particular: ${t.Particular}`);
    console.log(`  Bradesco: ${t.Bradesco}`);
  });
}

debugData().catch(console.error);
