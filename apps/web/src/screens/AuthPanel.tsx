import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, setToken, type PublicUser } from '../api';
import { ru } from '../i18n/ru';
import { readInitData } from '../theme';

type Channel = 'TELEGRAM' | 'PHONE' | 'EMAIL';

export function AuthPanel({ onDone }: { onDone?: (user: PublicUser) => void }) {
  const query = useQueryClient();
  const [channel, setChannel] = useState<Channel>('TELEGRAM');
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'pick' | 'code'>('pick');
  const [debugCode, setDebugCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tgTried, setTgTried] = useState(false);

  useEffect(() => {
    const initData = readInitData();
    if (!initData || tgTried) return;
    setTgTried(true);
    void (async () => {
      try {
        setBusy(true);
        const result = await api<{ token: string; user: PublicUser }>('/api/v1/auth/telegram', {
          method: 'POST',
          body: JSON.stringify({ initData }),
        });
        setToken(result.token);
        await query.invalidateQueries();
        onDone?.(result.user);
      } catch {
        /* вне Telegram или подпись не прошла — остаёмся на ручном входе */
      } finally {
        setBusy(false);
      }
    })();
  }, [tgTried, query, onDone]);

  const finish = async (token: string, user: PublicUser) => {
    setToken(token);
    await query.invalidateQueries();
    onDone?.(user);
  };

  const requestCode = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ debugCode?: string }>('/api/v1/auth/code/request', {
        method: 'POST',
        body: JSON.stringify({ channel, target: target.trim() }),
      });
      setDebugCode(result.debugCode ?? '');
      setStep('code');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ token: string; user: PublicUser }>('/api/v1/auth/code/verify', {
        method: 'POST',
        body: JSON.stringify({ channel, target: target.trim(), code: code.trim() }),
      });
      await finish(result.token, result.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const guest = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ token: string; user: PublicUser }>('/api/v1/auth/guest', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await finish(result.token, result.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const placeholder =
    channel === 'PHONE' ? '+7 914 000-00-00' : channel === 'EMAIL' ? 'name@mail.ru' : '@username или ID';

  return (
    <div className="page auth-panel">
      <div className="title">{ru.auth.title}</div>
      <p className="hint">{ru.auth.subtitle}</p>
      <div className="seg">
        {(['TELEGRAM', 'PHONE', 'EMAIL'] as Channel[]).map((item) => (
          <button
            key={item}
            type="button"
            className={'seg-btn' + (channel === item ? ' is-on' : '')}
            onClick={() => {
              setChannel(item);
              setStep('pick');
              setCode('');
              setDebugCode('');
              setError('');
            }}
          >
            {item === 'TELEGRAM' ? ru.auth.telegram : item === 'PHONE' ? ru.auth.phone : ru.auth.email}
          </button>
        ))}
      </div>
      <p className="hint">
        {channel === 'TELEGRAM' ? ru.auth.telegramHint : channel === 'PHONE' ? ru.auth.phoneHint : ru.auth.emailHint}
      </p>
      {step === 'pick' && (
        <>
          <label className="field-label">
            {channel === 'PHONE' ? ru.auth.targetPhone : channel === 'EMAIL' ? ru.auth.targetEmail : ru.auth.targetTelegram}
            <input className="field" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={placeholder} inputMode={channel === 'PHONE' ? 'tel' : 'text'} />
          </label>
          <button type="button" className={'btn primary' + (busy ? ' is-busy' : '')} disabled={busy || target.trim().length < 3} onClick={() => void requestCode()}>
            {ru.auth.sendCode}
          </button>
        </>
      )}
      {step === 'code' && (
        <>
          <label className="field-label">
            {ru.auth.code}
            <input className="field" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
          </label>
          {debugCode && (
            <p className="status wait">
              {ru.auth.debugCode}: <b>{debugCode}</b>
            </p>
          )}
          <button type="button" className={'btn primary' + (busy ? ' is-busy' : '')} disabled={busy || code.trim().length < 4} onClick={() => void verify()}>
            {ru.auth.verify}
          </button>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void requestCode()}>
            {ru.auth.resend}
          </button>
        </>
      )}
      <button type="button" className="btn secondary" disabled={busy} onClick={() => void guest()}>
        {ru.auth.guest}
      </button>
      <p className="hint">{ru.auth.guestHint}</p>
      {error && <div className="status wait">{error}</div>}
    </div>
  );
}

export function ProfileCompleteForm({ user }: { user: PublicUser }) {
  const query = useQueryClient();
  const [firstName, setFirstName] = useState(user.firstName === 'Игрок' ? '' : user.firstName);
  const [lastName, setLastName] = useState(user.lastName ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ token: string; user: PublicUser }>('/api/v1/me/profile', {
        method: 'PUT',
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() }),
      });
      setToken(result.token);
      await query.invalidateQueries();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="label">{ru.auth.completeTitle}</div>
      <p className="hint">{ru.auth.completeHint}</p>
      <label className="field-label">
        {ru.auth.firstName}
        <input className="field" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      </label>
      <label className="field-label">
        {ru.auth.lastName}
        <input className="field" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </label>
      <label className="field-label">
        {ru.auth.phoneField}
        <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+7 …" />
      </label>
      <button
        type="button"
        className={'btn primary' + (busy ? ' is-busy' : '')}
        disabled={busy || !firstName.trim() || !lastName.trim() || phone.trim().length < 8}
        onClick={() => void save()}
      >
        {ru.auth.saveProfile}
      </button>
      {error && <div className="status wait">{error}</div>}
    </section>
  );
}
