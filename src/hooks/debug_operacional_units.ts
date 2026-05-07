import { getDatabase, ref, get } from "firebase/database";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  databaseURL: "https://oftautomacao-9b427-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function debugData() {
  const path = `/DRM/agendamentoWhatsApp/operacional/consultasAgendadas/unidades`;
  
  const snapshot = await get(ref(db, path));
  const data = snapshot.val();
  
  if (!data) return;

  console.log("Units in operacional/consultasAgendadas:");
  console.log(JSON.stringify(Object.keys(data), null, 2));
}

debugData().catch(console.error);
