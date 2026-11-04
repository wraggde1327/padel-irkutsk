import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '../api';
import { moneyFromKopecks } from '../format';
import { ru } from '../i18n/ru';
import { useTournament } from './TournamentScreen';

export function RegisterScreen() {
  const { id } = useParams<{ id: string }>();
  const { data } = useTournament(id);
  const navigate = useNavigate();
  const query = useQueryClient();
  const [mode, setMode] = useState<'pair' | 'solo'>('pair');
  const [rating, setRating] = useState(3.4);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fee = mode === 'pair' ? data?.feePairKopecks ?? 400000 : data?.feeSoloKopecks ?? 200000;
  const back = id ? `/t/${id}` : '/';
  const submit = async () => {
    if (!id) return;
    if (!getToken()) {
      navigate('/profile');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/api/v1/tournaments/${id}/entries`, {
        method: 'POST',
        body: JSON.stringify({ type: mode === 'pair' ? 'PAIR' : 'SOLO', rating }),
      });
      await query.invalidateQueries({ queryKey: ['tournaments'] });
      await query.invalidateQueries({ queryKey: ['tournament', id] });
      navigate(`/t/${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <Link to={back} className="back">
        {ru.register.back}
      </Link>
      <div className="title">{ru.register.title}</div>
      {data && <p className="hint">{data.title}</p>}
      <div className="seg">
        <button type="button" className={'seg-btn' + (mode === 'pair' ? ' is-on' : '')} onClick={() => setMode('pair')}>
          {ru.register.pair}
        </button>
        <button type="button" className={'seg-btn' + (mode === 'solo' ? ' is-on' : '')} onClick={() => setMode('solo')}>
          {ru.register.solo}
        </button>
      </div>
      <p className="hint">{mode === 'pair' ? ru.register.pairHint : ru.register.soloHint}</p>
      <section className="card">
        <div className="label">{ru.register.rating}</div>
        <div className="stepper">
          <button type="button" className="stepper-btn" aria-label="Меньше" onClick={() => setRating((r) => Math.max(1, +(r - 0.1).toFixed(1)))}>
            −
          </button>
          <div className="big">{rating.toFixed(1).replace('.', ',')}</div>
          <button type="button" className="stepper-btn" aria-label="Больше" onClick={() => setRating((r) => Math.min(7, +(r + 0.1).toFixed(1)))}>
            +
          </button>
        </div>
        <div className="hint">{ru.register.ratingHint}</div>
      </section>
      {mode === 'pair' && (
        <button type="button" className="btn secondary">
          {ru.register.invite}
        </button>
      )}
      <div className="sticky-pay">
        <button type="button" className={'btn primary' + (busy ? ' is-busy' : '')} disabled={busy} onClick={() => void submit()}>
          {ru.register.payPair} {moneyFromKopecks(fee)}
        </button>
        <div className="hint center">{getToken() ? ru.register.later : ru.register.needLogin}</div>
        {error && <div className="status wait">{error}</div>}
      </div>
    </div>
  );
}
