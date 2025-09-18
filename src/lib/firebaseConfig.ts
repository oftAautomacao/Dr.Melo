// src/lib/firebaseConfig.ts

export type Unit = "DRM" | "OFT/45";

export function getFirebasePathBase(): Unit {
  const environment = process.env.NEXT_PUBLIC_FIREBASE_ENV || "test"; // Padrão para 'test' se a variável não estiver definida

  if (environment === "production") {
    // Em produção, usar sempre 'DRM' (conforme sua necessidade atual)
    return "DRM";
  } else {
    // Em outros ambientes (como 'test'), usar a lógica do localStorage
    if (typeof window !== "undefined") {
      const storedValue = localStorage.getItem("FIREBASE_PATH_BASE");
      if (storedValue === "DRM" || storedValue === "OFT/45") {
        return storedValue as Unit;
      }
    }
    return "DRM"; // Padrão para 'DRM' em teste se nada for encontrado no localStorage
  }
}
