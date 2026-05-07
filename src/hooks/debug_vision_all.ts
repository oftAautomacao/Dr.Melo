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

  const vision = Object.values(data).filter((t: any) => 
    t.unidade === "VisionCareBarra" && t.diaDaSemana === "3aFeira"
  );

  console.log("ALL keys with 'Sim' for VisionCareBarra on Tuesday:");
  vision.forEach((t, i) => {
    const keys = Object.keys(t).filter(k => t[k] === 'Sim');
    console.log(`  Turno ${i+1} (${t.turno}):`, JSON.stringify(keys));
  });
}

debugData().catch(console.error);
