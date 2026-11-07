import { AuthorizationProvider } from "../authorization";
import { ToastProvider } from "../shared/feedback/ToastProvider";
import { PlanSaleContext } from "../shared/workflows/PlanSaleContext";
import { AppRoutes } from "./AppRoutes";
import { renderPlanSale } from "./plan-sale";

export function App() {
  return (
    <AuthorizationProvider>
      <ToastProvider>
        <PlanSaleContext.Provider value={renderPlanSale}>
          <AppRoutes />
        </PlanSaleContext.Provider>
      </ToastProvider>
    </AuthorizationProvider>
  );
}

export default App;
