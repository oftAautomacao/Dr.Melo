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

  const ultraKeys = new Set<string>();
  Object.values(data).forEach((t: any) => {
    Object.keys(t).forEach(k => {
      if (k.toLowerCase().includes("ultra") && (t[k] === 'Sim' || t[k] === 'Nao')) {
        ultraKeys.add(k);
      }
    });
  });

  console.log("Unique 'Ultra' keys:", Array.from(ultraKeys));
  
  Object.values(data).forEach((t: any) => {
    const matching = Object.keys(t).filter(k => ultraKeys.has(k) && t[k] === 'Sim');
    if (matching.length > 0) {
      console.log(`Unit ${t.unidade} (${t.diaDaSemana}): ${matching.join(', ')}`);
    }
  });
}

debugData().catch(console.error);
