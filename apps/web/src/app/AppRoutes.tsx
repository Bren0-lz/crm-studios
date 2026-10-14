import { PatientDetailPage } from "../features/patients/PatientDetailPage";
import type { AppModule } from "@crm/contracts";
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { hasSession } from "../api";
import { useAuthorization } from "../authorization-context";
import { AgendaPage } from "../features/agenda/AgendaPage";
import { LoginPage } from "../features/auth/LoginPage";
import { ClinicalRecordsPage } from "../features/clinical/ClinicalRecordsPage";
import { CommercialPage } from "../features/commercial/CommercialPage";
import { CommunicationsPage } from "../features/communications/CommunicationsPage";
import { DocumentsPage } from "../features/contracts/DocumentsPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { FinancePage } from "../features/finance/FinancePage";
import { GroupsPage } from "../features/groups/GroupsPage";
import { HistoryPage } from "../features/history/HistoryPage";
import { PatientsPage } from "../features/patients/PatientsPage";
import { PlansPage } from "../features/plans/PlansPage";
import { RelationshipPage } from "../features/relationship/RelationshipPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { LoadingBlock } from "../shared/components/LoadingBlock";
import { Shell } from "./Shell";

export function AppRoutes() {
  const location = useLocation();
  const {
    user,
    setUser,
    logout,
    checking: staleSession,
    canView,
    canEdit,
  } = useAuthorization();
  const authenticated = Boolean(user && hasSession());
  const allow = (module: AppModule, element: ReactNode) =>
    canView(module) ? element : <Navigate to="/" replace />;
  return (
    <Routes>
      <Route
        path="/login"
        element={
          authenticated ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage onLogin={setUser} />
          )
        }
      />
      <Route
        path="*"
        element={
          !authenticated ? (
            <Navigate to="/login" replace />
          ) : staleSession ? (
            <main className="session-check">
              <LoadingBlock />
            </main>
          ) : (
            <Shell
              key={JSON.stringify(user!.permissions)}
              user={user!}
              onLogout={logout}
            >
              <Routes key={location.pathname + location.search}>
                <Route path="/" element={<DashboardPage />} />
                <Route
                  path="/agenda"
                  element={allow("agenda", <AgendaPage />)}
                />
                <Route
                  path="/turmas"
                  element={allow("groups", <GroupsPage />)}
                />
                <Route
                  path="/clientes"
                  element={allow("patients", <PatientsPage />)}
                />
                <Route
                  path="/clientes/:id"
                  element={allow("patients", <PatientDetailPage />)}
                />
                {/* Endereço antigo, mantido para links e favoritos já salvos. */}
                <Route
                  path="/pacientes"
                  element={<Navigate to="/clientes" replace />}
                />
                <Route
                  path="/planos"
                  element={allow(
                    "plans",
                    <PlansPage canManage={canEdit("plans")} />,
                  )}
                />
                <Route
                  path="/comercial"
                  element={allow("crm", <CommercialPage />)}
                />
                <Route
                  path="/relacionamento"
                  element={allow("relationship", <RelationshipPage />)}
                />
                <Route
                  path="/comunicacoes"
                  element={allow("communications", <CommunicationsPage />)}
                />
                <Route
                  path="/contratos"
                  element={allow("contracts", <DocumentsPage />)}
                />
                <Route
                  path="/documentos"
                  element={<Navigate to="/contratos" replace />}
                />
                <Route
                  path="/prontuarios"
                  element={allow("clinical", <ClinicalRecordsPage />)}
                />
                <Route
                  path="/financeiro"
                  element={allow("finance", <FinancePage />)}
                />
                <Route
                  path="/historico"
                  element={allow("history", <HistoryPage />)}
                />
                <Route
                  path="/relatorios"
                  element={allow("reports", <ReportsPage />)}
                />
                <Route
                  path="/configuracoes"
                  element={allow("settings", <SettingsPage />)}
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          )
        }
      />
    </Routes>
  );
}
