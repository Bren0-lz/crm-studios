import { AuthorizationProvider } from "../authorization";
import { ToastProvider } from "../shared/feedback/ToastProvider";
import { GuidedSaleContext } from "../shared/workflows/GuidedSaleContext";
import { PlanSaleContext } from "../shared/workflows/PlanSaleContext";
import { guidedSale } from "./guided-sale";
import { AppRoutes } from "./AppRoutes";
import { renderPlanSale } from "./plan-sale";

export function App() {
  return (
    <AuthorizationProvider>
      <ToastProvider>
        <PlanSaleContext.Provider value={renderPlanSale}>
          <GuidedSaleContext.Provider value={guidedSale}>
            <AppRoutes />
          </GuidedSaleContext.Provider>
        </PlanSaleContext.Provider>
      </ToastProvider>
    </AuthorizationProvider>
  );
}

export default App;
