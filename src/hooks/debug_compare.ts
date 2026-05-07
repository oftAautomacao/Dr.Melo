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

  const units = ["OftalmoDayTijuca", "VisionCareBarra", "CiomMeier"];
  
  units.forEach(u => {
    const turnos = Object.values(data).filter((t: any) => t.unidade === u);
    console.log(`\nUnit: ${u}`);
    if (turnos.length > 0) {
      console.log("  Sample Keys with Sim:", Object.keys(turnos[0]).filter(k => turnos[0][k] === 'Sim').filter(k => k.toLowerCase().includes("retina") || k.toLowerCase().includes("ultra")));
    }
  });
}

debugData().catch(console.error);
