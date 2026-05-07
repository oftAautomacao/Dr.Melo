import { getDatabase, ref, get } from "firebase/database";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  databaseURL: "https://oftautomacao-9b427-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function debugData() {
  const base = "DRM";
  const path = `${base}/agendamentoWhatsApp/configuracoes/feriados`;
  
  const snapshot = await get(ref(db, path));
  const data = snapshot.val();
  
  if (!data) return;

  console.log("Holidays in database:");
  console.log(JSON.stringify(data, null, 2));
}

debugData().catch(console.error);
