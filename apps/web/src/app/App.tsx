import { AuthorizationProvider } from "../authorization";
import { ToastProvider } from "../shared/feedback/ToastProvider";
import { AppRoutes } from "./AppRoutes";

export function App() {
  return (
    <AuthorizationProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthorizationProvider>
  );
}

export default App;
