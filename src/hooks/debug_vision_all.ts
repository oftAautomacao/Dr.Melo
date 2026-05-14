import { getApp, getApps, initializeApp } from "firebase/app";
import { getDatabase, get, ref } from "firebase/database";

const firebaseConfig = {
  databaseURL: "https://oftautomacao-9b427-default-rtdb.firebaseio.com"
};

type TurnoCriterio = {
  unidade?: string;
  diaDaSemana?: string;
  turno?: string;
  [key: string]: unknown;
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getDatabase(app);

async function debugData() {
  const base = "DRM";
  const path = `${base}/agendamentoWhatsApp/configuracoes/turnosCriterios`;
  
  const snapshot = await get(ref(db, path));
  const data = snapshot.val() as Record<string, TurnoCriterio> | null;
  
  if (!data) return;

  const vision = Object.values(data).filter((t) => 
    t.unidade === "VisionCareBarra" && t.diaDaSemana === "3aFeira"
  );

  console.log("ALL keys with 'Sim' for VisionCareBarra on Tuesday:");
  vision.forEach((t, i) => {
    const keys = Object.keys(t).filter(k => t[k] === 'Sim');
    console.log(`  Turno ${i+1} (${t.turno}):`, JSON.stringify(keys));
  });
}

debugData().catch(console.error);
