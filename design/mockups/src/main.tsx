import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Overview } from './Overview';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Overview />
  </StrictMode>,
);
