import { createRoot } from 'react-dom/client';
import { Workbench } from '../../src/Workbench';
import '../content/style.css';
import './style.css';

createRoot(document.getElementById('root')!).render(<Workbench />);
