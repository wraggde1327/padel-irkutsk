import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournament } from '../App';
import { moneyFromKopecks } from '../format';
import { ru } from '../i18n/ru';

export function RegisterScreen() {
  const { data } = useTournament();
  const [mode, setMode] = useState<'pair' | 'solo'>('pair');
  const [rating, setRating] = useState(3.4);
  const fee = mode === 'pair' ? data?.feePairKopecks ?? 400000 : data?.feeSoloKopecks ?? 200000;
  return (
    <div className="page">
      <Link to="/" className="back">
        {ru.register.back}
      </Link>
      <div className="title">{ru.register.title}</div>
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
        <button type="button" className="btn primary">
          {ru.register.payPair} {moneyFromKopecks(fee)}
        </button>
        <div className="hint center">{ru.register.later}</div>
      </div>
    </div>
  );
}
