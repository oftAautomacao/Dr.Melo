import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getFirestore, type Firestore } from "firebase/firestore";
// import { ENVIRONMENT } from "@/app/configuracoes/page";
import { ENVIRONMENT } from "../../ambiente";
// let ambiente = "teste";
let firebaseConfig = {};

// IMPORTANT: Replace with your actual Firebase project configuration

const testConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://teste-b720c-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "teste-b720c",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "YOUR_APP_ID",
};

const prodConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://oftautomacao-9b427-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "oftautomacao-9b427",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "YOUR_APP_ID",
};

function getAppInstance(name: string, config: any): FirebaseApp {
  const existingApp = getApps().find((app) => app.name === name);
  return existingApp || initializeApp(config, name);
}

// Inicializa ambos (ou reutiliza se já existirem)
const appTest = getAppInstance("TEST", testConfig);
// O app "default" (sem nome ou [DEFAULT]) geralmente é o que o resto do app usa se importar 'app'. 
// Vamos manter o padrão sendo Teste ou Produção conforme o ambiente "build time"? 
// Melhor: vamos forçar nomes explícitos para o backend usage.
const appProd = getAppInstance("PROD", prodConfig);

// Para compatibilidade com imports existentes que esperam um "default export" ou "app" export, 
// podemos manter o `app` apontando para um deles, mas o ideal é usar o helper.
// Por padrão, vamos deixar o app principal como Teste para evitar acidentes em dev, 
// ou o que estiver em process.env (mas aqui queremos runtime switch).
const app = appTest;

const databaseTest: Database = getDatabase(appTest);
const databaseProd: Database = getDatabase(appProd);

const dbTest: Firestore = getFirestore(appTest);
const dbProd: Firestore = getFirestore(appProd);

// Helper para selecionar o banco correto
export function getDatabaseInstance(env: "teste" | "producao"): Database {
  return env === "producao" ? databaseProd : databaseTest;
}

export function getFirestoreInstance(env: "teste" | "producao"): Firestore {
  return env === "producao" ? dbProd : dbTest;
}

// Mantendo exports antigos para não quebrar compatibilidade imediata, 
// mas eles apontarão fixo para Teste (app default) se não migrarmos tudo.
// O ideal é migrar tudo que usa 'database' para 'getDatabaseInstance'.
export { app, databaseTest as database, dbTest as db };