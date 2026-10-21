import { createRoot } from 'react-dom/client';
import { SettingsForm } from '../../src/SettingsForm';
import { openWorkspace } from '../../src/workspace';
import './style.css';

createRoot(document.getElementById('root')!).render(<SettingsForm onSaved={() => { void openWorkspace(); }} onCancel={() => { void openWorkspace(); }} />);
