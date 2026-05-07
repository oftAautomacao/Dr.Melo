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

  const recreioMonday = Object.values(data).filter((t: any) => 
    t.unidade === "OftalmoRecreio" && t.diaDaSemana === "2aFeira"
  );

  console.log("Amil support for OftalmoRecreio on Monday:");
  recreioMonday.forEach((t: any, i) => {
    console.log(`  Turno ${i+1} (${t.turno}): Amil=${t.Amil}`);
  });
}

debugData().catch(console.error);
