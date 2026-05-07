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

  const recreio = Object.values(data).filter((t: any) => 
    t.unidade === "OftalmoRecreio" && t.diaDaSemana === "3aFeira"
  );

  console.log("Convenios with 'Sim' for OftalmoRecreio on Tuesday:");
  if (recreio.length > 0) {
    const convenios = Object.keys(recreio[0]).filter(k => recreio[0][k] === 'Sim' && !k.includes("desconsiderar") && !k.includes("hora") && !k.includes("unidade") && !k.includes("turno") && !k.includes("diaDaSemana"));
    console.log(JSON.stringify(convenios, null, 2));
  }
}

debugData().catch(console.error);
