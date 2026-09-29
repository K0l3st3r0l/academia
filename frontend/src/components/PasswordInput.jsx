import { useState } from 'react';

// Children mistype often: letting them see what they wrote beats a second "confirm" box.
export default function PasswordInput({ id, value, onChange, autoComplete, autoFocus = false, describedBy }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface border border-gray-700 rounded-xl pl-4 pr-20 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand"
        placeholder="••••••••"
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-describedby={describedBy}
        required
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-pressed={visible}
        className="absolute inset-y-0 right-2 my-auto h-9 px-3 rounded-lg text-sm text-gray-400 hover:text-white"
      >
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  );
}
