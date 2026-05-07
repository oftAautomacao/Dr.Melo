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

  const allKeys = new Set<string>();
  Object.values(data).forEach((t: any) => {
    Object.keys(t).forEach(k => {
      if (t[k] === 'Sim' || t[k] === 'Nao') {
        allKeys.add(k);
      }
    });
  });

  const sortedKeys = Array.from(allKeys).sort();
  console.log("All procedure keys in database:");
  console.log(JSON.stringify(sortedKeys, null, 2));
}

debugData().catch(console.error);
