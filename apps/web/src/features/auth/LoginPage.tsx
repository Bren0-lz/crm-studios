import type { UserSummary } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../../api";
import { Logo } from "../../shared/components/Logo";

export function LoginPage({
  onLogin,
}: {
  onLogin: (user: UserSummary) => void;
}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@movimenta.local");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await login(email, password);
      onLogin(session.user);
      navigate("/");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível entrar.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <Logo />
        <div className="story-copy">
          <span className="eyebrow light">Gestão clínica, sem ruído</span>
          <h1>
            Mais presença no cuidado.
            <br />
            Menos tempo na operação.
          </h1>
          <p>
            Agenda, clientes e prontuários conectados em uma experiência simples
            para toda a equipe.
          </p>
        </div>
        <p className="story-note">
          Ambiente de demonstração · Dados fictícios
        </p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">Bem-vinda de volta</span>
          <h2>Acesse sua clínica</h2>
          <p>Use suas credenciais para continuar.</p>
          <form onSubmit={submit}>
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary-button full" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
          <div className="demo-credentials">
            <strong>Acesso de demonstração</strong>
            <span>admin@movimenta.local · Admin@123</span>
          </div>
        </div>
      </section>
    </main>
  );
}
