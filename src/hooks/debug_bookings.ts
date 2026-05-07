import { getDatabase, ref, get } from "firebase/database";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  databaseURL: "https://oftautomacao-9b427-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function debugData() {
  const dateStr = "2026-05-12"; // Next Tuesday
  const unit = "CiomMeier";
  const path = `/DRM/agendamentoWhatsApp/operacional/consultasAgendadas/unidades/${unit}/${dateStr}`;
  
  console.log(`Checking bookings for ${unit} on ${dateStr} at ${path}...`);
  const snapshot = await get(ref(db, path));
  const data = snapshot.val();
  
  if (!data) {
    console.log("No bookings found.");
    return;
  }

  console.log("Bookings:", JSON.stringify(data, null, 2));
}

debugData().catch(console.error);
