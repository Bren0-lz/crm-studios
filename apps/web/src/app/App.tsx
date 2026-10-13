import { AuthorizationProvider } from "../authorization";
import { AppRoutes } from "./AppRoutes";

export function App() {
  return (
    <AuthorizationProvider>
      <AppRoutes />
    </AuthorizationProvider>
  );
}

export default App;
