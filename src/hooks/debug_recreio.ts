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

  const oftalmorecreio = Object.values(data).filter((t: any) => 
    t.unidade && t.unidade.toLowerCase().includes("recreio")
  );

  console.log(`Found ${oftalmorecreio.length} turnos for Oftalmorecreio.`);
  if (oftalmorecreio.length > 0) {
    console.log("Keys with 'Sim':", Object.keys(oftalmorecreio[0]).filter(k => oftalmorecreio[0][k] === 'Sim'));
  }
}

debugData().catch(console.error);
