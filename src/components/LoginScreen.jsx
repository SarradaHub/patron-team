import React, { useState } from 'react';
import { verifyCredentials, saveSession, clearSession } from '../auth/auth.js';
import { deleteDatabase } from '../api/indexeddb.js';

/**
 * LoginScreen — Tela de autenticação exibida antes do acesso à aplicação.
 * Valida as credenciais comparando o hash SHA-256 da senha informada
 * com o hash armazenado em variável de ambiente.
 *
 * @param {Object} props
 * @param {Function} props.onLogin — callback executado após login bem-sucedido
 */
export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const valid = await verifyCredentials(username, password);

      if (valid) {
        saveSession();
        onLogin();
      } else {
        setError('Usuário ou senha inválidos.');
      }
    } catch (err) {
      console.error('Erro na autenticação:', err);
      setError('Erro ao verificar credenciais. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearLocalData = async () => {
    if (
      !window.confirm(
        'Apagar todos os dados locais (IndexedDB) e a sessão? Esta ação é só para desenvolvimento.'
      )
    ) {
      return;
    }
    setError('');
    setLoading(true);
    try {
      await deleteDatabase();
      clearSession();
      window.location.reload();
    } catch (err) {
      console.error(err);
      setError('Não foi possível limpar o banco local.');
    } finally {
      setLoading(false);
    }
  };

  const isDev = import.meta.env.DEV;

  return (
    <div className="login-overlay">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-header">
          <span className="login-icon">⚽</span>
          <h1>Fila de Times</h1>
        </div>

        <div className="login-field">
          <label htmlFor="login-user">Usuário</label>
          <input
            id="login-user"
            className="input-text"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Digite seu usuário"
            autoFocus
            required
            disabled={loading}
          />
        </div>

        <div className="login-field">
          <label htmlFor="login-pass">Senha</label>
          <input
            id="login-pass"
            className="input-text"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Digite sua senha"
            required
            disabled={loading}
          />
        </div>

        {error && <p className="login-error">{error}</p>}

        <div className={isDev ? 'login-actions login-actions--split' : 'login-actions'}>
          <button
            className="btn btn-primary login-btn"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
          {isDev && (
            <button
              className="btn btn-outline login-btn login-btn-dev"
              type="button"
              disabled={loading}
              title="Removido em build de produção (Vite)"
              onClick={handleClearLocalData}
            >
              Limpar dados locais
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

