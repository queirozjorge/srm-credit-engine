import { setupServer } from 'msw/node';

// Os handlers de negócio serão definidos nos respectivos domínios.
export const server = setupServer();
