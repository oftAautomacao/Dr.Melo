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

  recreio.forEach((t: any, i) => {
    console.log(`\nTurno ${i+1}:`);
    console.log(`  Turno: ${t.turno}`);
    console.log(`  MapeamentoDeRetina: ${t.MapeamentoDeRetina}`);
    console.log(`  UltrassonografiaOcular: ${t.UltrassonografiaOcular}`);
  });
}

debugData().catch(console.error);
