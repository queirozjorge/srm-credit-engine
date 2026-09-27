// Demonstração somente no servidor de desenvolvimento, por escolha explícita.
export const demoMode = import.meta.env.DEV && (import.meta.env.MODE === 'demo' || import.meta.env.VITE_API_MODE === 'demo');
