import { RuntimeBootstrap } from './RuntimeBootstrap';
import { AppRoutes } from './routes/AppRoutes';

export function App() {
  return (
      <RuntimeBootstrap><AppRoutes /></RuntimeBootstrap>
  );
}
