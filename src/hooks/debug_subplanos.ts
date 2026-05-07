import { getDatabase, ref, get } from "firebase/database";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  databaseURL: "https://oftautomacao-9b427-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function debugData() {
  const base = "DRM";
  const path = `${base}/agendamentoWhatsApp/configuracoes/subplanos`;
  
  const snapshot = await get(ref(db, path));
  const data = snapshot.val();
  
  if (!data) return;

  console.log("Subplanos configuration for CiomMeier:");
  const subplanos = Object.values(data).filter((sp: any) => sp.CiomMeier === 'Nao');
  console.log(`Found ${subplanos.length} subplanos where CiomMeier is 'Nao'.`);
  
  if (subplanos.length > 0) {
    console.log("Example subplanos where CiomMeier is 'Nao':");
    subplanos.slice(0, 5).forEach((sp: any) => {
      console.log(`  Convenio: ${sp.convenio}, Subplano: ${sp.subplano}`);
    });
  }
}

debugData().catch(console.error);
