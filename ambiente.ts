export let ENVIRONMENT: "teste" | "producao";

function readEnvironmentFromStorage() {
  const storedEnvironment = typeof window !== 'undefined' ? localStorage.getItem('APP_ENVIRONMENT') : null;
  ENVIRONMENT = storedEnvironment === 'teste' || storedEnvironment === 'producao' ? storedEnvironment : 'teste'; // Default to 'teste'
}

// Initialize ENVIRONMENT when the module is loaded
readEnvironmentFromStorage();
