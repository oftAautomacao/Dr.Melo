import { getDatabase, ref, get } from "firebase/database";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  databaseURL: "https://oftautomacao-9b427-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function debugData() {
  const base = "DRM";
  const path = `${base}/agendamentoWhatsApp/configuracoes/unidades`;
  
  const snapshot = await get(ref(db, path));
  const data = snapshot.val();
  
  if (!data) return;

  console.log("Unidades configuration keys:");
  console.log(JSON.stringify(Object.keys(data), null, 2));
  
  console.log("\nDetails for CiomMeier:");
  console.log(JSON.stringify(data['CiomMeier'], null, 2));
}

debugData().catch(console.error);
